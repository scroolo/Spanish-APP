# AI Spanish Teacher — Phase 2 Implementation Report

Date: 2026-08-06
Status: Delivered — all STEPs verified (backend 69 tests, repo typecheck, live E2E green)

---

## 0. Executive summary

Phase 2 adds the AI layer to the Phase 1 deterministic learning engine. The
core principle is preserved: **the deterministic engine decides WHAT to study
(level, lesson structure, SRS, weaknesses, review), while AI decides only HOW
content is expressed** (explanations, personalised exercises, pronunciation
audio, speech recognition, conversation). AI is never the source of truth for
progression — every AI attempt flows through the same `LearningSignalsService`
record path as curriculum attempts.

Delivered capabilities: AI Teacher chat (Slovak), AI-personalised exercises,
listening exercises with text-to-speech (TTS), speaking exercises with
speech-to-text (STT) evaluation, and bounded AI conversation (A0/A1 scenarios).
Everything ships with offline-safe mock providers and per-feature rate limits,
so the app is fully usable without any AI API keys.

---

## 1. Features delivered

| # | Feature | Endpoint / surface | Status |
|---|---------|--------------------|--------|
| 1 | AI Teacher — explain today's lesson | `POST /api/me/ai/tutor/explain` | verified |
| 2 | AI Teacher — free-form Q&A in Slovak | `POST /api/me/ai/tutor/ask` | verified |
| 3 | AI-personalised exercises (grammar / vocabulary / general) | `GET /api/me/ai/exercises`, `POST /api/me/ai/exercises/generate`, `POST /api/me/ai/exercises/:id/attempt` | verified |
| 4 | Listening exercises (TTS audio in lessons) | lesson DTO `exercises[].audioUrl`, `GET /api/media/tts/:file` | verified |
| 5 | Speaking exercises (record → STT → evaluate) | `POST /api/me/speaking/attempt`, `GET /api/me/speaking/history` | verified |
| 6 | AI conversation (5 bounded A0/A1 scenarios) | `GET /api/me/conversation/scenarios`, `POST /api/me/conversation/sessions`, `GET/POST .../sessions/:id`, `POST .../sessions/:id/reply`, `POST .../sessions/:id/finish` | verified |
| 7 | Mobile: AI učiteľ screen (chat + quick prompts + conversation) | `app/ai-tutor.tsx` | typechecked |
| 8 | Mobile: Hovorenie tab (speak-review loop + history) | `app/(tabs)/speaking.tsx` | typechecked |
| 9 | Mobile: listening/speaking UI in lesson flow | `app/lesson/[id].tsx` | typechecked |
| 10 | Mobile: audio playback (`AudioPlayer`) + recording (`RecordButton`/`useRecording`) | `src/components`, `src/hooks` | typechecked |

TTS cache and asset management: listening audio is generated once per
(text, voice, cache-version) and reused across users via a content-addressable
`audio_assets` table — no per-user audio rows are duplicated.

---

## 2. Architecture

New backend directories and responsibilities:

```
apps/backend/src/
├── ai/            AIService abstraction
│   ├── types.ts            provider interface + input/output schemas
│   ├── provider.ts         factory (openai | mock)
│   └── providers/          mock.ts, openai.ts
├── tts/           text-to-speech provider abstraction (mock | openai)
├── stt/           speech-to-text provider abstraction (mock | openai)
├── conversation/  scenario catalogue + prompt building
├── services/
│   ├── personalized-exercise.service.ts
│   ├── tutor.service.ts
│   ├── speaking-attempt.service.ts
│   ├── conversation.service.ts
│   └── tts.service.ts      (asset persistence + media serving)
└── usage.service.ts        per-user per-feature counters (ai/tts/stt)
```

Data model additions (Drizzle + SQL migrations applied):

- `audio_assets` — TTS cache (sha1 key, format, provider, file path).
- `exercises.audio_text` — the spoken Spanish for listening/speaking seeds.
- `speaking_attempts` — one row per recorded attempt (evaluation, provider).
- `conversation_sessions` + `conversation_turns` — bounded conversations with
  jsonb hints/summary/feedback payloads.
- `ai_usage` — per-user per-feature monthly counters (requests, tokens, chars).

All AI generation is **zod-validated** with a deterministic fallback: on
invalid or over-length output the provider response is rejected/retried
(`AI_STRUCTURED_RETRIES`) and finally replaced by a safe mock/static turn so the
learning flow never breaks.

---

## 3. Configuration & API surface

### Env vars (`apps/backend/.env.example` documents all)

| Var | Default | Meaning |
|-----|---------|---------|
| `AI_PROVIDER` | `mock` | `mock` runs offline deterministic outputs; `openai` uses `/chat/completions` |
| `AI_MODEL`, `AI_API_KEY`, `AI_BASE_URL` | — | OpenAI-compatible settings |
| `AI_STRUCTURED_RETRIES`, `AI_CONTEXT_MAX_CHARS` | 3, 9000 | robustness knobs |
| `TTS_PROVIDER` | `mock` | `mock` → small tone WAV; `openai` → real speech |
| `TTS_VOICE`, `TTS_MODEL`, `TTS_API_KEY`, `TTS_BASE_URL` | alloy, tts-1 | voice selection |
| `MEDIA_DIR`, `TTS_CACHE_VERSION` | `./media/tts`, 1 | cache location + force-bust |
| `STT_PROVIDER` | `mock` | `mock` → empty transcripts (always `unrecognized`); `openai` → Whisper; `groq` → Groq's OpenAI-compatible Whisper |
| `STT_MODEL`, `STT_API_KEY`, `STT_BASE_URL`, `STT_MAX_AUDIO_SECONDS` | whisper-1, 30 | OpenAI transcription |
| `GROQ_API_KEY`, `GROQ_BASE_URL`, `GROQ_MODEL` | —, `https://api.groq.com/openai/v1`, `whisper-large-v3-turbo` | Groq transcription (set `STT_PROVIDER=groq`) |
| `RATE_LIMIT_AI_PER_HOUR` / `TTS` / `STT` | 60 / 90 / 40 | per-user per-hour; `-1` disables |

### Rate limits & usage policy

- In-memory fixed-window limiter per (user, feature, hour).
- `POST /ai/tutor/explain`, `POST /ai/tutor/ask`, `POST /ai/exercises/generate`,
  conversation start/reply/finish → feature `ai`.
- `POST /speaking/attempt` → feature `stt`.
- TTS synthesis → feature `tts` (cached assets do not re-bill).
- On limit exceeded → `429` with `{ error: { code: 'RATE_LIMIT', message } }`.

### Failure fallbacks (no-crash matrix)

| Failure | Behaviour |
|---------|-----------|
| No AI key / provider mock | deterministic mock exercises, teacher replies, conversations |
| Malformed/over-long AI JSON | schema-validation retry → safe fallback turn |
| TTS unavailable | `audioUrl: null` — listening exercise still renders (text) |
| STT unavailable / empty audio | attempt recorded as `unrecognized` with SK feedback |
| Conversation AI failure | `safeTurn` fallback keeps the session moving |
| Audio file missing on disk | media route returns 404 (filename validated by regex) |
| Rate limit | 429 surfaced to the UI as a Slovak message |

---

## 4. Speaking evaluation model

`evaluateSpeaking(transcript, target)` — accent/punctuation-insensitive:

1. Normalise both strings (NFD, strip accents/punctuation, lowercase).
2. Word-level Levenshtein distance.
3. `distance === 0` → `correct`; ratio ≤ 0.35 → `close`; empty → `unrecognized`;
   otherwise → `retry`.
4. Feedback strings in Slovak; the mock STT provider never fabricates a
   "correct" (no fake pronunciation metrics).

The mobile `RecordButton` uses `expo-audio` (mic permission via config plugin),
encodes the recording to base64, and posts it to `/speaking/attempt`. In the
mock STT configuration every recording evaluates as `unrecognized` — this is
documented in `.env.example` so evaluators understand expected behaviour.

---

## 5. Mobile integration

- `src/api/client.ts` gained typed methods for all new endpoints plus a
  `mediaUrl()` helper that resolves relative `/api/media/...` paths to absolute
  URLs using the configured API base.
- `src/components/AudioPlayer.tsx` — `expo-audio` playback for listening.
- `src/components/RecordButton.tsx` + `src/hooks/useRecording.ts` — mic
  recording → base64.
- `app/lesson/[id].tsx` — renders listening (player + options/typing) and
  speaking (player + record → evaluation) exercise types inline in the flow.
- `app/(tabs)/speaking.tsx` — new **Hovorenie** tab: today's speaking sentences,
  record → evaluation loop, and recent attempt history.
- `app/ai-tutor.tsx` — new **AI učiteľ** screen (stack route): chat bubbles with
  quick prompts, free-text questions, scenario cards that start a conversation,
  delayed grammar feedback and a finish/summary (+20 XP) flow.
- i18n keys added for all new UI strings (Slovak).

---

## 6. Verification

- Backend unit tests: **69 passing across 8 files** (SRS, answer normalization,
  content, AI + AI integration, TTS, STT, conversation).
- Repo-wide `npm run typecheck`: green (backend + mobile + shared).
- Live E2E against a running server (`apps/backend/src/scripts/e2e.ts`):
  **ALL CHECKS PASSED** (auth → lesson → attempts → completion → review →
  progress → curriculum → learning profile).
- Live smoke tests this session verified: TTS asset generation + media
  delivery (RIFF/WAV bytes, `audio/mpeg`/`audio/wav` content type), speaking
  attempt 200 with `unrecognized` on mock, empty-audio 400 `BAD_REQUEST`,
  conversation start/reply/feedback-on-4th-turn/finish (+20 XP, summary),
  reply-after-finish 400.

---

## 7. Roadmap (Phase 3+)

| Capability | Notes |
|-----------|-------|
| Real speech providers | wire Whisper (`STT_PROVIDER=openai` or `groq`) + OpenAI TTS/other TTS in `.env`; Groq STT already verified live |
| Higher CEFR scenarios | extend `conversation/scenarios.ts` beyond A0/A1 with per-scenario grammar allow-lists |
| Conversation persistence UX | resume/abandon sessions, list past conversations |
| Audio caching eviction | optional LRU/TTL over `audio_assets` for production storage hygiene |
| Client OTA testing | `expo export` + device pass on Android/iOS (needs real device for mic) |
| Exams & weekly reviews | reuse the existing summary/metrics pipeline |
