# Fáza 2.1 — Report: Flexibilné učenie + denný plán + Android APK príprava

Dátum: 2026-08-06 · Status: implementované, testy zelené; APK nakonfigurované (build čaká)

---

## 1. Čo pribudlo

### A. Flexibilné tempo (denný plán už NIE je zámok)

- **Viac lekcií za deň:** server žiadnym spôsobom neblokuje viac lekcií denne.
- **Sekvenčné odomykanie:** odomyká sa vždy najbližšia neprejdená lekcia
  (N+1 okamžite po dokončení). Nedá sa preskočiť — `GET /api/me/lesson/:id`,
  `attempt` aj `complete` vracajú `403 LOCKED` pre uzamknuté lekcie.
- **Denný plán ≠ pokrok v kurze:** plán je len odporúčanie. Kurz postupuje podľa
  sekvenčného odomykania; plán ukazuje dnešný cieľ a položky.
- **Každá lekcia okamžite:** zapíše completion, mastery, SRS, slabiny, CEFR
  a odomkne ďalšiu (žiadne dávkovanie).
- **Streak = 1 za kalendárny deň** (bez násobenia). Streak navyše rastie aj pri
  opakovaní a hovorení (zmysluplná aktivita), nie len za lekciu.

### B. Dnešný plán (nový)

- Domov ukazuje **„Dnešný plán"**: cieľ (min), dokončené minúty, položky.
- Položky: Opakovanie · Ďalšia lekcia · Hovorenie · Precvičiť slabiny ·
  Konverzácia. Podľa cieľa 15/30/45/60/90/120 min:
  - **15 min:** Opakovanie + Lekcia
  - **30 min:** + Hovorenie (5)
  - **45 min:** + Precvičiť slabiny (5)
  - **60 min:** + Konverzácia (5)
  - **90 min:** Hovorenie 10 · Precvičiť 10
  - **120 min:** Hovorenie 15 · Precvičiť 10
- **Rýchly žiak** (2+ lekcie za 24 h) → plán navrhne viac opakovania a ukáže
  nápovedu „Včera si prešiel veľa novej látky…".
- **Veľký backlog opakovania** (≥20 due) → odporúčanie „Najprv odporúčame
  opakovanie", ale „Pokračovať na lekciu" je vždy dostupné.

### C. Mobilná appka

- Domov: Dnešný plán + karta Kurz („Ďalšia lekcia" + Pokračovať).
- Učenie: ✅ (hotové) / ▶ (odomknuté, spustiteľné) / 🔒 (zamknuté).
- Po dokončení lekcie: **„Pokračovať na ďalšiu lekciu"** (rovno na N+1) +
  sekundárne „Späť na Domov".
- Error UX: „Nepodarilo sa pripojiť k serveru." + „Skúsiť znova" na Domove
  aj v lekcii.
- `EXPO_PUBLIC_API_URL` je prvotriedne (žiadny tvrdý `10.0.2.2` v release
  buildoch; dev fallback ostáva pre emulátor).

### D. Android build príprava

- `eas.json`: profily development / **preview → APK** / production → AAB.
- `app.json`: `package` `sk.spanielcina.app`, verzia `0.1.0`, `versionCode: 1`,
  názov „Španielčina", ikonky/splash sú zástupné (funkčné).
- `docs/ANDROID-INSTALL.md` — postup build APK + checklist reálneho zariadenia.
- `docs/DEPLOYMENT.md` — nasadenie backendu (env, migrácie, CORS, health).

---

## 2. Príklady denného plánu (odporúčanie, neblokuje)

| Cieľ | Opakovanie | Lekcia | Hovorenie | Precvičiť | Konverzácia | Spolu (cca) |
|-----:|-----------:|-------:|----------:|----------:|------------:|------------:|
| 15   | 3 (6 due)   | 10     | –         | –          | –           | 13          |
| 30   | 4 (8 due)   | 20     | 5         | –          | –           | 29          |
| 45   | 5 (10 due)  | 25     | 5         | 5          | –           | 40          |
| 60   | 5 (10 due)  | 25     | 5         | 5          | 5           | 45          |
| 90   | 10 (20 due) | 25     | 10        | 10         | 5           | 60          |
| 120  | 15 (30 due) | 25     | 15        | 10         | 5           | 70          |

Hodnoty sú deterministické (testované v `test/plan.test.ts`).

---

## 3. Stav Android APK — HONEST

- **Nakonfigurované:** profily, package id, názov, verzie, ikonky, env-aware
  API adresa, dokumentácia.
- **REÁLNY APK NEBOL ZABUILDNÝ** (vyžaduje EAS účet / cloud build alebo lokálny
  Gradle). Podľa `docs/ANDROID-INSTALL.md` spusti:
  `npx eas build --platform android --profile preview --env EXPO_PUBLIC_API_URL=…`
  a až potom tvrď, že APK existuje.
- Lokálny build (`expo prebuild` + `gradlew assembleRelease`) je zdokumentovaný
  ako alternatíva, preferovaný je EAS (najmenej deštruktívny).

---

## 4. Backend konektivita (dev / preview / prod)

- **Dev emulátor:** default `10.0.2.2:4000/api` (bez env).
- **Dev fyzický telefón:** `EXPO_PUBLIC_API_URL=http://<LAN-IP>:4000/api`.
- **Preview/prod APK:** `--env EXPO_PUBLIC_API_URL=https://…` pri buildu.
- Bez env v release buildu: appka cieli na prázdnu adresu → pripojenie zlyhá
  s jasnou hláškou (žiadne tiché posielanie na emulátor).

## 5. Secrets

Groq/OpenAI/STT/TTS kľúče ostávajú v `apps/backend/.env` (gitignored). APK
žiadne kľúče neobsahuje.

---

## 6. Testovanie

- Backend: **85 testov zelených** (10 súborov). Nové: `test/plan.test.ts`
  (11), `test/streak.test.ts` (5).
- `npm run typecheck` (backend + mobile) — zelené.
- Backend build (`tsc`) — zelený.
- Live E2E / reálny fyzický telefón: **nebol spustený v tejto fáze** — podľa
  checklistu v `docs/ANDROID-INSTALL.md` (sekcia 4).

## 7. Zmenené súbory

- `packages/shared/src/index.ts` — DailyPlan DTO, `SummaryDto.plan`, `locked`.
- Backend: `learning/plan.ts`, `learning/streak.ts` (nové), `daily-plan.service.ts`
  (nové), `lesson.service.ts`, `progress.service.ts`, `srs.service.ts`,
  `speaking-attempt.service.ts`, `app.ts`; testy `test/plan.test.ts`,
  `test/streak.test.ts`.
- Mobile: `src/store/auth.ts`, `src/i18n/messages.ts`, `app/(tabs)/index.tsx`,
  `app/(tabs)/learn.tsx`, `app/lesson/[id].tsx`, `app.json`, `eas.json` (nové),
  `.env.example` (nové).
- Docs: `ANDROID-INSTALL.md`, `DEPLOYMENT.md`, tento report.

## 8. Známe obmedzenia

- Plán „Precvičiť slabiny" a „Konverzácia" nemajú detekciu dokončenia
  (`done=false` vždy) — sú to odporúčania.
- „Dokončené minúty" plánu sú odhad (lekcie dnes + opakovania dnes +
  hovorenie dnes), nie presné meranie času.
- Ikony/splash sú zástupné; pred vydaním nahraď.
- Rate limity sú in-memory (single instance).
- Appka nie je offline; všetky dáta idú cez backend.

## 9. Odporúčaná ďalšia fáza

Reálny EAS preview build a fyzické zariadenie (smoke test podľa checklistu),
potom produkčné nasadenie backendu a `production` AAB.
