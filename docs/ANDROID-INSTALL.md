# Inštalácia Android APK (Španielčina)

Dátum: 2026-08-06 · Fáza 2.1

Tento dokument popisuje, ako vyrobiť a nainštalovať reálny inštalovateľný
Android APK pre interné testovanie na fyzickom zariadení (emulátor aj reálny
telefón). AAB (Google Play) je nakonfigurovaný, ale vydáva sa neskôr.

---

## 0. Čo je potrebné (jednorazovo)

- Node.js ≥ 20 a npm.
- Účet **Expo (EAS)** a prihlásenie: `npx eas-cli login`.
- Backend bežiaci a dosiahnuteľný z telefónu (pozri §3).
- Android zariadenie so zapnutou inštaláciou z neznámych zdrojov, alebo
  emulátor.

> **Žiadne fake tvrdenia:** APK v tomto dokumente je artefakt EAS cloud buildu.
> Pokým ho reálne nevybuildíš, uvádzaj to v správach ako „nakonfigurované,
> čaká na build", nie ako hotové APK.

---

## 1. Konfigurácia buildov

Súbor `apps/mobile/eas.json`:

| Profil        | Účel                                  | Android artefakt |
|---------------|---------------------------------------|------------------|
| `development` | vývojový build (Expo Go klient)       | dev client       |
| `preview`     | interné testovanie (hlavný APK)       | **APK**          |
| `production`  | Google Play neskôr                    | AAB              |

Identifikátor balíka: `sk.spanielcina.app` · názov aplikácie: „Španielčina"
(ikonky/splash sú v `apps/mobile/assets/` a sú funkčné, ale vizuálne sú
zástupné). Verzia `0.1.0`, `versionCode: 1`.

### API adresa — dôležité

Appka číta backend cez `EXPO_PUBLIC_API_URL` (časť `apps/mobile/.env.example`).
Expo túto premennú **zabuduje do buildu** — beží **nie** na zariadení.

- **Dev (Metro/emulátor):** ak nie je nastavená, použije sa emulátorová adresa
  (`10.0.2.2` na Androide, `localhost` na iOS).
- **Preview/production APK:** pri buildu MUSÍ byť nastavená na adresu
  dosiahnuteľnú z telefónu. Bez nej release build cieli na prázdnu adresu a
  appka ukáže „Nepodarilo sa pripojiť k serveru."

---

## 2. Vyrobiť APK (preview)

```bash
# 1. Shared typy + typecheck (koreň repa)
npm run build --workspace @spanish/shared
npm run typecheck

# 2. Backend musí byť bežať (pred testom na reálnom telefóne)
#    `npm run dev` v apps/backend

# 3. Build APK cez EAS cloud — adresa podľa prostredia:
#    a) vývojový backend na tvojom PC (LAN IP)
npx eas build --platform android --profile preview \
  --env EXPO_PUBLIC_API_URL=http://<LAN-IP>:4000/api

#    b) nasadený backend (Vercel — viď docs/VERCEL-DEPLOYMENT.md)
npx eas build --platform android --profile preview \
  --env EXPO_PUBLIC_API_URL=https://<app>.vercel.app/api
```

EAS vráti odkaz na súbor APK (alebo QR kód). Stiahni APK a nainštaluj na
zariadenie.

> `LAN-IP` je adresa počítača v lokálnej sieti (napr. `192.168.1.20`), nie
> `10.0.2.2` (to je len emulátor). Zisti ju napr. `ipconfig` na Windowse.

---

## 3. Backend z tvojho telefónu

- Backend počúva na `:4000` (dev). Nastav `CORS_ORIGINS=*` (alebo konkrétnu
  adresu) v `apps/backend/.env`.
- Telefón a počítač musia byť v rovnakej sieti; firewall musí púšťať port 4000.
- Skontroluj z telefónu: otvor v prehliadači `http://<LAN-IP>:4000/api/health`
  → malo by vrátiť `{"status":"ok"}`.

---

## 4. Checklist reálneho zariadenia (physical-device smoke test)

Po inštalácii APK na fyzický telefón odskúšaj:

- [ ] Registrácia / prihlásenie (backend dosiahnuteľný).
- [ ] Domov: zobrazuje sa „Dnešný plán" (cieľ, minúty, položky).
- [ ] „Pokračovať na lekciu" otvorí ďalšiu lekciu.
- [ ] Dokončenie lekcie → „Pokračovať na ďalšiu lekciu" hneď otvorí N+1.
- [ ] Lekcie po aktuálnej sú v Učenie zamknuté (🔒) a nedajú sa otvoriť.
- [ ] Nahrávka hovorenia: mikrofón povolený; Groq/STT vyhodnotí vetu.
- [ ] Zlé pripojenie (vypnutá sieť) → „Nepodarilo sa pripojiť k serveru." +
      „Skúsiť znova".

> **Offline očakávania:** appka **nie je** plne offline — všetky dáta
> (lekcie, AI, STT/TTS, plán) idú cez backend. Bez siete nefunguje.

---

## 5. Alternatíva: lokálny build (bez EAS)

EAS je preferovaný (najmenej deštruktívny). Lokálny build je náhrada, ak nemáš
EAS účet:

```bash
cd apps/mobile
npx expo prebuild --platform android     # vygeneruje apps/mobile/android/
# nastav EXPO_PUBLIC_API_URL do .env (release build ho číta pri bundlingu)
cd android
./gradlew assembleRelease                # výstup: android/app/build/outputs/apk/release/
```

`prebuild` pridá nativné projekty do repa (pokiaľ nie sú gitignorované) —
preto EAS preferujeme.

---

## 6. Secrets

Všetky kľúče (Groq, OpenAI, STT/TTS) ostávajú **len** na backendoch
(`apps/backend/.env`, gitignored). APK žiadne API kľúče neobsahuje.
