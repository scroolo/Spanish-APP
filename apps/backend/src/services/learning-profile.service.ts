import { and, desc, eq, sql } from 'drizzle-orm';
import type { LearningProfileDto, TopicStat } from '@spanish/shared';
import { db } from '../db/client.js';
import {
  grammarConcepts,
  mistakes,
  userGrammarProgress,
  userLanguages,
  userStatistics,
  userVocabulary,
  vocabularyItems,
} from '../db/schema.js';
import { stageFor } from '../learning/mastery.js';
import { WeaknessEngine } from '../learning/weakness.js';

/**
 * Derived, concise learning profile for a user.
 *
 * Built entirely from stored progress data (no fabricated metrics). Intended
 * to be consumed later by AI features (Phase 2): it summarises where the
 * learner is, what they have struggled with and what to practise next.
 */
export class LearningProfileService {
  constructor(private weaknessEngine: WeaknessEngine) {}

  async get(userId: string, languageId: string, now: Date): Promise<LearningProfileDto> {
    const [ul] = await db
      .select()
      .from(userLanguages)
      .where(and(eq(userLanguages.userId, userId), eq(userLanguages.languageId, languageId)));
    const [stats] = await db
      .select()
      .from(userStatistics)
      .where(and(eq(userStatistics.userId, userId), eq(userStatistics.languageId, languageId)));

    const vocabRows = await db
      .select({
        uv: userVocabulary,
        item: vocabularyItems,
      })
      .from(userVocabulary)
      .innerJoin(vocabularyItems, eq(userVocabulary.vocabularyItemId, vocabularyItems.id))
      .where(and(eq(userVocabulary.userId, userId), eq(vocabularyItems.languageId, languageId)))
      .orderBy(desc(userVocabulary.lastReviewed))
      .limit(1000);

    let mastered = 0;
    let strong = 0;
    let needsReview = 0;
    for (const r of vocabRows) {
      const stage = stageFor(Number(r.uv.masteryScore), r.uv.correctCount);
      if (stage === 'MASTERED') mastered += 1;
      else if (stage === 'STRONG') strong += 1;
      if (r.uv.nextReviewDate && new Date(r.uv.nextReviewDate) <= now) needsReview += 1;
    }

    const recent = vocabRows
      .filter((r) => r.uv.lastReviewed)
      .slice(0, 10)
      .map((r) => ({
        spanish: r.item.spanish,
        translation: r.item.translation,
        reviewedAt: r.uv.lastReviewed!.toISOString(),
      }));

    const weakTerms = await this.weaknessEngine.weakVocabularyTerms(userId, languageId, 20);
    const weakGrammar = await this.weaknessEngine.weakGrammar(userId, languageId, 10);

    const grammarProgress = await db
      .select({
        up: userGrammarProgress,
        concept: grammarConcepts,
      })
      .from(userGrammarProgress)
      .innerJoin(grammarConcepts, eq(userGrammarProgress.grammarConceptId, grammarConcepts.id))
      .where(and(eq(userGrammarProgress.userId, userId), eq(grammarConcepts.languageId, languageId)))
      .limit(500);

    const knownGrammar = grammarProgress
      .filter((g) => stageFor(Number(g.up.masteryScore), g.up.correctCount) === 'MASTERED')
      .map((g) => g.concept.title);

    const recentMistakes = await db
      .select({
        vocabularySpanish: vocabularyItems.spanish,
        grammarKey: grammarConcepts.slug,
        correctAnswer: mistakes.correctAnswer,
        userAnswer: mistakes.userAnswer,
        createdAt: mistakes.createdAt,
      })
      .from(mistakes)
      .leftJoin(vocabularyItems, eq(mistakes.vocabularyItemId, vocabularyItems.id))
      .leftJoin(grammarConcepts, eq(mistakes.grammarConceptId, grammarConcepts.id))
      .where(eq(mistakes.userId, userId))
      .orderBy(desc(mistakes.createdAt))
      .limit(10);

    const skillPercent: Record<string, number> = {};
    const rows = await db
      .select({
        moduleTitle: grammarConcepts.title,
        stage: userGrammarProgress.masteryScore,
      })
      .from(userGrammarProgress)
      .innerJoin(grammarConcepts, eq(userGrammarProgress.grammarConceptId, grammarConcepts.id))
      .where(and(eq(userGrammarProgress.userId, userId), eq(grammarConcepts.languageId, languageId)))
      .limit(500);
    for (const r of rows) {
      const mastery = Number(r.stage);
      if (mastery > 0) skillPercent[r.moduleTitle] = Math.round(mastery * 100);
    }

    const topics: TopicStat[] = Object.entries(skillPercent).map(([label, percent]) => ({
      label,
      percent,
    }));

    return {
      targetLanguage: 'es-ES',
      nativeLanguage: 'sk-SK',
      cefrLevel: ul?.cefrLevel ?? 'A0',
      studyMinutes: ul?.dailyMinutes ?? 30,
      vocabulary: {
        learned: vocabRows.filter((r) => r.uv.isLearned).length,
        mastered,
        strong,
        needsReview,
        weak: weakTerms,
        recent,
      },
      grammar: {
        known: knownGrammar,
        weak: weakGrammar,
      },
      recentMistakes: recentMistakes.map((m) => ({
        vocabularySpanish: m.vocabularySpanish ?? null,
        grammarKey: m.grammarKey ?? null,
        correctAnswer: m.correctAnswer ?? null,
        userAnswer: m.userAnswer ?? null,
        createdAt: new Date(m.createdAt).toISOString(),
      })),
      strongTopics: topics.sort((a, b) => b.percent - a.percent).slice(0, 5),
      weakTopics: topics.sort((a, b) => a.percent - b.percent).slice(0, 5),
      generatedAt: now.toISOString(),
    };
  }
}
