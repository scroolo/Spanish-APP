/**
 * CEFR level progression — Phase 1.5 formula.
 *
 * A learner's progress inside a level is NOT measured by lesson count alone.
 * It is a weighted blend of four real, stored signals:
 *
 *   curriculum   40 %  completed lessons / lessons in the level's course
 *   vocabulary   30 %  learned words        / target words for the level
 *   grammar      20 %  progressed concepts  / grammar concepts for the level
 *   review       10 %  lifetime SRS accuracy (correct / total reviews)
 *
 * The learner advances to the next CEFR level once every lesson in the
 * current level's course is completed AND the blended score reaches 100 %.
 */
export interface CefrMetrics {
  lessonsCompleted: number;
  levelLessonCount: number;
  levelVocabTarget: number;
  vocabLearned: number;
  levelGrammarCount: number;
  grammarProgressed: number;
  reviewAccuracy: number | null;
}

export const CEFR_WEIGHTS = {
  curriculum: 0.4,
  vocabulary: 0.3,
  grammar: 0.2,
  review: 0.1,
} as const;

export function cefrLevelPercent(m: CefrMetrics): number {
  const curriculum = m.levelLessonCount > 0 ? m.lessonsCompleted / m.levelLessonCount : 0;
  const vocabulary = m.levelVocabTarget > 0 ? Math.min(1, m.vocabLearned / m.levelVocabTarget) : 0;
  const grammar = m.levelGrammarCount > 0 ? Math.min(1, m.grammarProgressed / m.levelGrammarCount) : 0;
  const review = m.reviewAccuracy ?? 1;
  const raw =
    CEFR_WEIGHTS.curriculum * curriculum +
    CEFR_WEIGHTS.vocabulary * vocabulary +
    CEFR_WEIGHTS.grammar * grammar +
    CEFR_WEIGHTS.review * review;
  return Math.min(100, Math.round(raw * 100));
}

export function canAdvanceLevel(m: CefrMetrics): boolean {
  return m.levelLessonCount > 0 && m.lessonsCompleted >= m.levelLessonCount && cefrLevelPercent(m) >= 100;
}
