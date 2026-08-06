import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import type { UserDto, UserLanguageDto } from '@spanish/shared';
import { api, initApi } from '../api/client';

/**
 * Backend base URL.
 *
 * `EXPO_PUBLIC_API_URL` is inlined at bundle/build time (see `apps/mobile/.env.example`),
 * so a preview/production APK must be built with the reachable API URL baked in
 * (LAN IP for internal testing, or the deployed backend URL). In development the
 * emulator loopback (Android `10.0.2.2`, iOS `localhost`) is used automatically.
 * A release build without the env var intentionally resolves to `''` so requests
 * fail loudly instead of silently targeting the emulator address on real devices.
 */
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? (__DEV__ ? (Platform.OS === 'android' ? 'http://10.0.2.2:4000/api' : 'http://localhost:4000/api') : '');

export type AuthStatus = 'loading' | 'guest' | 'onboarding' | 'authed';

interface AuthState {
  token: string | null;
  user: UserDto | null;
  language: UserLanguageDto | null;
  status: AuthStatus;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName?: string) => Promise<void>;
  setLanguage: (language: UserLanguageDto) => void;
  refresh: () => Promise<void>;
  logout: () => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      language: null,
      status: 'loading',

      login: async (email, password) => {
        const res = await api().login(email, password);
        set({
          token: res.token,
          user: res.user,
          language: res.language,
          status: res.language ? 'authed' : 'onboarding',
        });
      },

      register: async (email, password, displayName) => {
        const res = await api().register(email, password, displayName);
        set({
          token: res.token,
          user: res.user,
          language: res.language,
          status: 'onboarding',
        });
      },

      setLanguage: (language) => set({ language, status: 'authed' }),

      refresh: async () => {
        const { token } = get();
        if (!token) {
          set({ status: 'guest' });
          return;
        }
        try {
          const { user, language } = await api().me();
          set({ user, language, status: language ? 'authed' : 'onboarding' });
        } catch {
          set({ status: 'guest' });
        }
      },

      logout: () => set({ token: null, user: null, language: null, status: 'guest' }),
    }),
    {
      name: 'spanielcina.auth',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        language: state.language,
      }),
    },
  ),
);

export function setupApi() {
  initApi(API_URL, () => useAuth.getState().token);
}
