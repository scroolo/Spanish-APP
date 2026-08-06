import type { ExerciseType } from '@spanish/shared';

export interface SeedExample {
  spanish: string;
  translation: string;
}

export interface SeedGrammar {
  slug: string;
  title: string;
  explanation: string;
  rule: string;
  examples: SeedExample[];
}

export interface SeedVocab {
  spanish: string;
  translation: string;
  pronunciation: string;
  example: string;
  exampleTranslation: string;
  pos?: string;
  category?: string;
}

export interface SeedExercise {
  type: ExerciseType;
  prompt: string;
  options?: string[];
  correct: string;
  explanation?: string;
  hint?: string;
  vocab?: string;
  grammar?: string;
  /** Spanish text that gets synthesized to audio (listening/speaking exercises). */
  audioText?: string;
}

export interface SeedLesson {
  title: string;
  description: string;
  day: number;
  minutes: number;
  grammar?: SeedGrammar;
  vocab: SeedVocab[];
  exercises: SeedExercise[];
}

export interface SeedModule {
  slug: string;
  title: string;
  description: string;
  lessons: SeedLesson[];
}

export interface SeedCourse {
  cefrLevel: 'A0' | 'A1' | 'A2' | 'B1' | 'B2' | 'C1';
  name: string;
  modules: SeedModule[];
}
