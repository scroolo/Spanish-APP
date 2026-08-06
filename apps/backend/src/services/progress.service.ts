import { and, asc, eq, gte, inArray, sql } from 'drizzle-orm';
import type { ProgressDto, SkillStat, SummaryDto } from '@spanish/shared';
import { db } from '../db/client.js';
import {
  courses,
  exerciseAttempts,
  exercises,
  grammarConcepts,
  lessonProgress,
  lessons,
  modules,
  userGrammarProgress,
  userLanguages,
  userStatistics,
  userVocabulary,
  vocabularyItems,
} from '../db/schema.js';
import { isDue } from '../learning/srs.js';
import { stageFor, isWeakAccuracy } from '../learning/mastery.js';
import { cefrLevelPercent } from '../learning/cefr.js';
import { ReviewService } from './review.service.js';
import { LessonService } from './lesson.service.js';
import { DailyPlanService } from './daily-plan.service.js';
import { WeaknessEngine } from '../learning/weakness.js';

export class ProgressService {
  constructor(
    private lessonService: LessonService,
    private reviewService: ReviewService,
    private weaknessEngine: WeaknessEngine,
    private dailyPlanService: DailyPlanService,
  ) {}

  async getSummary(userId: string, languageId: string, now: Date): Promise<SummaryDto> {
    const [ul] = await db
      .select()
      .from(userLanguages)
      .where(and(eq(userLanguages.userId, userId), eq(userLanguages.languageId, languageId)));
    const [stats] = await db
      .select()
      .from(userStatistics)
      .where(and(eq(userStatistics.userId, userId), eq(userStatistics.languageId, languageId)));

    const lesson = await this.lessonService.assemble(userId, languageId, now);

    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayCompleted = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(lessonProgress)
      .where(
        and(
          eq(lessonProgress.userId, userId),
          eq(lessonProgress.languageId, languageId),
          eq(lessonProgress.status, 'completed'),
          gte(lessonProgress.completedAt, todayStart),
        ),
      );

    const vocabTotal = await this.getVocabTotal(languageId, ul.cefrLevel);
    const vocabLearned = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(userVocabulary)
      .where(and(eq(userVocabulary.userId, userId), eq(userVocabulary.isLearned, true)));

    const grammarTotal = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(grammarConcepts)
      .where(eq(grammarConcepts.languageId, languageId));

    const grammarProgressed = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(userGrammarProgress)
      .where(eq(userGrammarProgress.userId, userId));

    const { readingPercent } = await this.getSkillPercents(userId, languageId);

    const progress = {
      vocabulary: {
        label: 'Slovná zásoba',
        percent: vocabTotal > 0 ? Math.round(((vocabLearned[0]?.count ?? 0) / vocabTotal) * 100) : 0,
      },
      grammar: {
        label: 'Gramatika',
        percent:
          grammarTotal[0]?.count > 0
            ? Math.round(((grammarProgressed[0]?.count ?? 0) / grammarTotal[0].count) * 100)
            : 0,
      },
      listening: { label: 'Počúvanie', percent: 0 },
      speaking: { label: 'Rozprávanie', percent: 0 },
    };

    const nextMilestone = this.nextMilestone(stats, vocabLearned[0]?.count ?? 0);
    const dayNumber = lesson?.dayNumber ?? (await this.getNextDayNumber(userId, languageId));
    const plan = await this.dailyPlanService.build(userId, languageId, now);

    return {
      dayNumber,
      cefrLevel: ul.cefrLevel as SummaryDto['cefrLevel'],
      currentStreak: stats?.currentStreak ?? 0,
      estimatedMinutes: lesson?.estimatedMinutes ?? ul.dailyMinutes,
      totalLearningMinutes: stats?.totalLearningMinutes ?? 0,
      totalHours: Math.round(((stats?.totalLearningMinutes ?? 0) / 60) * 10) / 10,
      vocabularyLearned: vocabLearned[0]?.count ?? 0,
      lessonsCompleted: stats?.lessonsCompleted ?? 0,
      weeklyMinutes: stats?.weeklyMinutes ?? 0,
      nextMilestone,
      progress,
      todayLesson: lesson
        ? {
            id: lesson.id,
            title: lesson.title,
            description: lesson.description,
            estimatedMinutes: lesson.estimatedMinutes,
            isReviewLesson: false,
          }
        : null,
      hasCompletedToday: (todayCompleted[0]?.count ?? 0) > 0,
      plan,
    };
  }

  async getProgress(userId: string, languageId: string, now: Date): Promise<ProgressDto> {
    const [ul] = await db
      .select()
      .from(userLanguages)
      .where(and(eq(userLanguages.userId, userId), eq(userLanguages.languageId, languageId)));
    const [stats] = await db
      .select()
      .from(userStatistics)
      .where(and(eq(userStatistics.userId, userId), eq(userStatistics.languageId, languageId)));

    const level = ul.cefrLevel as ProgressDto['cefrLevel'];
    const levelLessons = await this.getLevelLessonCount(languageId, level);
    const [completedRows] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(lessonProgress)
      .where(
        and(
          eq(lessonProgress.userId, userId),
          eq(lessonProgress.languageId, languageId),
          eq(lessonProgress.status, 'completed'),
        ),
      );
    const lessonsCompleted = completedRows?.count ?? 0;

    const vocabLearned = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(userVocabulary)
      .where(and(eq(userVocabulary.userId, userId), eq(userVocabulary.isLearned, true)));

    const { vocabStats, reviewAccuracy } = await this.getVocabStats(userId, languageId, now);
    const grammarStats = await this.getGrammarStats(userId, languageId);
    const studyStats = {
      currentStreak: stats?.currentStreak ?? 0,
      longestStreak: stats?.longestStreak ?? 0,
      totalMinutes: stats?.totalLearningMinutes ?? 0,
      totalHours: Math.round(((stats?.totalLearningMinutes ?? 0) / 60) * 10) / 10,
      lessonsCompleted,
    };

    const levelPercent = cefrLevelPercent({
      lessonsCompleted,
      levelLessonCount: levelLessons.total,
      levelVocabTarget: await this.getVocabTotal(languageId, level),
      vocabLearned: vocabLearned[0]?.count ?? 0,
      levelGrammarCount: await this.getGrammarTotal(languageId, level),
      grammarProgressed: grammarStats.total,
      reviewAccuracy,
    });

    const { readingPercent } = await this.getSkillPercents(userId, languageId);
    const skills = await this.getModuleSkills(userId, languageId);

    const strongestTopics = [...skills].sort((a, b) => b.percent - a.percent).slice(0, 3);
    const weakestTopics = [...skills].sort((a, b) => a.percent - b.percent).slice(0, 3);

    const weaknesses = await this.getWeaknesses(userId, languageId, now);
    const modulesData = await this.getModuleProgress(userId, languageId);

    return {
      cefrLevel: level,
      levelPercent,
      vocabularyLearned: vocabLearned[0]?.count ?? 0,
      grammarConcepts: grammarStats.total,
      lessonsCompleted,
      totalLessons: levelLessons.total,
      totalLearningMinutes: stats?.totalLearningMinutes ?? 0,
      listeningPercent: 0,
      speakingPercent: 0,
      readingPercent,
      skills,
      weaknesses,
      vocabStats,
      grammarStats,
      studyStats,
      strongestTopics,
      weakestTopics,
      modules: modulesData,
    };
  }

  private async getVocabStats(userId: string, languageId: string, now: Date) {
    const rows = await db
      .select({
        uv: userVocabulary,
      })
      .from(userVocabulary)
      .innerJoin(vocabularyItems, eq(userVocabulary.vocabularyItemId, vocabularyItems.id))
      .where(and(eq(userVocabulary.userId, userId), eq(vocabularyItems.languageId, languageId)))
      .limit(1000);

    const stats = { learned: 0, learning: 0, familiar: 0, strong: 0, mastered: 0, needsReview: 0 };
    let correct = 0;
    let total = 0;

    for (const r of rows) {
      const mastery = Number(r.uv.masteryScore);
      const stage = stageFor(mastery, r.uv.correctCount);
      if (r.uv.isLearned) stats.learned += 1;
      if (stage === 'LEARNING') stats.learning += 1;
      else if (stage === 'FAMILIAR') stats.familiar += 1;
      else if (stage === 'STRONG') stats.strong += 1;
      else if (stage === 'MASTERED') stats.mastered += 1;
      if (isDue(
        {
          mastery,
          reviewCount: r.uv.reviewCount,
          correctCount: r.uv.correctCount,
          incorrectCount: r.uv.incorrectCount,
          lastReviewed: r.uv.lastReviewed ? new Date(r.uv.lastReviewed) : null,
          nextReview: r.uv.nextReviewDate ? new Date(r.uv.nextReviewDate) : null,
        },
        now,
      )) stats.needsReview += 1;
      correct += r.uv.correctCount;
      total += r.uv.correctCount + r.uv.incorrectCount;
    }

    return { vocabStats: stats, reviewAccuracy: total > 0 ? correct / total : null };
  }

  private async getGrammarStats(userId: string, languageId: string) {
    const rows = await db
      .select({
        up: userGrammarProgress,
      })
      .from(userGrammarProgress)
      .innerJoin(grammarConcepts, eq(userGrammarProgress.grammarConceptId, grammarConcepts.id))
      .where(and(eq(userGrammarProgress.userId, userId), eq(grammarConcepts.languageId, languageId)))
      .limit(500);

    let mastered = 0;
    let learning = 0;
    let weak = 0;
    for (const r of rows) {
      const stage = stageFor(Number(r.up.masteryScore), r.up.correctCount);
      if (stage === 'MASTERED') mastered += 1;
      else learning += 1;
      if (isWeakAccuracy(r.up.correctCount, r.up.correctCount + r.up.incorrectCount)) weak += 1;
    }
    return { total: rows.length, mastered, learning, weak };
  }

  private async getGrammarTotal(languageId: string, level: string): Promise<number> {
    const [course] = await db
      .select()
      .from(courses)
      .where(and(eq(courses.languageId, languageId), eq(courses.cefrLevel, level)))
      .orderBy(asc(courses.sortOrder))
      .limit(1);
    if (!course) return 0;
    const modulesRows = await db.select().from(modules).where(eq(modules.courseId, course.id));
    const moduleIds = modulesRows.map((m) => m.id);
    if (moduleIds.length === 0) return 0;
    const [rows] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(grammarConcepts)
      .where(inArray(grammarConcepts.moduleId, moduleIds));
    return rows?.count ?? 0;
  }

  private async getVocabTotal(languageId: string, level: string) {
    const [course] = await db
      .select()
      .from(courses)
      .where(and(eq(courses.languageId, languageId), eq(courses.cefrLevel, level)))
      .orderBy(asc(courses.sortOrder))
      .limit(1);
    if (!course) return 0;
    const modulesRows = await db.select().from(modules).where(eq(modules.courseId, course.id));
    const moduleIds = modulesRows.map((m) => m.id);
    if (moduleIds.length === 0) return 0;
    const rows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(vocabularyItems)
      .where(inArray(vocabularyItems.moduleId, moduleIds));
    return rows[0]?.count ?? 0;
  }

  private async getLevelLessonCount(languageId: string, level: string) {
    const [course] = await db
      .select()
      .from(courses)
      .where(and(eq(courses.languageId, languageId), eq(courses.cefrLevel, level)))
      .orderBy(asc(courses.sortOrder))
      .limit(1);
    if (!course) return { total: 0, lessons: [] as { id: string; dayNumber: number }[] };
    const rows = await db
      .select({ id: lessons.id, dayNumber: lessons.dayNumber })
      .from(lessons)
      .innerJoin(modules, eq(lessons.moduleId, modules.id))
      .where(eq(modules.courseId, course.id))
      .orderBy(asc(modules.sortOrder), asc(lessons.sortOrder));
    return { total: rows.length, lessons: rows };
  }

  private async getSkillPercents(userId: string, languageId: string) {
    const attempts = await db
      .select({
        isCorrect: exerciseAttempts.isCorrect,
        type: exercises.type,
      })
      .from(exerciseAttempts)
      .innerJoin(exercises, eq(exerciseAttempts.exerciseId, exercises.id))
      .where(eq(exerciseAttempts.userId, userId))
      .limit(2000);

    const total = attempts.length;
    const correct = attempts.filter((a) => a.isCorrect).length;
    const listening = attempts.filter((a) => a.type === 'listening');
    const listeningCorrect = listening.filter((a) => a.isCorrect).length;

    return {
      readingPercent: total > 0 ? Math.round((correct / total) * 100) : 0,
      listeningPercent:
        listening.length > 0 ? Math.round((listeningCorrect / listening.length) * 100) : 0,
    };
  }

  private async getModuleSkills(userId: string, languageId: string): Promise<SkillStat[]> {
    const rows = await db
      .select({
        moduleTitle: modules.title,
        isCorrect: exerciseAttempts.isCorrect,
      })
      .from(exerciseAttempts)
      .innerJoin(exercises, eq(exerciseAttempts.exerciseId, exercises.id))
      .innerJoin(lessons, eq(exercises.lessonId, lessons.id))
      .innerJoin(modules, eq(lessons.moduleId, modules.id))
      .innerJoin(courses, eq(modules.courseId, courses.id))
      .where(
        and(
          eq(courses.languageId, languageId),
          eq(exerciseAttempts.userId, userId),
        ),
      );

    const grouped = new Map<string, { correct: number; total: number }>();
    for (const r of rows) {
      const g = grouped.get(r.moduleTitle) ?? { correct: 0, total: 0 };
      g.total += 1;
      if (r.isCorrect) g.correct += 1;
      grouped.set(r.moduleTitle, g);
    }

    return [...grouped.entries()]
      .map(([label, g]) => ({
        label,
        percent: Math.round((g.correct / g.total) * 100),
      }))
      .sort((a, b) => a.percent - b.percent);
  }

  private async getWeaknesses(
    userId: string,
    languageId: string,
    now: Date,
  ): Promise<ProgressDto['weaknesses']> {
    const since = new Date(now.getTime() - 14 * 86_400_000);

    const rows = await db
      .select({
        conceptId: exercises.grammarConceptId,
        conceptTitle: grammarConcepts.title,
        isCorrect: exerciseAttempts.isCorrect,
      })
      .from(exerciseAttempts)
      .innerJoin(exercises, eq(exerciseAttempts.exerciseId, exercises.id))
      .innerJoin(grammarConcepts, eq(exercises.grammarConceptId, grammarConcepts.id))
      .where(
        and(
          eq(exerciseAttempts.userId, userId),
          gte(exerciseAttempts.answeredAt, since),
          eq(grammarConcepts.languageId, languageId),
        ),
      );

    const grouped = new Map<string, { correct: number; total: number; title: string }>();
    for (const r of rows) {
      if (!r.conceptId) continue;
      const g = grouped.get(r.conceptId) ?? { correct: 0, total: 0, title: r.conceptTitle ?? '' };
      g.total += 1;
      if (r.isCorrect) g.correct += 1;
      grouped.set(r.conceptId, g);
    }

    const dynamic: ProgressDto['weaknesses'] = [...grouped.entries()]
      .filter(([, g]) => g.total >= 2 && g.correct / g.total < 0.7)
      .map(([, g]) => ({
        grammarTitle: g.title,
        accuracy: Math.round((g.correct / g.total) * 100),
        needsReview: true,
      }))
      .sort((a, b) => a.accuracy - b.accuracy);

    const persisted = await this.weaknessEngine.weakGrammar(userId, languageId, 10);
    const persistedWeaknesses: ProgressDto['weaknesses'] = persisted.map((w) => ({
      grammarTitle: w.title,
      accuracy: w.accuracy,
      needsReview: true,
    }));

    const seen = new Set(dynamic.map((d) => d.grammarTitle));
    const merged = [...dynamic];
    for (const p of persistedWeaknesses) {
      if (!seen.has(p.grammarTitle)) merged.push(p);
    }
    return merged.sort((a, b) => a.accuracy - b.accuracy).slice(0, 8);
  }

  private async getModuleProgress(
    userId: string,
    languageId: string,
  ): Promise<ProgressDto['modules']> {
    const rows = await db
      .select({
        id: modules.id,
        title: modules.title,
        lessonId: lessons.id,
        completed: lessonProgress.status,
        courseLevel: courses.cefrLevel,
      })
      .from(modules)
      .innerJoin(courses, eq(modules.courseId, courses.id))
      .innerJoin(lessons, eq(lessons.moduleId, modules.id))
      .leftJoin(
        lessonProgress,
        and(eq(lessonProgress.lessonId, lessons.id), eq(lessonProgress.userId, userId)),
      )
      .where(eq(courses.languageId, languageId))
      .orderBy(asc(courses.sortOrder), asc(modules.sortOrder), asc(lessons.sortOrder));

    const grouped = new Map<string, { id: string; title: string; lessonCount: number; completed: number }>();
    for (const r of rows) {
      const g = grouped.get(r.id) ?? { id: r.id, title: r.title, lessonCount: 0, completed: 0 };
      g.lessonCount += 1;
      if (r.completed === 'completed') g.completed += 1;
      grouped.set(r.id, g);
    }

    return [...grouped.values()].map((m) => ({
      id: m.id,
      title: m.title,
      lessonCount: m.lessonCount,
      completedLessons: m.completed,
      percent: Math.round((m.completed / m.lessonCount) * 100),
    }));
  }

  private nextMilestone(
    stats: typeof userStatistics.$inferSelect | undefined,
    vocabLearned: number,
  ): SummaryDto['nextMilestone'] {
    const streak = stats?.currentStreak ?? 0;
    const lessons = stats?.lessonsCompleted ?? 0;

    const candidates: { label: string; current: number; target: number }[] = [];
    if (streak < 7) candidates.push({ label: `Séria ${7} dní`, current: streak, target: 7 });
    else if (streak < 30) candidates.push({ label: `Séria ${30} dní`, current: streak, target: 30 });
    if (vocabLearned < 50) candidates.push({ label: `50 slov`, current: vocabLearned, target: 50 });
    else if (vocabLearned < 100)
      candidates.push({ label: `100 slov`, current: vocabLearned, target: 100 });
    if (lessons < 10) candidates.push({ label: `10 lekcií`, current: lessons, target: 10 });

    if (candidates.length === 0) return null;
    const nearest = candidates.sort((a, b) => b.target - a.target)[0];
    return { label: nearest.label, progress: Math.min(100, Math.round((nearest.current / nearest.target) * 100)) };
  }

  private async getNextDayNumber(userId: string, languageId: string): Promise<number> {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(lessonProgress)
      .where(
        and(eq(lessonProgress.userId, userId), eq(lessonProgress.languageId, languageId)),
      );
    return (row?.count ?? 0) + 1;
  }
}
