import { eq, and } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import type { AuthResponse } from '@spanish/shared';
import { db } from '../db/client.js';
import { users, userLanguages, languages } from '../db/schema.js';

export class AuthService {
  async register(email: string, password: string, displayName?: string): Promise<AuthResponse> {
    const normalized = email.trim().toLowerCase();
    const existing = await db.select().from(users).where(eq(users.email, normalized));
    if (existing.length > 0) {
      const err = new Error('Účet s týmto e-mailom už existuje.') as Error & { code?: string };
      err.code = 'EMAIL_TAKEN';
      throw err;
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const [user] = await db
      .insert(users)
      .values({ email: normalized, passwordHash, displayName: displayName ?? null })
      .returning();
    return {
      token: '',
      user: this.toUserDto(user),
      language: null,
    };
  }

  async login(email: string, password: string): Promise<AuthResponse> {
    const normalized = email.trim().toLowerCase();
    const [user] = await db.select().from(users).where(eq(users.email, normalized));
    if (!user) {
      const err = new Error('Nesprávny e-mail alebo heslo.') as Error & { code?: string };
      err.code = 'INVALID_CREDENTIALS';
      throw err;
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      const err = new Error('Nesprávny e-mail alebo heslo.') as Error & { code?: string };
      err.code = 'INVALID_CREDENTIALS';
      throw err;
    }
    return {
      token: '',
      user: this.toUserDto(user),
      language: await this.getActiveLanguage(user.id),
    };
  }

  async getActiveLanguage(userId: string) {
    const rows = await db
      .select({ ul: userLanguages, lang: languages })
      .from(userLanguages)
      .innerJoin(languages, eq(userLanguages.languageId, languages.id))
      .where(and(eq(userLanguages.userId, userId), eq(userLanguages.isActive, true)))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      languageCode: row.lang.code,
      languageName: row.lang.name,
      cefrLevel: row.ul.cefrLevel,
      dailyMinutes: row.ul.dailyMinutes,
      mainGoal: row.ul.mainGoal,
      spanishVariant: row.ul.spanishVariant,
      isActive: row.ul.isActive,
    } as AuthResponse['language'];
  }

  async getUserById(userId: string) {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) {
      const err = new Error('Používateľ neexistuje.') as Error & { code?: string };
      err.code = 'NOT_FOUND';
      throw err;
    }
    return this.toUserDto(user);
  }

  private toUserDto(user: typeof users.$inferSelect) {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      nativeLanguage: user.nativeLanguage,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
