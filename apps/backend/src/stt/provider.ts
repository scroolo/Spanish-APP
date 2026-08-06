import { config } from '../config.js';
import type { SpeechToTextProvider } from './types.js';
import { MockSttProvider } from './providers/mock.js';
import { OpenAISTTProvider } from './providers/openai.js';

let instance: SpeechToTextProvider | null = null;

/** Selects the STT provider from environment configuration (STT_PROVIDER). */
export function getSttProvider(): SpeechToTextProvider {
  if (instance) return instance;
  const kind = config.stt.provider;
  if (kind === 'openai') {
    if (!config.stt.apiKey) {
      throw new Error('openai STT vyžaduje nastavené STT_API_KEY.');
    }
    instance = new OpenAISTTProvider({
      name: 'openai',
      apiKey: config.stt.apiKey,
      baseUrl: config.stt.baseUrl,
      model: config.stt.model,
      language: 'es',
      maxAudioSeconds: config.stt.maxAudioSeconds,
    });
  } else if (kind === 'groq') {
    if (!config.stt.groqApiKey) {
      throw new Error('groq STT vyžaduje nastavené GROQ_API_KEY.');
    }
    instance = new OpenAISTTProvider({
      name: 'groq',
      apiKey: config.stt.groqApiKey,
      baseUrl: config.stt.groqBaseUrl,
      model: config.stt.groqModel,
      language: 'es',
      maxAudioSeconds: config.stt.maxAudioSeconds,
    });
  } else {
    instance = new MockSttProvider();
  }
  return instance;
}
