import { useColorScheme } from 'react-native';

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceAlt: string;
  primary: string;
  primarySoft: string;
  teal: string;
  text: string;
  textMuted: string;
  border: string;
  success: string;
  danger: string;
  warning: string;
  tabBar: string;
  cardShadow: string;
}

const light: ThemeColors = {
  background: '#F6F8FC',
  surface: '#FFFFFF',
  surfaceAlt: '#EEF2F8',
  primary: '#4F46E5',
  primarySoft: '#E0E7FF',
  teal: '#0D9488',
  text: '#0F172A',
  textMuted: '#64748B',
  border: '#E2E8F0',
  success: '#16A34A',
  danger: '#DC2626',
  warning: '#D97706',
  tabBar: '#FFFFFF',
  cardShadow: '#0F172A',
};

const dark: ThemeColors = {
  background: '#0B1220',
  surface: '#151E31',
  surfaceAlt: '#1D2940',
  primary: '#818CF8',
  primarySoft: '#2A2F5A',
  teal: '#2DD4BF',
  text: '#F1F5F9',
  textMuted: '#94A3B8',
  border: '#26334D',
  success: '#4ADE80',
  danger: '#F87171',
  warning: '#FBBF24',
  tabBar: '#101827',
  cardShadow: '#000000',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
};

export function useTheme() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  return {
    colors: isDark ? dark : light,
    isDark,
    spacing,
    radius,
  };
}
