import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { aiUsage } from '../db/schema.js';

export type UsageFeature = 'ai_generate' | 'ai_tutor' | 'ai_conversation' | 'tts' | 'stt';

export interface UsageDelta {
  inputTokens?: number;
  outputTokens?: number;
  ttsCharacters?: number;
  sttSeconds?: number;
}

/**
 * Internal AI/TTS/STT usage ledger for later cost analysis.
 *
 * Only aggregates counts — no raw prompts, transcripts or audio are stored
 * here. Every expensive provider call records a delta per user + feature.
 */
export class UsageService {
  async record(userId: string, feature: UsageFeature, delta: UsageDelta = {}) {
    const inputTokens = delta.inputTokens ?? 0;
    const outputTokens = delta.outputTokens ?? 0;
    const ttsCharacters = delta.ttsCharacters ?? 0;
    const sttSeconds = delta.sttSeconds ?? 0;
    await db
      .insert(aiUsage)
      .values({
        userId,
        feature,
        requestCount: 1,
        inputTokens,
        outputTokens,
        ttsCharacters,
        sttSeconds,
      })
      .onConflictDoUpdate({
        target: [aiUsage.userId, aiUsage.feature],
        set: {
          requestCount: sql`${aiUsage.requestCount} + 1`,
          inputTokens: sql`${aiUsage.inputTokens} + ${inputTokens}`,
          outputTokens: sql`${aiUsage.outputTokens} + ${outputTokens}`,
          ttsCharacters: sql`${aiUsage.ttsCharacters} + ${ttsCharacters}`,
          sttSeconds: sql`${aiUsage.sttSeconds} + ${sttSeconds}`,
          lastUsedAt: sql`now()`,
        },
      });
  }

  async getForUser(userId: string): Promise<
    { feature: string; requestCount: number; inputTokens: number; outputTokens: number; ttsCharacters: number; sttSeconds: number }[]
  > {
    return db
      .select({
        feature: aiUsage.feature,
        requestCount: aiUsage.requestCount,
        inputTokens: aiUsage.inputTokens,
        outputTokens: aiUsage.outputTokens,
        ttsCharacters: aiUsage.ttsCharacters,
        sttSeconds: aiUsage.sttSeconds,
      })
      .from(aiUsage)
      .where(and(eq(aiUsage.userId, userId)))
      .orderBy(sql`${aiUsage.lastUsedAt} desc`);
  }
}
