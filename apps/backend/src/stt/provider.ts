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
      console.warn(`STT_PROVIDER=openai bez STT_API_KEY – používa sa mock.`);
      instance = new MockSttProvider();
      return instance;
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
      console.warn(`STT_PROVIDER=groq bez GROQ_API_KEY — používa sa mock.`);
      instance = new MockSttProvider();
      return instance;
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
