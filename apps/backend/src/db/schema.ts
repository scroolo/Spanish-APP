import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 320 }).notNull(),
    passwordHash: text('password_hash').notNull(),
    displayName: text('display_name'),
    nativeLanguage: text('native_language').notNull().default('sk'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('users_email_idx').on(t.email)],
);

export const languages = pgTable(
  'languages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: varchar('code', { length: 8 }).notNull(),
    name: varchar('name', { length: 64 }).notNull(),
    status: varchar('status', { length: 16 }).notNull().default('active'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [uniqueIndex('languages_code_idx').on(t.code)],
);

export const userLanguages = pgTable(
  'user_languages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    languageId: uuid('language_id')
      .notNull()
      .references(() => languages.id, { onDelete: 'cascade' }),
    cefrLevel: varchar('cefr_level', { length: 4 }).notNull().default('A0'),
    dailyMinutes: integer('daily_minutes').notNull().default(30),
    mainGoal: varchar('main_goal', { length: 32 }).notNull().default('general_fluency'),
    spanishVariant: varchar('spanish_variant', { length: 16 }).notNull().default('spain'),
    nativeLanguage: text('native_language').notNull().default('sk'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('user_languages_uid_lid_idx').on(t.userId, t.languageId)],
);

export const courses = pgTable('courses', {
  id: uuid('id').primaryKey().defaultRandom(),
  languageId: uuid('language_id')
    .notNull()
    .references(() => languages.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 128 }).notNull(),
  cefrLevel: varchar('cefr_level', { length: 4 }).notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const modules = pgTable('modules', {
  id: uuid('id').primaryKey().defaultRandom(),
  courseId: uuid('course_id')
    .notNull()
    .references(() => courses.id, { onDelete: 'cascade' }),
  slug: varchar('slug', { length: 64 }).notNull(),
  title: varchar('title', { length: 128 }).notNull(),
  description: text('description').notNull().default(''),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const lessons = pgTable('lessons', {
  id: uuid('id').primaryKey().defaultRandom(),
  moduleId: uuid('module_id')
    .notNull()
    .references(() => modules.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 128 }).notNull(),
  description: text('description').notNull().default(''),
  dayNumber: integer('day_number').notNull().default(0),
  sortOrder: integer('sort_order').notNull().default(0),
  estimatedMinutes: integer('estimated_minutes').notNull().default(30),
  isReviewLesson: boolean('is_review_lesson').notNull().default(false),
});

export const vocabularyItems = pgTable('vocabulary_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  languageId: uuid('language_id')
    .notNull()
    .references(() => languages.id, { onDelete: 'cascade' }),
  moduleId: uuid('module_id').references(() => modules.id, { onDelete: 'set null' }),
  lessonId: uuid('lesson_id').references(() => lessons.id, { onDelete: 'set null' }),
  spanish: varchar('spanish', { length: 255 }).notNull(),
  translation: varchar('translation', { length: 255 }).notNull(),
  pronunciation: varchar('pronunciation', { length: 255 }).notNull().default(''),
  exampleSentence: text('example_sentence').notNull().default(''),
  exampleTranslation: text('example_translation').notNull().default(''),
  audioUrl: text('audio_url'),
  partOfSpeech: varchar('part_of_speech', { length: 32 }),
  category: varchar('category', { length: 64 }).notNull().default('general'),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const grammarConcepts = pgTable('grammar_concepts', {
  id: uuid('id').primaryKey().defaultRandom(),
  languageId: uuid('language_id')
    .notNull()
    .references(() => languages.id, { onDelete: 'cascade' }),
  moduleId: uuid('module_id').references(() => modules.id, { onDelete: 'set null' }),
  slug: varchar('slug', { length: 64 }).notNull(),
  title: varchar('title', { length: 128 }).notNull(),
  explanation: text('explanation').notNull().default(''),
  rule: text('rule').notNull().default(''),
  examples: jsonb('examples').$type<{ spanish: string; translation: string }[]>().notNull().default([]),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const exercises = pgTable('exercises', {
  id: uuid('id').primaryKey().defaultRandom(),
  lessonId: uuid('lesson_id')
    .notNull()
    .references(() => lessons.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 32 }).notNull(),
  prompt: text('prompt').notNull(),
  options: jsonb('options').$type<string[] | null>(),
  correctAnswer: text('correct_answer').notNull(),
  explanation: text('explanation'),
  hint: text('hint'),
  vocabItemId: uuid('vocab_item_id').references(() => vocabularyItems.id, { onDelete: 'set null' }),
  grammarConceptId: uuid('grammar_concept_id').references(() => grammarConcepts.id, { onDelete: 'set null' }),
  audioText: text('audio_text'),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const userVocabulary = pgTable(
  'user_vocabulary',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    languageId: uuid('language_id')
      .notNull()
      .references(() => languages.id, { onDelete: 'cascade' }),
    vocabularyItemId: uuid('vocabulary_item_id')
      .notNull()
      .references(() => vocabularyItems.id, { onDelete: 'cascade' }),
    isLearned: boolean('is_learned').notNull().default(false),
    firstLearned: timestamp('first_learned', { withTimezone: true }),
    lastReviewed: timestamp('last_reviewed', { withTimezone: true }),
    reviewCount: integer('review_count').notNull().default(0),
    correctCount: integer('correct_count').notNull().default(0),
    incorrectCount: integer('incorrect_count').notNull().default(0),
    masteryScore: numeric('mastery_score', { precision: 6, scale: 4 }).notNull().default('0'),
    nextReviewDate: timestamp('next_review_date', { withTimezone: true }),
    seenInLessons: jsonb('seen_in_lessons').$type<string[]>().notNull().default([]),
  },
  (t) => [
    uniqueIndex('user_vocabulary_uid_vid_idx').on(t.userId, t.vocabularyItemId),
    index('user_vocabulary_next_review_idx').on(t.userId, t.nextReviewDate),
  ],
);

export const userGrammarProgress = pgTable(
  'user_grammar_progress',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    languageId: uuid('language_id')
      .notNull()
      .references(() => languages.id, { onDelete: 'cascade' }),
    grammarConceptId: uuid('grammar_concept_id')
      .notNull()
      .references(() => grammarConcepts.id, { onDelete: 'cascade' }),
    reviewCount: integer('review_count').notNull().default(0),
    correctCount: integer('correct_count').notNull().default(0),
    incorrectCount: integer('incorrect_count').notNull().default(0),
    masteryScore: numeric('mastery_score', { precision: 6, scale: 4 }).notNull().default('0'),
    nextReviewDate: timestamp('next_review_date', { withTimezone: true }),
    lastReviewed: timestamp('last_reviewed', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('user_grammar_uid_cid_idx').on(t.userId, t.grammarConceptId),
    index('user_grammar_next_review_idx').on(t.userId, t.nextReviewDate),
  ],
);

export const lessonProgress = pgTable(
  'lesson_progress',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    languageId: uuid('language_id')
      .notNull()
      .references(() => languages.id, { onDelete: 'cascade' }),
    lessonId: uuid('lesson_id')
      .notNull()
      .references(() => lessons.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 16 }).notNull().default('not_started'),
    progressPct: integer('progress_pct').notNull().default(0),
    attemptsCount: integer('attempts_count').notNull().default(0),
    bestScore: numeric('best_score', { precision: 6, scale: 4 }).notNull().default('0'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('lesson_progress_uid_lid_idx').on(t.userId, t.lessonId)],
);

export const generatedExercises = pgTable(
  'generated_exercises',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    languageId: uuid('language_id')
      .notNull()
      .references(() => languages.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 32 }).notNull(),
    instructionSk: text('instruction_sk').notNull(),
    sentenceEs: text('sentence_es'),
    options: jsonb('options').$type<string[] | null>(),
    correctAnswer: text('correct_answer').notNull(),
    explanation: text('explanation').notNull().default(''),
    grammarConceptId: uuid('grammar_concept_id').references(() => grammarConcepts.id, {
      onDelete: 'set null',
    }),
    vocabularyItemId: uuid('vocabulary_item_id').references(() => vocabularyItems.id, {
      onDelete: 'set null',
    }),
    difficulty: varchar('difficulty', { length: 16 }).notNull().default('easy'),
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    status: varchar('status', { length: 16 }).notNull().default('active'),
    attempts: integer('attempts').notNull().default(0),
    correctCount: integer('correct_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('generated_exercises_uid_status_idx').on(t.userId, t.status),
    index('generated_exercises_uid_created_idx').on(t.userId, t.createdAt),
  ],
);

export const exerciseAttempts = pgTable(
  'exercise_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    languageId: uuid('language_id')
      .notNull()
      .references(() => languages.id, { onDelete: 'cascade' }),
    lessonId: uuid('lesson_id').references(() => lessons.id, { onDelete: 'cascade' }),
    exerciseId: uuid('exercise_id').references(() => exercises.id, { onDelete: 'cascade' }),
    generatedExerciseId: uuid('generated_exercise_id').references(() => generatedExercises.id, {
      onDelete: 'cascade',
    }),
    source: varchar('source', { length: 16 }).notNull().default('curriculum'),
    isCorrect: boolean('is_correct').notNull(),
    userAnswer: text('user_answer'),
    answeredAt: timestamp('answered_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('exercise_attempts_uid_answered_idx').on(t.userId, t.answeredAt)],
);

export const mistakes = pgTable('mistakes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  languageId: uuid('language_id')
    .notNull()
    .references(() => languages.id, { onDelete: 'cascade' }),
  lessonId: uuid('lesson_id').references(() => lessons.id, { onDelete: 'set null' }),
  exerciseId: uuid('exercise_id').references(() => exercises.id, { onDelete: 'set null' }),
  generatedExerciseId: uuid('generated_exercise_id').references(() => generatedExercises.id, {
    onDelete: 'set null',
  }),
  vocabularyItemId: uuid('vocabulary_item_id').references(() => vocabularyItems.id, { onDelete: 'set null' }),
  grammarConceptId: uuid('grammar_concept_id').references(() => grammarConcepts.id, { onDelete: 'set null' }),
  exerciseType: varchar('exercise_type', { length: 32 }),
  mistakeType: varchar('mistake_type', { length: 32 }).notNull().default('general'),
  userAnswer: text('user_answer'),
  correctAnswer: text('correct_answer'),
  context: text('context'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const speakingAttempts = pgTable(
  'speaking_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    languageId: uuid('language_id')
      .notNull()
      .references(() => languages.id, { onDelete: 'cascade' }),
    exerciseId: uuid('exercise_id').references(() => exercises.id, { onDelete: 'set null' }),
    targetEs: text('target_es').notNull(),
    recognized: text('recognized'),
    evaluation: varchar('evaluation', { length: 16 }).notNull(),
    recordedSeconds: integer('recorded_seconds').notNull().default(0),
    provider: varchar('provider', { length: 32 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('speaking_attempts_uid_created_idx').on(t.userId, t.createdAt)],
);

export interface ConversationSummaryJson {
  newPhrases: string[];
  suggestedReview: string;
}

export interface ConversationTurnFeedbackJson {
  kind: 'continue' | 'correction';
  messageSk: string;
}

export const conversationSessions = pgTable(
  'conversation_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    languageId: uuid('language_id')
      .notNull()
      .references(() => languages.id, { onDelete: 'cascade' }),
    scenarioSlug: varchar('scenario_slug', { length: 40 }).notNull(),
    status: varchar('status', { length: 16 }).notNull().default('active'),
    correctedCount: integer('corrected_count').notNull().default(0),
    summary: jsonb('summary').$type<ConversationSummaryJson | null>(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('conversation_sessions_uid_idx').on(t.userId, t.createdAt)],
);

export const conversationTurns = pgTable(
  'conversation_turns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => conversationSessions.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 16 }).notNull(),
    spanish: text('spanish').notNull(),
    translationSk: text('translation_sk'),
    hintsSk: jsonb('hints_sk').$type<string[] | null>(),
    kind: varchar('kind', { length: 16 }),
    feedback: jsonb('feedback').$type<ConversationTurnFeedbackJson | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('conversation_turns_session_idx').on(t.sessionId, t.createdAt)],
);

export const userStatistics = pgTable(
  'user_statistics',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    languageId: uuid('language_id')
      .notNull()
      .references(() => languages.id, { onDelete: 'cascade' }),
    totalLearningMinutes: integer('total_learning_minutes').notNull().default(0),
    lessonsCompleted: integer('lessons_completed').notNull().default(0),
    vocabularyLearned: integer('vocabulary_learned').notNull().default(0),
    currentStreak: integer('current_streak').notNull().default(0),
    longestStreak: integer('longest_streak').notNull().default(0),
    totalXp: integer('total_xp').notNull().default(0),
    weeklyMinutes: integer('weekly_minutes').notNull().default(0),
    lastStudyDate: timestamp('last_study_date', { withTimezone: true }),
  },
  (t) => [uniqueIndex('user_statistics_uid_lid_idx').on(t.userId, t.languageId)],
);

export const weaknesses = pgTable(
  'weaknesses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    languageId: uuid('language_id')
      .notNull()
      .references(() => languages.id, { onDelete: 'cascade' }),
    category: varchar('category', { length: 32 }).notNull(),
    key: varchar('key', { length: 128 }).notNull(),
    label: varchar('label', { length: 160 }).notNull(),
    vocabularyItemId: uuid('vocabulary_item_id').references(() => vocabularyItems.id, { onDelete: 'set null' }),
    grammarConceptId: uuid('grammar_concept_id').references(() => grammarConcepts.id, { onDelete: 'set null' }),
    mistakeCount: integer('mistake_count').notNull().default(0),
    correctCount: integer('correct_count').notNull().default(0),
    lastMistakeAt: timestamp('last_mistake_at', { withTimezone: true }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('weaknesses_uid_cat_key_idx').on(t.userId, t.category, t.key),
    index('weaknesses_resolved_idx').on(t.userId, t.resolvedAt),
  ],
);

export const audioAssets = pgTable(
  'audio_assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    languageId: uuid('language_id').references(() => languages.id, { onDelete: 'set null' }),
    text: text('text').notNull(),
    voice: varchar('voice', { length: 64 }).notNull().default('alloy'),
    cacheKey: varchar('cache_key', { length: 64 }).notNull(),
    provider: varchar('provider', { length: 32 }).notNull().default('mock'),
    url: text('url').notNull(),
    format: varchar('format', { length: 16 }).notNull().default('mp3'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('audio_assets_cache_key_idx').on(t.cacheKey)],
);

export const aiUsage = pgTable(
  'ai_usage',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    feature: varchar('feature', { length: 32 }).notNull(),
    requestCount: integer('request_count').notNull().default(0),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    ttsCharacters: integer('tts_characters').notNull().default(0),
    sttSeconds: integer('stt_seconds').notNull().default(0),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('ai_usage_uid_feature_idx').on(t.userId, t.feature)],
);

export const achievements = pgTable('achievements', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 64 }).notNull(),
  title: varchar('title', { length: 128 }).notNull(),
  description: text('description').notNull().default(''),
  icon: varchar('icon', { length: 16 }).notNull().default('🎯'),
});

export const userAchievements = pgTable(
  'user_achievements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    achievementId: uuid('achievement_id')
      .notNull()
      .references(() => achievements.id, { onDelete: 'cascade' }),
    unlockedAt: timestamp('unlocked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('user_achievements_uid_aid_idx').on(t.userId, t.achievementId)],
);

export type User = typeof users.$inferSelect;
export type UserLanguage = typeof userLanguages.$inferSelect;
export type Lesson = typeof lessons.$inferSelect;
export type Module = typeof modules.$inferSelect;
export type VocabularyItem = typeof vocabularyItems.$inferSelect;
export type GrammarConcept = typeof grammarConcepts.$inferSelect;
export type Exercise = typeof exercises.$inferSelect;
export type UserVocabulary = typeof userVocabulary.$inferSelect;
export type UserGrammarProgress = typeof userGrammarProgress.$inferSelect;
export type LessonProgress = typeof lessonProgress.$inferSelect;
export type UserStatistics = typeof userStatistics.$inferSelect;
export type Weakness = typeof weaknesses.$inferSelect;
export type AIUsage = typeof aiUsage.$inferSelect;
export type GeneratedExercise = typeof generatedExercises.$inferSelect;
export type AudioAsset = typeof audioAssets.$inferSelect;
