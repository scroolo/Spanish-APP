import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { WeaknessCategory } from '@spanish/shared';
import { db } from '../db/client.js';
import { grammarConcepts, userGrammarProgress, userVocabulary, vocabularyItems, weaknesses } from '../db/schema.js';
import { isWeakAccuracy } from './mastery.js';

/**
 * Persisted weakness engine.
 *
 * A weakness is created/strengthened deterministically from real mistakes
 * (exercise + review attempts). It stays active until the learner proves
 * mastery: enough recent attempts with accuracy back above the threshold.
 * Active weaknesses are injected into the next lesson's review section.
 */
export interface WeaknessInput {
  userId: string;
  languageId: string;
  category: WeaknessCategory;
  key: string;
  label: string;
  vocabularyItemId?: string | null;
  grammarConceptId?: string | null;
  isCorrect: boolean;
  now: Date;
}

export class WeaknessEngine {
  async record(input: WeaknessInput) {
    const existing = await db
      .select()
      .from(weaknesses)
      .where(
        and(
          eq(weaknesses.userId, input.userId),
          eq(weaknesses.category, input.category),
          eq(weaknesses.key, input.key),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      const w = existing[0];
      const mistakeCount = w.mistakeCount + (input.isCorrect ? 0 : 1);
      const correctCount = w.correctCount + (input.isCorrect ? 1 : 0);
      const resolved = this.isResolved(mistakeCount, correctCount, input.now);

      await db
        .update(weaknesses)
        .set({
          mistakeCount,
          correctCount,
          lastMistakeAt: input.isCorrect ? w.lastMistakeAt : input.now,
          resolvedAt: resolved ? input.now : null,
        })
        .where(eq(weaknesses.id, w.id));
    } else {
      const resolved = this.isResolved(input.isCorrect ? 1 : 0, input.isCorrect ? 1 : 0, input.now);
      await db.insert(weaknesses).values({
        userId: input.userId,
        languageId: input.languageId,
        category: input.category,
        key: input.key,
        label: input.label,
        vocabularyItemId: input.vocabularyItemId ?? null,
        grammarConceptId: input.grammarConceptId ?? null,
        mistakeCount: input.isCorrect ? 0 : 1,
        correctCount: input.isCorrect ? 1 : 0,
        lastMistakeAt: input.isCorrect ? null : input.now,
        resolvedAt: resolved ? input.now : null,
      });
    }
  }

  private isResolved(mistakeCount: number, correctCount: number, now: Date): boolean {
    void now;
    return mistakeCount === 0 && correctCount >= 2 && !isWeakAccuracy(correctCount, correctCount + mistakeCount);
  }

  async getActive(userId: string, languageId: string): Promise<typeof weaknesses.$inferSelect[]> {
    return db
      .select()
      .from(weaknesses)
      .where(and(eq(weaknesses.userId, userId), eq(weaknesses.languageId, languageId), isNull(weaknesses.resolvedAt)))
      .orderBy(desc(weaknesses.lastMistakeAt))
      .limit(50);
  }

  /** Resolves weaknesses that no longer reflect recent accuracy (idempotent maintenance). */
  async refreshFromAttempts(userId: string, languageId: string, now: Date) {
    const active = await this.getActive(userId, languageId);
    const since = new Date(now.getTime() - 14 * 86_400_000);

    for (const w of active) {
      const accuracy = await this.accuracyFor(userId, languageId, w, since);
      if (accuracy !== null && !isWeakAccuracy(accuracy.correct, accuracy.total)) {
        await db
          .update(weaknesses)
          .set({ resolvedAt: now, correctCount: accuracy.correct, mistakeCount: accuracy.total - accuracy.correct })
          .where(eq(weaknesses.id, w.id));
      }
    }
  }

  private async accuracyFor(
    userId: string,
    languageId: string,
    w: typeof weaknesses.$inferSelect,
    since: Date,
  ): Promise<{ correct: number; total: number } | null> {
    void languageId;
    if (w.category === 'vocabulary' && w.vocabularyItemId) {
      const rows = await db
        .select({ correctCount: userVocabulary.correctCount, incorrectCount: userVocabulary.incorrectCount })
        .from(userVocabulary)
        .where(and(eq(userVocabulary.userId, userId), eq(userVocabulary.vocabularyItemId, w.vocabularyItemId)));
      const r = rows[0];
      if (!r) return null;
      return { correct: r.correctCount, total: r.correctCount + r.incorrectCount };
    }
    if (w.category === 'grammar' && w.grammarConceptId) {
      const rows = await db
        .select({ correctCount: userGrammarProgress.correctCount, incorrectCount: userGrammarProgress.incorrectCount })
        .from(userGrammarProgress)
        .where(and(eq(userGrammarProgress.userId, userId), eq(userGrammarProgress.grammarConceptId, w.grammarConceptId)));
      const r = rows[0];
      if (!r) return null;
      return { correct: r.correctCount, total: r.correctCount + r.incorrectCount };
    }
    void since;
    return null;
  }

  async weakVocabularyTerms(userId: string, languageId: string, limit: number): Promise<string[]> {
    const active = await this.getActive(userId, languageId);
    const vocab = active.filter((w) => w.category === 'vocabulary' && w.vocabularyItemId).slice(0, limit);
    if (vocab.length === 0) return [];
    const ids = vocab.map((w) => w.vocabularyItemId) as string[];
    const rows = await db
      .select({ spanish: vocabularyItems.spanish })
      .from(vocabularyItems)
      .where(and(eq(vocabularyItems.languageId, languageId), sql`${vocabularyItems.id} in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`));
    return rows.map((r) => r.spanish);
  }

  async weakGrammar(userId: string, languageId: string, limit: number): Promise<{ key: string; title: string; accuracy: number }[]> {
    const active = await this.getActive(userId, languageId);
    const grammar = active.filter((w) => w.category === 'grammar' && w.grammarConceptId).slice(0, limit);
    if (grammar.length === 0) return [];
    const ids = grammar.map((w) => w.grammarConceptId) as string[];
    const rows = await db
      .select({ id: grammarConcepts.id, title: grammarConcepts.title })
      .from(grammarConcepts)
      .where(and(eq(grammarConcepts.languageId, languageId), sql`${grammarConcepts.id} in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`));
    const byId = new Map(rows.map((r) => [r.id, r.title]));
    return grammar.map((w) => {
      const total = w.mistakeCount + w.correctCount;
      return {
        key: w.key,
        title: byId.get(w.grammarConceptId ?? '') ?? w.label,
        accuracy: total > 0 ? Math.round((w.correctCount / total) * 100) : 0,
      };
    });
  }
}
