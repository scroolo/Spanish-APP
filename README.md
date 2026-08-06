# Španielčina — AI Spanish Teacher

A long-term adaptive Spanish learning app for Slovak speakers. Phase 1: account, onboarding, deterministic A0/A1 curriculum, daily lesson engine, spaced repetition and mistake tracking.

## Stack

- **Monorepo**: npm workspaces (`apps/*`, `packages/*`)
- **Backend**: Fastify 5, Drizzle ORM, PostgreSQL 16, JWT auth, Vitest
- **Mobile**: React Native (Expo SDK 57), Expo Router, Zustand, TanStack Query
- **Shared**: `@spanish/shared` — DTO types used by both apps

## Requirements

- Node.js >= 24
- npm >= 11
- Docker (for PostgreSQL)
- Android Studio / iOS simulator or the Expo Go app on a device

## Setup

```bash
# 1. Install dependencies (from the repo root)
npm install

# 2. Build the shared package (backend & mobile import its types)
npm run build --workspace @spanish/shared

# 3. Start PostgreSQL
docker compose up -d
```

## Backend

```bash
# 4. Configure env
cp apps/backend/.env.example apps/backend/.env
#    edit DATABASE_URL / JWT_SECRET if needed

# 5. Apply schema and seed content (8 lessons, 81 words, 8 grammar, 64 exercises)
npm run db:migrate --workspace @spanish/backend
npm run db:seed --workspace @spanish/backend

# 6. Run the API on http://localhost:4000
npm run dev --workspace @spanish/backend
```

### Backend scripts

| Command | Description |
| --- | --- |
| `npm run dev --workspace @spanish/backend` | dev server (hot reload) |
| `npm run test --workspace @spanish/backend` | unit tests (SRS, answer normalization) |
| `npm run e2e --workspace @spanish/backend` | full user-flow E2E against a running server |
| `npm run db:migrate --workspace @spanish/backend` | apply Drizzle migrations |
| `npm run db:seed --workspace @spanish/backend` | seed the curriculum |
| `npm run typecheck --workspace @spanish/backend` | type check |

## Mobile app

```bash
# API base URL (default http://localhost:4000/api;
# Android emulator auto-uses http://10.0.2.2:4000/api).
# For a physical device, set your machine's LAN IP, e.g.:
#   EXPO_PUBLIC_API_URL=http://192.168.1.20:4000/api

npm start --workspace @spanish/mobile
# then press a (Android), i (iOS), or scan the QR code with Expo Go
```

### Mobile scripts

| Command | Description |
| --- | --- |
| `npm start --workspace @spanish/mobile` | start Expo dev server |
| `npm run typecheck --workspace @spanish/mobile` | type check |
| `npx expo export --platform android` | verify the JS bundle compiles |

## Project structure

```
apps/backend/src/
  db/            schema + seed (Slovak curriculum content)
  services/      auth, onboarding, lesson, review, srs, progress
  learning/      SRS engine (SM-2 variant), answer normalization, onboarding options
  scripts/       e2e.ts full user-flow test
apps/mobile/
  app/           expo-router screens (auth, onboarding, tabs, lesson flow, profile)
  src/           theme, API client, zustand stores, components
packages/shared/ shared DTO types
```

## Learning engine (Phase 1)

- Deterministic A0/A1 curriculum, sequenced per day.
- SM-2 spaced repetition: intervals 1/3/7/14/30 days; mastery ≥ 0.85 with ≥ 3 correct reviews.
- Weakness injection: grammar with ≥ 2 attempts and accuracy < 70% in 14 days is surfaced in later lessons.
- XP: 10 correct / 2 incorrect / 50 lesson bonus + score bonus.
- Achievements: first_lesson, streak_7, streak_30, words_50, words_100, lessons_10, level_a1.

## Roadmap (later phases)

- Phase 2: AI-generated content and speech (listening/speaking exercises).
- Phase 3: open conversation with an AI tutor.

See `docs/PLAN.md` for the full technical plan.
