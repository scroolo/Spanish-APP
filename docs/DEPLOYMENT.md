# Nasadenie backendu (Španielčina) — príručka

Dátum: 2026-08-06 · Fáza 2.1

Cieľ: dokumentovať, ako backend sprevádzkovať mimo lokálneho prostredia
(preview/production), aby ho mobilný APK vedel dosiahnuť.

---

## 1. Požiadavky

- Node.js ≥ 20 (odporúčané 24), PostgreSQL 16.
- Produkčný proces: `node dist/index.js` po `npm run build`.

## 2. Konfigurácia (env)

Kopíruj `apps/backend/.env.example` → `apps/backend/.env` (v produkcii
nastav reálne hodnoty; `.env` je gitignored).

| Premenná            | Význam                                                        | Poznámka                            |
|---------------------|---------------------------------------------------------------|-------------------------------------|
| `DATABASE_URL`      | PostgreSQL connection string (napr. `postgres://user:pass@host:5432/db`) | **povinné**                 |
| `JWT_SECRET`        | podpis JWT tokenov                                            | **musí sa zmeniť** v produkcii      |
| `PORT`              | port HTTP servera (default 4000)                              |                                    |
| `CORS_ORIGINS`      | povolené originy (`*` pre vývoj, v produkcii konkrétna adresa) |                                   |
| `LOG_LEVEL`         | `info` / `debug` / `silent`                                   |                                    |
| `AI_PROVIDER`/`AI_API_KEY`/`AI_BASE_URL` | LLM pre AI učiteľa, cvičenia, konverzácie | `mock` bez kľúča        |
| `TTS_PROVIDER`/`TTS_API_KEY` | text-to-speech (mock/openai)                          |                                    |
| `STT_PROVIDER`/`STT_API_KEY` | speech-to-text (mock/openai/groq)                     |                                    |
| `GROQ_API_KEY`/`GROQ_BASE_URL`/`GROQ_MODEL` | Groq STT (odporúčané) | `whisper-large-v3-turbo` |
| `RATE_LIMIT_*`      | limity AI/TTS/STT za hodinu (-1 vypne)                       | in-memory, single instance        |

> Kľúče AI/STT/TTS patria **výhradne** sem (backend). Nikdy do mobilnej
> appky, EAS secrets ani do buildu APK.

## 3. Migrácie a seed

```bash
npm run db:migrate        # drizzle-kit migrate (vytvorí schému)
npm run db:seed           # seed kurikula A0/A1, achievementov
```

Produkčný DB najprv vymigruj, potom seedni. Seed je idempotentný? Over podľa
`src/db/seed.ts` — pri opakovaní sa vyhni duplicitám.

## 4. Build a spustenie

```bash
npm run build --workspace @spanish/shared
npm run build --workspace @spanish/backend     # vyrobí dist/
npm run start --workspace @spanish/backend      # node dist/index.js
```

Health check: `GET /api/health` → `{"status":"ok"}`.

## 5. CORS a prístup z APK

- V dev s reálnym telefónom: `CORS_ORIGINS=*` (alebo adresa LAN).
- V produkcii nastav origin webu / zvoľ `*` iba ak rozumieš riziku (mobile
  native HTTP nemá origin, CORS naň nemá vplyv; CORS slúži pre web klienta).
- Backend musí byť dosiahnuteľný na URL, ktorá je zabudovaná do APK
  (`EXPO_PUBLIC_API_URL`) — viď `docs/ANDROID-INSTALL.md`.

## 6. Pravidelná údržba

- TTS cache: `MEDIA_DIR` (predvolene `./media/tts`). Pri zálohovaní servera
  zálohuj aj tento adresár, inak sa audio regeneruje (alebo bumpni
  `TTS_CACHE_VERSION`).
- Rate limity sú in-memory → pri viacerých instanciach ich spravuj externe
  (alebo nechaj single instance).

## 7. Čo NIE je hotové

- HTTPS/terminácia TLS (nastav za reverzným proxy, napr. Caddy/Nginx).
- Viacnásobné inštancie a zdieľané rate limity.
- Logging/APM do produkčného zberu.
