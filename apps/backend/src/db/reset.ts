import 'dotenv/config';
import { config } from '../config.js';
import { db } from './client.js';

if (config.isProduction) {
  console.error('Reset: refusing to run against a production environment (NODE_ENV=production).');
  console.error('Reset: point DATABASE_URL at a scratch/dev database and unset NODE_ENV=production to proceed.');
  process.exit(1);
}
import {
  achievements,
  courses,
  exerciseAttempts,
  exercises,
  grammarConcepts,
  lessonProgress,
  lessons,
  mistakes,
  modules,
  userAchievements,
  userGrammarProgress,
  userLanguages,
  userStatistics,
  userVocabulary,
  users,
  vocabularyItems,
  weaknesses,
} from './schema.js';

async function reset() {
  await db.delete(userAchievements);
  await db.delete(weaknesses);
  await db.delete(mistakes);
  await db.delete(exerciseAttempts);
  await db.delete(userVocabulary);
  await db.delete(userGrammarProgress);
  await db.delete(lessonProgress);
  await db.delete(userStatistics);
  await db.delete(userLanguages);
  await db.delete(users);
  await db.delete(exercises);
  await db.delete(vocabularyItems);
  await db.delete(grammarConcepts);
  await db.delete(lessons);
  await db.delete(modules);
  await db.delete(courses);
  await db.delete(achievements);
  console.log('Reset: all learner data and curriculum cleared.');
}

reset()
  .then(async () => {
    await import('./seed.js');
  })
  .catch((err) => {
    console.error('Reset failed:', err);
    process.exit(1);
  });
