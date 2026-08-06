import { describe, expect, it } from 'vitest';
import { composeDailyPlan } from '../src/learning/plan.js';

function plan(overrides: Partial<Parameters<typeof composeDailyPlan>[0]> = {}) {
  return composeDailyPlan({
    goalMinutes: 30,
    dueReviewCount: 0,
    lessonMinutes: 20,
    lessonsCompletedToday: 0,
    lessonsCompleted24h: 0,
    ...overrides,
  });
}

describe('composeDailyPlan', () => {
  it('always recommends the next lesson for a fresh day', () => {
    const p = plan();
    expect(p.items.map((i) => i.kind)).toEqual(['lesson', 'speaking']);
  });

  it('adds a review block sized to the due backlog (30 min)', () => {
    const p = plan({ dueReviewCount: 8, lessonMinutes: 20 });
    // capacity = 30 - 20 - 5 (speaking) = 5, review = min(ceil(8/2)=4, 5)
    expect(p.items.find((i) => i.kind === 'review')?.minutes).toBe(4);
    expect(p.items.find((i) => i.kind === 'speaking')?.minutes).toBe(5);
  });

  it('does not force review when the lesson fills the whole goal', () => {
    const p = plan({ dueReviewCount: 12, lessonMinutes: 25 });
    expect(p.items.find((i) => i.kind === 'review')).toBeUndefined();
  });

  it('15-minute plan stays compact: review + lesson, no extras', () => {
    const p = plan({ goalMinutes: 15, dueReviewCount: 6, lessonMinutes: 10 });
    const kinds = p.items.map((i) => i.kind);
    expect(kinds).toContain('review');
    expect(kinds).toContain('lesson');
    expect(kinds).not.toContain('speaking');
    expect(kinds).not.toContain('conversation');
  });

  it('escalates extras with the goal (30/45/60/90/120)', () => {
    const cases: Array<[number, string[]]> = [
      [30, ['speaking']],
      [45, ['speaking', 'personalized']],
      [60, ['speaking', 'personalized', 'conversation']],
      [90, ['speaking', 'personalized', 'conversation']],
      [120, ['speaking', 'personalized', 'conversation']],
    ];
    for (const [goal, extras] of cases) {
      const p = plan({ goalMinutes: goal });
      for (const kind of extras) {
        expect(p.items.map((i) => i.kind), `goal ${goal}`).toContain(kind);
      }
    }
  });

  it('gives 120-minute learners more speaking practice', () => {
    const p = plan({ goalMinutes: 120, lessonMinutes: 30 });
    expect(p.items.find((i) => i.kind === 'speaking')?.minutes).toBe(15);
    expect(p.items.find((i) => i.kind === 'personalized')?.minutes).toBe(10);
  });

  it('boosts review time for fast learners (2+ lessons in 24h)', () => {
    const p = plan({ dueReviewCount: 12, lessonMinutes: 20, lessonsCompleted24h: 2 });
    expect(p.fastLearner).toBe(true);
    // base review = min(6, 5) = 5 → boosted toward min(6, 15) = 6
    expect(p.items.find((i) => i.kind === 'review')?.minutes).toBe(6);
  });

  it('does not flag fast learner after a single lesson', () => {
    expect(plan({ lessonsCompleted24h: 1 }).fastLearner).toBe(false);
  });

  it('emphasizes review when the backlog is large', () => {
    expect(plan({ dueReviewCount: 25 }).emphasizeReview).toBe(true);
    expect(plan({ dueReviewCount: 5 }).emphasizeReview).toBe(false);
  });

  it('drops the lesson item when the course is complete', () => {
    const p = plan({ lessonMinutes: null, dueReviewCount: 10, goalMinutes: 60 });
    const kinds = p.items.map((i) => i.kind);
    expect(kinds).not.toContain('lesson');
    expect(kinds).toContain('review');
    expect(kinds).toContain('speaking');
  });

  it('planned minutes roughly match the goal', () => {
    for (const goal of [15, 30, 45, 60, 90, 120]) {
      const p = plan({ goalMinutes: goal, dueReviewCount: 20, lessonMinutes: 25 });
      const total = p.items.reduce((s, i) => s + i.minutes, 0);
      expect(total, `goal ${goal}`).toBeGreaterThan(0);
      expect(total, `goal ${goal}`).toBeLessThanOrEqual(goal + 10);
    }
  });
});
