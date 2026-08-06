import { and, eq, sql } from 'drizzle-orm';
import type { WeaknessCategory } from '@spanish/shared';
import { db } from '../db/client.js';
import { grammarConcepts, mistakes, userGrammarProgress, userVocabulary, vocabularyItems } from '../db/schema.js';
import { applySrsAnswer, initialSrsState } from '../learning/srs.js';
import { bumpStudyStreak } from '../learning/streak.js';
import { WeaknessEngine } from '../learning/weakness.js';

export class SrsService {
  constructor(private weaknessEngine: WeaknessEngine) {}
  async updateVocabulary(
    userId: string,
    languageId: string,
    vocabItemId: string,
    correct: boolean,
    now: Date,
    lessonId?: string,
  ) {
    const [row] = await db
      .select()
      .from(userVocabulary)
      .where(and(eq(userVocabulary.userId, userId), eq(userVocabulary.vocabularyItemId, vocabItemId)));

    const prev = row
      ? {
          mastery: Number(row.masteryScore),
          reviewCount: row.reviewCount,
          correctCount: row.correctCount,
          incorrectCount: row.incorrectCount,
          lastReviewed: row.lastReviewed ? new Date(row.lastReviewed) : null,
          nextReview: row.nextReviewDate ? new Date(row.nextReviewDate) : null,
        }
      : initialSrsState(now);

    const applied = applySrsAnswer(prev, correct, now);
    const seen = new Set(row?.seenInLessons ?? []);
    if (lessonId) seen.add(lessonId);

    await db
      .insert(userVocabulary)
      .values({
        userId,
        languageId,
        vocabularyItemId: vocabItemId,
        isLearned: false,
        firstLearned: now,
        lastReviewed: applied.state.lastReviewed,
        reviewCount: applied.state.reviewCount,
        correctCount: applied.state.correctCount,
        incorrectCount: applied.state.incorrectCount,
        masteryScore: String(applied.state.mastery),
        nextReviewDate: applied.state.nextReview,
        seenInLessons: [...seen],
      })
      .onConflictDoUpdate({
        target: [userVocabulary.userId, userVocabulary.vocabularyItemId],
        set: {
          isLearned: sql`${userVocabulary.isLearned}`,
          firstLearned: sql`coalesce(${userVocabulary.firstLearned}, ${now})`,
          lastReviewed: applied.state.lastReviewed,
          reviewCount: applied.state.reviewCount,
          correctCount: applied.state.correctCount,
          incorrectCount: applied.state.incorrectCount,
          masteryScore: String(applied.state.mastery),
          nextReviewDate: applied.state.nextReview,
          seenInLessons: [...seen],
        },
      });
  }

  async updateGrammar(
    userId: string,
    languageId: string,
    conceptId: string,
    correct: boolean,
    now: Date,
  ) {
    const [row] = await db
      .select()
      .from(userGrammarProgress)
      .where(and(eq(userGrammarProgress.userId, userId), eq(userGrammarProgress.grammarConceptId, conceptId)));

    const prev = row
      ? {
          mastery: Number(row.masteryScore),
          reviewCount: row.reviewCount,
          correctCount: row.correctCount,
          incorrectCount: row.incorrectCount,
          lastReviewed: row.lastReviewed ? new Date(row.lastReviewed) : null,
          nextReview: row.nextReviewDate ? new Date(row.nextReviewDate) : null,
        }
      : initialSrsState(now);

    const applied = applySrsAnswer(prev, correct, now);

    await db
      .insert(userGrammarProgress)
      .values({
        userId,
        languageId,
        grammarConceptId: conceptId,
        reviewCount: applied.state.reviewCount,
        correctCount: applied.state.correctCount,
        incorrectCount: applied.state.incorrectCount,
        masteryScore: String(applied.state.mastery),
        nextReviewDate: applied.state.nextReview,
        lastReviewed: applied.state.lastReviewed,
      })
      .onConflictDoUpdate({
        target: [userGrammarProgress.userId, userGrammarProgress.grammarConceptId],
        set: {
          reviewCount: applied.state.reviewCount,
          correctCount: applied.state.correctCount,
          incorrectCount: applied.state.incorrectCount,
          masteryScore: String(applied.state.mastery),
          nextReviewDate: applied.state.nextReview,
          lastReviewed: applied.state.lastReviewed,
        },
      });
  }

  async gradeReviewItem(
    userId: string,
    languageId: string,
    itemId: string,
    kind: 'vocabulary' | 'grammar',
    answer: string,
    correctAnswer: string,
    correct: boolean,
    now: Date,
  ) {
    let vocabItemId: string | null = null;
    let grammarConceptId: string | null = null;

    if (kind === 'vocabulary') {
      const [row] = await db
        .select()
        .from(userVocabulary)
        .where(and(eq(userVocabulary.id, itemId), eq(userVocabulary.userId, userId)));
      if (!row) throw new Error('Položka na opakovanie neexistuje.');
      vocabItemId = row.vocabularyItemId;
      await this.updateVocabulary(userId, languageId, row.vocabularyItemId, correct, now);
    } else {
      const [row] = await db
        .select()
        .from(userGrammarProgress)
        .where(and(eq(userGrammarProgress.id, itemId), eq(userGrammarProgress.userId, userId)));
      if (!row) throw new Error('Položka na opakovanie neexistuje.');
      grammarConceptId = row.grammarConceptId;
      await this.updateGrammar(userId, languageId, row.grammarConceptId, correct, now);
    }

    if (!correct) {
      await this.recordReviewMistake(
        userId,
        languageId,
        kind,
        vocabItemId,
        grammarConceptId,
        answer,
        correctAnswer,
        now,
      );
    }

    await bumpStudyStreak(userId, languageId, now);

    return {
      correct,
      correctAnswer,
      explanation: correct
        ? null
        : kind === 'vocabulary'
          ? `Správny preklad: «${correctAnswer}»`
          : `Zopakuj si: «${correctAnswer}».`,
      masteryDelta: correct ? 0.25 : -0.45,
      xpEarned: correct ? 10 : 2,
    };
  }

  private async recordReviewMistake(
    userId: string,
    languageId: string,
    kind: 'vocabulary' | 'grammar',
    vocabItemId: string | null,
    grammarConceptId: string | null,
    answer: string,
    correctAnswer: string,
    now: Date,
  ) {
    let label = 'Neznámy pojem';
    let category: WeaknessCategory = 'vocabulary';
    let key = 'unknown';

    if (kind === 'vocabulary' && vocabItemId) {
      const [v] = await db
        .select({ spanish: vocabularyItems.spanish })
        .from(vocabularyItems)
        .where(eq(vocabularyItems.id, vocabItemId));
      label = v?.spanish ?? correctAnswer;
      key = `vocab:${vocabItemId}`;
      category = 'vocabulary';
    } else if (kind === 'grammar' && grammarConceptId) {
      const [g] = await db
        .select({ slug: grammarConcepts.slug, title: grammarConcepts.title })
        .from(grammarConcepts)
        .where(eq(grammarConcepts.id, grammarConceptId));
      label = g?.title ?? correctAnswer;
      key = `grammar:${g?.slug ?? grammarConceptId}`;
      category = 'grammar';
    }

    await db.insert(mistakes).values({
      userId,
      languageId,
      vocabularyItemId: vocabItemId,
      grammarConceptId,
      exerciseType: 'review',
      mistakeType: kind === 'vocabulary' ? 'vocabulary_review' : 'grammar_review',
      userAnswer: answer,
      correctAnswer,
      context: `Opakovanie: «${correctAnswer}»`,
    });

    await this.weaknessEngine.record({
      userId,
      languageId,
      category,
      key,
      label,
      vocabularyItemId: vocabItemId,
      grammarConceptId,
      isCorrect: false,
      now,
    });
  }
}
