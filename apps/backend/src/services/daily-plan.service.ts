import { and, eq, gte, sql } from 'drizzle-orm';
import type { DailyPlanDto, DailyPlanItemDto } from '@spanish/shared';
import { db } from '../db/client.js';
import {
  lessonProgress,
  lessons,
  speakingAttempts,
  userGrammarProgress,
  userLanguages,
  userVocabulary,
} from '../db/schema.js';
import { composeDailyPlan } from '../learning/plan.js';
import { LessonService } from './lesson.service.js';
import { ReviewService } from './review.service.js';

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * Builds the "Dnešný plán" (Phase 2.1). The plan is a recommendation only —
 * it never blocks further learning. Course progress and the daily plan are
 * deliberately separate concerns: the plan reflects today's target, while the
 * curriculum determines which lesson is unlocked next.
 */
export class DailyPlanService {
  constructor(
    private lessonService: LessonService,
    private reviewService: ReviewService,
  ) {}

  async build(userId: string, languageId: string, now: Date): Promise<DailyPlanDto> {
    const [ul] = await db
      .select()
      .from(userLanguages)
      .where(and(eq(userLanguages.userId, userId), eq(userLanguages.languageId, languageId)));
    const goal = ul?.dailyMinutes ?? 30;
    const todayStart = startOfDay(now);
    const dayAgo = new Date(now.getTime() - 86_400_000);

    const dueCount = await this.reviewService.countDue(userId, languageId, now);
    const next = await this.lessonService.getNextLessonInfo(userId, languageId);

    const [lessonsTodayRows] = await db
      .select({
        minutes: sql<number>`coalesce(sum(${lessons.estimatedMinutes}), 0)::int`,
        count: sql<number>`count(*)::int`,
      })
      .from(lessonProgress)
      .innerJoin(lessons, eq(lessonProgress.lessonId, lessons.id))
      .where(
        and(
          eq(lessonProgress.userId, userId),
          eq(lessonProgress.languageId, languageId),
          eq(lessonProgress.status, 'completed'),
          gte(lessonProgress.completedAt, todayStart),
        ),
      );
    const lessonsCompletedToday = lessonsTodayRows?.count ?? 0;
    const lessonsMinutesToday = lessonsTodayRows?.minutes ?? 0;

    const [lessons24hRows] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(lessonProgress)
      .where(
        and(
          eq(lessonProgress.userId, userId),
          eq(lessonProgress.languageId, languageId),
          eq(lessonProgress.status, 'completed'),
          gte(lessonProgress.completedAt, dayAgo),
        ),
      );
    const lessonsCompleted24h = lessons24hRows?.count ?? 0;

    const [vocabReviewed] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(userVocabulary)
      .where(
        and(
          eq(userVocabulary.userId, userId),
          eq(userVocabulary.languageId, languageId),
          gte(userVocabulary.lastReviewed, todayStart),
        ),
      );
    const [grammarReviewed] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(userGrammarProgress)
      .where(
        and(
          eq(userGrammarProgress.userId, userId),
          eq(userGrammarProgress.languageId, languageId),
          gte(userGrammarProgress.lastReviewed, todayStart),
        ),
      );
    const reviewItemsToday = (vocabReviewed?.count ?? 0) + (grammarReviewed?.count ?? 0);
    const reviewMinutesToday = Math.ceil(reviewItemsToday / 2);

    const [speakingRows] = await db
      .select({ seconds: sql<number>`coalesce(sum(${speakingAttempts.recordedSeconds}), 0)::int` })
      .from(speakingAttempts)
      .where(
        and(
          eq(speakingAttempts.userId, userId),
          eq(speakingAttempts.languageId, languageId),
          gte(speakingAttempts.createdAt, todayStart),
        ),
      );
    const speakingMinutesToday = Math.ceil((speakingRows?.seconds ?? 0) / 60);

    const spec = composeDailyPlan({
      goalMinutes: goal,
      dueReviewCount: dueCount,
      lessonMinutes: next?.estimatedMinutes ?? null,
      lessonsCompletedToday,
      lessonsCompleted24h,
    });

    const items: DailyPlanItemDto[] = spec.items.map((it) => {
      const done =
        it.kind === 'lesson'
          ? lessonsCompletedToday >= 1
          : it.kind === 'review'
            ? reviewMinutesToday >= it.minutes
            : it.kind === 'speaking'
              ? speakingMinutesToday >= it.minutes
              : false;
      return {
        kind: it.kind,
        title: it.title,
        minutes: it.minutes,
        lessonId: it.kind === 'lesson' ? next?.id ?? null : null,
        ...(it.kind === 'review' ? { reviewItems: dueCount } : {}),
        done,
      };
    });

    const completedMinutes = lessonsMinutesToday + reviewMinutesToday + speakingMinutesToday;

    return {
      durationGoal: goal,
      completedMinutes,
      plannedMinutes: items.reduce((sum, i) => sum + i.minutes, 0),
      status: completedMinutes >= goal ? 'done' : 'pending',
      reviewDueCount: dueCount,
      fastLearner: spec.fastLearner,
      emphasizeReview: spec.emphasizeReview,
      items,
    };
  }
}
