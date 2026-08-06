/**
 * Lesson composition by study duration.
 *
 * A learner's daily goal (15–120 min) drives how much material a single
 * lesson/study session pulls in. Buckets are explicit, not a simple linear
 * scale of vocabulary count.
 */
export interface DurationBucket {
  reviewItems: number;
  exerciseLimit: number | null;
  vocabularyPerLesson: number;
}

export const DURATION_BUCKETS: Record<number, DurationBucket> = {
  15: { reviewItems: 6, exerciseLimit: 4, vocabularyPerLesson: 8 },
  30: { reviewItems: 8, exerciseLimit: null, vocabularyPerLesson: 10 },
  45: { reviewItems: 10, exerciseLimit: null, vocabularyPerLesson: 12 },
  60: { reviewItems: 10, exerciseLimit: null, vocabularyPerLesson: 12 },
  90: { reviewItems: 12, exerciseLimit: null, vocabularyPerLesson: 14 },
  120: { reviewItems: 12, exerciseLimit: null, vocabularyPerLesson: 14 },
};

export function bucketFor(minutes: number): DurationBucket {
  const keys = Object.keys(DURATION_BUCKETS)
    .map(Number)
    .sort((a, b) => a - b);
  let chosen = DURATION_BUCKETS[30];
  for (const k of keys) {
    if (minutes >= k) chosen = DURATION_BUCKETS[k];
    else break;
  }
  return chosen;
}
