export interface SrsState {
  mastery: number;
  reviewCount: number;
  correctCount: number;
  incorrectCount: number;
  lastReviewed: Date | null;
  nextReview: Date | null;
}

export interface SrsResult {
  state: SrsState;
  mastered: boolean;
  nextIntervalDays: number;
}

export const MASTERED_THRESHOLD = 0.85;
export const MASTERED_MIN_REVIEWS = 3;
export const LONG_INTERVAL_THRESHOLD = 0.92;

export function initialSrsState(now: Date): SrsState {
  return {
    mastery: 0,
    reviewCount: 0,
    correctCount: 0,
    incorrectCount: 0,
    lastReviewed: null,
    nextReview: now,
  };
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Deterministic spaced-repetition scheduler.
 *
 * Intervals depend on the item's actual performance history:
 * - a fresh item answered wrong stays due for the same session (0 days),
 *   so it is offered again in review / the next assembly;
 * - any other wrong answer shortens the interval to 1 day;
 * - successful reviews extend the interval: +1, +3, +7, +14, then +30 days
 *   for items that are both strong and consistently correct.
 */
export function intervalFor(state: SrsState, isCorrect: boolean): number {
  if (!isCorrect) {
    return state.correctCount === 0 ? 0 : 1;
  }
  if (state.correctCount <= 1) return 1;
  if (state.correctCount === 2) return 3;
  if (state.correctCount === 3) return 7;
  if (state.correctCount === 4) return 14;
  if (state.mastery >= LONG_INTERVAL_THRESHOLD) return 30;
  return 14;
}

export function applySrsAnswer(prev: SrsState, isCorrect: boolean, now: Date): SrsResult {
  const mastery = isCorrect
    ? Math.min(1, prev.mastery + (1 - prev.mastery) * 0.25)
    : prev.mastery * 0.55;

  const state: SrsState = {
    mastery: Math.round(mastery * 10000) / 10000,
    reviewCount: prev.reviewCount + 1,
    correctCount: prev.correctCount + (isCorrect ? 1 : 0),
    incorrectCount: prev.incorrectCount + (isCorrect ? 0 : 1),
    lastReviewed: now,
    nextReview: null,
  };

  const nextIntervalDays = intervalFor(state, isCorrect);
  state.nextReview = addDays(now, nextIntervalDays);

  const mastered =
    state.mastery >= MASTERED_THRESHOLD && state.correctCount >= MASTERED_MIN_REVIEWS;

  return { state, mastered, nextIntervalDays };
}

export function isDue(state: SrsState, now: Date): boolean {
  if (!state.nextReview) return true;
  return state.nextReview <= now;
}
