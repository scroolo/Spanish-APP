import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, useColorScheme } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { DefaultTheme, DarkTheme, ThemeProvider } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useTheme } from '@/src/theme';
import { setupApi, useAuth } from '@/src/store/auth';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

export default function RootLayout() {
  const { colors } = useTheme();
  const scheme = useColorScheme();
  const status = useAuth((s) => s.status);
  const refresh = useAuth((s) => s.refresh);

  useEffect(() => {
    setupApi();
    void refresh();
  }, [refresh]);

  if (status === 'loading') {
    return (
      <GestureHandlerRootView style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </GestureHandlerRootView>
    );
  }

  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.primary,
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
    },
  };

  return (
    <GestureHandlerRootView style={styles.root}>
      <ThemeProvider value={navTheme}>
        <QueryClientProvider client={queryClient}>
          <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(onboarding)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="lesson/[id]" options={{ headerShown: true, title: 'Lekcia' }} />
            <Stack.Screen name="ai-tutor" options={{ headerShown: true, title: 'AI učiteľ' }} />
            <Stack.Screen name="profile" options={{ presentation: 'modal', title: 'Profil' }} />
          </Stack>
        </QueryClientProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
