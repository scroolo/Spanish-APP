import type { TutorReplyDto } from '@spanish/shared';
import { AIService } from '../ai/AIService.js';
import { TutorReplySchema, type TutorReply } from '../ai/schemas.js';
import { LearningContextService, type CurrentActivity } from '../ai/LearningContextService.js';
import { LearningProfileService } from './learning-profile.service.js';
import { LessonService } from './lesson.service.js';

/**
 * AI učiteľ — a contextual, lesson-aware Spanish tutor for Slovak learners.
 *
 * The teacher never decides WHAT to study; that stays deterministic. It only
 * explains, answers lesson questions and creates variations. Every answer is
 * schema-validated and falls back to a deterministic reply when the provider
 * is unavailable, so core learning is never blocked.
 */
export class TutorService {
  constructor(
    private aiService: AIService,
    private learningContext: LearningContextService,
    private profileService: LearningProfileService,
    private lessonService: LessonService,
  ) {}

  private async activityFor(
    userId: string,
    languageId: string,
    lessonId: string | undefined,
    now: Date,
  ): Promise<{ activity: CurrentActivity; grammarExplanation: string | null }> {
    if (lessonId) {
      const lesson = await this.lessonService.assembleById(userId, languageId, lessonId, now);
      if (lesson) {
        return {
          activity: {
            lessonTitle: lesson.title,
            grammarTopic: lesson.parts.grammar?.title ?? undefined,
            vocabulary: lesson.parts.vocabulary.map((v) => v.spanish),
          },
          grammarExplanation: lesson.parts.grammar?.explanation ?? null,
        };
      }
    }
    const today = await this.lessonService.assemble(userId, languageId, now);
    if (today) {
      return {
        activity: {
          lessonTitle: today.title,
          grammarTopic: today.parts.grammar?.title ?? undefined,
          vocabulary: today.parts.vocabulary.map((v) => v.spanish),
        },
        grammarExplanation: today.parts.grammar?.explanation ?? null,
      };
    }
    return { activity: {}, grammarExplanation: null };
  }

  private async contextBlock(
    userId: string,
    languageId: string,
    activity: CurrentActivity,
    now: Date,
  ) {
    const profile = await this.profileService.get(userId, languageId, now);
    const ctx = this.learningContext.bounded(this.learningContext.build(profile, activity));
    return { system: this.learningContext.systemBlock(ctx), profile };
  }

  /** „Vysvetli po slovensky" — explains today's / given lesson grammar. */
  async explain(
    userId: string,
    languageId: string,
    lessonId: string | undefined,
    now: Date,
  ): Promise<TutorReplyDto> {
    const { activity, grammarExplanation } = await this.activityFor(userId, languageId, lessonId, now);
    const { system } = await this.contextBlock(userId, languageId, activity, now);
    const topic = activity.grammarTopic ?? 'tvoja aktuálna lekcia';
    const prompt =
      `Vysvetli po slovensky hlavnú gramatiku aktuálnej lekcie: «${topic}». ` +
      `Uveď jeden jasný španielsky príklad s prekladom do slovenčiny. Buď stručný. ` +
      `Odpovedz JSON objektom s kľúčmi replySk, spanishExample, exampleTranslationSk, followUpQuestionSk.`;

    const reply = await this.safeGenerate(prompt, system, userId);
    if (reply) return toDto(reply);
    return {
      replySk: `Vysvetlím ti «${topic}». ${grammarExplanation ?? 'Pozri si gramatickú kartu v lekcii.'}`,
      spanishExample: null,
      exampleTranslationSk: null,
      followUpQuestionSk: null,
    };
  }

  /** „Opýtať sa učiteľa" — answers an actual learner question. */
  async ask(
    userId: string,
    languageId: string,
    question: string,
    lessonId: string | undefined,
    now: Date,
  ): Promise<TutorReplyDto> {
    const { activity } = await this.activityFor(userId, languageId, lessonId, now);
    const { system } = await this.contextBlock(userId, languageId, activity, now);
    const prompt =
      `Žiak sa pýta: «${question}»\n` +
      `Odpovedz PRIAMO na túto otázku. Rešpektuj jeho úroveň, vysvetli po slovensky, ` +
      `uveď španielsky príklad s prekladom. Odpoveď nesmie byť príliš dlhá. ` +
      `Odpovedz JSON objektom s kľúčmi replySk, spanishExample, exampleTranslationSk, followUpQuestionSk.`;

    const reply = await this.safeGenerate(prompt, system, userId);
    if (reply) return toDto(reply);
    return {
      replySk: 'Dobrá otázka! Aktuálna lekcia ťa naučí základ, ktorý hľadáš. Skús najprv prečítať gramatickú kartu a potom mi položiť konkrétnejšiu otázku.',
      spanishExample: null,
      exampleTranslationSk: null,
      followUpQuestionSk: null,
    };
  }

  private async safeGenerate(prompt: string, system: string, userId: string): Promise<TutorReply | null> {
    try {
      return await this.aiService.generateStructured(
        TutorReplySchema,
        { system, prompt, temperature: 0.4, maxTokens: 700 },
        userId,
        'ai_tutor',
      );
    } catch {
      return null;
    }
  }
}

function toDto(r: TutorReply): TutorReplyDto {
  return {
    replySk: r.replySk,
    spanishExample: r.spanishExample ?? null,
    exampleTranslationSk: r.exampleTranslationSk ?? null,
    followUpQuestionSk: r.followUpQuestionSk ?? null,
  };
}
