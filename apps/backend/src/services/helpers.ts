import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { userLanguages, userStatistics } from '../db/schema.js';

export async function ensureStats(userId: string, languageId: string) {
  await db
    .insert(userStatistics)
    .values({ userId, languageId })
    .onConflictDoNothing({ target: [userStatistics.userId, userStatistics.languageId] });
}

export async function requireActiveLanguage(userId: string): Promise<string> {
  const [row] = await db
    .select()
    .from(userLanguages)
    .where(and(eq(userLanguages.userId, userId), eq(userLanguages.isActive, true)))
    .limit(1);
  if (!row) {
    const err = new Error('Najprv dokonči nastavenie kurzu (onboarding).') as Error & {
      code?: string;
    };
    err.code = 'ONBOARDING_REQUIRED';
    throw err;
  }
  await ensureStats(userId, row.languageId);
  return row.languageId;
}

export function ensureUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
