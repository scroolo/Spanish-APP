import type { OnboardingOptions } from '@spanish/shared';

export const ONBOARDING_OPTIONS: OnboardingOptions = {
  levels: [
    { value: 'A0', label: 'Úplný začiatočník', description: 'Neviem ešte takmer nič po španielsky.' },
    { value: 'A1', label: 'A1', description: 'Základy: pozdravy, predstavenie, jednoduché vety.' },
    { value: 'A2', label: 'A2', description: 'Zvládam bežné situácie a jednoduché rozhovory.' },
    { value: 'B1', label: 'B1', description: 'Rozumiem hlavným myšlienkam a rozprávam o skúsenostiach.' },
    { value: 'B2', label: 'B2', description: 'Plynulo hovorím a rozumiem zložitejším témam.' },
    { value: 'C1', label: 'C1', description: 'Takmer rodinná úroveň, zložité témy a výrazy.' },
  ],
  durations: [
    { value: 15, label: '15 minút' },
    { value: 30, label: '30 minút' },
    { value: 45, label: '45 minút' },
    { value: 60, label: '60 minút' },
    { value: 90, label: '90 minút' },
    { value: 120, label: '120 minút' },
  ],
  goals: [
    { value: 'travel', label: 'Cestovanie' },
    { value: 'living_in_spain', label: 'Život v Španielsku' },
    { value: 'conversation', label: 'Konverzácia' },
    { value: 'movies_series', label: 'Filmy a seriály' },
    { value: 'work', label: 'Práca' },
    { value: 'general_fluency', label: 'Všeobecná plynulosť' },
  ],
  variants: [
    { value: 'spain', label: 'Španielčina zo Španielska' },
    { value: 'latin_america', label: 'Latinskoamerická španielčina' },
    { value: 'none', label: 'Bez preferencie' },
  ],
  nativeLanguages: [
    { value: 'sk', label: 'Slovenčina' },
    { value: 'cs', label: 'Čeština' },
    { value: 'en', label: 'Angličtina' },
    { value: 'de', label: 'Nemčina' },
    { value: 'hu', label: 'Maďarčina' },
    { value: 'pl', label: 'Poľština' },
    { value: 'uk', label: 'Ukrajinčina' },
  ],
};
