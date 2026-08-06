import { config } from '../config.js';
import type { AIProvider } from './types.js';
import { MockAIProvider } from './providers/mock.js';
import { OpenAIProvider } from './providers/openai.js';

let instance: AIProvider | null = null;

/** Selects the AI provider from environment configuration (AI_PROVIDER). */
export function getAIProvider(): AIProvider {
  if (instance) return instance;
  const kind = config.ai.provider;
  if (kind === 'openai') {
    if (!config.ai.apiKey) {
      console.warn(`AI_PROVIDER=openai bez AI_API_KEY – používa sa mock.`);
      instance = new MockAIProvider();
      return instance;
    }
    instance = new OpenAIProvider({
      apiKey: config.ai.apiKey,
      baseUrl: config.ai.baseUrl,
      model: config.ai.model,
    });
  } else {
    instance = new MockAIProvider();
  }
  return instance;
}
