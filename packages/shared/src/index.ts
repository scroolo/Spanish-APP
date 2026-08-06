export type CefrLevel = 'A0' | 'A1' | 'A2' | 'B1' | 'B2' | 'C1';

export const CEFR_LEVELS: CefrLevel[] = ['A0', 'A1', 'A2', 'B1', 'B2', 'C1'];

export type SpanishVariant = 'spain' | 'latin_america' | 'none';

export type MainGoal =
  | 'travel'
  | 'living_in_spain'
  | 'conversation'
  | 'movies_series'
  | 'work'
  | 'general_fluency';

export type ExerciseType =
  | 'multiple_choice'
  | 'fill_blank'
  | 'translation'
  | 'ordering'
  | 'listening'
  | 'speaking';

export type MasteryStage = 'NEW' | 'LEARNING' | 'FAMILIAR' | 'STRONG' | 'MASTERED';

export type WeaknessCategory =
  | 'vocabulary'
  | 'grammar'
  | 'conjugation'
  | 'listening'
  | 'translation_direction'
  | 'sentence_construction';

export interface UserDto {
  id: string;
  email: string;
  displayName: string | null;
  nativeLanguage: string;
  createdAt: string;
}

export interface UserLanguageDto {
  languageCode: string;
  languageName: string;
  cefrLevel: CefrLevel;
  dailyMinutes: number;
  mainGoal: MainGoal;
  spanishVariant: SpanishVariant;
  isActive: boolean;
}

export interface AuthResponse {
  token: string;
  user: UserDto;
  language: UserLanguageDto | null;
}

export interface OnboardingInput {
  languageCode: string;
  cefrLevel: CefrLevel;
  dailyMinutes: number;
  mainGoal: MainGoal;
  spanishVariant: SpanishVariant;
  nativeLanguage: string;
}

export interface OnboardingOptions {
  levels: { value: CefrLevel; label: string; description: string }[];
  durations: { value: number; label: string }[];
  goals: { value: MainGoal; label: string }[];
  variants: { value: SpanishVariant; label: string }[];
  nativeLanguages: { value: string; label: string }[];
}
export interface VocabularyItemDto {
  id: string;
  spanish: string;
  translation: string;
  pronunciation: string;
  exampleSentence: string;
  exampleTranslation: string;
  audioUrl: string | null;
  partOfSpeech: string | null;
  category: string | null;
}

export interface GrammarConceptDto {
  id: string;
  slug: string;
  title: string;
  explanation: string;
  rule: string;
  examples: { spanish: string; translation: string }[];
}

export interface ExerciseDto {
  id: string;
  type: ExerciseType;
  prompt: string;
  options: string[] | null;
  hint: string | null;
  sortOrder: number;
  audioUrl: string | null;
  /** For 'speaking' exercises: the Spanish sentence the learner must produce. */
  targetEs: string | null;
}

export interface LessonReviewItemDto {
  id: string;
  kind: 'vocabulary' | 'grammar';
  spanish: string;
  translation: string;
  prompt: string;
  options: string[];
  correctAnswer: string;
  sourceTitle: string;
}

export interface LessonDto {
  id: string;
  moduleTitle: string;
  moduleSlug: string;
  title: string;
  description: string;
  dayNumber: number;
  estimatedMinutes: number;
  parts: {
    review: LessonReviewItemDto[];
    vocabulary: VocabularyItemDto[];
    grammar: GrammarConceptDto | null;
    exercises: ExerciseDto[];
  };
}

export interface AttemptResult {
  correct: boolean;
  correctAnswer: string;
  explanation: string | null;
  masteryDelta: number;
  xpEarned: number;
}

export interface LessonCompleteResult {
  xpEarned: number;
  minutesSpent: number;
  lessonsCompleted: number;
  currentStreak: number;
  achievementsUnlocked: { code: string; title: string; description: string }[];
  nextLessonId: string | null;
}

export type DailyPlanItemKind = 'review' | 'lesson' | 'speaking' | 'personalized' | 'conversation';

export interface DailyPlanItemDto {
  kind: DailyPlanItemKind;
  /** Slovak recommendation title, e.g. "Opakovanie". */
  title: string;
  minutes: number;
  /** Set for the course-lesson item. */
  lessonId: string | null;
  /** Number of currently due review items (review item only). */
  reviewItems?: number;
  done: boolean;
}

export interface DailyPlanDto {
  durationGoal: number;
  completedMinutes: number;
  plannedMinutes: number;
  status: 'pending' | 'done';
  reviewDueCount: number;
  /** True when the learner completed several lessons in the last 24h. */
  fastLearner: boolean;
  /** True when the review backlog is high — recommend review first. */
  emphasizeReview: boolean;
  items: DailyPlanItemDto[];
}

export interface SkillStat {
  label: string;
  percent: number;
}

export interface SummaryDto {
  dayNumber: number;
  cefrLevel: CefrLevel;
  currentStreak: number;
  estimatedMinutes: number;
  totalLearningMinutes: number;
  totalHours: number;
  vocabularyLearned: number;
  lessonsCompleted: number;
  weeklyMinutes: number;
  nextMilestone: { label: string; progress: number } | null;
  progress: {
    vocabulary: SkillStat;
    grammar: SkillStat;
    listening: SkillStat;
    speaking: SkillStat;
  };
  todayLesson: {
    id: string | null;
    title: string;
    description: string;
    estimatedMinutes: number;
    isReviewLesson: boolean;
  } | null;
  hasCompletedToday: boolean;
  plan: DailyPlanDto;
}

export interface ProgressDto {
  cefrLevel: CefrLevel;
  levelPercent: number;
  vocabularyLearned: number;
  grammarConcepts: number;
  lessonsCompleted: number;
  totalLessons: number;
  totalLearningMinutes: number;
  listeningPercent: number;
  speakingPercent: number;
  readingPercent: number;
  skills: SkillStat[];
  weaknesses: { grammarTitle: string; accuracy: number; needsReview: boolean }[];
  vocabStats: VocabStatsDto;
  grammarStats: GrammarStatsDto;
  studyStats: StudyStatsDto;
  strongestTopics: TopicStat[];
  weakestTopics: TopicStat[];
  modules: {
    id: string;
    title: string;
    lessonCount: number;
    completedLessons: number;
    percent: number;
  }[];
}

export interface LearningProfileDto {
  targetLanguage: string;
  nativeLanguage: string;
  cefrLevel: string;
  studyMinutes: number;
  vocabulary: {
    learned: number;
    mastered: number;
    strong: number;
    needsReview: number;
    weak: string[];
    recent: { spanish: string; translation: string; reviewedAt: string }[];
  };
  grammar: {
    known: string[];
    weak: { key: string; title: string; accuracy: number }[];
  };
  recentMistakes: {
    vocabularySpanish: string | null;
    grammarKey: string | null;
    correctAnswer: string | null;
    userAnswer: string | null;
    createdAt: string;
  }[];
  strongTopics: TopicStat[];
  weakTopics: TopicStat[];
  generatedAt: string;
}

export interface ReviewSessionDto {
  items: LessonReviewItemDto[];
}

export interface ReviewSummaryDto {
  vocabCount: number;
  grammarCount: number;
  estimatedMinutes: number;
  totalItems: number;
}

export interface VocabStatsDto {
  learned: number;
  learning: number;
  familiar: number;
  strong: number;
  mastered: number;
  needsReview: number;
}

export interface GrammarStatsDto {
  total: number;
  mastered: number;
  learning: number;
  weak: number;
}

export interface StudyStatsDto {
  currentStreak: number;
  longestStreak: number;
  totalMinutes: number;
  totalHours: number;
  lessonsCompleted: number;
}

export interface TopicStat {
  label: string;
  percent: number;
}

export interface ModuleSummaryDto {
  id: string;
  slug: string;
  title: string;
  description: string;
  lessons: {
    id: string;
    title: string;
    dayNumber: number;
    status: 'not_started' | 'in_progress' | 'completed' | 'locked';
  }[];
}

export type GeneratedExerciseType =
  | 'multiple_choice'
  | 'fill_blank'
  | 'translation'
  | 'ordering'
  | 'error_correction'
  | 'short_answer';

export type ExerciseDifficulty = 'easy' | 'medium' | 'hard';

export interface GeneratedExerciseDto {
  id: string;
  type: GeneratedExerciseType;
  prompt: string;
  options: string[] | null;
  difficulty: ExerciseDifficulty;
  grammarConceptTitle: string | null;
  tags: string[];
}

export interface AiExerciseGenerateResult {
  provider: string;
  targeted: { kind: 'grammar' | 'vocabulary' | 'general'; label: string } | null;
  exercises: GeneratedExerciseDto[];
}

export interface AiExerciseAttemptResult extends AttemptResult {
  generatedExerciseId: string;
}

export interface UsageSummaryEntry {
  feature: string;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  ttsCharacters: number;
  sttSeconds: number;
}

export interface TutorReplyDto {
  replySk: string;
  spanishExample: string | null;
  exampleTranslationSk: string | null;
  followUpQuestionSk: string | null;
}

export interface AudioAssetDto {
  url: string;
  format: string;
  cached: boolean;
  provider: string;
}

export type SpeakingEvaluation = 'correct' | 'close' | 'retry' | 'unrecognized';

export interface SpeakingAttemptResult {
  id: string;
  recognized: string;
  target: string;
  evaluation: SpeakingEvaluation;
  feedbackSk: string;
  recordedSeconds: number;
  provider: string;
}

export interface CurriculumDto {
  languageCode: string;
  cefrLevel: string;
  modules: ModuleSummaryDto[];
}

export interface ConversationScenarioDto {
  slug: string;
  titleSk: string;
  descriptionSk: string;
  maxCefr: string;
  openingEs: string;
  openingSk: string;
}

export interface ConversationSessionTurnDto {
  id: string;
  role: 'ai' | 'learner';
  spanish: string;
  translationSk: string | null;
  hintsSk: string[] | null;
  kind: string | null;
  createdAt: string;
}

export interface ConversationSummaryResult {
  newPhrases: string[];
  suggestedReview: string;
}

export interface ConversationSessionDto {
  id: string;
  scenarioSlug: string;
  status: 'active' | 'finished';
  correctedCount: number;
  turns: ConversationSessionTurnDto[];
  summary: ConversationSummaryResult | null;
}

export interface ConversationReplyResult {
  turn: ConversationSessionTurnDto;
  feedbackSk: string | null;
  session: ConversationSessionDto;
}

export interface ApiError {
  error: { code: string; message: string };
}
