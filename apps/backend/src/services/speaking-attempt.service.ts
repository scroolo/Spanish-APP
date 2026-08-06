import { desc, eq } from 'drizzle-orm';
import type { SpeakingEvaluation, SpeakingAttemptResult } from '@spanish/shared';
import { db } from '../db/client.js';
import { speakingAttempts } from '../db/schema.js';
import { bumpStudyStreak } from '../learning/streak.js';
import type { SpeechToTextProvider } from '../stt/types.js';
import { UsageService } from './usage.service.js';

/** Word-level Levenshtein distance between two token arrays. */
function levenshtein(a: string[], b: string[]): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = [];
  for (let i = 0; i <= m; i++) {
    dp[i] = [];
    dp[i]![0] = i;
  }
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost);
    }
  }
  return dp[m]![n]!;
}

export function normalizeSpanish(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[¿¡.,;:!?"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function words(text: string): string[] {
  return normalizeSpanish(text).split(' ').filter(Boolean);
}

/**
 * Evaluates a transcription against the target sentence. Comparison is
 * word-level, accent-insensitive and punctuation-insensitive. Only real
 * signals are used — there are no fake pronunciation metrics.
 */
export function evaluateSpeaking(recognized: string, target: string): SpeakingEvaluation {
  const rw = words(recognized);
  const tw = words(target);
  if (rw.length === 0) return 'unrecognized';
  if (tw.length === 0) return rw.length === 0 ? 'correct' : 'retry';

  const distance = levenshtein(rw, tw);
  const ratio = distance / Math.max(tw.length, rw.length, 1);
  if (distance === 0) return 'correct';
  if (ratio <= 0.35) return 'close';
  return 'retry';
}

const FEEDBACK: Record<SpeakingEvaluation, string> = {
  correct: 'Výborne! Povedal si to správne.',
  close: 'Skoro! Máš to takmer presné — skús ešte raz.',
  retry: 'Povedz to ešte raz, pozorne si vypočuj nahrávku.',
  unrecognized: 'Nerozumel som ťa. Skús to znova a hovor priamo do mikrofónu.',
};

export interface RecordSpeakingInput {
  userId: string;
  languageId: string;
  targetEs: string;
  recognized: string;
  recordedSeconds: number;
  provider: string;
  exerciseId?: string | null;
}

export class SpeakingAttemptService {
  constructor(private stt: SpeechToTextProvider, private usage: UsageService) {}

  /** Transcribes audio via the configured provider and evaluates it. */
  async handleAttempt(
    userId: string,
    languageId: string,
    opts: { audio: Uint8Array; mimeType: string; targetEs: string; recordedSeconds?: number; exerciseId?: string | null },
  ): Promise<SpeakingAttemptResult> {
    const audio = opts.audio;
    if (!audio || audio.length === 0) {
      throw Object.assign(new Error('Nahraj aspoň krátky zvukový záznam.'), { code: 'BAD_REQUEST' });
    }
    const transcription = await this.stt.transcribe({ audio, mimeType: opts.mimeType, language: 'es' });
    const evaluation = evaluateSpeaking(transcription.text, opts.targetEs);
    const recordedSeconds = opts.recordedSeconds ?? transcription.durationSeconds;

    const [row] = await db
      .insert(speakingAttempts)
      .values({
        userId,
        languageId,
        targetEs: opts.targetEs,
        recognized: transcription.text,
        evaluation,
        recordedSeconds,
        provider: this.stt.name,
        exerciseId: opts.exerciseId ?? null,
      })
      .returning();

    await this.usage.record(userId, 'stt', { sttSeconds: recordedSeconds });
    await bumpStudyStreak(userId, languageId, new Date());

    return {
      recognized: transcription.text,
      target: opts.targetEs,
      evaluation,
      feedbackSk: FEEDBACK[evaluation],
      recordedSeconds,
      provider: this.stt.name,
      id: row!.id,
    };
  }

  /** Recent attempts for a user (used by mobile "Hovorenie" history). */
  async recent(userId: string, limit = 20): Promise<SpeakingAttemptResult[]> {
    const rows = await db
      .select()
      .from(speakingAttempts)
      .where(eq(speakingAttempts.userId, userId))
      .orderBy(desc(speakingAttempts.createdAt))
      .limit(limit);
    return rows.map((r) => ({
      id: r.id,
      recognized: r.recognized ?? '',
      target: r.targetEs,
      evaluation: r.evaluation as SpeakingEvaluation,
      feedbackSk: FEEDBACK[r.evaluation as SpeakingEvaluation],
      recordedSeconds: r.recordedSeconds,
      provider: r.provider,
    }));
  }
}
