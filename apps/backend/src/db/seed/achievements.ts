export interface AchievementSeed {
  code: string;
  title: string;
  description: string;
  icon: string;
}

export const ACHIEVEMENTS: AchievementSeed[] = [
  { code: 'first_lesson', title: 'Prvé kroky', description: 'Dokonči svoju prvú lekciu.', icon: '🌱' },
  { code: 'first_conversation', title: 'Prvý rozhovor', description: 'Dokonči lekciu s rozhovorom.', icon: '💬' },
  { code: 'streak_7', title: 'Týždeň v kuse', description: 'Uč sa 7 dní po sebe.', icon: '🔥' },
  { code: 'streak_30', title: 'Tridsaťdňový hrdina', description: 'Uč sa 30 dní po sebe.', icon: '🏆' },
  { code: 'words_50', title: 'Prvých 50 slov', description: 'Nauč sa 50 španielskych slov.', icon: '📖' },
  { code: 'words_100', title: '100 naučených slov', description: 'Nauč sa 100 španielskych slov.', icon: '✨' },
  { code: 'lessons_10', title: 'Desať lekcií', description: 'Dokonči 10 lekcií.', icon: '🎯' },
  { code: 'level_a1', title: 'Vitaj v A1', description: 'Dosiahni úroveň A1.', icon: '🚀' },
];
