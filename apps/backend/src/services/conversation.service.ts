import { and, asc, eq, sql } from 'drizzle-orm';
import type {
  ConversationReplyResult,
  ConversationScenarioDto,
  ConversationSessionDto,
  ConversationSessionTurnDto,
  ConversationSummaryResult,
} from '@spanish/shared';
import { db } from '../db/client.js';
import { conversationSessions, conversationTurns, userStatistics } from '../db/schema.js';
import { AIService } from '../ai/AIService.js';
import {
  ConversationFeedback,
  ConversationFeedbackSchema,
  ConversationSummarySchema,
  ConversationTurn,
  ConversationTurnSchema,
} from '../ai/schemas.js';
import { LearningContextService } from '../ai/LearningContextService.js';
import { LearningProfileService } from './learning-profile.service.js';
import { UsageService } from './usage.service.js';
import {
  CONVERSATION_SCENARIOS,
  HISTORY_TURNS,
  MAX_CONVERSATION_WORDS,
  MAX_SESSION_TURNS,
  scenarioBySlug,
  type ConversationScenario,
} from '../conversation/scenarios.js';

const XP_CONVERSATION_COMPLETE = 20;

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function safeTurn(): ConversationTurn {
  return {
    spanish: '¡Perfecto! ¿Y qué más?',
    translationSk: 'Výborne! A čo ešte?',
    kind: 'question',
    hintsSk: [],
  };
}

interface TurnRow {
  id: string;
  role: string;
  spanish: string;
  translationSk: string | null;
  hintsSk: string[] | null;
  kind: string | null;
  feedback: { kind: 'continue' | 'correction'; messageSk: string } | null;
  createdAt: Date;
}

interface SessionRow {
  id: string;
  scenarioSlug: string;
  status: string;
  correctedCount: number;
  summary: ConversationSummaryResult | null;
  languageId: string;
  userId: string;
}

export class ConversationService {
  constructor(
    private ai: AIService,
    private context: LearningContextService,
    private profileService: LearningProfileService,
    private usage: UsageService,
  ) {}

  scenarios(): ConversationScenarioDto[] {
    return CONVERSATION_SCENARIOS.map((s) => ({
      slug: s.slug,
      titleSk: s.titleSk,
      descriptionSk: s.descriptionSk,
      maxCefr: s.maxCefr,
      openingEs: s.openingEs,
      openingSk: s.openingSk,
    }));
  }

  async start(userId: string, languageId: string, scenarioSlug: string, now: Date): Promise<ConversationSessionDto> {
    const scenario = scenarioBySlug(scenarioSlug);
    if (!scenario) {
      throw Object.assign(new Error('Neznámy scenár konverzácie.'), { code: 'NOT_FOUND' });
    }

    const [session] = await db
      .insert(conversationSessions)
      .values({ userId, languageId, scenarioSlug: scenario.slug })
      .returning();

    const [opening] = await db
      .insert(conversationTurns)
      .values({
        sessionId: session!.id,
        role: 'ai',
        spanish: scenario.openingEs,
        translationSk: scenario.openingSk,
        kind: 'question',
        hintsSk: [],
      })
      .returning();

    return this.toSessionDto(session!, [opening!]);
  }

  async reply(
    userId: string,
    sessionId: string,
    userSpanish: string,
    now: Date,
  ): Promise<ConversationReplyResult> {
    const session = await this.loadActiveSession(userId, sessionId);
    const scenario = scenarioBySlug(session.scenarioSlug)!;
    const turns = await this.loadTurns(sessionId);
    const learnerTurns = turns.filter((t) => t.role === 'learner');

    if (turns.length >= MAX_SESSION_TURNS) {
      throw Object.assign(new Error('Konverzácia dosiahla maximálny počet výmen. Ukonči ju a začni novú.'), {
        code: 'BAD_REQUEST',
      });
    }

    await db.insert(conversationTurns).values({
      sessionId,
      role: 'learner',
      spanish: userSpanish,
    });

    const prompt = await this.buildTurnPrompt(scenario, turns, userSpanish, userId, session.languageId, now);
    let aiTurn = await this.ai.generateStructured(ConversationTurnSchema, prompt, userId, 'ai_conversation');
    if (!aiTurn || wordCount(aiTurn.spanish) > MAX_CONVERSATION_WORDS || aiTurn.spanish.length === 0) {
      aiTurn = safeTurn();
    }

    // Delayed feedback: surface a short correction/encouragement every few
    // turns instead of interrupting after every single reply.
    let feedback: ConversationFeedback | null = null;
    if (learnerTurns.length > 0 && learnerTurns.length % 3 === 0) {
      const ctx = this.context.bounded(
        this.context.build(await this.profileService.get(userId, session.languageId, now)),
      );
      feedback = await this.ai.generateStructured(
        ConversationFeedbackSchema,
        {
          system: this.context.systemBlock(ctx),
          prompt:
            `Scenár: ${scenario.titleSk}. Žiak práve odpovedal: "${userSpanish}".\n` +
            'Ak bola odpoveď v poriadku, vráť {"kind":"continue"}. Ak obsahovala chybu, vráť {"kind":"correction","messageSk":"krátka povzbudivá oprava"}.',
          temperature: 0.3,
        },
        userId,
        'ai_conversation',
      );
    }

    const [turn] = await db
      .insert(conversationTurns)
      .values({
        sessionId,
        role: 'ai',
        spanish: aiTurn.spanish,
        translationSk: aiTurn.translationSk,
        hintsSk: aiTurn.hintsSk ?? [],
        kind: aiTurn.kind,
        feedback: feedback ? { kind: feedback.kind, messageSk: feedback.messageSk } : null,
      })
      .returning();

    const allTurns = await this.loadTurns(sessionId);
    return {
      turn: this.toTurnDto(turn!),
      feedbackSk: feedback?.messageSk ?? null,
      session: this.toSessionDto(session, allTurns),
    };
  }

  async finish(
    userId: string,
    sessionId: string,
    now: Date,
  ): Promise<{ summary: ConversationSummaryResult; session: ConversationSessionDto; xpEarned: number }> {
    const session = await this.loadActiveSession(userId, sessionId);
    const scenario = scenarioBySlug(session.scenarioSlug)!;
    const turns = await this.loadTurns(sessionId);

    const corrections = turns.filter((t) => t.feedback?.kind === 'correction').length;
    const summary = await this.buildSummary(scenario, turns, userId, session.languageId, now);

    await db
      .update(conversationSessions)
      .set({ status: 'finished', correctedCount: corrections, summary, finishedAt: now })
      .where(eq(conversationSessions.id, sessionId));

    await db
      .update(userStatistics)
      .set({ totalXp: sql`${userStatistics.totalXp} + ${XP_CONVERSATION_COMPLETE}` })
      .where(and(eq(userStatistics.userId, userId), eq(userStatistics.languageId, session.languageId)));

    return {
      summary,
      session: this.toSessionDto(
        { ...session, status: 'finished', correctedCount: corrections, summary },
        turns,
      ),
      xpEarned: XP_CONVERSATION_COMPLETE,
    };
  }

  async getSession(userId: string, sessionId: string): Promise<ConversationSessionDto> {
    const session = await this.loadSession(sessionId);
    if (!session || session.userId !== userId) {
      throw Object.assign(new Error('Konverzácia neexistuje.'), { code: 'NOT_FOUND' });
    }
    return this.toSessionDto(session, await this.loadTurns(sessionId));
  }

  private async loadActiveSession(userId: string, sessionId: string): Promise<SessionRow> {
    const session = await this.loadSession(sessionId);
    if (!session || session.userId !== userId) {
      throw Object.assign(new Error('Konverzácia neexistuje.'), { code: 'NOT_FOUND' });
    }
    if (session.status !== 'active') {
      throw Object.assign(new Error('Konverzácia už bola ukončená.'), { code: 'BAD_REQUEST' });
    }
    return session;
  }

  private async loadSession(sessionId: string): Promise<SessionRow | null> {
    const rows = await db.select().from(conversationSessions).where(eq(conversationSessions.id, sessionId)).limit(1);
    return (rows[0] as SessionRow | undefined) ?? null;
  }

  private async loadTurns(sessionId: string): Promise<TurnRow[]> {
    return db
      .select()
      .from(conversationTurns)
      .where(eq(conversationTurns.sessionId, sessionId))
      .orderBy(asc(conversationTurns.createdAt)) as Promise<TurnRow[]>;
  }

  private async buildTurnPrompt(
    scenario: ConversationScenario,
    turns: TurnRow[],
    userSpanish: string,
    userId: string,
    languageId: string,
    now: Date,
  ): Promise<{ system: string; prompt: string; temperature?: number }> {
    const ctx = this.context.bounded(this.context.build(await this.profileService.get(userId, languageId, now)));
    const history = turns
      .slice(-HISTORY_TURNS)
      .map((t) => `${t.role === 'ai' ? 'AI' : 'Žiak'}: ${t.spanish}${t.translationSk ? ` (${t.translationSk})` : ''}`)
      .join('\n');

    const prompt =
      `\nPráve hráš úlohu v scénari: ${scenario.titleSk}. ${scenario.descriptionSk}\n` +
      `Zameranie slovnej zásoby: ${scenario.focusSk}\n` +
      `Pravidlá scénaru:\n` +
      `- Používaj LEN túto gramatiku: ${scenario.allowedGrammar.join(', ')}.\n` +
      `- Používaj len jednoduchú slovnú zásobu, ktorú žiak pozná (max ${MAX_CONVERSATION_WORDS} slov na vetu).\n` +
      `- Pýtaj sa vždy len JEDNU otázku.\n` +
      `- Reaguj prirodzene na žiakovu odpoveď a pokračuj v rozhovore.\n` +
      (history.length > 0 ? `\nDoterajší rozhovor:\n${history}\n` : '') +
      `\nŽiak práve odpovedal: "${userSpanish}".\n` +
      'Teraz odpovedz ďalšou replikou (JSON podľa schémy). Ak má rozhovor skončiť, vráť kind:"end".';
    return { system: this.context.systemBlock(ctx), prompt, temperature: 0.7 };
  }

  private async buildSummary(
    scenario: ConversationScenario,
    turns: TurnRow[],
    userId: string,
    languageId: string,
    now: Date,
  ): Promise<ConversationSummaryResult> {
    const ctx = this.context.bounded(this.context.build(await this.profileService.get(userId, languageId, now)));
    const transcript = turns.map((t) => `${t.role === 'ai' ? 'AI' : 'Žiak'}: ${t.spanish}`).join('\n');
    const generated = await this.ai.generateStructured(
      ConversationSummarySchema,
      {
        system: this.context.systemBlock(ctx),
        prompt:
          `\nScenár: ${scenario.titleSk}.\nKonverzácia:\n${transcript}\n\n` +
          'Zhrň konverzáciu: najpoužívanejšie nové slovné spojenia a odporúčanie na precvičenie.',
        temperature: 0.4,
      },
      userId,
      'ai_conversation',
    );
    return {
      newPhrases: generated?.newPhrases ?? [],
      suggestedReview: generated?.suggestedReview ?? `Precvič si scénar „${scenario.titleSk}“ v ďalšej lekcii.`,
    };
  }

  private toTurnDto(t: TurnRow): ConversationSessionTurnDto {
    return {
      id: t.id,
      role: t.role as 'ai' | 'learner',
      spanish: t.spanish,
      translationSk: t.translationSk,
      hintsSk: t.hintsSk ?? null,
      kind: t.kind,
      createdAt: t.createdAt.toISOString(),
    };
  }

  private toSessionDto(s: SessionRow, turns: TurnRow[]): ConversationSessionDto {
    return {
      id: s.id,
      scenarioSlug: s.scenarioSlug,
      status: s.status as 'active' | 'finished',
      correctedCount: s.correctedCount,
      turns: turns.map((t) => this.toTurnDto(t)),
      summary: s.summary,
    };
  }
}
