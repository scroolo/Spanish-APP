import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type {
  AiExerciseAttemptResult,
  AiExerciseGenerateResult,
  GeneratedExerciseDto,
} from '@spanish/shared';
import { db } from '../db/client.js';
import { generatedExercises, grammarConcepts, vocabularyItems, weaknesses } from '../db/schema.js';
import { AIService } from '../ai/AIService.js';
import { GeneratedExerciseSetSchema, type GeneratedExercise } from '../ai/schemas.js';
import { LearningContextService, type CurrentActivity } from '../ai/LearningContextService.js';
import { LearningProfileService } from './learning-profile.service.js';
import { LearningSignalsService } from './learning-signals.service.js';
import { isCorrectAnswer } from '../learning/answer.js';

export interface AiTarget {
  kind: 'grammar' | 'vocabulary' | 'general';
  grammarConceptId?: string;
  vocabularyItemId?: string;
  label: string;
}

export interface GenerateOptions {
  count?: number;
  grammarConceptId?: string;
  vocabularyItemId?: string;
  now: Date;
}

/**
 * Personalized exercise generation.
 *
 * The deterministic engine decides WHAT to practise (weak grammar/vocabulary
 * from the persisted weakness ledger). The AI only creates EXERCISE
 * VARIATIONS. Generated attempts flow through the shared learning-signals
 * pipeline, so they update the exact same mastery/mistake/weakness/SRS model
 * as curriculum exercises.
 */
export class PersonalizedExerciseService {
  constructor(
    private aiService: AIService,
    private learningContext: LearningContextService,
    private profileService: LearningProfileService,
    private signals: LearningSignalsService,
  ) {}

  /** Deterministic selection of the next concept to practise (weakness-first). */
  async targetFromWeaknesses(userId: string, languageId: string): Promise<AiTarget> {
    const active = await db
      .select()
      .from(weaknesses)
      .where(
        and(
          eq(weaknesses.userId, userId),
          eq(weaknesses.languageId, languageId),
          isNull(weaknesses.resolvedAt),
        ),
      )
      .orderBy(desc(weaknesses.lastMistakeAt))
      .limit(20);

    const grammar = active.find((w) => w.category === 'grammar' && w.grammarConceptId);
    if (grammar) {
      const [g] = await db
        .select({ title: grammarConcepts.title })
        .from(grammarConcepts)
        .where(eq(grammarConcepts.id, grammar.grammarConceptId!));
      return {
        kind: 'grammar',
        grammarConceptId: grammar.grammarConceptId!,
        label: g?.title ?? grammar.label,
      };
    }

    const vocab = active.find((w) => w.category === 'vocabulary' && w.vocabularyItemId);
    if (vocab) {
      const [v] = await db
        .select({ spanish: vocabularyItems.spanish })
        .from(vocabularyItems)
        .where(eq(vocabularyItems.id, vocab.vocabularyItemId!));
      return {
        kind: 'vocabulary',
        vocabularyItemId: vocab.vocabularyItemId!,
        label: v?.spanish ?? vocab.label,
      };
    }

    return { kind: 'general', label: 'Všeobecné precvičenie' };
  }

  private async resolveTarget(
    grammarConceptId: string | undefined,
    vocabularyItemId: string | undefined,
    userId: string,
    languageId: string,
  ): Promise<AiTarget> {
    if (grammarConceptId) {
      const [g] = await db
        .select({ title: grammarConcepts.title })
        .from(grammarConcepts)
        .where(and(eq(grammarConcepts.id, grammarConceptId), eq(grammarConcepts.languageId, languageId)));
      if (!g) throw new Error('Gramatický jav neexistuje.');
      return { kind: 'grammar', grammarConceptId, label: g.title };
    }
    if (vocabularyItemId) {
      const [v] = await db
        .select({ spanish: vocabularyItems.spanish })
        .from(vocabularyItems)
        .where(and(eq(vocabularyItems.id, vocabularyItemId), eq(vocabularyItems.languageId, languageId)));
      if (!v) throw new Error('Slovíčko neexistuje.');
      return { kind: 'vocabulary', vocabularyItemId, label: v.spanish };
    }
    return this.targetFromWeaknesses(userId, languageId);
  }

  async generate(userId: string, languageId: string, opts: GenerateOptions): Promise<AiExerciseGenerateResult> {
    const count = Math.min(5, Math.max(1, opts.count ?? 3));
    const target = await this.resolveTarget(opts.grammarConceptId, opts.vocabularyItemId, userId, languageId);

    const profile = await this.profileService.get(userId, languageId, opts.now);
    const activity: CurrentActivity = { grammarTopic: target.kind === 'grammar' ? target.label : undefined };
    const ctx = this.learningContext.bounded(this.learningContext.build(profile, activity));
    const system = this.learningContext.systemBlock(ctx);

    const generated = await this.aiService.generateStructured(
      GeneratedExerciseSetSchema,
      {
        system,
        prompt: buildExercisePrompt(target, count),
        temperature: 0.4,
        maxTokens: 1000,
      },
      userId,
      'ai_generate',
    );

    let set: GeneratedExercise[];
    if (generated && generated.exercises.length > 0) {
      set = [...generated.exercises];
    } else {
      set = [];
    }
    if (set.length < count) {
      const fallback = deterministicFallback(target, count - set.length);
      set = [...set, ...fallback];
    }
    set = set.slice(0, count);

    const rows = [];
    for (const ex of set) {
      const [row] = await db
        .insert(generatedExercises)
        .values({
          userId,
          languageId,
          type: ex.type,
          instructionSk: ex.instructionSk,
          sentenceEs: ex.sentenceEs ?? null,
          options: ex.options ?? null,
          correctAnswer: ex.answer,
          explanation: ex.explanationSk,
          grammarConceptId: target.grammarConceptId ?? null,
          vocabularyItemId: target.vocabularyItemId ?? null,
          difficulty: ex.difficulty,
          tags: [target.kind, ex.type, ...(ex.grammarConcept ? [ex.grammarConcept] : [])],
          status: 'active',
        })
        .returning();
      rows.push(row);
    }

    return {
      provider: this.aiService.providerName,
      targeted: { kind: target.kind, label: target.label },
      exercises: rows.map((r) => toDto(r, target.kind === 'grammar' ? target.label : null)),
    };
  }

  async grade(
    userId: string,
    languageId: string,
    generatedExerciseId: string,
    answer: string,
    now: Date,
  ): Promise<AiExerciseAttemptResult> {
    const [ex] = await db
      .select()
      .from(generatedExercises)
      .where(and(eq(generatedExercises.id, generatedExerciseId), eq(generatedExercises.userId, userId)));
    if (!ex) {
      const err = new Error('Vygenerované cvičenie neexistuje.') as Error & { code?: string };
      err.code = 'NOT_FOUND';
      throw err;
    }

    const correct = isCorrectAnswer(answer, ex.correctAnswer);
    await db
      .update(generatedExercises)
      .set({
        attempts: sql`${generatedExercises.attempts} + 1`,
        correctCount: sql`${generatedExercises.correctCount} + ${correct ? 1 : 0}`,
      })
      .where(eq(generatedExercises.id, ex.id));

    const result = await this.signals.apply({
      userId,
      languageId,
      correct,
      answer,
      correctAnswer: ex.correctAnswer,
      generatedExerciseId: ex.id,
      source: 'ai',
      vocabItemId: ex.vocabularyItemId,
      grammarConceptId: ex.grammarConceptId,
      exerciseType: ex.type,
      mistakeContext: ex.instructionSk,
      now,
    });

    return {
      correct,
      correctAnswer: ex.correctAnswer,
      explanation: ex.explanation || null,
      masteryDelta: result.masteryDelta,
      xpEarned: result.xpEarned,
      generatedExerciseId: ex.id,
    };
  }

  async list(userId: string, languageId: string, limit: number): Promise<GeneratedExerciseDto[]> {
    const rows = await db
      .select({
        g: generatedExercises,
        grammarTitle: grammarConcepts.title,
      })
      .from(generatedExercises)
      .leftJoin(grammarConcepts, eq(generatedExercises.grammarConceptId, grammarConcepts.id))
      .where(and(eq(generatedExercises.userId, userId), eq(generatedExercises.languageId, languageId)))
      .orderBy(desc(generatedExercises.createdAt))
      .limit(limit);
    return rows.map((r) => toDto(r.g, r.grammarTitle ?? null));
  }
}

function toDto(r: typeof generatedExercises.$inferSelect, grammarTitle: string | null): GeneratedExerciseDto {
  const prompt = r.sentenceEs ? `${r.instructionSk}\n\n${r.sentenceEs}` : r.instructionSk;
  return {
    id: r.id,
    type: r.type as GeneratedExerciseDto['type'],
    prompt,
    options: r.options,
    difficulty: r.difficulty as GeneratedExerciseDto['difficulty'],
    grammarConceptTitle: grammarTitle,
    tags: r.tags,
  };
}

function buildExercisePrompt(target: AiTarget, count: number): string {
  return (
    `Vygeneruj presne ${count} cvičení pre žiaka podľa kontextu. Cieľový jav: «${target.label}» (${target.kind}).\n` +
    `Požiadavky:\n` +
    `- Každé cvičenie má JEDEN jasný vzdelávací cieľ a jednoznačne overiteľnú odpoveď.\n` +
    `- Používaj len slová vhodné pre A0/A1 žiaka; uprednostni slová z jeho slovnej zásoby.\n` +
    `- Nezavádzaj zbytočnú pokročilú gramatiku.\n` +
    `- Pri typoch multiple_choice, ordering a error_correction vždy uveď 4 možnosti (options) obsahujúce správnu odpoveď.\n` +
    `- Correct answer môže obsahovať viac akceptovaných variantov oddelených znakom "|".\n` +
    `- Každé cvičenie má krátke slovenské vysvetlenie po vyhodnotení (explanationSk).\n` +
    `- Odpovedz LEN JSON objektom: {"exercises": [ {type, instructionSk, sentenceEs, options, answer, explanationSk, difficulty} ]}`
  );
}

function deterministicFallback(target: AiTarget, count: number): GeneratedExercise[] {
  const base = target.kind === 'grammar' ? grammarFallback(target.label) : vocabularyFallback(target.label);
  const result: GeneratedExercise[] = [];
  for (let i = 0; i < count; i++) {
    result.push(base[i % base.length]);
  }
  return result;
}

function grammarFallback(label: string): GeneratedExercise[] {
  const l = label.toLowerCase();
  if (l.includes('tener')) {
    return [
      {
        type: 'fill_blank',
        instructionSk: 'Doplň správny tvar slovesa tener.',
        sentenceEs: 'Yo ___ 30 años.',
        answer: 'tengo',
        explanationSk: 'Pri veku používame TENER: „Tengo 30 años".',
        grammarConcept: 'tener',
        vocabularyItems: ['tengo'],
        difficulty: 'easy',
      },
      {
        type: 'multiple_choice',
        instructionSk: 'Vyber správny tvar slovesa tener pre „má" (on/ona).',
        sentenceEs: 'Él ___ un coche.',
        options: ['tiene', 'tengo', 'tienes', 'tenemos'],
        answer: 'tiene',
        explanationSk: 'Pre „on/ona" používame tvar tiene.',
        grammarConcept: 'tener',
        vocabularyItems: ['coche'],
        difficulty: 'easy',
      },
    ];
  }
  return [
    {
      type: 'fill_blank',
      instructionSk: 'Doplň správny tvar slovesa.',
      sentenceEs: 'Yo ___ de Eslovaquia.',
      answer: 'soy',
      explanationSk: 'Pri pôvode používame SER: „Soy de Eslovaquia".',
      grammarConcept: 'ser',
      vocabularyItems: ['soy'],
      difficulty: 'easy',
    },
    {
      type: 'multiple_choice',
      instructionSk: 'Vyber správny tvar slovesa pre „som" (pôvod).',
      sentenceEs: 'Yo ___ de Eslovaquia.',
      options: ['soy', 'estoy', 'eres', 'es'],
      answer: 'soy',
      explanationSk: 'Pôvod opisujeme pomocou SER: „Soy de Eslovaquia".',
      grammarConcept: 'ser',
      vocabularyItems: ['soy'],
      difficulty: 'easy',
    },
  ];
}

function vocabularyFallback(label: string): GeneratedExercise[] {
  return [
    {
      type: 'translation',
      instructionSk: 'Prelož do španielčiny:',
      sentenceEs: `${label}`,
      answer: label.split('|')[0]!.trim(),
      explanationSk: `Preloženie slova «${label}».`,
      difficulty: 'easy',
    },
    {
      type: 'multiple_choice',
      instructionSk: 'Vyber správny španielsky ekvivalent:',
      sentenceEs: 'Prelož: „Som unavený" (slovo pre unavený).',
      options: ['cansado', 'contento', 'rápido', 'grande'],
      answer: 'cansado',
      explanationSk: '„Unavený" je po španielsky cansado.',
      difficulty: 'easy',
    },
  ];
}
