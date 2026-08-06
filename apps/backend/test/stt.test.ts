import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { desc, eq } from 'drizzle-orm';
import { db } from '../src/db/client.js';
import { languages, speakingAttempts, userLanguages, userStatistics, users } from '../src/db/schema.js';
import { evaluateSpeaking, normalizeSpanish, SpeakingAttemptService } from '../src/services/speaking-attempt.service.js';
import { UsageService } from '../src/services/usage.service.js';
import type { SpeechToTextProvider } from '../src/stt/types.js';

describe('normalizeSpanish', () => {
  it('strips accents, punctuation and case', () => {
    expect(normalizeSpanish('¿Hola, Buenos DÍAS!')).toBe('hola buenos dias');
  });
});

describe('evaluateSpeaking', () => {
  it('marks an exact match as correct (accent-insensitive)', () => {
    expect(evaluateSpeaking('¿Hola, buenos días!', 'Hola buenos días')).toBe('correct');
  });

  it('marks a one-word-off transcript as close', () => {
    expect(evaluateSpeaking('hola buenos', 'hola buenos dias')).toBe('close');
  });

  it('marks an unrelated transcript as retry', () => {
    expect(evaluateSpeaking('me llamo ana', 'un cafe por favor')).toBe('retry');
  });

  it('marks an empty transcript as unrecognized', () => {
    expect(evaluateSpeaking('', 'hola buenos dias')).toBe('unrecognized');
  });

  it('does not invent correct answers for empty transcripts', () => {
    expect(evaluateSpeaking('   ', 'hola')).toBe('unrecognized');
  });
});

describe('SpeakingAttemptService integration', () => {
  let userId: string;
  let languageId: string;

  function stubProvider(text: string): SpeechToTextProvider {
    return {
      name: 'stub',
      transcribe: async () => ({ text, durationSeconds: 0, language: 'es' }),
    };
  }

  beforeAll(async () => {
    const [lang] = await db.select().from(languages).where(eq(languages.code, 'es')).limit(1);
    languageId = lang!.id;
    const [user] = await db
      .insert(users)
      .values({ email: `stt-${Date.now()}@test.sk`, passwordHash: 'x', nativeLanguage: 'sk' })
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

  it('transcribes, evaluates and persists a correct attempt', async () => {
    const svc = new SpeakingAttemptService(stubProvider('hola buenos dias'), new UsageService());
    const res = await svc.handleAttempt(userId, languageId, {
      audio: new Uint8Array([1, 2, 3]),
      mimeType: 'audio/webm',
      targetEs: 'Hola buenos días',
      recordedSeconds: 2,
    });
    expect(res.evaluation).toBe('correct');
    expect(res.recognized).toBe('hola buenos dias');
    expect(res.feedbackSk.length).toBeGreaterThan(0);

    const [row] = await db
      .select()
      .from(speakingAttempts)
      .where(eq(speakingAttempts.userId, userId))
      .orderBy(desc(speakingAttempts.createdAt))
      .limit(1);
    expect(row!.evaluation).toBe('correct');
    expect(row!.targetEs).toBe('Hola buenos días');
    expect(row!.recordedSeconds).toBe(2);
  });

  it('persists an unrecognized attempt and keeps the history honest', async () => {
    const svc = new SpeakingAttemptService(stubProvider(''), new UsageService());
    const res = await svc.handleAttempt(userId, languageId, {
      audio: new Uint8Array([9, 9]),
      mimeType: 'audio/webm',
      targetEs: 'Mucho gusto',
      recordedSeconds: 0,
    });
    expect(res.evaluation).toBe('unrecognized');

    const history = await svc.recent(userId);
    expect(history.length).toBeGreaterThanOrEqual(1);
    expect(history[0]!.target).toBe('Mucho gusto');
  });

  it('rejects empty audio', async () => {
    const svc = new SpeakingAttemptService(stubProvider('x'), new UsageService());
    await expect(
      svc.handleAttempt(userId, languageId, { audio: new Uint8Array(0), mimeType: 'audio/webm', targetEs: 'Hola' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});
