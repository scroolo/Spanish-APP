import type { MasteryStage } from '@spanish/shared';

/**
 * Deterministic vocabulary/grammar mastery model.
 *
 * A single continuous score in [0, 1] is maintained per item (see srs.ts)
 * and updated on every exercise/review attempt. Stages are derived from the
 * score and the number of successful reviews — not from lesson completion.
 */
export const STAGE_THRESHOLDS = {
  LEARNING: 0.35,
  FAMILIAR: 0.6,
  STRONG: 0.75,
  MASTERED: 0.85,
} as const;

export const MIN_REVIEWS_FOR_MASTERED = 3;

export function stageFor(mastery: number, correctCount: number): MasteryStage {
  if (mastery === 0 && correctCount === 0) return 'NEW';
  if (mastery < STAGE_THRESHOLDS.LEARNING) return 'LEARNING';
  if (mastery < STAGE_THRESHOLDS.FAMILIAR) return 'FAMILIAR';
  if (mastery < STAGE_THRESHOLDS.STRONG) return 'STRONG';
  if (mastery < STAGE_THRESHOLDS.MASTERED) return 'STRONG';
  if (correctCount >= MIN_REVIEWS_FOR_MASTERED) return 'MASTERED';
  return 'STRONG';
}

/** Items below this accuracy (recent window) are considered weak. */
export const WEAK_ACCURACY_THRESHOLD = 0.7;
export const WEAK_MIN_ATTEMPTS = 2;
export const WEAK_RECENT_DAYS = 14;

export function accuracyOf(correct: number, total: number): number {
  return total > 0 ? Math.round((correct / total) * 100) : 0;
}

export function isWeakAccuracy(correct: number, total: number): boolean {
  if (total < WEAK_MIN_ATTEMPTS) return false;
  return correct / total < WEAK_ACCURACY_THRESHOLD;
}
