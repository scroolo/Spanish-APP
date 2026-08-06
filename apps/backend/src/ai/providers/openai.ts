import type {
  AICompletion,
  AIGenerateOptions,
  AIProvider,
  AIUsageInfo,
} from '../types.js';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenAIProviderConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

/**
 * Reference "real" provider: OpenAI-compatible chat completions API.
 *
 * Used when AI_PROVIDER=openai. Structured generation asks the model for a
 * single JSON object (response_format=json_object); the returned JSON is still
 * validated against the zod schema by AIService before use.
 */
export class OpenAIProvider implements AIProvider {
  readonly name = 'openai';

  constructor(private cfg: OpenAIProviderConfig) {}

  async generateCompletion(opts: AIGenerateOptions): Promise<AICompletion> {
    const body = {
      model: this.cfg.model,
      messages: this.messages(opts),
      temperature: opts.temperature ?? 0.3,
      max_tokens: opts.maxTokens ?? 700,
      stream: false,
      ...(opts.responseSchema ? { response_format: { type: 'json_object' } } : {}),
    };

    const res = await fetch(`${this.cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.cfg.apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`AI provider error (${res.status}): ${detail.slice(0, 300)}`);
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const text = json.choices?.[0]?.message?.content ?? '';
    const usage: AIUsageInfo = {
      inputTokens: json.usage?.prompt_tokens,
      outputTokens: json.usage?.completion_tokens,
    };
    return { text, usage };
  }

  async *streamCompletion(opts: AIGenerateOptions): AsyncIterable<string> {
    const body = {
      model: this.cfg.model,
      messages: this.messages(opts),
      temperature: opts.temperature ?? 0.7,
      stream: true,
    };
    const res = await fetch(`${this.cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.cfg.apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok || !res.body) {
      throw new Error(`AI provider stream error (${res.status})`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') return;
        try {
          const parsed = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] };
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {
          // ignore keep-alive / malformed sse lines
        }
      }
    }
  }

  private messages(opts: AIGenerateOptions): ChatMessage[] {
    return [
      { role: 'system', content: opts.system },
      { role: 'user', content: opts.prompt },
    ];
  }
}
