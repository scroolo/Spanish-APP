import type { DailyPlanItemKind } from '@spanish/shared';

/**
 * Deterministic daily-plan composition (Phase 2.1).
 *
 * The plan is a *recommendation* only — it never locks the learner. It is
 * composed from the user's daily minute goal (15/30/45/60/90/120), the due
 * review backlog, and the next course lesson. Fast learners get extra review
 * time, and a large backlog flags "review first" (but never blocks the lesson).
 */
export interface ComposePlanInput {
  goalMinutes: number;
  dueReviewCount: number;
  /** estimated minutes of the next course lesson, null when the course is done */
  lessonMinutes: number | null;
  lessonsCompletedToday: number;
  /** lessons completed in the last 24h (fast-learner signal) */
  lessonsCompleted24h: number;
}

export interface ComposedPlanItem {
  kind: DailyPlanItemKind;
  /** Slovak recommendation title rendered by the client. */
  title: string;
  minutes: number;
}

export interface ComposedPlan {
  items: ComposedPlanItem[];
  fastLearner: boolean;
  emphasizeReview: boolean;
}

function fixedFor(goal: number): { speaking: number; personalized: number; conversation: number } {
  return {
    speaking: goal >= 120 ? 15 : goal >= 90 ? 10 : goal >= 30 ? 5 : 0,
    personalized: goal >= 90 ? 10 : goal >= 45 ? 5 : 0,
    conversation: goal >= 60 ? 5 : 0,
  };
}

export function composeDailyPlan(input: ComposePlanInput): ComposedPlan {
  const fixed = fixedFor(input.goalMinutes);
  const fixedSum = fixed.speaking + fixed.personalized + fixed.conversation;
  const lessonMinutes = input.lessonMinutes ?? 0;
  const due = Math.max(0, input.dueReviewCount);

  // Review fills the time left after the lesson and the fixed activities
  // (~2 review items per minute), but never more than what is due.
  const capacity = Math.max(0, input.goalMinutes - lessonMinutes - fixedSum);
  let reviewMinutes = due > 0 ? Math.min(Math.ceil(due / 2), capacity) : 0;
  if (due > 0 && reviewMinutes === 0 && capacity > 0) reviewMinutes = 1;

  const fastLearner = input.lessonsCompleted24h >= 2;
  if (fastLearner && due > 0) {
    reviewMinutes = Math.min(Math.ceil(due / 2), reviewMinutes + 10);
  }

  const emphasizeReview = due >= 20;

  const items: ComposedPlanItem[] = [];
  if (reviewMinutes > 0) items.push({ kind: 'review', title: 'Opakovanie', minutes: reviewMinutes });
  if (input.lessonMinutes != null && lessonMinutes > 0) {
    items.push({ kind: 'lesson', title: 'Ďalšia lekcia', minutes: lessonMinutes });
  }
  if (fixed.speaking > 0) items.push({ kind: 'speaking', title: 'Hovorenie', minutes: fixed.speaking });
  if (fixed.personalized > 0) {
    items.push({ kind: 'personalized', title: 'Precvičiť slabiny', minutes: fixed.personalized });
  }
  if (fixed.conversation > 0) {
    items.push({ kind: 'conversation', title: 'Konverzácia', minutes: fixed.conversation });
  }

  return { items, fastLearner, emphasizeReview };
}
