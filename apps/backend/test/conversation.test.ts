import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db } from '../src/db/client.js';
import {
  conversationSessions,
  conversationTurns,
  languages,
  userLanguages,
  userStatistics,
  users,
} from '../src/db/schema.js';
import { AIService } from '../src/ai/AIService.js';
import { MockAIProvider } from '../src/ai/providers/mock.js';
import { LearningContextService } from '../src/ai/LearningContextService.js';
import { LearningProfileService } from '../src/services/learning-profile.service.js';
import { UsageService } from '../src/services/usage.service.js';
import { ConversationService } from '../src/services/conversation.service.js';
import { WeaknessEngine } from '../src/learning/weakness.js';

let userId: string;
let languageId: string;

function buildService() {
  const ai = new AIService(new MockAIProvider(), new UsageService());
  const profileService = new LearningProfileService(new WeaknessEngine());
  return new ConversationService(ai, new LearningContextService(), profileService, new UsageService());
}

beforeAll(async () => {
  const [lang] = await db.select().from(languages).where(eq(languages.code, 'es')).limit(1);
  languageId = lang!.id;
  const [user] = await db
    .insert(users)
    .values({ email: `conv-${Date.now()}@test.sk`, passwordHash: 'x', nativeLanguage: 'sk' })
    .returning();
  userId = user.id;
  await db.insert(userLanguages).values({
    userId,
    languageId,
    cefrLevel: 'A0',
    dailyMinutes: 30,
    mainGoal: 'conversation',
    spanishVariant: 'spain',
    nativeLanguage: 'sk',
  });
  await db.insert(userStatistics).values({ userId, languageId });
});

afterAll(async () => {
  if (userId) {
    await db.delete(users).where(eq(users.id, userId));
  }
});

describe('conversation scenarios', () => {
  it('exposes a bounded scenario catalog', () => {
    const svc = buildService();
    const list = svc.scenarios();
    expect(list.length).toBeGreaterThanOrEqual(5);
    const predstavenie = list.find((s) => s.slug === 'predstavenie');
    expect(predstavenie!.maxCefr).toBe('A1');
    expect(predstavenie!.openingEs.length).toBeGreaterThan(0);
  });
});

describe('ConversationService integration', () => {
  it('starts a session with an AI opening turn', async () => {
    const svc = buildService();
    const session = await svc.start(userId, languageId, 'predstavenie', new Date());
    expect(session.status).toBe('active');
    expect(session.scenarioSlug).toBe('predstavenie');
    expect(session.turns.length).toBe(1);
    expect(session.turns[0]!.role).toBe('ai');
    expect(session.turns[0]!.kind).toBe('question');

    const rows = await db
      .select()
      .from(conversationTurns)
      .where(eq(conversationTurns.sessionId, session.id));
    expect(rows.length).toBe(1);
  });

  it('handles a learner reply and appends the AI turn + feedback', async () => {
    const svc = buildService();
    const session = await svc.start(userId, languageId, 'kaviaren', new Date());

    const r1 = await svc.reply(userId, session.id, 'Hola, quiero un café por favor', new Date());
    expect(r1.turn.role).toBe('ai');
    expect(r1.turn.spanish.length).toBeGreaterThan(0);
    expect(r1.session.turns.length).toBe(3);

    const r2 = await svc.reply(userId, session.id, 'Quiero agua por favor', new Date());
    const r3 = await svc.reply(userId, session.id, 'Gracias, hasta luego', new Date());
    expect(r3.feedbackSk).toBeNull();
    const r4 = await svc.reply(userId, session.id, 'Igualmente, adiós', new Date());
    // Feedback appears on the 4th learner turn (delayed feedback cadence).
    expect(typeof r4.feedbackSk).toBe('string');

    const rows = await db
      .select()
      .from(conversationTurns)
      .where(eq(conversationTurns.sessionId, session.id))
      .orderBy(conversationTurns.createdAt);
    const learners = rows.filter((r) => r.role === 'learner');
    expect(learners.length).toBe(4);
  });

  it('rejects replies after the session is finished and refuses foreign sessions', async () => {
    const svc = buildService();
    const session = await svc.start(userId, languageId, 'restauracia', new Date());

    await expect(svc.reply('00000000-0000-0000-0000-000000000000', session.id, 'Hola', new Date())).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });

    const finished = await svc.finish(userId, session.id, new Date());
    expect(finished.summary.suggestedReview.length).toBeGreaterThan(0);
    expect(finished.xpEarned).toBeGreaterThan(0);

    await expect(svc.reply(userId, session.id, 'Otra cosa', new Date())).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('persists a summary on finish and marks the session finished', async () => {
    const svc = buildService();
    const session = await svc.start(userId, languageId, 'cesta', new Date());
    await svc.reply(userId, session.id, '¿Dónde está la estación?', new Date());
    await svc.reply(userId, session.id, 'Gracias', new Date());

    const finished = await svc.finish(userId, session.id, new Date());
    expect(finished.session.status).toBe('finished');

    const [row] = await db
      .select()
      .from(conversationSessions)
      .where(and(eq(conversationSessions.id, session.id), eq(conversationSessions.userId, userId)));
    expect(row!.status).toBe('finished');
    expect(row!.summary).not.toBeNull();
    expect((row!.summary as { suggestedReview: string }).suggestedReview.length).toBeGreaterThan(0);
  });
});
