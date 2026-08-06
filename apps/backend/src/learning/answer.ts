export function normalizeAnswer(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[¿?!¡.,;:«»"'()]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/(^|\s)el\s/, ' ')
    .replace(/(^|\s)la\s/, ' ')
    .trim();
}

export function isCorrectAnswer(userAnswer: string, correctAnswer: string): boolean {
  const u = normalizeAnswer(userAnswer);
  if (!u) return false;
  const accepted = correctAnswer.split('|').map((a) => normalizeAnswer(a));
  return accepted.includes(u);
}
