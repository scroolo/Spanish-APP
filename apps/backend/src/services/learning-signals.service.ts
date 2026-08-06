import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { exerciseAttempts, mistakes, userStatistics } from '../db/schema.js';
import { SrsService } from './srs.service.js';
import { WeaknessEngine } from '../learning/weakness.js';

/**
 * Shared learning-signal pipeline. Both curriculum exercises and AI-generated
 * exercises funnel through here so that every attempt updates the SAME
 * learner model: exercise attempts, mistakes, vocabulary mastery, grammar
 * mastery, weaknesses and SRS scheduling. There is no separate AI progress
 * system.
 */
export interface LearningSignalInput {
  userId: string;
  languageId: string;
  correct: boolean;
  answer: string;
  correctAnswer: string;
  lessonId?: string | null;
  exerciseId?: string | null;
  generatedExerciseId?: string | null;
  source: 'curriculum' | 'ai';
  vocabItemId?: string | null;
  grammarConceptId?: string | null;
  exerciseType: string;
  mistakeContext: string;
  now: Date;
}

export interface LearningSignalResult {
  xpEarned: number;
  masteryDelta: number;
}

const XP_CORRECT = 10;
const XP_INCORRECT = 2;

export class LearningSignalsService {
  constructor(
    private srsService: SrsService,
    private weaknessEngine: WeaknessEngine,
  ) {}

  async apply(input: LearningSignalInput): Promise<LearningSignalResult> {
    await db.insert(exerciseAttempts).values({
      userId: input.userId,
      languageId: input.languageId,
      lessonId: input.lessonId ?? null,
      exerciseId: input.exerciseId ?? null,
      generatedExerciseId: input.generatedExerciseId ?? null,
      source: input.source,
      isCorrect: input.correct,
      userAnswer: input.answer,
    });

    if (!input.correct) {
      await db.insert(mistakes).values({
        userId: input.userId,
        languageId: input.languageId,
        lessonId: input.lessonId ?? null,
        exerciseId: input.exerciseId ?? null,
        generatedExerciseId: input.generatedExerciseId ?? null,
        vocabularyItemId: input.vocabItemId ?? null,
        grammarConceptId: input.grammarConceptId ?? null,
        exerciseType: input.exerciseType,
        mistakeType: input.source === 'ai' ? 'ai_exercise' : 'exercise',
        userAnswer: input.answer,
        correctAnswer: input.correctAnswer,
        context: input.mistakeContext,
      });
    }

    if (input.vocabItemId) {
      await this.srsService.updateVocabulary(
        input.userId,
        input.languageId,
        input.vocabItemId,
        input.correct,
        input.now,
        input.lessonId ?? undefined,
      );
      await this.weaknessEngine.record({
        userId: input.userId,
        languageId: input.languageId,
        category: 'vocabulary',
        key: `vocab:${input.vocabItemId}`,
        label: input.mistakeContext,
        vocabularyItemId: input.vocabItemId,
        isCorrect: input.correct,
        now: input.now,
      });
    }
    if (input.grammarConceptId) {
      await this.srsService.updateGrammar(
        input.userId,
        input.languageId,
        input.grammarConceptId,
        input.correct,
        input.now,
      );
      await this.weaknessEngine.record({
        userId: input.userId,
        languageId: input.languageId,
        category: 'grammar',
        key: `grammar:${input.grammarConceptId}`,
        label: input.mistakeContext,
        grammarConceptId: input.grammarConceptId,
        isCorrect: input.correct,
        now: input.now,
      });
    }

    const xpEarned = input.correct ? XP_CORRECT : XP_INCORRECT;
    await db
      .update(userStatistics)
      .set({ totalXp: sql`${userStatistics.totalXp} + ${xpEarned}` })
      .where(and(eq(userStatistics.userId, input.userId), eq(userStatistics.languageId, input.languageId)));

    return { xpEarned, masteryDelta: input.correct ? 0.25 : -0.45 };
  }
}
