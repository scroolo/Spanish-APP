import { eq } from 'drizzle-orm';
import type { OnboardingInput } from '@spanish/shared';
import { db } from '../db/client.js';
import { languages, userLanguages } from '../db/schema.js';

export class OnboardingService {
  async save(userId: string, input: OnboardingInput) {
    const [lang] = await db
      .insert(languages)
      .values({
        code: input.languageCode,
        name: input.languageCode === 'es' ? 'Španielčina' : input.languageCode.toUpperCase(),
        status: 'active',
        sortOrder: 1,
      })
      .onConflictDoNothing({ target: languages.code })
      .returning();

    const languageId = lang
      ? lang.id
      : (await db.select().from(languages).where(eq(languages.code, input.languageCode)))[0].id;

    await db.update(userLanguages).set({ isActive: false }).where(eq(userLanguages.userId, userId));

    const [row] = await db
      .insert(userLanguages)
      .values({
        userId,
        languageId,
        cefrLevel: input.cefrLevel,
        dailyMinutes: input.dailyMinutes,
        mainGoal: input.mainGoal,
        spanishVariant: input.spanishVariant,
        nativeLanguage: input.nativeLanguage,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: [userLanguages.userId, userLanguages.languageId],
        set: {
          cefrLevel: input.cefrLevel,
          dailyMinutes: input.dailyMinutes,
          mainGoal: input.mainGoal,
          spanishVariant: input.spanishVariant,
          nativeLanguage: input.nativeLanguage,
          isActive: true,
        },
      })
      .returning();

    return row;
  }
}
