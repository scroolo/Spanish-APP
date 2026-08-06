import { create } from 'zustand';
import type { CefrLevel, MainGoal, SpanishVariant } from '@spanish/shared';

interface OnboardingDraft {
  cefrLevel: CefrLevel;
  dailyMinutes: number;
  mainGoal: MainGoal;
  spanishVariant: SpanishVariant;
  nativeLanguage: string;
  setLevel: (v: CefrLevel) => void;
  setDuration: (v: number) => void;
  setGoal: (v: MainGoal) => void;
  setVariant: (v: SpanishVariant) => void;
  setNative: (v: string) => void;
}

export const useOnboarding = create<OnboardingDraft>()((set) => ({
  cefrLevel: 'A0',
  dailyMinutes: 30,
  mainGoal: 'conversation',
  spanishVariant: 'spain',
  nativeLanguage: 'sk',
  setLevel: (cefrLevel) => set({ cefrLevel }),
  setDuration: (dailyMinutes) => set({ dailyMinutes }),
  setGoal: (mainGoal) => set({ mainGoal }),
  setVariant: (spanishVariant) => set({ spanishVariant }),
  setNative: (nativeLanguage) => set({ nativeLanguage }),
}));
