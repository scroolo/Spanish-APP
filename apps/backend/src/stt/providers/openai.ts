import type { SpeechToTextProvider, SttTranscribeOptions, SttTranscriptionResult } from '../types.js';

interface OpenAISTTConfig {
  name: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  language: string;
  maxAudioSeconds: number;
}

/**
 * Real STT provider using an OpenAI-compatible /audio/transcriptions
 * (Whisper) endpoint — used for both OpenAI and Groq.
 */
export class OpenAISTTProvider implements SpeechToTextProvider {
  readonly name: string;

  constructor(private cfg: OpenAISTTConfig) {
    this.name = cfg.name;
  }

  async transcribe(opts: SttTranscribeOptions): Promise<SttTranscriptionResult> {
    const form = new FormData();
    const blob = new Blob([opts.audio], { type: opts.mimeType });
    form.append('file', blob, `recording.${extFor(opts.mimeType)}`);
    form.append('model', this.cfg.model);
    form.append('language', opts.language ?? this.cfg.language);

    const res = await fetch(`${this.cfg.baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.cfg.apiKey}` },
      body: form,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`STT provider error (${res.status}): ${detail.slice(0, 300)}`);
    }
    const json = (await res.json()) as { text?: string };
    return {
      text: (json.text ?? '').trim(),
      durationSeconds: 0,
      language: opts.language ?? this.cfg.language,
    };
  }
}

function extFor(mimeType: string): string {
  switch (mimeType) {
    case 'audio/wav':
    case 'audio/wave':
    case 'audio/x-wav':
      return 'wav';
    case 'audio/mp4':
    case 'audio/m4a':
      return 'm4a';
    default:
      return 'webm';
  }
}
