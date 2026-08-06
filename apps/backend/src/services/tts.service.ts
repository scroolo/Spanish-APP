import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { put } from '@vercel/blob';
import { eq } from 'drizzle-orm';
import type { AudioAssetDto } from '@spanish/shared';
import { config } from '../config.js';
import { db } from '../db/client.js';
import { audioAssets } from '../db/schema.js';
import type { TTSProvider } from '../tts/types.js';
import { UsageService } from './usage.service.js';

/**
 * Deterministic cache key for generated audio.
 *
 * key = sha1(languageVoiceTag | text | voice | TTS_CACHE_VERSION)
 *
 * Identical curriculum text therefore always maps to the same asset and is
 * generated at most once per cache version. Bump TTS_CACHE_VERSION to force
 * regeneration (e.g. after switching voice or provider). This keeps provider
 * cost bounded for reusable curriculum content.
 */
export function ttsCacheKey(text: string, voice: string, version = config.ttsCacheVersion): string {
  return createHash('sha1')
    .update(`es-ES|${text}|${voice}|${version}`)
    .digest('hex')
    .slice(0, 24);
}

export class TtsService {
  constructor(
    private provider: TTSProvider,
    private usage: UsageService,
    private mediaDir = path.resolve(config.mediaDir),
    private blobToken = config.blob.token,
  ) {}

  /**
   * Ensures audio exists for `text` and returns its public URL.
   * Reuses the cached asset whenever possible; generates only on cache miss.
   */
  async synthesize(
    text: string,
    opts: { userId?: string; languageId?: string; voice?: string } = {},
  ): Promise<AudioAssetDto> {
    const voice = opts.voice ?? config.tts.voice;
    const key = ttsCacheKey(text, voice);

    const existing = await db.select().from(audioAssets).where(eq(audioAssets.cacheKey, key)).limit(1);
    if (existing[0]) {
      return { url: existing[0].url, format: existing[0].format, cached: true, provider: existing[0].provider };
    }

    const { data, format, ext } = await this.provider.synthesize({ text, voice });

    let url: string;
    if (this.blobToken) {
      // Serverless mode (Vercel Blob): durable object store instead of the
      // ephemeral local disk. `put` uses the token from BLOB_READ_WRITE_TOKEN.
      const filename = `${key}.${ext}`;
      const blob = await put(`tts/${filename}`, data, {
        access: 'public',
        contentType: format === 'wav' ? 'audio/wav' : 'audio/mpeg',
        addRandomSuffix: false,
        token: this.blobToken,
      });
      url = blob.url;
    } else {
      // Local development: write to the media directory on disk.
      const dir = this.mediaDir;
      await mkdir(dir, { recursive: true });
      const filename = `${key}.${ext}`;
      await writeFile(path.join(dir, filename), data);
      url = `/api/media/tts/${filename}`;
    }

    await db.insert(audioAssets).values({
      userId: opts.userId ?? null,
      languageId: opts.languageId ?? null,
      text,
      voice,
      cacheKey: key,
      provider: this.provider.name,
      url,
      format,
    });

    if (opts.userId) {
      await this.usage.record(opts.userId, 'tts', { ttsCharacters: text.length });
    }

    return { url, format, cached: false, provider: this.provider.name };
  }

  /** Absolute filesystem path for a stored asset (used by the media route). */
  static resolveFile(filename: string): string {
    const base = path.resolve(config.mediaDir);
    const resolved = path.resolve(base, filename);
    if (!resolved.startsWith(base)) {
      throw new Error('Neplatná cesta audio súboru.');
    }
    return resolved;
  }
}
