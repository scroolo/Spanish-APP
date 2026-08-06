/**
 * Bounded conversation scenarios (A0/A1 rails).
 *
 * Every scenario constrains the AI: a maximum CEFR level, an explicit list of
 * allowed grammar (known to the learner), the scenario vocabulary, and a
 * sentence-length cap. This keeps role-play safely inside what the learner has
 * actually studied — the deterministic curriculum stays the source of truth.
 */

export interface ConversationScenario {
  slug: string;
  titleSk: string;
  descriptionSk: string;
  maxCefr: 'A0' | 'A1';
  /** Allowed grammar-concept slugs (must be known/mastered by the learner). */
  allowedGrammar: string[];
  /** Spanish opening line spoken by the AI partner. */
  openingEs: string;
  /** Slovak translation of the opening line. */
  openingSk: string;
  /** Guidance for the provider about the expected vocabulary/role. */
  focusSk: string;
}

export const MAX_CONVERSATION_WORDS = 14;
export const MAX_SESSION_TURNS = 12;
export const HISTORY_TURNS = 8;

export const CONVERSATION_SCENARIOS: ConversationScenario[] = [
  {
    slug: 'predstavenie',
    titleSk: 'Predstavovanie',
    descriptionSk: 'Predstav sa, povedz odkiaľ si a zdvorilo sa rozlúč.',
    maxCefr: 'A1',
    allowedGrammar: ['ser', 'subject_pronouns', 'origin_de', 'polite_expressions', 'conversation_combos'],
    openingEs: '¡Hola! Me llamo Ana. ¿Y tú? ¿Cómo te llamas?',
    openingSk: 'Ahoj! Volám sa Ana. A ty? Ako sa voláš?',
    focusSk: 'meno (me llamo), pôvod (soy de), teší ma (mucho gusto), lúčenie (hasta luego, nos vemos).',
  },
  {
    slug: 'kaviaren',
    titleSk: 'V kaviarni',
    descriptionSk: 'Objednaj si kávu, čaj alebo vodu a zdvorilo poďakuj.',
    maxCefr: 'A1',
    allowedGrammar: ['querer', 'tener', 'polite_expressions', 'articles'],
    openingEs: '¡Hola! Bienvenido al café. ¿Qué quieres beber?',
    openingSk: 'Ahoj! Vitaj v kaviarni. Čo si dáš na pitie?',
    focusSk: 'chcieť (quiero), káva (café), čaj (té), voda (agua), prosím (por favor), ďakujem (gracias).',
  },
  {
    slug: 'restauracia',
    titleSk: 'V reštaurácii',
    descriptionSk: 'Objednaj si jedlo a vypýtaj si účet.',
    maxCefr: 'A1',
    allowedGrammar: ['querer', 'tener', 'polite_expressions', 'plurals'],
    openingEs: '¡Buenas tardes! ¿Qué quiere comer?',
    openingSk: 'Dobré popoludnie! Čo si dáte jesť?',
    focusSk: 'jesť (comer), piť (beber), chlieb (pan), voda (agua), účet (la cuenta), por favor.',
  },
  {
    slug: 'obchod',
    titleSk: 'V obchode',
    descriptionSk: 'Kúp si jednu vec a opýtaj sa na cenu.',
    maxCefr: 'A1',
    allowedGrammar: ['tener', 'querer', 'polite_expressions', 'numbers'],
    openingEs: '¡Hola! ¿Qué necesita?',
    openingSk: 'Ahoj! Čo potrebujete?',
    focusSk: 'chcieť (quiero), mať (tengo), čísla, cena (¿cuánto cuesta?), poďakovanie.',
  },
  {
    slug: 'cesta',
    titleSk: 'Na ceste',
    descriptionSk: 'Opýtaj sa na cestu a pochop jednoduchú odpoveď.',
    maxCefr: 'A1',
    allowedGrammar: ['estar_locations', 'hay', 'ser', 'origin_de', 'numbers'],
    openingEs: '¡Hola! ¿Necesitas ayuda? ¿Dónde está la estación?',
    openingSk: 'Ahoj! Potrebuješ pomoc? Kde je stanica?',
    focusSk: 'kde je (dónde está), je/sú (hay), vľavo (a la izquierda), vpravo (a la derecha), rovno (todo recto).',
  },
];

export function scenarioBySlug(slug: string): ConversationScenario | undefined {
  return CONVERSATION_SCENARIOS.find((s) => s.slug === slug);
}
