import type {
  AICompletion,
  AIGenerateOptions,
  AIProvider,
  AIUsageInfo,
} from '../types.js';

/**
 * Deterministic mock provider. Used when AI_PROVIDER=mock (default) so the
 * whole application can be developed, tested and demoed without any paid AI
 * credentials. Every output is schema-shaped (see ai/schemas.ts) and valid.
 *
 * Usage numbers are small fabricated counts so the usage-tracking pipeline is
 * exercised even in mock mode; they are never presented to the learner.
 */

interface Shape {
  [key: string]: unknown;
}

function shapeOf(schema: AIGenerateOptions['responseSchema']): Shape | null {
  if (!schema) return null;
  const s = schema as { _def?: { shape?: () => Shape }; shape?: () => Shape };
  const inner = s._def?.shape?.() ?? s.shape?.();
  return inner ?? null;
}

function has(shape: Shape, ...keys: string[]): boolean {
  return keys.every((k) => k in shape);
}

function pick(prompt: string, words: string[]): string | null {
  const lower = prompt.toLowerCase();
  for (const w of words) {
    if (lower.includes(w.toLowerCase())) return w;
  }
  return null;
}

function exerciseFor(prompt: string, needOptions: boolean) {
  const concept =
    pick(prompt, ['ser_vs_estar', 'SER vs ESTAR', 'sujeto', 'possessives', 'tener', 'gustar', 'querer', 'origin_de', 'estar_locations']) ?? 'ser';
  const vocab = pick(prompt, ['cansado', 'trabajo', 'agua', 'hola', 'llamo', 'casa']) ?? 'Eslovaquia';

  if (needOptions) {
    if (concept.toLowerCase().includes('ser') || concept.toLowerCase().includes('estar')) {
      return {
        type: 'multiple_choice',
        instructionSk: 'Vyber správny tvar slovesa SER alebo ESTAR.',
        sentenceEs: 'Yo ___ de Eslovaquia.',
        options: ['soy', 'estoy', 'eres', 'está'],
        answer: 'soy',
        explanationSk: 'Pri pôvode používame SER, pretože hovoríme o trvalej vlastnosti.',
        grammarConcept: 'ser',
        vocabularyItems: [vocab],
        difficulty: 'easy',
      };
    }
    return {
      type: 'multiple_choice',
      instructionSk: 'Doplň do vety správne slovo.',
      sentenceEs: 'Yo ___ de Eslovaquia.',
      options: ['soy', 'estoy', 'eres', 'es'],
      answer: 'soy',
      explanationSk: 'Používame soy, pretože hovoríme o pôvode.',
      grammarConcept: 'ser',
      vocabularyItems: [vocab],
      difficulty: 'easy',
    };
  }

  if (concept.toLowerCase().includes('tener')) {
    return {
      type: 'fill_blank',
      instructionSk: 'Doplň správny tvar slovesa tener.',
      sentenceEs: 'Yo ___ 30 años.',
      answer: 'tengo',
      explanationSk: 'Pri veku používame TENER: tengo 30 años.',
      grammarConcept: 'tener',
      vocabularyItems: [vocab],
      difficulty: 'easy',
    };
  }
  return {
    type: 'fill_blank',
    instructionSk: 'Doplň správny tvar slovesa.',
    sentenceEs: 'Yo ___ de Eslovaquia.',
    answer: 'soy',
    explanationSk: 'Pri pôvode používame SER: Soy de Eslovaquia.',
    grammarConcept: 'ser',
    vocabularyItems: [vocab],
    difficulty: 'easy',
  };
}

function tutorReplyFor(prompt: string) {
  const lower = prompt.toLowerCase();
  if (lower.includes('ser') && lower.includes('estoy')) {
    return {
      replySk: '„Estoy cansado" znamená „Som unavený". Používame ESTAR, pretože opisujeme aktuálny stav, ktorý sa môže zmeniť.',
      spanishExample: 'Estoy cansado.',
      exampleTranslationSk: 'Som unavený.',
    };
  }
  if (lower.includes('la casa') || lower.includes('el coche')) {
    return {
      replySk: 'Rod podstatných mien sa v španielčine učí naspamäť: la casa (dom, ženský rod) a el coche (auto, mužský rod). Pomôž si členom — väčšinou končiace na -a sú ženský rod (la) a na -o mužský rod (el).',
      spanishExample: 'La casa es bonita. El coche es rojo.',
      exampleTranslationSk: 'Dom je pekný. Auto je červené.',
    };
  }
  return {
    replySk: 'Dobrá otázka! Stručne vysvetlím: v tejto vete používame sloveso v správnom tvare podľa osoby (ja = yo). Skús sa riadiť príkladom nižšie.',
    spanishExample: 'Yo soy de Eslovaquia.',
    exampleTranslationSk: 'Som zo Slovenska.',
    followUpQuestionSk: 'Ako by si povedal: „Som zo Španielska"?',
  };
}

function conversationTurnFor(prompt: string) {
  const lower = prompt.toLowerCase();
  if (lower.includes('predstavenie') || lower.includes('predstavovanie') || lower.includes('presentación')) {
    return {
      spanish: '¡Hola! ¿Cómo te llamas?',
      translationSk: 'Ahoj! Ako sa voláš?',
      kind: 'question',
      hintsSk: ['Me llamo…', 'Soy…', 'Mucho gusto.'],
    };
  }
  if (lower.includes('kaviareň') || lower.includes('café')) {
    return {
      spanish: 'Hola, ¿qué quieres beber?',
      translationSk: 'Ahoj, čo chceš piť?',
      kind: 'question',
      hintsSk: ['Quiero…', 'Un café, por favor.', 'Agua, por favor.'],
    };
  }
  if (lower.includes('reštaurácia') || lower.includes('comer')) {
    return {
      spanish: '¿Qué quiere comer?',
      translationSk: 'Čo si dáte jesť?',
      kind: 'question',
      hintsSk: ['Quiero…', 'Un pan, por favor.', 'La cuenta, por favor.'],
    };
  }
  if (lower.includes('obchod') || lower.includes('necesita')) {
    return {
      spanish: '¿Qué necesita?',
      translationSk: 'Čo potrebujete?',
      kind: 'question',
      hintsSk: ['Quiero…', '¿Cuánto cuesta?', 'Gracias.'],
    };
  }
  if (lower.includes('cesta') || lower.includes('estación')) {
    return {
      spanish: '¿Dónde está la estación?',
      translationSk: 'Kde je stanica?',
      kind: 'question',
      hintsSk: ['A la izquierda…', 'A la derecha…', 'Todo recto…'],
    };
  }
  return {
    spanish: '¡Hola! ¿Cómo estás?',
    translationSk: 'Ahoj! Ako sa máš?',
    kind: 'question',
    hintsSk: ['Estoy bien.', 'Muy bien, gracias.', 'Regular.'],
  };
}

function conversationFeedbackFor() {
  return {
    kind: 'correction',
    messageSk: 'Rozumel som ti bez problémov. Pozor na jednu vec: pri veku používame TENER — namiesto „yo soy 30 años" hovoríme „tengo 30 años".',
  };
}

function conversationSummaryFor() {
  return {
    newPhrases: ['Me llamo…', '¿De dónde eres?', 'Soy de…'],
    suggestedReview: 'Zopakuj si predstavovanie: Me llamo, Soy de, Mucho gusto.',
  };
}

function textFor(prompt: string): string {
  const lower = prompt.toLowerCase();
  if (lower.includes('vysvetli') || lower.includes('explain')) {
    return 'SER používame pre trvalé vlastnosti a pôvod. ESTAR pre aktuálny stav a polohu. Napríklad: „Soy de Eslovaquia" (pôvod) a „Estoy cansado" (aktuálny stav).';
  }
  return 'Toto je odpoveď AI učiteľa v mock režime. Konkrétny obsah sa objaví po pripojení reálneho AI poskytovateľa.';
}

const CONCEPT_WORDS = ['ser', 'tener', 'gustar', 'querer', 'estar', 'presente', 'articles'];

function usageFor(prompt: string): AIUsageInfo {
  return {
    inputTokens: Math.ceil(prompt.length / 4),
    outputTokens: 60,
  };
}

function buildStructured(opts: AIGenerateOptions): unknown | null {
  const shape = shapeOf(opts.responseSchema);
  if (!shape) return null;
  if (has(shape, 'exercises')) {
    return { exercises: [exerciseFor(opts.prompt, true), exerciseFor(opts.prompt, false)] };
  }
  if (has(shape, 'type', 'instructionSk')) {
    return exerciseFor(opts.prompt, false);
  }
  if (has(shape, 'replySk')) {
    return tutorReplyFor(opts.prompt);
  }
  if (has(shape, 'spanish', 'translationSk')) {
    return conversationTurnFor(opts.prompt);
  }
  if (has(shape, 'messageSk')) {
    return conversationFeedbackFor();
  }
  if (has(shape, 'newPhrases')) {
    return conversationSummaryFor();
  }
  return null;
}

export class MockAIProvider implements AIProvider {
  readonly name = 'mock';

  async generateCompletion(opts: AIGenerateOptions): Promise<AICompletion> {
    const structured = buildStructured(opts);
    const text = structured !== null ? JSON.stringify(structured) : textFor(opts.prompt);
    // Small pause keeps client/rate-limit behaviour realistic.
    await new Promise((r) => setTimeout(r, 5));
    return { text, usage: usageFor(opts.prompt) };
  }

  async *streamCompletion(opts: AIGenerateOptions): AsyncIterable<string> {
    const { text } = await this.generateCompletion(opts);
    const chunkSize = 24;
    for (let i = 0; i < text.length; i += chunkSize) {
      yield text.slice(i, i + chunkSize);
    }
  }

  /** Deterministic vocabulary used to make mock exercises conceptually relevant. */
  conceptWords(): string[] {
    return CONCEPT_WORDS;
  }
}
