import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Link, router } from 'expo-router';
import { Button } from '@/src/components/Button';
import { Screen } from '@/src/components/Screen';
import { useTheme } from '@/src/theme';
import { useAuth } from '@/src/store/auth';
import { useI18n } from '@/src/i18n';
import type { ApiError } from '@/src/api/client';

export default function LoginScreen() {
  const { colors, spacing } = useTheme();
  const { t } = useI18n();
  const login = useAuth((s) => s.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email || !password) {
      setError(t('auth.fillFields'));
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await login(email.trim(), password);
      router.replace(useAuth.getState().language ? '/(tabs)' : '/(onboarding)/level');
    } catch (e) {
      const err = e as ApiError;
      setError(err.code === 'NETWORK' ? err.message : t('auth.badCredentials'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={[styles.content, { padding: spacing.xl }]}>
          <Text style={[styles.title, { color: colors.text }]}>{t('auth.welcomeBack')}</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            {t('auth.welcomeBackSub')}
          </Text>

          <TextInput
            style={[
              styles.input,
              {
                color: colors.text,
                borderColor: colors.border,
                backgroundColor: colors.surface,
                borderRadius: 12,
              },
            ]}
            placeholder={t('auth.email')}
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={[
              styles.input,
              {
                color: colors.text,
                borderColor: colors.border,
                backgroundColor: colors.surface,
                borderRadius: 12,
              },
            ]}
            placeholder={t('auth.password')}
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

          <Button label={t('auth.login')} onPress={submit} loading={loading} style={{ marginTop: spacing.lg }} />

          <View style={styles.footer}>
            <Text style={{ color: colors.textMuted }}>{t('auth.noAccount')} </Text>
            <Link href="/(auth)/register" style={{ color: colors.primary, fontWeight: '700' }}>
              {t('auth.signup')}
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', gap: 14 },
  title: { fontSize: 30, fontWeight: '800' },
  subtitle: { fontSize: 16, marginBottom: 8 },
  input: {
    height: 54,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  error: { fontSize: 14 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 16 },
});
