import 'dotenv/config';

const BASE = process.env.E2E_BASE ?? 'http://localhost:4000/api';

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
  return { status: res.status, json, res };
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
  console.log('SMOKE: TTS / listening flow');

  const email = `tts+${Date.now()}@test.sk`;
  let r = await api('/auth/register', 'POST', undefined, { email, password: 'tajneheslo123', displayName: 'Erik' });
  check(r.status === 200 && r.json?.token, 'register');
  const token = r.json.token;

  r = await api('/me/onboarding', 'POST', token, {
    languageCode: 'es',
    cefrLevel: 'A0',
    dailyMinutes: 30,
    mainGoal: 'conversation',
    spanishVariant: 'spain',
    nativeLanguage: 'sk',
  });
  check(r.status === 200, 'onboarding');

  r = await api('/me/lesson/today', 'GET', token);
  check(r.status === 200, 'today lesson');
  const exercises = r.json.lesson.parts.exercises;
  const listening = exercises.filter((e: any) => e.type === 'listening');
  const speaking = exercises.filter((e: any) => e.type === 'speaking');
  check(listening.length >= 1, `lesson has >= 1 listening exercise (got ${listening.length})`);
  check(speaking.length >= 1, `lesson has >= 1 speaking exercise (got ${speaking.length})`);
  const l = listening[0];
  check(typeof l.audioUrl === 'string' && l.audioUrl.startsWith('/api/media/tts/'), 'listening exercise has audioUrl');
  const s = speaking[0];
  check(typeof s.targetEs === 'string' && s.targetEs.length > 0, 'speaking exercise has targetEs');
  check(!('correctAnswer' in l), 'no correct answer leaked');

  const audioRes = await fetch(`http://localhost:4000${l.audioUrl}`);
  check(audioRes.status === 200, `audio GET -> ${audioRes.status}`);
  const buf = Buffer.from(await audioRes.arrayBuffer());
  check(buf.length > 44, `audio file has WAV bytes (${buf.length})`);
  check(buf.subarray(0, 4).toString('ascii') === 'RIFF', 'audio is a RIFF/WAV file');
  check(audioRes.headers.get('content-type')?.startsWith('audio/') === true, 'audio content-type set');

  console.log('SMOKE: TTS / listening ALL CHECKS PASSED');
  process.exit(0);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
