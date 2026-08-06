import { config } from '../config.js';
import type { LearningProfileDto } from '@spanish/shared';
import { languagePolicy } from './languagePolicy.js';

/**
 * Constructs a concise, bounded learning context for AI prompts.
 *
 * The full learner history is never sent to a provider. Only a small,
 * structured summary is built from the learning profile plus the learner's
 * current activity. `LIMITS` keep every prompt small and cheap.
 */
export const CONTEXT_LIMITS = {
  weakVocabulary: 8,
  weakGrammar: 5,
  recentMistakes: 5,
  knownGrammar: 8,
  recentVocabulary: 8,
  currentLessonVocabulary: 10,
} as const;

export interface CurrentActivity {
  lessonTitle?: string;
  grammarTopic?: string;
  vocabulary?: string[];
}

export interface LearnerContext {
  learner: {
    cefr: string;
    nativeLanguage: string;
    targetLanguage: string;
  };
  currentLesson: {
    title: string | null;
    grammarTopic: string | null;
    vocabulary: string[];
  };
  weakGrammar: { key: string; title: string; accuracy: number }[];
  weakVocabulary: string[];
  recentMistakes: {
    userAnswer: string | null;
    correctAnswer: string | null;
    vocabularySpanish: string | null;
    grammarKey: string | null;
  }[];
  knownGrammar: string[];
  recentVocabulary: string[];
}

export class LearningContextService {
  /** Builds the structured context from the learning profile + current activity. */
  build(profile: LearningProfileDto, activity: CurrentActivity = {}): LearnerContext {
    return {
      learner: {
        cefr: profile.cefrLevel,
        nativeLanguage: profile.nativeLanguage,
        targetLanguage: profile.targetLanguage,
      },
      currentLesson: {
        title: activity.lessonTitle ?? null,
        grammarTopic: activity.grammarTopic ?? null,
        vocabulary: (activity.vocabulary ?? []).slice(0, CONTEXT_LIMITS.currentLessonVocabulary),
      },
      weakGrammar: profile.grammar.weak.slice(0, CONTEXT_LIMITS.weakGrammar),
      weakVocabulary: profile.vocabulary.weak.slice(0, CONTEXT_LIMITS.weakVocabulary),
      recentMistakes: profile.recentMistakes.slice(0, CONTEXT_LIMITS.recentMistakes).map((m) => ({
        userAnswer: m.userAnswer,
        correctAnswer: m.correctAnswer,
        vocabularySpanish: m.vocabularySpanish,
        grammarKey: m.grammarKey,
      })),
      knownGrammar: profile.grammar.known.slice(0, CONTEXT_LIMITS.knownGrammar),
      recentVocabulary: profile.vocabulary.recent
        .slice(0, CONTEXT_LIMITS.recentVocabulary)
        .map((v) => v.spanish),
    };
  }

  /** Human-readable summary used as the prompt's context block. */
  toText(ctx: LearnerContext): string {
    const parts: string[] = [];
    parts.push(
      `Úroveň: ${ctx.learner.cefr}. Rodný jazyk: ${ctx.learner.nativeLanguage}. Cieľový jazyk: ${ctx.learner.targetLanguage}.`,
    );
    if (ctx.currentLesson.title) {
      parts.push(`Aktuálna lekcia: ${ctx.currentLesson.title}.`);
    }
    if (ctx.currentLesson.grammarTopic) {
      parts.push(`Aktuálna gramatika: ${ctx.currentLesson.grammarTopic}.`);
    }
    if (ctx.currentLesson.vocabulary.length > 0) {
      parts.push(`Slová z lekcie: ${ctx.currentLesson.vocabulary.join(', ')}.`);
    }
    if (ctx.weakGrammar.length > 0) {
      parts.push(
        `Slabé gramatické javy: ${ctx.weakGrammar.map((g) => `${g.title} (${g.accuracy} %)`).join(', ')}.`,
      );
    }
    if (ctx.weakVocabulary.length > 0) {
      parts.push(`Slabé slová: ${ctx.weakVocabulary.join(', ')}.`);
    }
    if (ctx.recentMistakes.length > 0) {
      parts.push(
        `Nedávne chyby: ${ctx.recentMistakes
          .map((m) => (m.userAnswer ? `„${m.userAnswer}" (správne: ${m.correctAnswer ?? '?'})` : m.correctAnswer))
          .join('; ')}.`,
      );
    }
    if (ctx.knownGrammar.length > 0) {
      parts.push(`Zvládnutá gramatika: ${ctx.knownGrammar.join(', ')}.`);
    }
    if (ctx.recentVocabulary.length > 0) {
      parts.push(`Nedávna slovná zásoba: ${ctx.recentVocabulary.join(', ')}.`);
    }
    return parts.join('\n');
  }

  /** System-prompt segment including the CEFR language policy. */
  systemBlock(ctx: LearnerContext): string {
    const policy = languagePolicy(ctx.learner.cefr);
    return (
      'Si trpezlivý učiteľ španielčiny (španielčina zo Španielska, es-ES) pre slovensky hovoriaceho žiaka.\n' +
      `${policy}\n` +
      'Vždy zodpovedz konkrétnu otázku. Používaj krátke vety. Príklady uvádzaj so slovenským prekladom. Nezahlcuj žiaka.\n' +
      'Kontext žiaka:\n' +
      this.toText(ctx)
    );
  }

  /** Truncates to a safe maximum to prevent oversized prompts. */
  bounded(ctx: LearnerContext): LearnerContext {
    const text = this.toText(ctx);
    if (text.length <= config.ai.maxContextChars) return ctx;
    return {
      ...ctx,
      recentMistakes: ctx.recentMistakes.slice(0, 2),
      knownGrammar: ctx.knownGrammar.slice(0, 3),
      recentVocabulary: ctx.recentVocabulary.slice(0, 3),
      weakGrammar: ctx.weakGrammar.slice(0, 2),
    };
  }
}
