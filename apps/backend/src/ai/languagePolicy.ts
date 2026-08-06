/**
 * CEFR-aware language policy for AI teacher/explanation content.
 *
 * Beginner levels explain primarily in Slovak and gradually move towards
 * target-language immersion at higher levels. This is guidance for prompts,
 * not a rigid token ratio.
 */
const POLICY: Record<string, string> = {
  A0: 'Rozprávaj s učiacim sa prevažne po slovensky (približne 80–90 % slovenčina, 10–20 % španielčina). Španielske príklady buď krátke a jednoduché.',
  A1: 'Vysvetľuj po slovensky (približne 70 % slovenčina, 30 % španielčina). Používaj krátke španielske príklady s prekladom.',
  A2: 'Vyvážene po slovensky aj po španielsky (približne 50/50).',
  B1: 'Vysvetľuj prevažne po španielsky (približne 30 % slovenčina, 70 % španielčina), slovenčinu používaj len pri kľúčových pojmoch.',
  B2: 'Rozprávaj primárne po španielsky. Slovenčinu použi len v prípade naozaj nevyhnutnej podpory.',
  C1: 'Rozprávaj takmer výhradne po španielsky.',
};

export function languagePolicy(cefr: string): string {
  return POLICY[cefr] ?? POLICY.A1;
}

/** Rough CEFR order used to cap conversation language complexity. */
export const CEFR_RANK: Record<string, number> = { A0: 0, A1: 1, A2: 2, B1: 3, B2: 4, C1: 5 };

export function maxLevelFor(cefr: string): string {
  return cefr in CEFR_RANK ? cefr : 'A1';
}
