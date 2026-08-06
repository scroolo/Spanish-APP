# AI Spanish Teacher — Phase 1 Technical & Product Plan

Date: 2026-08-06
Status: Approved — begin implementation

---

## 0. Executive summary

We are building a long-term, adaptive AI Spanish teacher that remembers what the
learner knows and assembles each daily lesson from: **new material + spaced
repetition + weakness practice + listening + speaking**.

Phase 1 (this plan) delivers the **stable foundation**: account creation,
onboarding, deterministic A0/A1 curriculum, the daily lesson engine, exercises,
progress persistence, and basic spaced repetition. No AI keys are required in
Phase 1 — the curriculum is seeded deterministically. The architecture is
designed so later phases (AI generation, speech, conversation, more languages)
plug in behind clean interfaces.

---

## 1. Phase 1 scope (MVP)

**In scope**
- Email/password authentication (bcrypt + JWT).
- Onboarding: level (A0 default), daily study target, main goal, Spanish
  variant (default: Spain), native language (default: English).
- Spanish A0/A1 curriculum structure (modules → lessons) seeded in the DB.
- Home dashboard: today's lesson, streak, stats, milestones.
- Daily lesson flow: vocabulary (word, translation, pronunciation, example),
  grammar (RULE → EXAMPLES → PRACTICE → PRODUCTION), exercises, completion.
- Daily review session (recent + due items, mixed vocabulary & grammar).
- Progress page: CEFR level, vocabulary learned, grammar concepts, skill bars,
  weakness detection.
- Basic spaced repetition (SM-2 variant) for vocabulary and grammar.
- Mistake memory: recurring errors become weaknesses that appear in future
  lessons.
- Light gamification: XP, streak, achievements (a small first set).
- Multi-language ready: `languages` table + per-language progress tables; only
  Spanish is seeded.

**Out of scope (later phases)**
- AI content generation, AI teacher, conversation, roleplay (Phase 2/3).
- Speech-to-text / text-to-speech (Phase 3).
- Weekly/monthly/level exams, native content, series training, Living in Spain
  (Phase 4).
- Japanese and other languages (Phase 5).

---

## 2. Architecture overview

Monorepo with two applications and one shared types package.

```
Španielčina/  (repo root)
├── apps/
│   ├── backend/    Node.js + Fastify + Drizzle ORM + PostgreSQL
│   └── mobile/     React Native + Expo + TypeScript
├── packages/
│   └── shared/     Shared TypeScript types / constants
├── docker-compose.yml   PostgreSQL for local dev
└── docs/PLAN.md
```

**Principles**
- The backend is the source of truth. It decides *what* to study (level,
  lesson structure, SRS, weaknesses). Later, AI will decide *how* content is
  expressed — never what to study. This keeps the learning engine deterministic
  and auditable.
- The mobile app is a thin client: it renders lessons and submits attempts.
- Secrets (JWT secret, later AI/STT/TTS keys) live only in the backend via env
  vars.
- All language-specific data (vocabulary, grammar, modules) is data, not code.

### Client ↔ server data flow

```
Mobile
  │  POST /api/auth/register|login            (email+password)
  ▼
  │  POST /api/me/onboarding                  (level, minutes, goal, variant)
  ▼
  │  GET  /api/me/summary                     (dashboard)
  ▼
  │  GET  /api/me/lesson/today                (assembled lesson: review + new)
  ▼
  │  POST /api/me/lesson/:id/attempt          (answer → graded → SRS updated)
  │  POST /api/me/lesson/:id/complete         (stats, streak, XP)
  ▼
  │  GET  /api/me/review                      (daily review session)
  │  GET  /api/me/progress                    (progress page)
```

---

## 3. Tech stack decisions

| Concern      | Choice                                     | Why |
|--------------|--------------------------------------------|-----|
| Mobile       | Expo (SDK ~57) + TypeScript + expo-router  | Fast iteration, OTA-ready, one TS codebase |
| Client state | Zustand (auth/session)                     | Minimal, no boilerplate |
| Server state | TanStack Query                             | Caching, retries, invalidation |
| Backend      | Node.js 24 + Fastify + TypeScript          | Fast, TS-first, plugin model |
| ORM / SQL    | Drizzle ORM                                | TS-native, lightweight, explicit SQL |
| DB           | PostgreSQL 16 (Docker for dev)             | Required by spec, production-ready |
| Migrations   | Drizzle Kit                                | Versioned SQL migrations |
| Auth         | bcrypt + @fastify/jwt (stateless access tokens) | Secure, standard, no external dep |
| Validation   | Zod                                        | Shared with client later |
| Tests        | Vitest (backend unit)                      | Fast, TS-native |
| Content      | Seeded static curriculum (deterministic)   | Zero AI cost, auditable, offline-friendly |

**Deferred but designed for**: `AIService`, `SpeechToTextService`,
`TextToSpeechService` provider interfaces live in the backend services layer as
interfaces; Phase 1 ships a `static`/`mock` implementation clearly marked for
later replacement.

---

## 4. Database schema

PostgreSQL schema designed for Phase 1 (tables implemented now) with later
entities noted. Full product schema (section 26 of the spec) is mapped below.

### Phase 1 tables (implemented)

**users**
- id (uuid pk), email (unique, citext), password_hash, native_language (text),
  display_name, created_at, updated_at

**languages**
- id (uuid pk), code (unique: "es", "ja", ...), name, status
  (active|planned), sort_order

**user_languages**
- id, user_id (fk), language_id (fk), cefr_level (text: A0..C1),
  daily_minutes (int), main_goal (text), spanish_variant (text: spain |
  latin_america | none), native_language, is_active, created_at
- unique(user_id, language_id)

**courses**
- id, language_id (fk), name (e.g. "Spanish A1"), cefr_level (A0/A1/...),
  sort_order

**modules**
- id, course_id (fk), slug, title, description, sort_order

**lessons**
- id, module_id (fk), title, description, day_number, sort_order,
  estimated_minutes, is_review_lesson (bool)

**vocabulary_items**
- id, language_id (fk), module_id (fk), spanish, translation,
  pronunciation (text), example_sentence, example_translation,
  audio_url (nullable), part_of_speech, sort_order

**grammar_concepts**
- id, language_id (fk), module_id (fk), slug (unique per lang: "ser", "estar",
  ...), title, explanation, rule, examples (jsonb), sort_order

**exercises**
- id, lesson_id (fk), type (multiple_choice | fill_blank | translation |
  listening | ordering), prompt (text), options (jsonb), correct_answer (text),
  explanation (text), vocab_item_id (nullable fk), grammar_concept_id (nullable
  fk), sort_order

**user_vocabulary** — the SRS ledger per word
- id, user_id, language_id, vocabulary_item_id, is_learned (bool),
  first_learned (ts), last_reviewed (ts), review_count, correct_count,
  incorrect_count, mastery_score (float 0..1), next_review_date (ts),
  seen_in_lessons (jsonb list of lesson ids)

**user_grammar_progress** — SRS ledger per concept
- id, user_id, language_id, grammar_concept_id, review_count, correct_count,
  incorrect_count, mastery_score, next_review_date, last_reviewed

**lesson_progress**
- id, user_id, language_id, lesson_id, status (not_started | in_progress |
  completed), progress_pct, attempts_count, best_score, started_at,
  completed_at, last_activity_at
- unique(user_id, lesson_id)

**exercise_attempts**
- id, user_id, lesson_id, exercise_id, is_correct, user_answer, answered_at

**mistakes** — structured memory of wrong answers
- id, user_id, language_id, exercise_id, vocabulary_item_id (nullable),
  grammar_concept_id (nullable), mistake_type, user_answer, correct_answer,
  context, created_at

**user_statistics**
- id, user_id, language_id, total_learning_minutes, lessons_completed,
  vocabulary_learned, current_streak, longest_streak, total_xp, weekly_minutes,
  last_study_date, level_progress (jsonb)

**achievements** / **user_achievements**
- achievements: id, code (unique), title, description, icon
- user_achievements: id, user_id, achievement_id, unlocked_at

### Deferred entities (documented, not implemented in Phase 1)
Course/lesson per-language scaffolding is implemented via `courses/modules`
above. Later tables: `conversations`, `conversation_messages`,
`speaking_attempts`, `listening_attempts`, `review_schedule` (folded into the
SRS ledger for now), `exams`, `exam_attempts`, `weaknesses` (derived from
`mistakes` + analytics in Phase 2). `LessonGenerationService` output will be
cached in a `generated_lessons` table in Phase 2.

---

## 5. Learning engine architecture

Deterministic services in `apps/backend/src/learning/`:

**SpacedRepetitionService**
- SM-2 variant over `user_vocabulary` / `user_grammar_progress`.
- `mastery_score` 0..1 updated on every answer.
- `next_review_date` intervals: 1, 3, 7, 14, 30 days depending on correctness
  history; mastered items (score ≥ 0.85 with ≥ 3 correct) review less often.
- Lower `ease` on mistakes; a wrong answer on an otherwise mastered item drops
  its score and re-queues it sooner.

**ReviewService**
- Picks due items from yesterday / 3d / 7d / 14d / 30d buckets, mixes
  vocabulary + grammar, caps volume by study duration. Used by the lesson
  intro (5 min) and the Review screen.

**LessonAssemblyService**
- Input: user profile (level, duration), module cursor, due reviews, weak items.
- Output: a `Lesson` DTO = review block + new vocabulary (8–15) + one grammar
  concept + generated exercises from a deterministic exercise template engine.
- Study duration scaling: 15 min → compressed (review + 6–8 words, no full
  grammar part); 30/45 → standard; 60+ → adds extended review/extra examples
  (speaking/listening arrive in Phase 3).
- Missing days are not punished: the engine just continues from the module
  cursor and adds pending reviews.

**AdaptationService / MistakeService**
- Records every wrong attempt; aggregates by grammar_concept_id / vocab_item_id.
- A "weakness" = concept with accuracy < 70% and ≥ 2 mistakes in the last 14
  days. Weakness material is injected into future lessons automatically.

**ProgressService**
- Streak (calendar-consecutive study days), XP, weekly minutes,
  CEFR progress % (based on completed lessons vs. course size, weighted by
  lesson/exam scores in later phases), skill bars per module (accuracy of
  attempts in that module).

**AchievementService**
- Checks unlock conditions after lesson completion (first lesson, 7/30 day
  streak, 100 words, 10 lessons, etc.).

Exercise types (deterministic templates):
- `multiple_choice` (translation → pick), `fill_blank`, `translation`
  (production, typed), `ordering` (word order), `listening` (audio-backed in
  Phase 3; Phase 1 uses transcript-based listening comprehension).

---

## 6. API design

Base path `/api`, JSON, JWT bearer auth (except auth routes).

| Method | Path | Purpose |
|--------|------|---------|
| POST | /api/auth/register | create account (returns token + user) |
| POST | /api/auth/login | login (returns token + user) |
| GET  | /api/auth/me | current user + active language summary |
| POST | /api/me/onboarding | save level, duration, goal, variant |
| GET  | /api/me/onboarding-options | static option lists |
| GET  | /api/me/summary | dashboard payload |
| GET  | /api/me/lesson/today | today's assembled lesson |
| GET  | /api/me/lesson/:id | full lesson content (parts, exercises) |
| POST | /api/me/lesson/:id/attempt | grade one exercise answer |
| POST | /api/me/lesson/:id/complete | finish lesson → stats/streak/XP/achievements |
| GET  | /api/me/review | daily review session items |
| POST | /api/me/review/attempt | grade a review item |
| GET  | /api/me/progress | progress page payload |
| GET  | /api/curriculum | full course structure (modules/lessons/vocab/grammar) |

All learning routes take `?language=es` (default es). Errors follow
`{ error: { code, message } }` with proper HTTP statuses.

---

## 7. Mobile screen & navigation structure

expo-router file-based navigation.

```
app/
├── _layout.tsx              (root: auth gate + theme provider)
├── index.tsx                (redirect: token? tabs : auth)
├── (auth)/
│   ├── login.tsx
│   └── register.tsx
├── (onboarding)/
│   ├── index.tsx            (welcome / level)
│   ├── level.tsx
│   ├── duration.tsx
│   ├── goal.tsx
│   └── variant.tsx
└── (tabs)/
    ├── _layout.tsx          (bottom tabs)
    ├── index.tsx            HOME  — dashboard
    ├── learn.tsx            LEARN — module/lesson list + today's lesson CTA
    ├── review.tsx           REVIEW — daily review
    └── progress.tsx         PROGRESS — stats + skill map
    └── (profile)            profile/settings via header → modal
```

Lesson flow (in `(tabs)/learn` stack): LessonList → LessonView (paged:
Vocabulary cards → Grammar explainer → Exercises → Results) → LessonComplete.

**Design language**: clean typography, cards, large touch targets, subtle
animations, light/dark via system. Not Duolingo-like. Calm indigo/teal palette
on near-white; dark mode equal contrast.

---

## 8. Phase 1 seed curriculum (Spanish A0/A1)

Seeded deterministically. Modules 1–4 give a complete vertical slice.

| Module | Lessons | Vocabulary theme | Grammar concept |
|--------|---------|------------------|-----------------|
| Greetings | 2 | hola, gracias, por favor, buenos días/tardes/noches, adiós, sí, no… | Polite expressions; Sí/No |
| Introductions | 2 | yo, tú, me llamo, ¿cómo te llamas?, de dónde eres, soy de… | `ser` (present, yo/tú/él) |
| Numbers | 2 | cero–diez, uno–diez, ¿cuántos? | Plural of nouns |
| Family | 2 | madre, padre, hermano, hermana, hijo, hija, familia… | Possessives (mi, tu, su) |

Each lesson: 8–12 vocabulary items, 1 grammar concept, 6–10 exercises across
the exercise types. ~60 words, ~4 concepts, ~30 exercises in Phase 1 seed.

---

## 9. Deterministic vs AI (Phase 1 stance)

| Capability | Phase 1 | Phase 2+ |
|------------|---------|----------|
| What to study / lesson structure / SRS / weaknesses | Deterministic engine | Deterministic engine (unchanged) |
| Content (explanations, dialogues, roleplays) | Seeded static curriculum | AI generation behind `AIService` |
| Exercise variations | Template-generated | AI-personalized |
| Speech | — | STT/TTS provider interfaces |
| Conversation | — | `ConversationService` |

**External services required (later phases):**
- LLM provider (OpenAI/Anthropic) — only via backend `AIService`.
- STT provider (e.g. Deepgram/Whisper) — backend proxied.
- TTS provider (e.g. ElevenLabs) — backend proxied; device TTS (expo-speech)
  is a free Phase 3 fallback.
- Auth providers (Google/Apple) — later.

Phase 1 needs no external credentials.

---

## 10. Implementation roadmap & verification

**Milestone 1 — Backend foundation**
1. Monorepo scaffold (workspaces, tsconfig, docker-compose, gitignore).
2. Drizzle schema + migration + seed script.
3. Services: SRS, review, lesson assembly, mistakes/adaptation, progress.
4. Routes: auth, onboarding, lesson, review, progress.
5. Vitest unit tests for SRS + assembly + auth.
6. Verify: `docker compose up db`, `npm run db:migrate`, `npm run db:seed`,
   `npm test`, boot server, curl key endpoints.

**Milestone 2 — Mobile foundation**
7. Expo scaffold, theme, navigation shell.
8. Auth + onboarding screens wired to API.
9. Dashboard, learn flow (lesson view + exercises + results), review,
   progress screens.
10. Verify: `tsc --noEmit`, `expo export` bundle, manual flow.

**Milestone 3 — Integration + docs**
11. End-to-end flow on device/emulator; README run instructions.

**Verification commands** (run after each milestone):
```
cd apps/backend && npm test
npm run build        # tsc for both packages
npm run db:migrate && npm run db:seed
npm run dev          # backend, then curl smoke tests
cd apps/mobile && npx tsc --noEmit && npx expo export
```

---

## 11. Risks & mitigations

| Risk | Mitigation |
|------|-----------|
| DB not available in dev | Docker Compose Postgres; DATABASE_URL env; retry script |
| Expo dependency drift | Pin exact versions from current stable SDK template |
| OneDrive path with non-ASCII name | Use npm workspaces with relative paths; avoid absolute imports |
| Content volume too large for Phase 1 | 4 modules × 2 lessons, extensible seed format |
| SRS complexity | Start with proven SM-2 variant, keep math isolated + tested |
| Mobile UI on Windows | Expo web export + tsc as CI-style verification; device testing by user |

---

## 12. Definition of done (Phase 1)

User can: create account → choose Spanish → select A0 → receive Lesson 1 →
complete vocabulary/grammar/exercises → close the app → return later → continue
from the correct state, with progress, streak, XP and spaced repetition
persisted and visible on the dashboard and progress page.
