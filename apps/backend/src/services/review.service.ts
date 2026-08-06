import { and, eq } from 'drizzle-orm';
import type { LessonReviewItemDto, ReviewSummaryDto } from '@spanish/shared';
import { db } from '../db/client.js';
import {
  grammarConcepts,
  userGrammarProgress,
  userVocabulary,
  vocabularyItems,
} from '../db/schema.js';
import { isDue, type SrsState } from '../learning/srs.js';
import { WeaknessEngine } from '../learning/weakness.js';

function toSrsState(row: {
  masteryScore: string;
  reviewCount: number;
  correctCount: number;
  incorrectCount: number;
  lastReviewed: Date | null;
  nextReviewDate: Date | null;
}): SrsState {
  return {
    mastery: Number(row.masteryScore),
    reviewCount: row.reviewCount,
    correctCount: row.correctCount,
    incorrectCount: row.incorrectCount,
    lastReviewed: row.lastReviewed ? new Date(row.lastReviewed) : null,
    nextReview: row.nextReviewDate ? new Date(row.nextReviewDate) : null,
  };
}

function pickDistractors(pool: string[], correct: string, count: number): string[] {
  const candidates = pool.filter((t) => t !== correct);
  const shuffled = candidates.sort(() => Math.random() - 0.5);
  return [correct, ...shuffled.slice(0, count - 1)].sort(() => Math.random() - 0.5);
}

export class ReviewService {
  constructor(private weaknessEngine: WeaknessEngine) {}

  private async dueVocabulary(userId: string, languageId: string, now: Date) {
    const vocabRows = await db
      .select({
        uv: userVocabulary,
        item: vocabularyItems,
      })
      .from(userVocabulary)
      .innerJoin(
        vocabularyItems,
        and(
          eq(userVocabulary.vocabularyItemId, vocabularyItems.id),
          eq(vocabularyItems.languageId, languageId),
        ),
      )
      .where(and(eq(userVocabulary.userId, userId), eq(userVocabulary.isLearned, true)))
      .limit(500);
    return vocabRows.filter((r) => isDue(toSrsState(r.uv), now));
  }

  private async dueGrammar(userId: string, languageId: string, now: Date) {
    const grammarRows = await db
      .select({
        up: userGrammarProgress,
        concept: grammarConcepts,
      })
      .from(userGrammarProgress)
      .innerJoin(
        grammarConcepts,
        and(
          eq(userGrammarProgress.grammarConceptId, grammarConcepts.id),
          eq(grammarConcepts.languageId, languageId),
        ),
      )
      .where(eq(userGrammarProgress.userId, userId))
      .limit(200);
    return grammarRows.filter((r) => isDue(toSrsState(r.up), now));
  }

  async getDueReviewItems(
    userId: string,
    languageId: string,
    limit: number,
    now: Date,
  ): Promise<LessonReviewItemDto[]> {
    const dueVocab = await this.dueVocabulary(userId, languageId, now);
    const dueGrammar = await this.dueGrammar(userId, languageId, now);

    const active = await this.weaknessEngine.getActive(userId, languageId);
    const weakVocabIds = new Set(
      active.filter((w) => w.category === 'vocabulary' && w.vocabularyItemId).map((w) => w.vocabularyItemId),
    );
    const weakGrammarIds = new Set(
      active.filter((w) => w.category === 'grammar' && w.grammarConceptId).map((w) => w.grammarConceptId),
    );

    const weakVocab = dueVocab.filter((r) => weakVocabIds.has(r.item.id));
    const restVocab = dueVocab.filter((r) => !weakVocabIds.has(r.item.id));
    const weakGrammar = dueGrammar.filter((r) => weakGrammarIds.has(r.concept.id));
    const restGrammar = dueGrammar.filter((r) => !weakGrammarIds.has(r.concept.id));

    const grammarSlice = Math.min(Math.ceil(limit / 3), dueGrammar.length);
    const weakVocabSlice = weakVocab.slice(0, Math.max(limit - grammarSlice, 2));
    const restVocabSlice = restVocab.slice(0, Math.max(limit - grammarSlice - weakVocabSlice.length, 0));
    const weakGrammarSlice = weakGrammar.slice(0, grammarSlice);
    const restGrammarSlice = restGrammar.slice(0, Math.max(grammarSlice - weakGrammarSlice.length, 0));

    const vocabSelected = [...weakVocabSlice, ...restVocabSlice];
    const grammarSelected = [...weakGrammarSlice, ...restGrammarSlice];

    const translationPool = dueVocab.map((r) => r.item.translation);
    const grammarTitlePool = dueGrammar.map((r) => r.concept.title);

    const items: LessonReviewItemDto[] = [];

    for (const row of vocabSelected) {
      const correct = row.item.translation;
      items.push({
        id: row.uv.id,
        kind: 'vocabulary',
        spanish: row.item.spanish,
        translation: correct,
        prompt: `Prelož do slovenčiny: «${row.item.spanish}»`,
        options: pickDistractors(translationPool, correct, 4),
        correctAnswer: correct,
        sourceTitle: row.item.translation,
      });
    }

    for (const row of grammarSelected) {
      const correct = row.concept.title;
      items.push({
        id: row.up.id,
        kind: 'grammar',
        spanish: row.concept.slug,
        translation: correct,
        prompt: `Aký gramatický jav je «${row.concept.title}»?`,
        options: pickDistractors(grammarTitlePool, correct, 4),
        correctAnswer: correct,
        sourceTitle: correct,
      });
    }

    return items.slice(0, limit);
  }

  async getSummary(userId: string, languageId: string, now: Date): Promise<ReviewSummaryDto> {
    const dueVocab = await this.dueVocabulary(userId, languageId, now);
    const dueGrammar = await this.dueGrammar(userId, languageId, now);
    const totalItems = dueVocab.length + dueGrammar.length;
    return {
      vocabCount: dueVocab.length,
      grammarCount: dueGrammar.length,
      estimatedMinutes: Math.max(1, Math.ceil(totalItems / 2)),
      totalItems,
    };
  }

  async countDue(userId: string, languageId: string, now: Date): Promise<number> {
    return (await this.dueVocabulary(userId, languageId, now)).length +
      (await this.dueGrammar(userId, languageId, now)).length;
  }
}
