import { config } from '../config.js';

/**
 * Lightweight per-user in-memory rate limiting for expensive provider
 * endpoints (AI tutor, exercise generation, conversation, TTS, STT).
 *
 * Guards against accidental request loops. Limits reset on process restart
 * and are configurable through env vars (RATE_LIMIT_*_PER_HOUR); -1 disables.
 */
export type RateLimitScope = 'ai' | 'tts' | 'stt';

const WINDOW_MS = 60 * 60 * 1000;

class Bucket {
  timestamps: number[] = [];

  isAllowed(limit: number, now: number): boolean {
    this.timestamps = this.timestamps.filter((t) => now - t < WINDOW_MS);
    if (this.timestamps.length >= limit) return false;
    this.timestamps.push(now);
    return true;
  }
}

const buckets = new Map<string, Bucket>();

function limitFor(scope: RateLimitScope): number {
  switch (scope) {
    case 'ai':
      return config.rateLimit.aiPerHour;
    case 'tts':
      return config.rateLimit.ttsPerHour;
    case 'stt':
      return config.rateLimit.sttPerHour;
  }
}

/**
 * Throws a rate-limit error when the user exceeds the per-hour budget.
 * Callers should catch this and respond with HTTP 429.
 */
export function assertRateLimit(userId: string, scope: RateLimitScope, now = new Date()): void {
  const limit = limitFor(scope);
  if (limit < 0) return;
  const key = `${userId}:${scope}`;
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = new Bucket();
    buckets.set(key, bucket);
  }
  if (!bucket.isAllowed(limit, now.getTime())) {
    const err = new Error('Prekročil si denný limit AI funkcií. Skús to neskôr.') as Error & { code?: string; statusCode?: number };
    err.code = 'RATE_LIMITED';
    err.statusCode = 429;
    throw err;
  }
}

/** Test helper: clears stored buckets (pure in-memory). */
export function resetRateLimits(): void {
  buckets.clear();
}
