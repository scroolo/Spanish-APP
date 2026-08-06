import { translate } from '../i18n';
import type {
  AiExerciseAttemptResult,
  AiExerciseGenerateResult,
  AttemptResult,
  AuthResponse,
  ConversationReplyResult,
  ConversationScenarioDto,
  ConversationSessionDto,
  GeneratedExerciseDto,
  LessonCompleteResult,
  LessonDto,
  LessonReviewItemDto,
  ModuleSummaryDto,
  OnboardingInput,
  OnboardingOptions,
  ProgressDto,
  ReviewSummaryDto,
  SpeakingAttemptResult,
  SummaryDto,
  TutorReplyDto,
  UserLanguageDto,
} from '@spanish/shared';
import type { LearningProfileDto } from '@spanish/shared';

export interface CourseCurriculumDto {
  languageCode: string;
  cefrLevel: string;
  courses: { cefrLevel: string; name: string; modules: ModuleSummaryDto[] }[];
}

export interface ApiError {
  code: string;
  message: string;
  status: number;
}

export class ApiClient {
  constructor(
    private baseUrl: string,
    private getToken: () => string | null,
  ) {}

  private async request<T>(path: string, method: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const token = this.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw {
        code: 'NETWORK',
        message: translate('error.network'),
        status: 0,
      } as ApiError;
    }

    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const err = json?.error ?? {};
      throw {
        code: err.code ?? 'BAD_REQUEST',
        message: err.message ?? translate('error.generic'),
        status: res.status,
      } as ApiError;
    }
    return json as T;
  }

  register(email: string, password: string, displayName?: string) {
    return this.request<AuthResponse>('/auth/register', 'POST', { email, password, displayName });
  }

  login(email: string, password: string) {
    return this.request<AuthResponse>('/auth/login', 'POST', { email, password });
  }

  me() {
    return this.request<{ user: AuthResponse['user']; language: UserLanguageDto | null }>(
      '/auth/me',
      'GET',
    );
  }

  onboardingOptions() {
    return this.request<OnboardingOptions>('/me/onboarding-options', 'GET');
  }

  saveOnboarding(input: OnboardingInput) {
    return this.request<{ language: UserLanguageDto }>('/me/onboarding', 'POST', input);
  }

  summary() {
    return this.request<SummaryDto>('/me/summary', 'GET');
  }

  todayLesson() {
    return this.request<{ lesson: LessonDto | null }>('/me/lesson/today', 'GET');
  }

  lessonById(id: string) {
    return this.request<{ lesson: LessonDto | null }>(`/me/lesson/${id}`, 'GET');
  }

  attempt(lessonId: string, exerciseId: string, answer: string) {
    return this.request<AttemptResult>(`/me/lesson/${lessonId}/attempt`, 'POST', {
      exerciseId,
      answer,
    });
  }

  completeLesson(lessonId: string) {
    return this.request<LessonCompleteResult>(`/me/lesson/${lessonId}/complete`, 'POST');
  }

  review() {
    return this.request<{ summary: ReviewSummaryDto; items: LessonReviewItemDto[] }>(
      '/me/review',
      'GET',
    );
  }

  reviewAttempt(item: { id: string; kind: 'vocabulary' | 'grammar'; answer: string; correctAnswer: string }) {
    return this.request<AttemptResult>('/me/review/attempt', 'POST', item);
  }

  progress() {
    return this.request<ProgressDto>('/me/progress', 'GET');
  }

  learningProfile() {
    return this.request<LearningProfileDto>('/me/learning-profile', 'GET');
  }

  curriculum() {
    return this.request<CourseCurriculumDto>('/curriculum', 'GET');
  }

  aiExercises() {
    return this.request<{ exercises: GeneratedExerciseDto[] }>('/ai/exercises', 'GET');
  }

  aiExercisesGenerate(opts: { count?: number; grammarConceptId?: string; vocabularyItemId?: string } = {}) {
    return this.request<AiExerciseGenerateResult>('/ai/exercises/generate', 'POST', opts);
  }

  aiExerciseAttempt(exerciseId: string, answer: string) {
    return this.request<AiExerciseAttemptResult>(`/ai/exercises/${exerciseId}/attempt`, 'POST', {
      answer,
    });
  }

  tutorExplain(lessonId?: string) {
    return this.request<TutorReplyDto>('/ai/tutor/explain', 'POST', lessonId ? { lessonId } : {});
  }

  tutorAsk(question: string, lessonId?: string) {
    return this.request<TutorReplyDto>('/ai/tutor/ask', 'POST', {
      question,
      ...(lessonId ? { lessonId } : {}),
    });
  }

  speakingAttempt(opts: {
    audio: string;
    mimeType: string;
    targetEs: string;
    recordedSeconds?: number;
    exerciseId?: string;
  }) {
    return this.request<SpeakingAttemptResult>('/speaking/attempt', 'POST', opts);
  }

  speakingHistory() {
    return this.request<SpeakingAttemptResult[]>('/speaking/history', 'GET');
  }

  conversationScenarios() {
    return this.request<ConversationScenarioDto[]>('/conversation/scenarios', 'GET');
  }

  conversationStart(scenarioSlug: string) {
    return this.request<ConversationSessionDto>('/conversation/sessions', 'POST', {
      scenarioSlug,
    });
  }

  conversationSession(id: string) {
    return this.request<ConversationSessionDto>(`/conversation/sessions/${id}`, 'GET');
  }

  conversationReply(id: string, userSpanish: string) {
    return this.request<ConversationReplyResult>(`/conversation/sessions/${id}/reply`, 'POST', {
      userSpanish,
    });
  }

  conversationFinish(id: string) {
    return this.request<ConversationSessionDto>(`/conversation/sessions/${id}/finish`, 'POST');
  }

  mediaUrl(path: string) {
    if (/^https?:\/\//.test(path)) return path;
    const base = this.baseUrl.replace(/\/api\/?$/, '');
    return `${base}${path.startsWith('/') ? path : `/${path}`}`;
  }
}

let instance: ApiClient | null = null;

export function initApi(baseUrl: string, getToken: () => string | null) {
  instance = new ApiClient(baseUrl, getToken);
}

export function api(): ApiClient {
  if (!instance) throw new Error(translate('error.apiNotInitialized'));
  return instance;
}
