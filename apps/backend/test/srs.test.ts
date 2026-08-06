import { describe, expect, it } from 'vitest';
import {
  applySrsAnswer,
  initialSrsState,
  intervalFor,
  isDue,
  MASTERED_MIN_REVIEWS,
  MASTERED_THRESHOLD,
} from '../src/learning/srs.js';

describe('applySrsAnswer', () => {
  const now = new Date('2026-08-06T10:00:00Z');

  it('starts with empty state and first correct answer schedules +1 day', () => {
    const state = initialSrsState(now);
    const result = applySrsAnswer(state, true, now);
    expect(result.state.reviewCount).toBe(1);
    expect(result.state.correctCount).toBe(1);
    expect(result.state.mastery).toBeGreaterThan(0);
    expect(result.state.nextReview!.getTime()).toBe(
      new Date('2026-08-07T10:00:00Z').getTime(),
    );
  });

  it('penalizes incorrect answers hard', () => {
    const state = initialSrsState(now);
    const ok = applySrsAnswer(state, true, now).state;
    const bad = applySrsAnswer(ok, false, now);
    expect(bad.state.mastery).toBeLessThan(ok.mastery);
    expect(bad.state.incorrectCount).toBe(1);
    expect(intervalFor(bad.state, false)).toBe(1);
  });

  it('lengthens intervals with consecutive successful reviews', () => {
    let state = initialSrsState(now);
    state = applySrsAnswer(state, true, now).state;
    expect(intervalFor(state, true)).toBe(1);
    state = applySrsAnswer(state, true, now).state;
    expect(intervalFor(state, true)).toBe(3);
    state = applySrsAnswer(state, true, now).state;
    expect(intervalFor(state, true)).toBe(7);
    state = applySrsAnswer(state, true, now).state;
    expect(intervalFor(state, true)).toBe(14);
  });

  it('schedules +30 days only for strong items with 5+ correct reviews', () => {
    let state = initialSrsState(now);
    for (let i = 0; i < 5; i++) state = applySrsAnswer(state, true, now).state;
    state.mastery = 0.95;
    expect(intervalFor(state, true)).toBe(30);
    state.mastery = 0.5;
    expect(intervalFor(state, true)).toBe(14);
  });

  it('schedules a fresh failure again in the same session (0 days)', () => {
    const state = initialSrsState(now);
    const result = applySrsAnswer(state, false, now);
    expect(result.state.incorrectCount).toBe(1);
    expect(result.state.nextReview!.getTime()).toBe(now.getTime());
  });

  it('shortens the interval to 1 day after a failure on a reviewed item', () => {
    let state = applySrsAnswer(initialSrsState(now), true, now).state;
    state = applySrsAnswer(state, false, now).state;
    expect(intervalFor(state, false)).toBe(1);
  });

  it('marks mastery above threshold with enough correct reviews', () => {
    let state = initialSrsState(now);
    let mastered = false;
    for (let i = 0; i < 10 && !mastered; i++) {
      state = applySrsAnswer(state, true, now).state;
      mastered = state.mastery >= MASTERED_THRESHOLD && state.correctCount >= MASTERED_MIN_REVIEWS;
    }
    expect(mastered).toBe(true);
  });

  it('mastery asymptotically approaches 1 but never exceeds it', () => {
    let state = initialSrsState(now);
    for (let i = 0; i < 50; i++) state = applySrsAnswer(state, true, now).state;
    expect(state.mastery).toBeLessThanOrEqual(1);
    expect(state.mastery).toBeGreaterThan(0.99);
  });

  it('isDue returns true when nextReview is null', () => {
    const state = initialSrsState(now);
    state.nextReview = null;
    expect(isDue(state, now)).toBe(true);
  });
});
