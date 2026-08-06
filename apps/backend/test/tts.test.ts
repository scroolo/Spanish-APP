import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { db } from '../src/db/client.js';
import { audioAssets } from '../src/db/schema.js';
import { UsageService } from '../src/services/usage.service.js';
import { TtsService, ttsCacheKey } from '../src/services/tts.service.js';
import { MockTTSProvider } from '../src/tts/providers/mock.js';

describe('ttsCacheKey', () => {
  it('is deterministic for the same text + voice + version', () => {
    expect(ttsCacheKey('Hola', 'alloy', '1')).toBe(ttsCacheKey('Hola', 'alloy', '1'));
  });

  it('differs when the text changes', () => {
    expect(ttsCacheKey('Hola', 'alloy', '1')).not.toBe(ttsCacheKey('Adiós', 'alloy', '1'));
  });

  it('differs when the voice or cache version changes', () => {
    expect(ttsCacheKey('Hola', 'alloy', '1')).not.toBe(ttsCacheKey('Hola', 'nova', '1'));
    expect(ttsCacheKey('Hola', 'alloy', '1')).not.toBe(ttsCacheKey('Hola', 'alloy', '2'));
  });
});

describe('TtsService integration', () => {
  let dir: string;
  let calls = 0;
  const usage = new UsageService();
  const provider = {
    name: 'mock',
    synthesize: async () => {
      calls += 1;
      return new MockTTSProvider().synthesize({ text: '', voice: 'alloy' });
    },
  };

  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'tts-test-'));
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
    if (calls) {
      await db.delete(audioAssets).where(eq(audioAssets.provider, 'mock'));
    }
  });

  it('synthesizes an asset once and reuses the cache on repeat calls', async () => {
    const svc = new TtsService(provider, usage, dir);
    const first = await svc.synthesize('Buenos días', { userId: null, languageId: null });
    expect(first.cached).toBe(false);
    expect(first.url).toMatch(/^\/api\/media\/tts\/[a-f0-9]{24}\.wav$/);

    const file = path.join(dir, path.basename(first.url));
    const data = await readFile(file);
    expect(data.length).toBeGreaterThan(0);

    const rows = await db.select().from(audioAssets).where(eq(audioAssets.cacheKey, ttsCacheKey('Buenos días', 'alloy')));
    expect(rows.length).toBe(1);
    expect(rows[0]!.url).toBe(first.url);

    const second = await svc.synthesize('Buenos días', { userId: null, languageId: null });
    expect(second.cached).toBe(true);
    expect(second.url).toBe(first.url);
    expect(calls).toBe(1);
  });

  it('generates a different asset for different text', async () => {
    const svc = new TtsService(provider, usage, dir);
    const a = await svc.synthesize('Hola', { userId: null, languageId: null });
    const b = await svc.synthesize('Adiós', { userId: null, languageId: null });
    expect(a.url).not.toBe(b.url);
    expect(calls).toBe(3);
  });
});
