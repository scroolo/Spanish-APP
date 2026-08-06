import { describe, expect, it } from 'vitest';
import { isCorrectAnswer, normalizeAnswer } from '../src/learning/answer.js';

describe('normalizeAnswer', () => {
  it('lowercases and trims', () => {
    expect(normalizeAnswer('  HOLA  ')).toBe('hola');
  });

  it('strips accents so typing without diacritics still matches', () => {
    expect(normalizeAnswer('sí')).toBe('si');
    expect(normalizeAnswer('Sí')).toBe('si');
  });

  it('removes punctuation', () => {
    expect(normalizeAnswer('¿Cómo estás?')).toBe('como estas');
    expect(normalizeAnswer('¡Hola!')).toBe('hola');
  });

  it('collapses whitespace', () => {
    expect(normalizeAnswer('buenos   días')).toBe('buenos dias');
  });
});

describe('isCorrectAnswer', () => {
  it('matches ignoring case and accents', () => {
    expect(isCorrectAnswer('si', 'sí')).toBe(true);
    expect(isCorrectAnswer('SI', 'sí')).toBe(true);
  });

  it('accepts multiple correct alternatives separated by |', () => {
    expect(isCorrectAnswer('estoy bien', 'estoy bien|me encuentro bien')).toBe(true);
    expect(isCorrectAnswer('me encuentro bien', 'estoy bien|me encuentro bien')).toBe(true);
  });

  it('rejects wrong answers', () => {
    expect(isCorrectAnswer('adiós', 'hola')).toBe(false);
  });

  it('rejects empty input', () => {
    expect(isCorrectAnswer('', 'hola')).toBe(false);
    expect(isCorrectAnswer('   ', 'hola')).toBe(false);
  });
});
