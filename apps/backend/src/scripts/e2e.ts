import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { exercises } from '../db/schema.js';

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
  return { status: res.status, json };
}

function check(cond: boolean, msg: string, detail?: unknown) {
  if (!cond) {
    console.error(`E2E FAILED: ${msg}`);
    if (detail) console.error(JSON.stringify(detail, null, 2));
    process.exit(1);
  }
  console.log(`  ok: ${msg}`);
}

async function main() {
  console.log('E2E: full user flow');

  const email = `erik+${Date.now()}@test.sk`;
  const password = 'tajneheslo123';

  console.log('1. register');
  let r = await api('/auth/register', 'POST', undefined, { email, password, displayName: 'Erik' });
  check(r.status === 200 && r.json?.token, 'register returns token');
  const token = r.json.token;
  const userId = r.json.user.id;

  console.log('2. summary requires onboarding');
  r = await api('/me/summary', 'GET', token);
  check(r.status === 428, 'summary before onboarding -> 428');

  console.log('3. onboarding');
  r = await api('/me/onboarding', 'POST', token, {
    languageCode: 'es',
    cefrLevel: 'A0',
    dailyMinutes: 30,
    mainGoal: 'conversation',
    spanishVariant: 'spain',
    nativeLanguage: 'sk',
  });
  check(r.status === 200 && r.json?.language?.cefrLevel === 'A0', 'onboarding saved A0');

  console.log('4. summary');
  r = await api('/me/summary', 'GET', token);
  check(r.status === 200, 'summary ok');
  check(r.json.cefrLevel === 'A0', 'summary level A0');
  check(r.json.todayLesson != null, 'today lesson present');

  console.log('5. today lesson');
  r = await api('/me/lesson/today', 'GET', token);
  check(r.status === 200 && r.json?.lesson?.id, 'lesson returned');
  const lesson = r.json.lesson;
  check(lesson.parts.vocabulary.length >= 8, 'has >= 8 vocab items');
  check(lesson.parts.exercises.length >= 4, 'has >= 4 exercises');
  check(lesson.parts.review.length === 0, 'no review on day 1');
  check(!('correctAnswer' in lesson.parts.exercises[0]), 'no correct answers leaked');

  console.log('6. grade exercises (mixed correct/wrong)');
  const exerciseIds = lesson.parts.exercises.map((e: { id: string }) => e.id);
  const rows = await db.select().from(exercises).where(eq(exercises.lessonId, lesson.id));
  const byId = new Map(rows.map((e) => [e.id, e]));

  for (const id of exerciseIds) {
    const ex = byId.get(id)!;
    const answer = ex.vocabItemId ? ex.correctAnswer : 'nesprávna_odpoveď';
    r = await api(`/me/lesson/${lesson.id}/attempt`, 'POST', token, { exerciseId: id, answer });
    check(r.status === 200 && typeof r.json?.correct === 'boolean', `attempt graded (${r.json?.correct ? 'ok' : 'wrong'})`);
  }

  console.log('7. complete lesson');
  r = await api(`/me/lesson/${lesson.id}/complete`, 'POST', token);
  check(r.status === 200, 'lesson completed', r.json);
  check(r.json.xpEarned > 0, 'xp earned');
  check(r.json.currentStreak === 1, 'streak = 1');
  check(r.json.achievementsUnlocked.some((a: { code: string }) => a.code === 'first_lesson'), 'first_lesson unlocked');
  check(r.json.nextLessonId != null, 'next lesson available');

  console.log('8. summary after completion');
  r = await api('/me/summary', 'GET', token);
  check(r.json.dayNumber === 2, `dayNumber = 2 (got ${r.json.dayNumber})`);
  check(r.json.vocabularyLearned >= 8, 'vocabulary learned >= 8');
  check(r.json.hasCompletedToday === true, 'hasCompletedToday true');

  console.log('9. resume state (new request, same user)');
  r = await api('/me/lesson/today', 'GET', token);
  check(r.json.lesson.title === 'Ako sa máš?', `continues from correct lesson (got "${r.json.lesson.title}")`);

  console.log('10. review (should be due after completion)');
  r = await api('/me/review', 'GET', token);
  check(r.status === 200, 'review endpoint ok');

  console.log('11. progress page');
  r = await api('/me/progress', 'GET', token);
  check(r.status === 200 && r.json.cefrLevel === 'A0', 'progress page ok');
  check(r.json.vocabularyLearned >= 8, 'progress vocabulary count');

  console.log('12. curriculum');
  r = await api('/curriculum', 'GET', token);
  check(r.status === 200 && r.json.courses.length === 2, 'curriculum with 2 courses');

  console.log('13. login again');
  r = await api('/auth/login', 'POST', undefined, { email, password });
  check(r.status === 200 && r.json.language?.cefrLevel === 'A0', 'login returns language');

  console.log('14. review summary');
  r = await api('/me/review/summary', 'GET', token);
  check(r.status === 200, 'review summary ok');
  check(typeof r.json.totalItems === 'number', 'summary has totalItems');
  check(typeof r.json.estimatedMinutes === 'number', 'summary has estimatedMinutes');

  console.log('15. review items + grade one correctly');
  r = await api('/me/review', 'GET', token);
  check(r.status === 200 && Array.isArray(r.json.items), 'review returns items array');
  check(typeof r.json.summary?.totalItems === 'number', 'review returns summary');
  if (r.json.items.length > 0) {
    const item = r.json.items[0];
    r = await api('/me/review/attempt', 'POST', token, {
      id: item.id,
      kind: item.kind,
      answer: item.correctAnswer,
      correctAnswer: item.correctAnswer,
    });
    check(r.status === 200 && r.json.correct === true, 'review attempt graded correct');
  }

  console.log('16. learning profile');
  r = await api('/me/learning-profile', 'GET', token);
  check(r.status === 200, 'learning profile ok');
  check(r.json.targetLanguage === 'es-ES', 'profile target language');
  check(r.json.nativeLanguage === 'sk-SK', 'profile native language');
  check(r.json.cefrLevel === 'A0', 'profile cefr level');
  check(typeof r.json.vocabulary.learned === 'number', 'profile vocab learned');
  check(Array.isArray(r.json.grammar.weak), 'profile grammar weak list');
  check(Array.isArray(r.json.recentMistakes), 'profile recent mistakes');

  console.log('17. progress with rich stats');
  r = await api('/me/progress', 'GET', token);
  check(r.status === 200, 'progress ok');
  check(typeof r.json.vocabStats?.learned === 'number', 'progress vocabStats present');
  check(typeof r.json.grammarStats?.total === 'number', 'progress grammarStats present');
  check(typeof r.json.studyStats?.currentStreak === 'number', 'progress studyStats present');
  check(Array.isArray(r.json.strongestTopics), 'progress strongestTopics present');
  check(Array.isArray(r.json.weakestTopics), 'progress weakestTopics present');
  check(typeof r.json.levelPercent === 'number', 'progress levelPercent present');

  console.log('E2E: ALL CHECKS PASSED');
  process.exit(0);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
