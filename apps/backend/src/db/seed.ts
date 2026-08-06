import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db } from './client.js';
import {
  achievements,
  courses,
  exercises,
  grammarConcepts,
  languages,
  lessons,
  modules,
  vocabularyItems,
} from './schema.js';
import { A0_COURSE } from './seed/a0.js';
import { A1_COURSE } from './seed/a1.js';
import { ACHIEVEMENTS } from './seed/achievements.js';
import type { SeedCourse } from './seed/types.js';

async function seedAchievements() {
  const existing = await db.select().from(achievements);
  if (existing.length > 0) {
    console.log(`Seed: achievements present (${existing.length}), skipping.`);
    return;
  }
  await db.insert(achievements).values(ACHIEVEMENTS);
  console.log(`Seed: inserted ${ACHIEVEMENTS.length} achievements.`);
}

async function seedCurriculum() {
  const existing = await db.select().from(languages).where(eq(languages.code, 'es'));
  let lang = existing[0];
  if (!lang) {
    const [inserted] = await db
      .insert(languages)
      .values({ code: 'es', name: 'Španielčina', status: 'active', sortOrder: 1 })
      .returning();
    lang = inserted;
    console.log('Seed: inserted language es (Španielčina).');
  }

  const existingCourses = await db.select().from(courses).where(eq(courses.languageId, lang.id));
  if (existingCourses.length > 0) {
    console.log('Seed: curriculum already present, skipping content insert.');
    return;
  }

  const coursesToSeed: SeedCourse[] = [A0_COURSE, A1_COURSE];

  for (const courseDef of coursesToSeed) {
    const [course] = await db
      .insert(courses)
      .values({
        languageId: lang.id,
        name: courseDef.name,
        cefrLevel: courseDef.cefrLevel,
        sortOrder: courseDef.cefrLevel === 'A0' ? 0 : 1,
      })
      .returning();

    let moduleOrder = 0;
    for (const moduleDef of courseDef.modules) {
      const [module] = await db
        .insert(modules)
        .values({
          courseId: course.id,
          slug: moduleDef.slug,
          title: moduleDef.title,
          description: moduleDef.description,
          sortOrder: moduleOrder++,
        })
        .returning();

      let lessonOrder = 0;
      for (const lessonDef of moduleDef.lessons) {
        const [lesson] = await db
          .insert(lessons)
          .values({
            moduleId: module.id,
            title: lessonDef.title,
            description: lessonDef.description,
            dayNumber: lessonDef.day,
            sortOrder: lessonOrder++,
            estimatedMinutes: lessonDef.minutes,
          })
          .returning();

        const vocabIds = new Map<string, string>();

        let vocabOrder = 0;
        for (const v of lessonDef.vocab) {
          const [inserted] = await db
            .insert(vocabularyItems)
            .values({
              languageId: lang.id,
              moduleId: module.id,
              lessonId: lesson.id,
              spanish: v.spanish,
              translation: v.translation,
              pronunciation: v.pronunciation,
              exampleSentence: v.example,
              exampleTranslation: v.exampleTranslation,
              partOfSpeech: v.pos ?? null,
              category: v.category ?? 'general',
              sortOrder: vocabOrder++,
            })
            .returning();
          vocabIds.set(v.spanish.toLowerCase(), inserted.id);
        }

        let grammarId: string | null = null;
        if (lessonDef.grammar) {
          const g = lessonDef.grammar;
          const [inserted] = await db
            .insert(grammarConcepts)
            .values({
              languageId: lang.id,
              moduleId: module.id,
              slug: g.slug,
              title: g.title,
              explanation: g.explanation,
              rule: g.rule,
              examples: g.examples,
              sortOrder: 0,
            })
            .returning();
          grammarId = inserted.id;
        }

        let exerciseOrder = 0;
        for (const ex of lessonDef.exercises) {
          const vocabId = ex.vocab ? vocabIds.get(ex.vocab.toLowerCase()) ?? null : null;
          await db.insert(exercises).values({
            lessonId: lesson.id,
            type: ex.type,
            prompt: ex.prompt,
            options: ex.options ?? null,
            correctAnswer: ex.correct,
            explanation: ex.explanation ?? null,
            hint: ex.hint ?? null,
            vocabItemId: vocabId,
            grammarConceptId: ex.grammar ? grammarId : null,
            audioText: ex.audioText ?? null,
            sortOrder: exerciseOrder++,
          });
        }
      }
    }
  }
  console.log('Seed: curriculum inserted (A0 + A1).');
}

async function main() {
  try {
    await seedAchievements();
    await seedCurriculum();
    console.log('Seed: done.');
    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  }
}

main();
