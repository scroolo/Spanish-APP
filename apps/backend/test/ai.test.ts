import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import type { LearningProfileDto } from '@spanish/shared';
import { AIService, extractJson } from '../src/ai/AIService.js';
import type { AIProvider } from '../src/ai/types.js';
import { MockAIProvider } from '../src/ai/providers/mock.js';
import {
  ConversationFeedbackSchema,
  ConversationSummarySchema,
  ConversationTurnSchema,
  GeneratedExerciseSchema,
  GeneratedExerciseSetSchema,
  TutorReplySchema,
} from '../src/ai/schemas.js';
import { LearningContextService, CONTEXT_LIMITS } from '../src/ai/LearningContextService.js';
import { languagePolicy } from '../src/ai/languagePolicy.js';
import { assertRateLimit, resetRateLimits } from '../src/ai/rateLimit.js';
import { UsageService } from '../src/services/usage.service.js';

const usage = new UsageService();

function makeService(provider: AIProvider) {
  return new AIService(provider, usage);
}

describe('extractJson', () => {
  it('parses raw json', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('parses fenced json', () => {
    expect(extractJson('```json\n{"a":2}\n```')).toEqual({ a: 2 });
  });

  it('parses json embedded in prose', () => {
    expect(extractJson('Odpoveď: {"a":3} koniec')).toEqual({ a: 3 });
  });

  it('returns null for invalid input', () => {
    expect(extractJson('not json at all')).toBeNull();
  });
});

describe('AIService structured generation with mock provider', () => {
  it('produces schema-valid exercise set', async () => {
    const service = makeService(new MockAIProvider());
    const result = await service.generateStructured(
      GeneratedExerciseSetSchema,
      {
        system: 'test',
        prompt: 'Vygeneruj cvičenia na SER_VS_ESTAR.',
      },
    );
    expect(result).not.toBeNull();
    expect(result!.exercises.length).toBeGreaterThanOrEqual(1);
    for (const ex of result!.exercises) {
      expect(typeof ex.answer).toBe('string');
      expect(ex.answer.length).toBeGreaterThan(0);
      if (ex.type === 'multiple_choice') expect(ex.options!.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('produces schema-valid tutor reply', async () => {
    const service = makeService(new MockAIProvider());
    const result = await service.generateStructured(
      TutorReplySchema,
      { system: 'test', prompt: 'Vysvetli po slovensky: Estoy cansado.' },
    );
    expect(result).not.toBeNull();
    expect(result!.replySk.length).toBeGreaterThan(5);
  });

  it('produces schema-valid conversation turn', async () => {
    const service = makeService(new MockAIProvider());
    const result = await service.generateStructured(
      ConversationTurnSchema,
      { system: 'test', prompt: 'Scenario: Predstavenie, turn 1' },
    );
    expect(result).not.toBeNull();
    expect(result!.spanish.length).toBeGreaterThan(0);
    expect(result!.translationSk.length).toBeGreaterThan(0);
  });

  it('produces schema-valid feedback and summary', async () => {
    const service = makeService(new MockAIProvider());
    const fb = await service.generateStructured(ConversationFeedbackSchema, { system: 't', prompt: 'feedback' });
    const sum = await service.generateStructured(ConversationSummarySchema, { system: 't', prompt: 'summary' });
    expect(fb).not.toBeNull();
    expect(sum).not.toBeNull();
    expect(['continue', 'correction']).toContain(fb!.kind);
  });
});

class AlwaysInvalidProvider implements AIProvider {
  readonly name = 'invalid';
  async generateCompletion() {
    return { text: 'this is not json', usage: { inputTokens: 1, outputTokens: 1 } };
  }
  async *streamCompletion() {
    yield 'x';
  }
}

class FirstTryInvalidProvider implements AIProvider {
  readonly name = 'first-invalid';
  private n = 0;
  async generateCompletion() {
    this.n++;
    return { text: this.n === 1 ? '{oops' : '{"replySk":"Toto je platná odpoveď.","spanishExample":"Soy de Eslovaquia.","exampleTranslationSk":"Som zo Slovenska."}', usage: {} };
  }
  async *streamCompletion() {
    yield 'x';
  }
}

describe('AIService structured generation fallback', () => {
  it('returns null when provider never returns valid JSON', async () => {
    const service = makeService(new AlwaysInvalidProvider());
    const result = await service.generateStructured(
      TutorReplySchema,
      { system: 't', prompt: 'p' },
    );
    expect(result).toBeNull();
  });

  it('recovers on a later retry attempt', async () => {
    const service = makeService(new FirstTryInvalidProvider());
    const result = await service.generateStructured(
      TutorReplySchema,
      { system: 't', prompt: 'p' },
    );
    expect(result).not.toBeNull();
    expect(result!.replySk).toContain('platná');
  });

  it('mock provider never yields malformed exercises', async () => {
    const service = makeService(new MockAIProvider());
    for (let i = 0; i < 20; i++) {
      const single = await service.generateStructured(
        GeneratedExerciseSchema,
        { system: 't', prompt: `run ${i} tenet gustar ser ser_vs_estar` },
      );
      if (single) {
        const parsed = GeneratedExerciseSchema.safeParse(single);
        expect(parsed.success).toBe(true);
      }
    }
  });
});

describe('LearningContextService', () => {
  const profile: LearningProfileDto = {
    targetLanguage: 'es-ES',
    nativeLanguage: 'sk-SK',
    cefrLevel: 'A1',
    studyMinutes: 30,
    vocabulary: {
      learned: 10,
      mastered: 2,
      strong: 1,
      needsReview: 3,
      weak: Array.from({ length: 20 }, (_, i) => `weak${i}`),
      recent: Array.from({ length: 20 }, (_, i) => ({ spanish: `palabra${i}`, translation: `slovo${i}`, reviewedAt: new Date().toISOString() })),
    },
    grammar: {
      known: Array.from({ length: 15 }, (_, i) => `gram${i}`),
      weak: Array.from({ length: 10 }, (_, i) => ({ key: `g${i}`, title: `Gramatika ${i}`, accuracy: 40 })),
    },
    recentMistakes: Array.from({ length: 10 }, (_, i) => ({
      vocabularySpanish: null,
      grammarKey: `g${i}`,
      correctAnswer: `ok${i}`,
      userAnswer: `bad${i}`,
      createdAt: new Date().toISOString(),
    })),
    strongTopics: [],
    weakTopics: [],
    generatedAt: new Date().toISOString(),
  };

  it('caps context fields', () => {
    const svc = new LearningContextService();
    const ctx = svc.build(profile, {
      lessonTitle: 'L1',
      grammarTopic: 'SER',
      vocabulary: ['a', 'b'],
    });
    expect(ctx.weakVocabulary.length).toBeLessThanOrEqual(CONTEXT_LIMITS.weakVocabulary);
    expect(ctx.weakGrammar.length).toBeLessThanOrEqual(CONTEXT_LIMITS.weakGrammar);
    expect(ctx.recentMistakes.length).toBeLessThanOrEqual(CONTEXT_LIMITS.recentMistakes);
    expect(ctx.knownGrammar.length).toBeLessThanOrEqual(CONTEXT_LIMITS.knownGrammar);
    expect(ctx.recentVocabulary.length).toBeLessThanOrEqual(CONTEXT_LIMITS.recentVocabulary);
  });

  it('reflects current activity', () => {
    const svc = new LearningContextService();
    const ctx = svc.build(profile, { lessonTitle: 'Predstavenie', grammarTopic: 'SER', vocabulary: ['hola', 'me llamo'] });
    expect(ctx.currentLesson.title).toBe('Predstavenie');
    expect(ctx.currentLesson.grammarTopic).toBe('SER');
    expect(ctx.currentLesson.vocabulary).toEqual(['hola', 'me llamo']);
  });

  it('includes learner identity fields', () => {
    const svc = new LearningContextService();
    const ctx = svc.build(profile);
    expect(ctx.learner.cefr).toBe('A1');
    expect(ctx.learner.nativeLanguage).toBe('sk-SK');
    expect(ctx.learner.targetLanguage).toBe('es-ES');
  });

  it('produces bounded text blocks', () => {
    const svc = new LearningContextService();
    const ctx = svc.build(profile);
    expect(svc.toText(ctx).length).toBeGreaterThan(0);
    expect(svc.systemBlock(ctx)).toContain('A1');
  });
});

describe('languagePolicy', () => {
  it('returns slovak-first guidance for beginners', () => {
    expect(languagePolicy('A0')).toContain('slovenčina');
  });

  it('falls back to A1 for unknown levels', () => {
    expect(languagePolicy('ZZ')).toContain('slovenčina');
  });
});

describe('assertRateLimit', () => {
  it('allows requests up to the limit then rejects', () => {
    resetRateLimits();
    const userId = 'user-rate';
    const limit = 60;
    for (let i = 0; i < limit; i++) {
      expect(() => assertRateLimit(userId, 'ai', new Date(1700000000000 + i * 1000))).not.toThrow();
    }
    let caught: { code?: string } | undefined;
    try {
      assertRateLimit(userId, 'ai', new Date(1700000000000 + limit * 1000));
    } catch (e) {
      caught = e as { code?: string };
    }
    expect(caught?.code).toBe('RATE_LIMITED');
    resetRateLimits();
  });

  it('treats scopes independently', () => {
    resetRateLimits();
    const userId = 'user-scope';
    expect(() => assertRateLimit(userId, 'tts', new Date())).not.toThrow();
    expect(() => assertRateLimit(userId, 'ai', new Date())).not.toThrow();
    resetRateLimits();
  });
});
