import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'http://localhost:4000/api';
const email = `groq-smoke-${Date.now()}@test.sk`;
let token = '';

async function api(path: string, method = 'GET', body?: unknown) {
  const headers: Record<string, string> = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
}

const check = (ok: boolean, label: string) => {
  console.log(`${ok ? 'ok' : 'FAIL'}: ${label}`);
  if (!ok) process.exitCode = 1;
};

const reg = await api('/auth/register', 'POST', {
  email,
  password: 'tajneheslo123',
  displayName: 'Groq Smoke',
});
check(reg.status === 200, 'register');
token = reg.json.token;

await api('/me/onboarding', 'POST', {
  cefrLevel: 'A0',
  dailyMinutes: 30,
  mainGoal: 'conversation',
  spanishVariant: 'spain',
  nativeLanguage: 'sk',
});

const today = await api('/me/lesson/today');
const exercises = today.json.lesson?.parts?.exercises ?? [];
const speaking = exercises.find((e: { type: string; targetEs: string }) => e.type === 'speaking');
const targetEs = speaking?.targetEs ?? 'Hola buenos días';
check(!!targetEs, `target sentence available (${targetEs})`);

const wavFiles = readdirSync('media/tts').filter((f) => f.endsWith('.wav')).map((f) => join('media/tts', f));
check(wavFiles.length > 0, `found ${wavFiles.length} cached wav files`);
const wav = readFileSync(wavFiles[0]);
const base64 = wav.toString('base64');

const attempt = await api('/me/speaking/attempt', 'POST', {
  audio: base64,
  mimeType: 'audio/wav',
  targetEs,
  recordedSeconds: 2,
  exerciseId: speaking?.id,
});
check(attempt.status === 200, `speaking attempt status ${attempt.status}`);
console.log('  -> evaluation:', attempt.json.evaluation, '| recognized:', attempt.json.recognized, '| provider:', attempt.json.provider);
console.log('  -> feedbackSk:', attempt.json.feedbackSk);

const history = await api('/me/speaking/history');
check(Array.isArray(history.json), 'speaking history list');
console.log('DONE');
