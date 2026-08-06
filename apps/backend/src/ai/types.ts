import type { ZodType } from 'zod';

/**
 * Provider-independent AI interfaces.
 *
 * Business logic depends only on `AIProvider` / `AIService`. Concrete
 * implementations (mock, OpenAI, …) are selected through environment
 * configuration and never leak provider-specific details into learning code.
 */
export interface AIGenerateOptions {
  /** System prompt with role + behavioural constraints. */
  system: string;
  /** User/assistant prompt content. */
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  /** Optional zod schema. Providers may use it (mock), others ignore it. */
  responseSchema?: ZodType<unknown>;
}

export interface AIUsageInfo {
  inputTokens?: number;
  outputTokens?: number;
}

export interface AICompletion {
  text: string;
  usage?: AIUsageInfo;
}

export interface AIProvider {
  readonly name: string;
  generateCompletion(opts: AIGenerateOptions): Promise<AICompletion>;
  /** Streams raw text chunks (used for chat). Providers may fall back to generateCompletion. */
  streamCompletion(opts: AIGenerateOptions): AsyncIterable<string>;
}
