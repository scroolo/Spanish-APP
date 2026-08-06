import type { ZodType } from 'zod';
import { config } from '../config.js';
import type { AICompletion, AIGenerateOptions, AIProvider } from './types.js';
import { UsageService, type UsageFeature } from '../services/usage.service.js';

/**
 * Extracts the first JSON value from a model response. Handles raw JSON and
 * responses wrapped in ```json fences.
 */
export function extractJson(text: string): unknown | null {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1]!.trim() : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    // Fallback: find first balanced {...}
    const start = candidate.indexOf('{');
    if (start < 0) return null;
    let depth = 0;
    for (let i = start; i < candidate.length; i++) {
      const c = candidate[i];
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(candidate.slice(start, i + 1));
          } catch {
            return null;
          }
        }
      }
    }
    return null;
  }
}

export class AIService {
  constructor(
    private provider: AIProvider,
    private usage: UsageService,
  ) {}

  get providerName(): string {
    return this.provider.name;
  }

  /** Raw text generation with usage recording. */
  async generateText(
    opts: AIGenerateOptions,
    userId?: string,
    feature: UsageFeature = 'ai_generate',
  ): Promise<AICompletion> {
    const result = await this.provider.generateCompletion(opts);
    if (userId) {
      await this.usage.record(userId, feature, result.usage);
    }
    return result;
  }

  /**
   * Schema-validated structured generation.
   *
   * Retries up to AI_STRUCTURED_RETRIES times; on a failing model it asks for
   * plain JSON with no commentary. Returns null when validation never passes
   * so callers can fall back to deterministic content — a malformed exercise
   * must never reach the learner.
   */
  async generateStructured<T>(
    schema: ZodType<T>,
    opts: AIGenerateOptions,
    userId?: string,
    feature: UsageFeature = 'ai_generate',
  ): Promise<T | null> {
    const maxRetries = config.ai.maxStructuredRetries;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const completion = await this.generateText(
        {
          ...opts,
          responseSchema: schema,
          prompt:
            attempt === 0
              ? opts.prompt
              : `${opts.prompt}\n\nPredošlá odpoveď nebola platná. Odpovedaj LEN platným JSON objektom bez akéhokoľvek komentára.`,
        },
        userId,
        feature,
      );
      const parsed = extractJson(completion.text);
      if (parsed === null) continue;
      const validated = schema.safeParse(parsed);
      if (validated.success) return validated.data;
    }
    return null;
  }

  /** Streaming conversation. Chunks are raw text; errors propagate to the caller. */
  async *streamConversation(
    opts: AIGenerateOptions,
    userId?: string,
    feature: UsageFeature = 'ai_conversation',
  ): AsyncIterable<string> {
    let full = '';
    for await (const chunk of this.provider.streamCompletion(opts)) {
      full += chunk;
      yield chunk;
    }
    if (userId) {
      await this.usage.record(userId, feature, { inputTokens: Math.ceil(opts.prompt.length / 4), outputTokens: Math.ceil(full.length / 4) });
    }
  }
}
