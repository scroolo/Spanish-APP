import { z } from 'zod';

/**
 * Zod schemas validating every structured AI output before it reaches the
 * learner. Never trust raw LLM JSON: on validation failure the caller retries
 * safely or falls back to deterministic content.
 */

export const GENERATED_EXERCISE_TYPES = [
  'multiple_choice',
  'fill_blank',
  'translation',
  'ordering',
  'error_correction',
  'short_answer',
] as const;
export type GeneratedExerciseType = (typeof GENERATED_EXERCISE_TYPES)[number];

export const EXERCISE_DIFFICULTY = ['easy', 'medium', 'hard'] as const;

export const GeneratedExerciseSchema = z.object({
  type: z.enum(GENERATED_EXERCISE_TYPES),
  /** Slovak instruction shown above the exercise. */
  instructionSk: z.string().min(3).max(300),
  /** Spanish sentence for fill_blank / ordering / error_correction. */
  sentenceEs: z.string().min(1).max(300).optional(),
  /** Options for multiple_choice / ordering / error_correction. */
  options: z.array(z.string().min(1).max(200)).min(2).max(6).optional(),
  /** The correct answer. May contain '|'-separated accepted variants. */
  answer: z.string().min(1).max(300),
  /** Short Slovak explanation shown after evaluation. */
  explanationSk: z.string().min(3).max(400),
  /** Grammar concept slug (e.g. 'ser', 'tener'), when grammar-targeted. */
  grammarConcept: z.string().min(1).max(64).optional(),
  /** Spanish vocabulary terms used by the exercise. */
  vocabularyItems: z.array(z.string().min(1).max(120)).max(8).optional(),
  difficulty: z.enum(EXERCISE_DIFFICULTY),
});
export type GeneratedExercise = z.infer<typeof GeneratedExerciseSchema>;

/** A batch of generated exercises for one targeting session. */
export const GeneratedExerciseSetSchema = z.object({
  exercises: z.array(GeneratedExerciseSchema).min(1).max(8),
});
export type GeneratedExerciseSet = z.infer<typeof GeneratedExerciseSetSchema>;

/** Structured teacher reply (lesson Q&A / explain-in-Slovak / tutoring). */
export const TutorReplySchema = z.object({
  /** Slovak answer/explanation (respects CEFR language policy). */
  replySk: z.string().min(5).max(900),
  /** Optional Spanish example sentence. */
  spanishExample: z.string().min(1).max(300).optional(),
  /** Optional Slovak translation of the example. */
  exampleTranslationSk: z.string().min(1).max(300).optional(),
  /** Optional short follow-up question in Slovak. */
  followUpQuestionSk: z.string().min(1).max(200).optional(),
});
export type TutorReply = z.infer<typeof TutorReplySchema>;

/** AI turn inside a bounded conversation scenario. */
export const ConversationTurnSchema = z.object({
  spanish: z.string().min(1).max(400),
  translationSk: z.string().min(1).max(400),
  /** Short guidance for the mobile UI, e.g. 'question' | 'statement' | 'end'. */
  kind: z.enum(['question', 'statement', 'end']),
  /** Optional hints the learner can reveal ('Čo môžem povedať?'). */
  hintsSk: z.array(z.string().min(1).max(200)).max(3).optional(),
});
export type ConversationTurn = z.infer<typeof ConversationTurnSchema>;

/** Corrective feedback after a few conversation turns. */
export const ConversationFeedbackSchema = z.object({
  kind: z.enum(['continue', 'correction']),
  /** Short Slovak feedback message. */
  messageSk: z.string().min(3).max(600),
});
export type ConversationFeedback = z.infer<typeof ConversationFeedbackSchema>;

/** Session summary produced from stored turn data. */
export const ConversationSummarySchema = z.object({
  newPhrases: z.array(z.string().min(1).max(200)).max(6).optional(),
  suggestedReview: z.string().min(3).max(400),
});
export type ConversationSummary = z.infer<typeof ConversationSummarySchema>;
