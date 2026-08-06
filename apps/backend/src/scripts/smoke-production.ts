import 'dotenv/config';

/**
 * Production smoke test.
 *
 * Verifies the publicly reachable API surface end-to-end. Safe to run against
 * any deployment (Vercel, local, etc.):
 *
 *   npm run smoke:production -- --url https://your-app.vercel.app
 *
 * AI / STT endpoints are skipped unless explicitly enabled with
 * `--with-ai` (they cost money and hit external providers).
 */

const args = process.argv.slice(2);
const urlArg = args.find((a) => a.startsWith('--url='))?.split('=')[1];
const withAi = args.includes('--with-ai');
const BASE = (urlArg ?? process.env.SMOKE_URL ?? 'http://localhost:4000').replace(/\/+$/, '');

async function api(path: string, method = 'GET', token?: string, body?: unknown) {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json: any = await res.json().catch(() => null);
  return { status: res.status, json };
}

function check(cond: boolean, msg: string, detail?: unknown) {
  if (!cond) {
    console.error(`SMOKE FAILED: ${msg}`);
    if (detail) console.error(JSON.stringify(detail, null, 2));
    process.exit(1);
  }
  console.log(`  ok: ${msg}`);
}

async function main() {
  console.log(`SMOKE: target ${BASE}`);

  console.log('1. health');
  let r = await api('/health');
  check(r.status === 200 && r.json?.status === 'ok', '/health returns ok', r.json);
  r = await api('/api/health');
  check(r.status === 200 && r.json?.status === 'ok', '/api/health returns ok', r.json);

  console.log('2. unauth access rejected');
  r = await api('/me/summary');
  check(r.status === 401, 'summary without token -> 401', r.json);

  console.log('3. register');
  const email = `smoke+${Date.now()}@test.sk`;
  const password = 'tajneheslo123';
  r = await api('/api/auth/register', 'POST', undefined, { email, password, displayName: 'Smoke' });
  check(r.status === 200 && r.json?.token, 'register returns token');
  const token = r.json.token;

  console.log('4. onboarding');
  r = await api('/api/me/onboarding', 'POST', token, {
    languageCode: 'es',
    cefrLevel: 'A0',
    dailyMinutes: 30,
    mainGoal: 'conversation',
    spanishVariant: 'spain',
    nativeLanguage: 'sk',
  });
  check(r.status === 200 && r.json?.language?.cefrLevel === 'A0', 'onboarding saved', r.json);

  console.log('5. summary');
  r = await api('/api/me/summary', 'GET', token);
  check(r.status === 200 && r.json?.todayLesson != null, 'summary returns today lesson', r.json);

  console.log('6. lesson');
  r = await api('/api/me/lesson/today', 'GET', token);
  check(r.status === 200 && r.json?.lesson?.id, 'lesson returned');
  check(r.json.lesson.parts.exercises.length >= 4, 'lesson has exercises');

  console.log('7. progress');
  r = await api('/api/me/progress', 'GET', token);
  check(r.status === 200, 'progress ok');

  console.log('8. curriculum');
  r = await api('/api/curriculum', 'GET', token);
  check(r.status === 200 && Array.isArray(r.json?.courses), 'curriculum ok');

  console.log('9. login');
  r = await api('/api/auth/login', 'POST', undefined, { email, password });
  check(r.status === 200 && r.json?.token, 'login returns token');

  console.log('10. speaking history (no STT call)');
  r = await api('/api/me/speaking/history', 'GET', token);
  check(r.status === 200, 'speaking history ok');

  if (withAi) {
    console.log('11. conversation scenarios');
    r = await api('/api/me/conversation/scenarios', 'GET', token);
    check(r.status === 200 && Array.isArray(r.json?.scenarios), 'scenarios ok');
  } else {
    console.log('11. conversation scenarios (skipped, use --with-ai)');
  }

  console.log('SMOKE: ALL CHECKS PASSED');
  process.exit(0);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
