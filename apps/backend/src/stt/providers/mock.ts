import type { SpeechToTextProvider, SttTranscribeOptions, SttTranscriptionResult } from '../types.js';

/**
 * Offline STT mock. It does NOT recognize speech: it returns an empty
 * transcript so every attempt evaluates as 'unrecognized'. This keeps the
 * speaking flow functional without any paid provider, and is clearly
 * documented. Configure STT_PROVIDER=openai or STT_PROVIDER=groq to get real
 * transcription.
 */
export class MockSttProvider implements SpeechToTextProvider {
  readonly name = 'mock';

  async transcribe(_opts: SttTranscribeOptions): Promise<SttTranscriptionResult> {
    return { text: '', durationSeconds: 0, language: 'es' };
  }
}
