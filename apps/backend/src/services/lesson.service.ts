import { and, asc, eq, gte, inArray, sql } from 'drizzle-orm';
import type { AttemptResult, ExerciseDto, ExerciseType, LessonCompleteResult, LessonDto } from '@spanish/shared';
import { db } from '../db/client.js';
import {
  achievements,
  courses,
  exerciseAttempts,
  exercises,
  grammarConcepts,
  lessonProgress,
  lessons,
  modules,
  userAchievements,
  userGrammarProgress,
  userLanguages,
  userStatistics,
  userVocabulary,
  vocabularyItems,
} from '../db/schema.js';
import { applySrsAnswer, initialSrsState } from '../learning/srs.js';
import { isCorrectAnswer } from '../learning/answer.js';
import { WeaknessEngine } from '../learning/weakness.js';
import { bucketFor } from '../learning/duration.js';
import { canAdvanceLevel } from '../learning/cefr.js';
import { computeStreak } from '../learning/streak.js';
import { ReviewService } from './review.service.js';
import { SrsService } from './srs.service.js';
import { LearningSignalsService } from './learning-signals.service.js';
import { TtsService } from './tts.service.js';
import { config } from '../config.js';

const CEFR_ORDER = ['A0', 'A1', 'A2', 'B1', 'B2', 'C1'] as const;
const XP_LESSON_BONUS = 50;

export class LessonService {
  constructor(
    private reviewService: ReviewService,
    private srsService: SrsService,
    private weaknessEngine: WeaknessEngine,
    private signals: LearningSignalsService,
    private ttsService: TtsService,
  ) {}

  private async getActiveCourse(languageId: string, cefrLevel: string) {
    const [course] = await db
      .select()
      .from(courses)
      .where(and(eq(courses.languageId, languageId), eq(courses.cefrLevel, cefrLevel)))
      .orderBy(asc(courses.sortOrder));
    return course ?? null;
  }

  private async resolveNextLesson(
    userId: string,
    languageId: string,
    cefrLevel: string,
  ): Promise<{ lesson: typeof lessons.$inferSelect; level: string; advanced: boolean } | null> {
    let level = cefrLevel;
    let course = await this.getActiveCourse(languageId, level);
    if (!course) return null;

    const completedRows = await db
      .select({ id: lessonProgress.lessonId })
      .from(lessonProgress)
      .where(
        and(
          eq(lessonProgress.userId, userId),
          eq(lessonProgress.languageId, languageId),
          eq(lessonProgress.status, 'completed'),
        ),
      );
    const completedIds = new Set(completedRows.map((c) => c.id));

    for (let guard = 0; guard < CEFR_ORDER.length; guard++) {
      const lessonRows = await db
        .select({ lesson: lessons })
        .from(lessons)
        .innerJoin(modules, eq(lessons.moduleId, modules.id))
        .where(eq(modules.courseId, course.id))
        .orderBy(asc(modules.sortOrder), asc(lessons.sortOrder));

      const next = lessonRows.find((l) => !completedIds.has(l.lesson.id));
      if (next) {
        return { lesson: next.lesson, level, advanced: level !== cefrLevel };
      }

      if (level === cefrLevel && !(await this.canAdvanceLevel(userId, languageId, level))) {
        return null;
      }

      const idx = CEFR_ORDER.indexOf(level as (typeof CEFR_ORDER)[number]);
      if (idx < 0 || idx >= CEFR_ORDER.length - 1) return null;
      level = CEFR_ORDER[idx + 1];
      course = await this.getActiveCourse(languageId, level);
      if (!course) return null;
    }
    return null;
  }

  private async canAdvanceLevel(userId: string, languageId: string, level: string): Promise<boolean> {
    const course = await this.getActiveCourse(languageId, level);
    if (!course) return false;

    const moduleRows = await db.select().from(modules).where(eq(modules.courseId, course.id));
    const moduleIds = moduleRows.map((m) => m.id);

    const [completedRows] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(lessonProgress)
      .innerJoin(lessons, eq(lessonProgress.lessonId, lessons.id))
      .innerJoin(modules, eq(lessons.moduleId, modules.id))
      .where(
        and(
          eq(lessonProgress.userId, userId),
          eq(lessonProgress.status, 'completed'),
          inArray(modules.id, moduleIds),
        ),
      );
    const [totalLessons] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(lessons)
      .where(inArray(lessons.moduleId, moduleIds));
    const [vocabTarget] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(vocabularyItems)
      .where(inArray(vocabularyItems.moduleId, moduleIds));
    const [vocabLearned] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(userVocabulary)
      .where(and(eq(userVocabulary.userId, userId), eq(userVocabulary.isLearned, true)));
    const [grammarTotal] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(grammarConcepts)
      .where(inArray(grammarConcepts.moduleId, moduleIds));
    const [grammarProgressed] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(userGrammarProgress)
      .where(eq(userGrammarProgress.userId, userId));

    const reviewAccuracy = await this.reviewAccuracyFor(userId);

    return canAdvanceLevel({
      lessonsCompleted: completedRows?.count ?? 0,
      levelLessonCount: totalLessons?.count ?? 0,
      levelVocabTarget: vocabTarget?.count ?? 0,
      vocabLearned: vocabLearned?.count ?? 0,
      levelGrammarCount: grammarTotal?.count ?? 0,
      grammarProgressed: grammarProgressed?.count ?? 0,
      reviewAccuracy,
    });
  }

  private async reviewAccuracyFor(userId: string): Promise<number | null> {
    const rows = await db
      .select({
        correct: userVocabulary.correctCount,
        incorrect: userVocabulary.incorrectCount,
      })
      .from(userVocabulary)
      .where(eq(userVocabulary.userId, userId))
      .limit(500);
    const total = rows.reduce((s, r) => s + r.correct + r.incorrect, 0);
    const correct = rows.reduce((s, r) => s + r.correct, 0);
    const grammar = await db
      .select({
        correct: userGrammarProgress.correctCount,
        incorrect: userGrammarProgress.incorrectCount,
      })
      .from(userGrammarProgress)
      .where(eq(userGrammarProgress.userId, userId))
      .limit(200);
    const grammarTotal = grammar.reduce((s, r) => s + r.correct + r.incorrect, 0);
    const grammarCorrect = grammar.reduce((s, r) => s + r.correct, 0);
    const allTotal = total + grammarTotal;
    if (allTotal === 0) return null;
    return (correct + grammarCorrect) / allTotal;
  }

  async assemble(userId: string, languageId: string, now: Date): Promise<LessonDto | null> {
    const [ul] = await db
      .select()
      .from(userLanguages)
      .where(and(eq(userLanguages.userId, userId), eq(userLanguages.languageId, languageId)));
    if (!ul) return null;

    const resolved = await this.resolveNextLesson(userId, languageId, ul.cefrLevel);
    if (!resolved) return null;

    if (resolved.advanced) {
      await db
        .update(userLanguages)
        .set({ cefrLevel: resolved.level })
        .where(eq(userLanguages.id, ul.id));
    }

    return this.assembleLesson(userId, languageId, resolved.lesson, ul, now);
  }

  async assembleById(
    userId: string,
    languageId: string,
    lessonId: string,
    now: Date,
  ): Promise<LessonDto | null> {
    const [ul] = await db
      .select()
      .from(userLanguages)
      .where(and(eq(userLanguages.userId, userId), eq(userLanguages.languageId, languageId)));
    if (!ul) return null;

    const [lesson] = await db.select().from(lessons).where(eq(lessons.id, lessonId));
    if (!lesson) {
      const err = new Error('Lekcia neexistuje.') as Error & { code?: string };
      err.code = 'NOT_FOUND';
      throw err;
    }

    await this.assertUnlocked(userId, languageId, lessonId);

    return this.assembleLesson(userId, languageId, lesson, ul, now);
  }

  /**
   * Lightweight "next lesson" lookup (no content, no TTS) used by the daily
   * plan. Returns the first not-completed lesson in curriculum order.
   */
  async getNextLessonInfo(
    userId: string,
    languageId: string,
  ): Promise<{ id: string; title: string; estimatedMinutes: number } | null> {
    const [ul] = await db
      .select()
      .from(userLanguages)
      .where(and(eq(userLanguages.userId, userId), eq(userLanguages.languageId, languageId)));
    if (!ul) return null;

    const resolved = await this.resolveNextLesson(userId, languageId, ul.cefrLevel);
    if (!resolved) return null;
    return {
      id: resolved.lesson.id,
      title: resolved.lesson.title,
      estimatedMinutes: resolved.lesson.estimatedMinutes ?? 0,
    };
  }

  /**
   * Sequential unlock (Phase 2.1): a lesson is accessible when it is completed,
   * already in progress, or the next not-completed lesson in curriculum order.
   * Skipping ahead is rejected with a `LOCKED` error.
   */
  private async isUnlocked(userId: string, languageId: string, lessonId: string): Promise<boolean> {
    const [ul] = await db
      .select()
      .from(userLanguages)
      .where(and(eq(userLanguages.userId, userId), eq(userLanguages.languageId, languageId)));
    if (!ul) return false;

    const [prog] = await db
      .select({ status: lessonProgress.status })
      .from(lessonProgress)
      .where(and(eq(lessonProgress.userId, userId), eq(lessonProgress.lessonId, lessonId)))
      .limit(1);
    if (prog && (prog.status === 'completed' || prog.status === 'in_progress')) return true;

    const resolved = await this.resolveNextLesson(userId, languageId, ul.cefrLevel);
    return resolved?.lesson.id === lessonId;
  }

  private async assertUnlocked(userId: string, languageId: string, lessonId: string): Promise<void> {
    if (await this.isUnlocked(userId, languageId, lessonId)) return;
    const err = new Error('Táto lekcia ešte nie je odomknutá. Dokonči najprv predchádzajúcu lekciu.') as Error & {
      code?: string;
    };
    err.code = 'LOCKED';
    throw err;
  }

  private async assembleLesson(
    userId: string,
    languageId: string,
    lesson: typeof lessons.$inferSelect,
    ul: typeof userLanguages.$inferSelect,
    now: Date,
  ): Promise<LessonDto> {
    const duration = ul.dailyMinutes;
    const bucket = bucketFor(duration);
    const reviewLimit = bucket.reviewItems;
    const reviewItems = await this.reviewService.getDueReviewItems(
      userId,
      languageId,
      reviewLimit,
      now,
    );

    const lessonId = lesson.id;
    const [module] = await db.select().from(modules).where(eq(modules.id, lesson.moduleId));

    const lessonVocab = await db
      .select()
      .from(vocabularyItems)
      .where(eq(vocabularyItems.lessonId, lessonId))
      .orderBy(asc(vocabularyItems.sortOrder));

    const exRows = await db
      .select()
      .from(exercises)
      .where(eq(exercises.lessonId, lessonId))
      .orderBy(asc(exercises.sortOrder));

    const [grammarIdRow] = await db
      .select({ id: exercises.grammarConceptId })
      .from(exercises)
      .where(and(eq(exercises.lessonId, lessonId), sql`${exercises.grammarConceptId} IS NOT NULL`))
      .limit(1);

    let grammar = null;
    if (grammarIdRow?.id) {
      [grammar] = await db.select().from(grammarConcepts).where(eq(grammarConcepts.id, grammarIdRow.id));
    }

    const exerciseLimit = bucket.exerciseLimit ?? exRows.length;

    const maxVocab = Math.max(4, bucket.vocabularyPerLesson);
    const vocabSlice = lessonVocab.slice(0, maxVocab);

    return {
      id: lessonId,
      moduleTitle: module.title,
      moduleSlug: module.slug,
      title: lesson.title,
      description: lesson.description,
      dayNumber: lesson.dayNumber,
      estimatedMinutes: lesson.estimatedMinutes,
      parts: {
        review: reviewItems,
        vocabulary: vocabSlice.map((v) => ({
          id: v.id,
          spanish: v.spanish,
          translation: v.translation,
          pronunciation: v.pronunciation,
          exampleSentence: v.exampleSentence,
          exampleTranslation: v.exampleTranslation,
          audioUrl: v.audioUrl ?? null,
          partOfSpeech: v.partOfSpeech,
          category: v.category,
        })),
        grammar: grammar
          ? {
              id: grammar.id,
              slug: grammar.slug,
              title: grammar.title,
              explanation: grammar.explanation,
              rule: grammar.rule,
              examples: grammar.examples,
            }
          : null,
        exercises: await this.withAudio(
          userId,
          languageId,
          exRows.slice(0, exerciseLimit).map((e) => ({
            id: e.id,
            type: e.type as ExerciseType,
            prompt: e.prompt,
            options: e.options,
            hint: e.hint ?? null,
            sortOrder: e.sortOrder,
            audioText: e.audioText,
          })),
        ),
      },
    };
  }

  private async withAudio(
    userId: string,
    languageId: string,
    exercises: { id: string; type: ExerciseType; prompt: string; options: string[] | null; hint: string | null; sortOrder: number; audioText: string | null }[],
  ): Promise<ExerciseDto[]> {
    const result: ExerciseDto[] = [];
    for (const e of exercises) {
      let audioUrl: string | null = null;
      if (e.audioText) {
        try {
          const asset = await this.ttsService.synthesize(e.audioText, {
            userId,
            languageId,
            voice: config.tts.voice,
          });
          audioUrl = asset.url;
        } catch {
          audioUrl = null;
        }
      }
      const { audioText: _audioText, ...rest } = e;
      void _audioText;
      result.push({
        ...rest,
        audioUrl,
        targetEs: e.audioText && rest.type === 'speaking' ? e.audioText : null,
      });
    }
    return result;
  }

  async grade(
    userId: string,
    languageId: string,
    lessonId: string,
    exerciseId: string,
    answer: string,
    now: Date,
  ): Promise<AttemptResult> {
    const [exercise] = await db.select().from(exercises).where(eq(exercises.id, exerciseId));
    if (!exercise || exercise.lessonId !== lessonId) {
      const err = new Error('Cvičenie neexistuje v tejto lekcii.') as Error & { code?: string };
      err.code = 'NOT_FOUND';
      throw err;
    }

    await this.assertUnlocked(userId, languageId, lessonId);

    const correct = isCorrectAnswer(answer, exercise.correctAnswer);

    const result = await this.signals.apply({
      userId,
      languageId,
      correct,
      answer,
      correctAnswer: exercise.correctAnswer,
      lessonId,
      exerciseId,
      source: 'curriculum',
      vocabItemId: exercise.vocabItemId,
      grammarConceptId: exercise.grammarConceptId,
      exerciseType: exercise.type,
      mistakeContext: exercise.prompt,
      now,
    });

    await this.touchLessonProgress(userId, languageId, lessonId, now);

    return {
      correct,
      correctAnswer: exercise.correctAnswer,
      explanation: exercise.explanation ?? null,
      masteryDelta: result.masteryDelta,
      xpEarned: result.xpEarned,
    };
  }

  async complete(userId: string, languageId: string, lessonId: string, now: Date): Promise<LessonCompleteResult> {
    const [lesson] = await db.select().from(lessons).where(eq(lessons.id, lessonId));
    if (!lesson) {
      const err = new Error('Lekcia neexistuje.') as Error & { code?: string };
      err.code = 'NOT_FOUND';
      throw err;
    }

    await this.assertUnlocked(userId, languageId, lessonId);

    const [stats] = await db
      .select()
      .from(userStatistics)
      .where(and(eq(userStatistics.userId, userId), eq(userStatistics.languageId, languageId)));

    const currentStreak = computeStreak(
      stats
        ? { currentStreak: stats.currentStreak, lastStudyDate: stats.lastStudyDate }
        : { currentStreak: 0, lastStudyDate: null },
      now,
    );

    const lessonVocab = await db
      .select()
      .from(vocabularyItems)
      .where(eq(vocabularyItems.lessonId, lessonId));

    for (const v of lessonVocab) {
      const existing = await db
        .select()
        .from(userVocabulary)
        .where(
          and(eq(userVocabulary.userId, userId), eq(userVocabulary.vocabularyItemId, v.id)),
        )
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(userVocabulary)
          .set({ isLearned: true })
          .where(eq(userVocabulary.id, existing[0].id));
      } else {
        const state = initialSrsState(now);
        const applied = applySrsAnswer(state, true, now);
        await db.insert(userVocabulary).values({
          userId,
          languageId,
          vocabularyItemId: v.id,
          isLearned: true,
          firstLearned: now,
          lastReviewed: now,
          reviewCount: 0,
          correctCount: 0,
          incorrectCount: 0,
          masteryScore: '0.2',
          nextReviewDate: applied.state.nextReview,
          seenInLessons: [lessonId],
        });
      }
    }

    const vocabCount = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(userVocabulary)
      .where(and(eq(userVocabulary.userId, userId), eq(userVocabulary.isLearned, true)));
    const vocabularyLearned = vocabCount[0]?.count ?? 0;

    const attempts = await db
      .select()
      .from(exerciseAttempts)
      .where(and(eq(exerciseAttempts.userId, userId), eq(exerciseAttempts.lessonId, lessonId)));
    const correctCount = attempts.filter((a) => a.isCorrect).length;
    const score = attempts.length > 0 ? correctCount / attempts.length : 0.5;
    const scoreBonus = Math.round(score * 100);

    const completedAt = now;
    await db
      .insert(lessonProgress)
      .values({
        userId,
        languageId,
        lessonId,
        status: 'completed',
        progressPct: 100,
        attemptsCount: attempts.length,
        bestScore: String(Math.round(score * 10000) / 10000),
        startedAt: null,
        completedAt,
        lastActivityAt: now,
      })
      .onConflictDoUpdate({
        target: [lessonProgress.userId, lessonProgress.lessonId],
        set: {
          status: 'completed',
          progressPct: 100,
          attemptsCount: attempts.length,
          bestScore: String(Math.round(score * 10000) / 10000),
          completedAt,
          lastActivityAt: now,
        },
      });

    const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);
    const weeklyRows = await db
      .select({ lesson: lessons })
      .from(lessonProgress)
      .innerJoin(lessons, eq(lessonProgress.lessonId, lessons.id))
      .where(
        and(
          eq(lessonProgress.userId, userId),
          eq(lessonProgress.languageId, languageId),
          eq(lessonProgress.status, 'completed'),
          gte(lessonProgress.completedAt, sevenDaysAgo),
        ),
      );
    const weeklyMinutes = weeklyRows.reduce((sum, r) => sum + (r.lesson.estimatedMinutes ?? 0), 0);

    const [ul] = await db
      .select()
      .from(userLanguages)
      .where(and(eq(userLanguages.userId, userId), eq(userLanguages.languageId, languageId)));

    const xpTotal = XP_LESSON_BONUS + scoreBonus;
    await db
      .update(userStatistics)
      .set({
        totalLearningMinutes: sql`${userStatistics.totalLearningMinutes} + ${lesson.estimatedMinutes ?? 0}`,
        lessonsCompleted: sql`${userStatistics.lessonsCompleted} + 1`,
        vocabularyLearned,
        currentStreak,
        longestStreak: sql`greatest(${userStatistics.longestStreak}, ${currentStreak})`,
        totalXp: sql`${userStatistics.totalXp} + ${xpTotal}`,
        weeklyMinutes,
        lastStudyDate: now,
      })
      .where(and(eq(userStatistics.userId, userId), eq(userStatistics.languageId, languageId)));

    const unlocked = await this.unlockAchievements(userId, languageId, {
      lessonsCompleted: (stats?.lessonsCompleted ?? 0) + 1,
      vocabularyLearned,
      currentStreak,
      cefrLevel: ul.cefrLevel,
    });

    const next = await this.resolveNextLesson(userId, languageId, ul.cefrLevel);

    return {
      xpEarned: xpTotal,
      minutesSpent: lesson.estimatedMinutes ?? 0,
      lessonsCompleted: (stats?.lessonsCompleted ?? 0) + 1,
      currentStreak,
      achievementsUnlocked: unlocked,
      nextLessonId: next?.lesson.id ?? null,
    };
  }

  private async touchLessonProgress(
    userId: string,
    languageId: string,
    lessonId: string,
    now: Date,
  ) {
    const [existing] = await db
      .select()
      .from(lessonProgress)
      .where(and(eq(lessonProgress.userId, userId), eq(lessonProgress.lessonId, lessonId)));

    const total = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(exercises)
      .where(eq(exercises.lessonId, lessonId));
    const attempted = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(exerciseAttempts)
      .where(and(eq(exerciseAttempts.userId, userId), eq(exerciseAttempts.lessonId, lessonId)));
    const pct = total[0]?.count
      ? Math.min(99, Math.round(((attempted[0]?.count ?? 0) / total[0].count) * 100))
      : 0;

    await db
      .insert(lessonProgress)
      .values({
        userId,
        languageId,
        lessonId,
        status: 'in_progress',
        progressPct: pct,
        attemptsCount: attempted[0]?.count ?? 0,
        bestScore: '0',
        startedAt: existing?.startedAt ?? now,
        lastActivityAt: now,
      })
      .onConflictDoUpdate({
        target: [lessonProgress.userId, lessonProgress.lessonId],
        set: {
          status: sql`case when ${lessonProgress.status} = 'completed' then 'completed' else 'in_progress' end`,
          progressPct: pct,
          attemptsCount: attempted[0]?.count ?? 0,
          startedAt: sql`coalesce(${lessonProgress.startedAt}, ${now})`,
          lastActivityAt: now,
        },
      });
  }

  private async unlockAchievements(
    userId: string,
    languageId: string,
    ctx: { lessonsCompleted: number; vocabularyLearned: number; currentStreak: number; cefrLevel: string },
  ): Promise<{ code: string; title: string; description: string }[]> {
    const all = await db.select().from(achievements);
    const owned = await db
      .select({ achievementId: userAchievements.achievementId })
      .from(userAchievements)
      .where(eq(userAchievements.userId, userId));
    const ownedSet = new Set(owned.map((o) => o.achievementId));

    const conditions: Record<string, boolean> = {
      first_lesson: ctx.lessonsCompleted >= 1,
      streak_7: ctx.currentStreak >= 7,
      streak_30: ctx.currentStreak >= 30,
      words_50: ctx.vocabularyLearned >= 50,
      words_100: ctx.vocabularyLearned >= 100,
      lessons_10: ctx.lessonsCompleted >= 10,
      level_a1: ctx.cefrLevel !== 'A0',
    };

    const unlocked: { code: string; title: string; description: string }[] = [];
    for (const a of all) {
      if (!ownedSet.has(a.id) && conditions[a.code]) {
        await db.insert(userAchievements).values({ userId, achievementId: a.id });
        unlocked.push({ code: a.code, title: a.title, description: a.description });
      }
    }
    return unlocked;
  }
}
