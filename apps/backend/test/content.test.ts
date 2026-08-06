import { describe, expect, it } from 'vitest';
import { A0_COURSE } from '../src/db/seed/a0.js';
import { A1_COURSE } from '../src/db/seed/a1.js';

describe('curriculum content validation', () => {
  const a0Lessons = A0_COURSE.modules.flatMap((m) => m.lessons);
  const a1Lessons = A1_COURSE.modules.flatMap((m) => m.lessons);
  const allLessons = [...a0Lessons, ...a1Lessons];

  it('has 16 A0 lessons and 8 A1 lessons', () => {
    expect(a0Lessons).toHaveLength(16);
    expect(a1Lessons).toHaveLength(8);
  });

  it('has contiguous unique day numbers 1..24', () => {
    const days = allLessons.map((l) => l.day).sort((a, b) => a - b);
    expect(days).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));
  });

  it('has unique module slugs per course', () => {
    for (const course of [A0_COURSE, A1_COURSE]) {
      const slugs = course.modules.map((m) => m.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
    }
  });

  it('every lesson has vocabulary and exercises', () => {
    for (const lesson of allLessons) {
      expect(lesson.vocab.length, lesson.title).toBeGreaterThanOrEqual(4);
      expect(lesson.exercises.length, lesson.title).toBeGreaterThanOrEqual(4);
    }
  });

  it('vocabulary keys are unique within each lesson', () => {
    for (const lesson of allLessons) {
      const keys = lesson.vocab.map((v) => v.spanish.toLowerCase());
      expect(new Set(keys).size, lesson.title).toBe(keys.length);
    }
  });

  it('every exercise that sets vocab references a word in the same lesson', () => {
    for (const lesson of allLessons) {
      const keys = new Set(lesson.vocab.map((v) => v.spanish.toLowerCase()));
      for (const ex of lesson.exercises) {
        if (ex.vocab) {
          expect(keys.has(ex.vocab.toLowerCase()), `${lesson.title} / ${ex.prompt}`).toBe(true);
        }
      }
    }
  });

  it('every multiple_choice exercise includes the correct answer in options', () => {
    for (const lesson of allLessons) {
      for (const ex of lesson.exercises) {
        if (ex.type === 'multiple_choice') {
          expect(ex.options, `${lesson.title} / ${ex.prompt}`).toBeDefined();
          expect(ex.options!.map((o) => o.toLowerCase()), `${lesson.title} / ${ex.prompt}`).toContain(
            ex.correct.toLowerCase(),
          );
        }
      }
    }
  });

  it('lesson 1 works for a zero-Spanish learner', () => {
    const first = a0Lessons[0];
    expect(first.title).toBe('Prvé slová');
    expect(first.day).toBe(1);
    const types = new Set(first.exercises.map((e) => e.type));
    expect(types).toContain('multiple_choice');
    expect(types).toContain('translation');
    expect(types).toContain('fill_blank');
  });

  it('lessons 1-7 teach the tiny intro conversation', () => {
    const week1 = allLessons.filter((l) => l.day <= 7);
    const words = new Set(week1.flatMap((l) => l.vocab.map((v) => v.spanish.toLowerCase())));
    for (const required of ['hola', 'me llamo', 'soy de', 'mucho gusto', 'igualmente']) {
      expect(words.has(required), `missing in week 1: ${required}`).toBe(true);
    }
  });

  it('every lesson has at most one grammar concept with unique slug', () => {
    const slugs = new Set<string>();
    for (const lesson of allLessons) {
      if (lesson.grammar) {
        expect(slugs.has(lesson.grammar.slug), `duplicate grammar slug ${lesson.grammar.slug}`).toBe(false);
        slugs.add(lesson.grammar.slug);
      }
    }
  });
});
