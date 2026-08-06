import { z } from 'zod';

export const OnboardingInputSchema = z.object({
  languageCode: z.string().min(2).max(8).default('es'),
  cefrLevel: z.enum(['A0', 'A1', 'A2', 'B1', 'B2', 'C1']).default('A0'),
  dailyMinutes: z.number().int().min(5).max(240).default(30),
  mainGoal: z
    .enum(['travel', 'living_in_spain', 'conversation', 'movies_series', 'work', 'general_fluency'])
    .default('general_fluency'),
  spanishVariant: z.enum(['spain', 'latin_america', 'none']).default('spain'),
  nativeLanguage: z.string().min(2).max(16).default('sk'),
});
