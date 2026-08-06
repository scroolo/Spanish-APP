import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { userStatistics } from '../db/schema.js';

/**
 * Calendar-day streak logic (Phase 2.1).
 *
 * A streak is one point per calendar day of meaningful learning activity —
 * it is never multiplied by how many lessons/exercises were done. A day is
 * "touched" by lesson completion, review attempts and speaking practice.
 */

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function computeStreak(
  stats: { currentStreak: number; lastStudyDate: Date | null },
  now: Date,
): number {
  const today = startOfDay(now);
  const last = stats.lastStudyDate ? startOfDay(new Date(stats.lastStudyDate)) : null;
  if (last && last.getTime() === today.getTime()) return stats.currentStreak;
  if (last && today.getTime() - last.getTime() === 86_400_000) return stats.currentStreak + 1;
  return 1;
}

/**
 * Records meaningful study activity for the calendar day: recomputes the
 * streak from the previous study date and bumps `last_study_date`. No-op when
 * no statistics row exists yet (created on onboarding).
 */
export async function bumpStudyStreak(userId: string, languageId: string, now: Date): Promise<void> {
  const [stats] = await db
    .select()
    .from(userStatistics)
    .where(and(eq(userStatistics.userId, userId), eq(userStatistics.languageId, languageId)));
  if (!stats) return;

  const streak = computeStreak(
    { currentStreak: stats.currentStreak, lastStudyDate: stats.lastStudyDate },
    now,
  );

  await db
    .update(userStatistics)
    .set({
      currentStreak: streak,
      longestStreak: sql`greatest(${userStatistics.longestStreak}, ${streak})`,
      lastStudyDate: now,
    })
    .where(and(eq(userStatistics.userId, userId), eq(userStatistics.languageId, languageId)));
}
