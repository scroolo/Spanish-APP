import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { createReadStream } from 'node:fs';
import { eq, sql } from 'drizzle-orm';
import { config } from './config.js';
import { db } from './db/client.js';
import {
  courses,
  lessons,
  lessonProgress,
  modules,
  userLanguages,
} from './db/schema.js';
import { requireActiveLanguage } from './services/helpers.js';
import { AuthService } from './services/auth.service.js';
import { OnboardingService } from './services/onboarding.service.js';
import { LessonService } from './services/lesson.service.js';
import { ReviewService } from './services/review.service.js';
import { SrsService } from './services/srs.service.js';
import { ProgressService } from './services/progress.service.js';
import { DailyPlanService } from './services/daily-plan.service.js';
import { LearningProfileService } from './services/learning-profile.service.js';
import { LearningSignalsService } from './services/learning-signals.service.js';
import { PersonalizedExerciseService } from './services/personalized-exercise.service.js';
import { TutorService } from './services/tutor.service.js';
import { TtsService } from './services/tts.service.js';
import { SpeakingAttemptService } from './services/speaking-attempt.service.js';
import { ConversationService } from './services/conversation.service.js';
import { UsageService } from './services/usage.service.js';
import { WeaknessEngine } from './learning/weakness.js';
import { AIService } from './ai/AIService.js';
import { LearningContextService } from './ai/LearningContextService.js';
import { getAIProvider } from './ai/provider.js';
import { getTTSProvider } from './tts/provider.js';
import { getSttProvider } from './stt/provider.js';
import { assertRateLimit } from './ai/rateLimit.js';
import { ONBOARDING_OPTIONS } from './learning/onboardingOptions.js';
import { OnboardingInputSchema } from './validation/onboarding.js';
import { isCorrectAnswer } from './learning/answer.js';

declare module 'fastify' {
  interface FastifyInstance {
    authService: AuthService;
    onboardingService: OnboardingService;
    lessonService: LessonService;
    reviewService: ReviewService;
    srsService: SrsService;
    progressService: ProgressService;
    dailyPlanService: DailyPlanService;
    learningProfileService: LearningProfileService;
    learningSignalsService: LearningSignalsService;
    personalizedExerciseService: PersonalizedExerciseService;
    tutorService: TutorService;
    usageService: UsageService;
    aiService: AIService;
    learningContextService: LearningContextService;
    ttsService: TtsService;
    speakingAttemptService: SpeakingAttemptService;
    conversationService: ConversationService;
    weaknessEngine: WeaknessEngine;
  }
  interface FastifyRequest {
    userId: string;
  }
}

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: { level: config.logLevel }, bodyLimit: config.maxBodyBytes });

  app.register(cors, { origin: config.corsOrigins[0] === '*' ? true : config.corsOrigins });
  app.register(jwt, { secret: config.jwtSecret });

  const authService = new AuthService();
  const onboardingService = new OnboardingService();
  const weaknessEngine = new WeaknessEngine();
  const reviewService = new ReviewService(weaknessEngine);
  const srsService = new SrsService(weaknessEngine);
  const learningSignalsService = new LearningSignalsService(srsService, weaknessEngine);
  const usageService = new UsageService();
  const aiService = new AIService(getAIProvider(), usageService);
  const ttsService = new TtsService(getTTSProvider(), usageService);
  const speakingAttemptService = new SpeakingAttemptService(getSttProvider(), usageService);
  const learningContextService = new LearningContextService();
  const lessonService = new LessonService(reviewService, srsService, weaknessEngine, learningSignalsService, ttsService);
  const dailyPlanService = new DailyPlanService(lessonService, reviewService);
  const progressService = new ProgressService(lessonService, reviewService, weaknessEngine, dailyPlanService);
  const learningProfileService = new LearningProfileService(weaknessEngine);
  const conversationService = new ConversationService(aiService, learningContextService, learningProfileService, usageService);
  const personalizedExerciseService = new PersonalizedExerciseService(
    aiService,
    learningContextService,
    learningProfileService,
    learningSignalsService,
  );
  const tutorService = new TutorService(
    aiService,
    learningContextService,
    learningProfileService,
    lessonService,
  );

  app.decorate('authService', authService);
  app.decorate('onboardingService', onboardingService);
  app.decorate('lessonService', lessonService);
  app.decorate('reviewService', reviewService);
  app.decorate('srsService', srsService);
  app.decorate('progressService', progressService);
  app.decorate('dailyPlanService', dailyPlanService);
  app.decorate('learningProfileService', learningProfileService);
  app.decorate('learningSignalsService', learningSignalsService);
  app.decorate('personalizedExerciseService', personalizedExerciseService);
  app.decorate('tutorService', tutorService);
  app.decorate('usageService', usageService);
  app.decorate('aiService', aiService);
  app.decorate('learningContextService', learningContextService);
  app.decorate('ttsService', ttsService);
  app.decorate('speakingAttemptService', speakingAttemptService);
  app.decorate('conversationService', conversationService);
  app.decorate('weaknessEngine', weaknessEngine);

  app.addHook('preHandler', async (request) => {
    const url = request.url.split('?')[0];
    const isPublic =
      url === '/health' ||
      url === '/api/health' ||
      url === '/api/auth/register' ||
      url === '/api/auth/login' ||
      url.startsWith('/api/media/');
    if (isPublic) return;
    try {
      await request.jwtVerify();
      request.userId = (request.user as { sub: string }).sub;
    } catch {
      const err = new Error('Neplatné alebo chýbajúce prihlásenie.') as Error & { code?: string };
      err.code = 'UNAUTHORIZED';
      throw err;
    }
  });

  app.setErrorHandler((err: Error & { code?: string }, request, reply) => {
    const status = err.code === 'UNAUTHORIZED' ? 401 : 400;
    const known = new Set([
      'EMAIL_TAKEN',
      'INVALID_CREDENTIALS',
      'ONBOARDING_REQUIRED',
      'NOT_FOUND',
      'RATE_LIMITED',
      'LOCKED',
    ]);
    const code = known.has(err.code ?? '') ? err.code : 'BAD_REQUEST';
    const httpStatus =
      err.code === 'ONBOARDING_REQUIRED'
        ? 428
        : err.code === 'RATE_LIMITED'
          ? 429
          : err.code === 'LOCKED'
            ? 403
            : status;
    void request;
    reply.status(httpStatus).send({ error: { code, message: err.message } });
  });

  void app.get('/api/health', async () => ({ status: 'ok' }));

  void app.get('/health', async () => ({
    status: 'ok',
    environment: config.environment,
    version: '0.1.0',
  }));

  void app.get('/api/media/tts/:file', async (request, reply) => {
    const { file } = request.params as { file: string };
    if (!/^[a-f0-9]{24}\.(mp3|wav)$/.test(file)) {
      return reply.status(400).send({ error: { code: 'BAD_REQUEST', message: 'Neplatný súbor.' } });
    }
    try {
      const filePath = TtsService.resolveFile(file);
      const type = file.endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav';
      return reply.type(type).send(createReadStream(filePath));
    } catch {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Audio súbor neexistuje.' } });
    }
  });

  void app.register(authRoutes, { prefix: '/api/auth' });
  void app.register(meRoutes, { prefix: '/api/me' });
  void app.register(curriculumRoutes, { prefix: '/api' });

  return app;
}

async function authRoutes(app: FastifyInstance) {
  app.post('/register', async (request, reply) => {
    const body = request.body as { email?: string; password?: string; displayName?: string };
    if (!body?.email || !body?.password || body.password.length < 6) {
      return reply
        .status(400)
        .send({ error: { code: 'BAD_REQUEST', message: 'Zadaj platný e-mail a heslo (aspoň 6 znakov).' } });
    }
    const result = await app.authService.register(body.email, body.password, body.displayName);
    result.token = app.jwt.sign({ sub: result.user.id });
    return result;
  });

  app.post('/login', async (request, reply) => {
    const body = request.body as { email?: string; password?: string };
    if (!body?.email || !body?.password) {
      return reply.status(400).send({ error: { code: 'BAD_REQUEST', message: 'Zadaj e-mail a heslo.' } });
    }
    const result = await app.authService.login(body.email, body.password);
    result.token = app.jwt.sign({ sub: result.user.id });
    return result;
  });

  app.get('/me', async (request) => {
    const user = await app.authService.getUserById(request.userId);
    const language = await app.authService.getActiveLanguage(request.userId);
    return { user, language };
  });
}

async function meRoutes(app: FastifyInstance) {
  app.get('/onboarding-options', async () => {
    return ONBOARDING_OPTIONS;
  });

  app.post('/onboarding', async (request, reply) => {
    const parsed = OnboardingInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: { code: 'BAD_REQUEST', message: 'Neplatné onboarding dáta.' } });
    }
    await app.onboardingService.save(request.userId, parsed.data);
    const language = await app.authService.getActiveLanguage(request.userId);
    return { language };
  });

  app.get('/summary', async (request) => {
    const languageId = await requireActiveLanguage(request.userId);
    return app.progressService.getSummary(request.userId, languageId, new Date());
  });

  app.get('/lesson/today', async (request) => {
    const languageId = await requireActiveLanguage(request.userId);
    return { lesson: await app.lessonService.assemble(request.userId, languageId, new Date()) };
  });

  app.get('/lesson/:id', async (request) => {
    const languageId = await requireActiveLanguage(request.userId);
    const { id } = request.params as { id: string };
    return { lesson: await app.lessonService.assembleById(request.userId, languageId, id, new Date()) };
  });

  app.post('/lesson/:id/attempt', async (request, reply) => {
    const languageId = await requireActiveLanguage(request.userId);
    const { id } = request.params as { id: string };
    const body = request.body as { exerciseId?: string; answer?: string };
    if (!body?.exerciseId || typeof body.answer !== 'string') {
      return reply.status(400).send({ error: { code: 'BAD_REQUEST', message: 'Chýba exerciseId alebo answer.' } });
    }
    return app.lessonService.grade(request.userId, languageId, id, body.exerciseId, body.answer, new Date());
  });

  app.post('/lesson/:id/complete', async (request) => {
    const languageId = await requireActiveLanguage(request.userId);
    const { id } = request.params as { id: string };
    return app.lessonService.complete(request.userId, languageId, id, new Date());
  });

  app.get('/review', async (request) => {
    const languageId = await requireActiveLanguage(request.userId);
    const ul = await app.authService.getActiveLanguage(request.userId);
    const duration = ul?.dailyMinutes ?? 30;
    const limit = duration <= 15 ? 6 : duration >= 60 ? 12 : 8;
    const now = new Date();
    const items = await app.reviewService.getDueReviewItems(
      request.userId,
      languageId,
      limit,
      now,
    );
    const summary = await app.reviewService.getSummary(request.userId, languageId, now);
    return { items, summary };
  });

  app.get('/review/summary', async (request) => {
    const languageId = await requireActiveLanguage(request.userId);
    return app.reviewService.getSummary(request.userId, languageId, new Date());
  });

  app.post('/review/attempt', async (request, reply) => {
    const languageId = await requireActiveLanguage(request.userId);
    const body = request.body as { id?: string; kind?: 'vocabulary' | 'grammar'; answer?: string; correctAnswer?: string };
    if (!body?.id || !body.kind || typeof body.answer !== 'string' || typeof body.correctAnswer !== 'string') {
      return reply
        .status(400)
        .send({ error: { code: 'BAD_REQUEST', message: 'Chýbajú dáta pokusu o opakovanie.' } });
    }
    const correct = isCorrectAnswer(body.answer, body.correctAnswer);
    return app.srsService.gradeReviewItem(
      request.userId,
      languageId,
      body.id,
      body.kind,
      body.answer,
      body.correctAnswer,
      correct,
      new Date(),
    );
  });

  app.get('/progress', async (request) => {
    const languageId = await requireActiveLanguage(request.userId);
    return app.progressService.getProgress(request.userId, languageId, new Date());
  });

  app.get('/learning-profile', async (request) => {
    const languageId = await requireActiveLanguage(request.userId);
    return app.learningProfileService.get(request.userId, languageId, new Date());
  });

  app.get('/ai/exercises', async (request) => {
    const languageId = await requireActiveLanguage(request.userId);
    return { exercises: await app.personalizedExerciseService.list(request.userId, languageId, 20) };
  });

  app.post('/ai/exercises/generate', async (request, reply) => {
    const languageId = await requireActiveLanguage(request.userId);
    assertRateLimit(request.userId, 'ai');
    const body = request.body as { count?: number; grammarConceptId?: string; vocabularyItemId?: string };
    if (body?.count !== undefined && (body.count < 1 || body.count > 5)) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'Počet cvičení musí byť 1–5.' },
      });
    }
    return app.personalizedExerciseService.generate(request.userId, languageId, {
      count: body?.count,
      grammarConceptId: body?.grammarConceptId,
      vocabularyItemId: body?.vocabularyItemId,
      now: new Date(),
    });
  });

  app.post('/ai/exercises/:id/attempt', async (request, reply) => {
    const languageId = await requireActiveLanguage(request.userId);
    const { id } = request.params as { id: string };
    const body = request.body as { answer?: string };
    if (typeof body?.answer !== 'string') {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'Chýba odpoveď.' },
      });
    }
    return app.personalizedExerciseService.grade(
      request.userId,
      languageId,
      id,
      body.answer,
      new Date(),
    );
  });

  app.post('/ai/tutor/explain', async (request) => {
    const languageId = await requireActiveLanguage(request.userId);
    assertRateLimit(request.userId, 'ai');
    const body = request.body as { lessonId?: string };
    return app.tutorService.explain(request.userId, languageId, body?.lessonId, new Date());
  });

  app.post('/ai/tutor/ask', async (request, reply) => {
    const languageId = await requireActiveLanguage(request.userId);
    const body = request.body as { question?: string; lessonId?: string };
    if (typeof body?.question !== 'string' || body.question.trim().length < 3) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'Napíš otázku (aspoň 3 znaky).' },
      });
    }
    assertRateLimit(request.userId, 'ai');
    return app.tutorService.ask(request.userId, languageId, body.question.trim(), body.lessonId, new Date());
  });

  app.post('/speaking/attempt', async (request, reply) => {
    const languageId = await requireActiveLanguage(request.userId);
    const body = request.body as {
      audio?: string;
      mimeType?: string;
      targetEs?: string;
      recordedSeconds?: number;
      exerciseId?: string;
    };
    if (typeof body?.audio !== 'string' || body.audio.length === 0) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'Chýba audio nahrávka.' },
      });
    }
    if (typeof body?.targetEs !== 'string' || body.targetEs.trim().length === 0) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'Chýba cieľová veta (targetEs).' },
      });
    }
    assertRateLimit(request.userId, 'stt');
    const audio = Buffer.from(body.audio, 'base64');
    return app.speakingAttemptService.handleAttempt(request.userId, languageId, {
      audio,
      mimeType: body.mimeType ?? 'audio/webm',
      targetEs: body.targetEs.trim(),
      recordedSeconds: body.recordedSeconds,
      exerciseId: body.exerciseId,
    });
  });

  app.get('/speaking/history', async (request) => {
    const languageId = await requireActiveLanguage(request.userId);
    void languageId;
    return app.speakingAttemptService.recent(request.userId, 20);
  });

  app.get('/conversation/scenarios', async () => app.conversationService.scenarios());

  app.post('/conversation/sessions', async (request, reply) => {
    const languageId = await requireActiveLanguage(request.userId);
    const body = request.body as { scenarioSlug?: string };
    if (typeof body?.scenarioSlug !== 'string') {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'Chýba scenarioSlug.' },
      });
    }
    assertRateLimit(request.userId, 'ai');
    return app.conversationService.start(request.userId, languageId, body.scenarioSlug, new Date());
  });

  app.get('/conversation/sessions/:id', async (request) => {
    const { id } = request.params as { id: string };
    return app.conversationService.getSession(request.userId, id);
  });

  app.post('/conversation/sessions/:id/reply', async (request, reply) => {
    const languageId = await requireActiveLanguage(request.userId);
    void languageId;
    const { id } = request.params as { id: string };
    const body = request.body as { userSpanish?: string };
    if (typeof body?.userSpanish !== 'string' || body.userSpanish.trim().length === 0) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'Napíš odpoveď po španielsky.' },
      });
    }
    if (body.userSpanish.trim().length > 300) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'Odpoveď je príliš dlhá (max 300 znakov).' },
      });
    }
    assertRateLimit(request.userId, 'ai');
    return app.conversationService.reply(request.userId, id, body.userSpanish.trim(), new Date());
  });

  app.post('/conversation/sessions/:id/finish', async (request) => {
    const languageId = await requireActiveLanguage(request.userId);
    void languageId;
    const { id } = request.params as { id: string };
    assertRateLimit(request.userId, 'ai');
    return app.conversationService.finish(request.userId, id, new Date());
  });
}

async function curriculumRoutes(app: FastifyInstance) {
  app.get('/curriculum', async (request) => {
    const languageId = await requireActiveLanguage(request.userId);
    const [activeLang] = await db
      .select()
      .from(userLanguages)
      .where(eq(userLanguages.userId, request.userId))
      .orderBy(sql`${userLanguages.isActive} desc`)
      .limit(1);

    const progressRows = await db
      .select({ lessonId: lessonProgress.lessonId, status: lessonProgress.status })
      .from(lessonProgress)
      .where(eq(lessonProgress.userId, request.userId));
    const completedIds = new Set(
      progressRows.filter((r) => r.status === 'completed').map((r) => r.lessonId),
    );
    const inProgressIds = new Set(
      progressRows.filter((r) => r.status === 'in_progress').map((r) => r.lessonId),
    );

    const courseRows = await db
      .select()
      .from(courses)
      .where(eq(courses.languageId, languageId))
      .orderBy(courses.sortOrder);

    const result = [];
    // Sequential unlock (Phase 2.1): the first not-completed lesson across the
    // whole curriculum (A0 → A1 in course order) is unlocked; everything after
    // it is 'locked'.
    let frontierSeen = false;
    for (const course of courseRows) {
      const moduleRows = await db
        .select()
        .from(modules)
        .where(eq(modules.courseId, course.id))
        .orderBy(modules.sortOrder);
      const mods = [];
      for (const m of moduleRows) {
        const lessonRows = await db
          .select()
          .from(lessons)
          .where(eq(lessons.moduleId, m.id))
          .orderBy(lessons.sortOrder);
        mods.push({
          id: m.id,
          slug: m.slug,
          title: m.title,
          description: m.description,
          lessons: lessonRows.map((l) => {
            let status: 'not_started' | 'in_progress' | 'completed' | 'locked';
            if (completedIds.has(l.id)) status = 'completed';
            else if (!frontierSeen) {
              status = inProgressIds.has(l.id) ? 'in_progress' : 'not_started';
              frontierSeen = true;
            } else status = 'locked';
            return {
              id: l.id,
              title: l.title,
              dayNumber: l.dayNumber,
              status,
            };
          }),
        });
      }
      result.push({ cefrLevel: course.cefrLevel, name: course.name, modules: mods });
    }

    return { languageCode: 'es', cefrLevel: activeLang?.cefrLevel ?? 'A0', courses: result };
  });
}
