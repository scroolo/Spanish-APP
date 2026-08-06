import { create } from 'zustand';
import { MESSAGES, type Locale, type MessageKey } from './messages';

interface I18nState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const useI18nStore = create<I18nState>((set) => ({
  locale: 'sk-SK',
  setLocale: (locale) => set({ locale }),
}));

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    params[key] !== undefined ? String(params[key]) : `{${key}}`,
  );
}

export function translate(key: MessageKey, params?: Record<string, string | number>): string {
  const { locale } = useI18nStore.getState();
  const template = MESSAGES[locale]?.[key] ?? MESSAGES['sk-SK'][key] ?? key;
  return interpolate(template, params);
}

export type { MessageKey, Locale } from './messages';

export function useI18n() {
  const locale = useI18nStore((s) => s.locale);
  return {
    locale,
    t: (key: MessageKey, params?: Record<string, string | number>) => {
      const template = MESSAGES[locale]?.[key] ?? MESSAGES['sk-SK'][key] ?? key;
      return interpolate(template, params);
    },
  };
}
