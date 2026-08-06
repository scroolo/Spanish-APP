import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db } from '../src/db/client.js';
import {
  generatedExercises,
  grammarConcepts,
  languages,
  mistakes,
  userGrammarProgress,
  userLanguages,
  userStatistics,
  userVocabulary,
  users,
  vocabularyItems,
  weaknesses,
} from '../src/db/schema.js';
import { WeaknessEngine } from '../src/learning/weakness.js';
import { SrsService } from '../src/services/srs.service.js';
import { LearningSignalsService } from '../src/services/learning-signals.service.js';
import { UsageService } from '../src/services/usage.service.js';
import { LearningProfileService } from '../src/services/learning-profile.service.js';
import { PersonalizedExerciseService } from '../src/services/personalized-exercise.service.js';
import { AIService } from '../src/ai/AIService.js';
import { MockAIProvider } from '../src/ai/providers/mock.js';
import { LearningContextService } from '../src/ai/LearningContextService.js';

let userId: string;
let languageId: string;
let conceptId: string;
let vocabId: string;

beforeAll(async () => {
  const [lang] = await db.select().from(languages).where(eq(languages.code, 'es')).limit(1);
  languageId = lang!.id;

  const [concept] = await db
    .select()
    .from(grammarConcepts)
    .where(and(eq(grammarConcepts.languageId, languageId), eq(grammarConcepts.slug, 'ser')))
    .limit(1);
  conceptId = concept!.id;

  const [vocab] = await db
    .select()
    .from(vocabularyItems)
    .where(eq(vocabularyItems.languageId, languageId))
    .limit(1);
  vocabId = vocab!.id;

  const [user] = await db
    .insert(users)
    .values({ email: `ai-integration-${Date.now()}@test.sk`, passwordHash: 'x', nativeLanguage: 'sk' })
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

function buildService() {
  const weaknessEngine = new WeaknessEngine();
  const srsService = new SrsService(weaknessEngine);
  const signals = new LearningSignalsService(srsService, weaknessEngine);
  const aiService = new AIService(new MockAIProvider(), new UsageService());
  const profileService = new LearningProfileService(weaknessEngine);
  return new PersonalizedExerciseService(aiService, new LearningContextService(), profileService, signals);
}

describe('personalized exercise integration (AI → learning engine)', () => {
  it('generates and persists exercises targeting an explicit grammar concept', async () => {
    const svc = buildService();
    const res = await svc.generate(userId, languageId, { count: 3, grammarConceptId: conceptId, now: new Date() });
    expect(res.targeted?.kind).toBe('grammar');
    expect(res.exercises.length).toBe(3);
    for (const ex of res.exercises) {
      expect(ex.prompt.length).toBeGreaterThan(0);
    }
    const rows = await db
      .select()
      .from(generatedExercises)
      .where(and(eq(generatedExercises.userId, userId), eq(generatedExercises.grammarConceptId, conceptId)));
    expect(rows.length).toBe(3);
  });

  it('records a mistake + grammar weakness on a wrong AI exercise answer', async () => {
    const svc = buildService();
    const res = await svc.generate(userId, languageId, { count: 1, grammarConceptId: conceptId, now: new Date() });
    const ex = res.exercises[0]!;
    const graded = await svc.grade(userId, languageId, ex.id, 'nesprávna_odpoveď', new Date());
    expect(graded.correct).toBe(false);
    expect(graded.masteryDelta).toBeLessThan(0);

    const [mistake] = await db
      .select()
      .from(mistakes)
      .where(and(eq(mistakes.userId, userId), eq(mistakes.generatedExerciseId, ex.id)));
    expect(mistake).toBeDefined();
    expect(mistake.mistakeType).toBe('ai_exercise');

    const [weak] = await db
      .select()
      .from(weaknesses)
      .where(and(eq(weaknesses.userId, userId), eq(weaknesses.grammarConceptId, conceptId)));
    expect(weak).toBeDefined();
    expect(weak!.category).toBe('grammar');
    expect(weak!.mistakeCount).toBeGreaterThanOrEqual(1);
  });

  it('updates grammar mastery and records an AI-sourced attempt on a correct answer', async () => {
    const svc = buildService();
    const res = await svc.generate(userId, languageId, { count: 1, grammarConceptId: conceptId, now: new Date() });
    const ex = res.exercises[0]!;
    const wrong = await svc.grade(userId, languageId, ex.id, 'nesprávna', new Date());
    expect(wrong.correct).toBe(false);

    const correctRes = await svc.generate(userId, languageId, { count: 1, grammarConceptId: conceptId, now: new Date() });
    const correctEx = correctRes.exercises[0]!;
    // correct answer comes from the DB record (not leaked through the DTO)
    const [row] = await db
      .select({ correctAnswer: generatedExercises.correctAnswer })
      .from(generatedExercises)
      .where(eq(generatedExercises.id, correctEx.id));
    const graded = await svc.grade(userId, languageId, correctEx.id, row!.correctAnswer, new Date());
    expect(graded.correct).toBe(true);
    expect(graded.xpEarned).toBeGreaterThan(0);

    const [attempt] = await db
      .select()
      .from(userGrammarProgress)
      .where(and(eq(userGrammarProgress.userId, userId), eq(userGrammarProgress.grammarConceptId, conceptId)));
    expect(attempt).toBeDefined();
    expect(Number(attempt!.masteryScore)).toBeGreaterThan(0);
    expect(attempt!.correctCount).toBeGreaterThanOrEqual(1);
  });

  it('grades a vocabulary-targeted exercise into vocabulary mastery', async () => {
    const svc = buildService();
    const res = await svc.generate(userId, languageId, { count: 1, vocabularyItemId: vocabId, now: new Date() });
    const ex = res.exercises[0]!;
    const [row] = await db
      .select({ correctAnswer: generatedExercises.correctAnswer })
      .from(generatedExercises)
      .where(eq(generatedExercises.id, ex.id));
    const graded = await svc.grade(userId, languageId, ex.id, row!.correctAnswer, new Date());
    expect(graded.correct).toBe(true);

    const [uv] = await db
      .select()
      .from(userVocabulary)
      .where(and(eq(userVocabulary.userId, userId), eq(userVocabulary.vocabularyItemId, vocabId)));
    expect(uv).toBeDefined();
    expect(uv!.reviewCount).toBeGreaterThanOrEqual(1);
  });
});
