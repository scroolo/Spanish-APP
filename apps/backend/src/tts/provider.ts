import { config } from '../config.js';
import type { TTSProvider } from './types.js';
import { MockTTSProvider } from './providers/mock.js';
import { OpenAITTSProvider } from './providers/openai.js';

let instance: TTSProvider | null = null;

/** Selects the TTS provider from environment configuration (TTS_PROVIDER). */
export function getTTSProvider(): TTSProvider {
  if (instance) return instance;
  const kind = config.tts.provider;
  if (kind === 'openai' || kind === 'elevenlabs') {
    if (!config.tts.apiKey) {
      console.warn(`TTS_PROVIDER=${kind} bez TTS_API_KEY – používa sa mock.`);
      instance = new MockTTSProvider();
      return instance;
    }
    instance = new OpenAITTSProvider({
      apiKey: config.tts.apiKey,
      baseUrl: config.tts.baseUrl,
      voice: config.tts.voice,
      model: config.tts.model,
    });
  } else {
    instance = new MockTTSProvider();
  }
  return instance;
}
