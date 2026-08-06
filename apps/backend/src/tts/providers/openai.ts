import type { TTSAudioResult, TTSProvider, TTSSynthesizeOptions } from '../types.js';

interface OpenAITTSConfig {
  apiKey: string;
  baseUrl: string;
  voice: string;
  model: string;
}

/** Real TTS provider using the OpenAI audio/speech endpoint. */
export class OpenAITTSProvider implements TTSProvider {
  readonly name = 'openai';

  constructor(private cfg: OpenAITTSConfig) {}

  async synthesize(opts: TTSSynthesizeOptions): Promise<TTSAudioResult> {
    const res = await fetch(`${this.cfg.baseUrl}/audio/speech`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: this.cfg.model,
        voice: opts.voice ?? this.cfg.voice,
        input: opts.text,
        response_format: 'mp3',
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`TTS provider error (${res.status}): ${detail.slice(0, 300)}`);
    }
    const data = Buffer.from(await res.arrayBuffer());
    return { data, format: 'mp3', ext: 'mp3' };
  }
}
