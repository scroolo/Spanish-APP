import { describe, expect, it } from 'vitest';
import { computeStreak } from '../src/learning/streak.js';

const DAY = 86_400_000;

describe('computeStreak', () => {
  const now = new Date('2026-08-06T10:00:00Z');
  const yesterday = new Date(now.getTime() - DAY);
  const twoDaysAgo = new Date(now.getTime() - 2 * DAY);

  it('starts a streak of 1 on the first study day', () => {
    expect(computeStreak({ currentStreak: 0, lastStudyDate: null }, now)).toBe(1);
  });

  it('keeps the same streak when studying again the same calendar day', () => {
    const lastStudyDate = new Date('2026-08-06T08:00:00Z');
    expect(computeStreak({ currentStreak: 5, lastStudyDate }, now)).toBe(5);
  });

  it('increments by one on the next calendar day', () => {
    expect(computeStreak({ currentStreak: 5, lastStudyDate: yesterday }, now)).toBe(6);
  });

  it('resets to 1 after a gap of more than one day', () => {
    expect(computeStreak({ currentStreak: 5, lastStudyDate: twoDaysAgo }, now)).toBe(1);
  });

  it('never multiplies within a single day (review + lesson same day)', () => {
    const lastStudyDate = new Date('2026-08-06T00:30:00Z');
    expect(computeStreak({ currentStreak: 3, lastStudyDate }, now)).toBe(3);
  });
});
