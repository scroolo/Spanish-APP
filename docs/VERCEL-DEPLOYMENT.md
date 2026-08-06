# Nasadenie backendu na Vercel + Neon Postgres (Španielčina)

Dátum: 2026-08-06 · Fáza 2.2 (nasadenie)

Tento dokument popisuje krok za krokom, ako nasadiť backend ako Vercel
serverless funkciu s produkčnou Postgres databázou (Neon) a overiť ho.
Po nasadení sa adresa zabuduje do APK cez `EXPO_PUBLIC_API_URL`
(viď `docs/ANDROID-INSTALL.md`).

> **Žiadne fake tvrdenia:** nasadzovanie vyžaduje reálny Vercel účet,
> projekt a Neon databázu. Nič z toho sa nedá vyrobiť „za človeka".
> Tento dokument popisuje kroky; výsledok je hotový až po ich reálnom
> vykonaní a overení cez `/health` a smoke test.

---

## 1. Ako backend beží na Vercel

Backend je **Fastify 5**, nie Express. Na Vercel sa nespúšťa cez `app.listen()` —
všetky requesty idú cez serverless funkciu `apps/backend/api/index.ts`, ktorá
používa Fastify `inject()` nad tým istým route stackom ako lokálny server
(žiadna zmena architektúry endpointov).

- Všetky importy `@spanish/shared` sú `import type` → funkcia nemá žiadnu
  runtime závislosť na shared package (typ-importy sa zbundlovaní odstránia).
- TTS: bez `BLOB_READ_WRITE_TOKEN` sa audio ukladá na lokálny disk
  (serverless disk je **ephemerálny** — medzi invokáciami sa stráca).
  S tokenom sa audio ukladá do **Vercel Blob** (trvalé URL).
- Rate limity sú in-memory → best-effort, na serverless sa resetujú.
- STT (Groq) a AI (OpenAI) idú cez klasické `fetch` → serverless-safe.

## 2. Prerekvizity

- Git repo (všetko odovzdané a pushnuté), Vercel účet (login cez
  `vercel login` alebo dashboard), Neon účet (alebo iná hosted Postgres ≥ 15).
- Lokálne: `vercel` CLI (`npm i -g vercel`) a prístup k Neon connection stringu.

## 3. Neon databáza

1. V Neon vytvor projekt (region blízko Vercel funkcie).
2. Získej connection string s **pooled** alebo **direct** URL pre `DATABASE_URL`.
   Neon vyžaduje TLS; backend v produkcii (`NODE_ENV=production`) alebo pri
   URL s `sslmode=require` automaticky povoľuje `ssl: { rejectUnauthorized: false }`
   a failuje rýchlo (`PG_CONNECTION_TIMEOUT_MS`, default 5 s).

### Stav (2026-08-06): DB už je pripravená

Migrácie aj seed boli **už vykonané** na reálnom Neon projekte (`neondb`,
`ep-delicate-recipe-b1k2bhct`) a overené smoke testom:

- `db:migrate` — schéma nasadená.
- `db:seed` — 8 achievements, 1 jazyk (es), 2 kurzy (A0+A1), 13 modulov,
  24 lekcií, 239 vocab položiek, 24 grammar konceptov, 225 cvičení.
- Seed je idempotentný (opakovaný beh nič nezdvojil).
- Lokálny backend napojený na Neon prešiel `smoke:production` (11/11 krokov).

> **Pozor:** `DATABASE_URL` (vrátene hesla) je tajomstvo — do kódu, commitov
> a dokumentácie sa nedáva. Nastavuje sa iba ako Vercel env var / lokálne env.


## 4. Vercel projekt

1. Importuj repo do Vercel (dashboard → Add New → Project).
2. **Root Directory:** `apps/backend` (backend je samostatný workspace).
3. Build/Install sú nakonfigurované v `apps/backend/vercel.json`:
   - `framework: null` (žiadna framework detekcia).
   - `buildCommand`: build shared typov + `build:vercel` (typecheck `api/`
     cez `tsconfig.vercel.json` + build `dist/`).
   - `functions.api/index.ts`: Node 20, 1 GB, max 30 s.
   - `rewrites`: všetky cesty (`/api/*`, `/health`, …) → `api/index.ts`.
4. Nastav **Environment Variables** v projekte:

| Premenná                    | Hodnota                                                     | Poznámka                        |
|-----------------------------|-------------------------------------------------------------|---------------------------------|
| `NODE_ENV`                  | `production`                                                | povinné                         |
| `DATABASE_URL`              | Neon connection string                                      | povinné                         |
| `JWT_SECRET`                | dlhý náhodný reťazec (stabilný, nie per-invokácia)          | povinné                         |
| `STT_PROVIDER`              | `groq`                                                      | povinné pre hovorenie           |
| `GROQ_API_KEY`              | Groq kľúč                                                   | povinné pre hovorenie           |
| `GROQ_MODEL`                | `whisper-large-v3-turbo` (default)                          | voliteľné                       |
| `AI_PROVIDER`               | `mock` / `openai`                                           | `openai` vyžaduje `AI_API_KEY`  |
| `AI_API_KEY`                | OpenAI kľúč (iba ak `AI_PROVIDER=openai`)                   | voliteľné                       |
| `TTS_PROVIDER`              | `mock` / `openai`                                           | `openai` vyžaduje `TTS_API_KEY` |
| `TTS_API_KEY`               | OpenAI kľúč (iba ak `TTS_PROVIDER=openai`)                  | voliteľné                       |
| `BLOB_READ_WRITE_TOKEN`     | Vercel Blob token                                           | voliteľné, odporúčané           |
| `CORS_ORIGINS`              | `*` (mobile HTTP nemá origin) alebo konkrétny web           | default `*`                     |
| `RATE_LIMIT_AI_PER_HOUR`    | napr. `120`                                                 | best-effort                     |
| `RATE_LIMIT_STT_PER_HOUR`   | napr. `80`                                                  | best-effort                     |
| `RATE_LIMIT_TTS_PER_HOUR`   | napr. `120`                                                 | best-effort                     |
| `MAX_BODY_BYTES`            | default 15 MB (base64 m4a z telefónu)                       | voliteľné                       |

> **Žiadne secrets do kódu alebo commitov.** Všetko cez Vercel env vars.

## 5. Migrácie a seed (produkčný DB)

Náhodné vypnutie/vypustenie DB zablokuje `db:reset` — v produkcii
(`NODE_ENV=production`) sa reset **odmietne spustiť**.

> Pre tento projekt je DB už migrovaná a seednutá (§3). Tieto kroky sú tu len
> ako referencie pre obnovu/nové prostredie.

```bash
# Z lokálneho počítača s DATABASE_URL smerujúcim na Neon:
cd apps/backend
DATABASE_URL=postgres://... npm run db:migrate
DATABASE_URL=postgres://... npm run db:seed
```

- `db:seed` je **idempotentný** — pri opakovaní nezdvojí obsah (preskočí, keď
  sú achievements/languages/courses prítomné).
- Seed vkladá **len** kurikulum a achievements, žiadni falošní používatelia.
- Migrácie: v repozitári sú v `apps/backend/drizzle/` — založené na
  `drizzle.config.ts` (čita `DATABASE_URL`).

## 6. Deploy a overenie

```bash
cd apps/backend
npx vercel --prod          # zistí rootDirectory/build z vercel.json
```

Po nasadení (reálna URL od Vercel):

```bash
# Lokálne smoke testy proti produkcii (bez AI/STT hovorov):
npm run smoke:production --workspace @spanish/backend \
  -- --url https://<app>.vercel.app

# S AI/STT endpointmi (volá Groq/OpenAI → platí):
npm run smoke:production --workspace @spanish/backend \
  -- --url https://<app>.vercel.app --with-ai
```

Smoke test overí: `/health`, `/api/health`, 401 bez tokenu, register,
onboarding, summary, lesson, progress, curriculum, login, speaking history.

Ručné overenie z telefónu: otvor `https://<app>.vercel.app/health` →
`{"status":"ok"}`.

## 7. Prepojenie s APK

Po úspešnom nasadení a smoke teste vyrob APK s reálnou adresou:

```bash
cd apps/mobile
npx eas login
npx eas build --platform android --profile preview \
  --env EXPO_PUBLIC_API_URL=https://<app>.vercel.app/api
```

Podrobnosti: `docs/ANDROID-INSTALL.md`.

## 8. Čo NIE je hoté / obmedzenia serverless

- TTS audio bez `BLOB_READ_WRITE_TOKEN` je stratené (ephemerálny disk) —
  odporúčame Blob token.
- Rate limity sú per-invokácia, nie globálne.
- Studený štart funkcie ≥ niekoľko stoviek ms (Node 20, ~1 GB).
- `db:reset` je v produkcii zakázaný — DB sa nevypúšťa omylom.
