import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/src/components/Button';
import { Card } from '@/src/components/Card';
import { Screen } from '@/src/components/Screen';
import { api, type ApiError } from '@/src/api/client';
import { useTheme } from '@/src/theme';
import { useOnboarding } from '@/src/store/onboarding';
import { useAuth } from '@/src/store/auth';
import { useI18n } from '@/src/i18n';

export default function SummaryScreen() {
  const { colors, spacing } = useTheme();
  const { t } = useI18n();
  const draft = useOnboarding();
  const setLanguage = useAuth((s) => s.setLanguage);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { data } = useQuery({ queryKey: ['onboarding-options'], queryFn: () => api().onboardingOptions() });

  const labelOf = <T,>(list: { value: T; label: string }[] | undefined, value: T) =>
    list?.find((o) => o.value === value)?.label ?? String(value);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await api().saveOnboarding({
        languageCode: 'es',
        cefrLevel: draft.cefrLevel,
        dailyMinutes: draft.dailyMinutes,
        mainGoal: draft.mainGoal,
        spanishVariant: draft.spanishVariant,
        nativeLanguage: draft.nativeLanguage,
      });
      setLanguage(res.language);
      router.replace('/(tabs)');
    } catch (e) {
      const err = e as ApiError;
      setError(err.code === 'NETWORK' ? err.message : t('error.tryAgain'));
    } finally {
      setSaving(false);
    }
  };

  const rows: { label: string; value: string }[] = [
    { label: t('onboarding.level'), value: labelOf(data?.levels, draft.cefrLevel) },
    { label: t('onboarding.dailyTime'), value: labelOf(data?.durations, draft.dailyMinutes) },
    { label: t('onboarding.goal'), value: labelOf(data?.goals, draft.mainGoal) },
    { label: t('onboarding.variant'), value: labelOf(data?.variants, draft.spanishVariant) },
  ];

  return (
    <Screen>
      <ScrollView contentContainerStyle={[styles.content, { padding: spacing.xl }]}>
        <Text style={[styles.title, { color: colors.text }]}>{t('onboarding.summaryTitle')}</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          {t('onboarding.summarySub')}
        </Text>
        <Card>
          {rows.map((r) => (
            <View key={r.label} style={styles.row}>
              <Text style={[styles.rowLabel, { color: colors.textMuted }]}>{r.label}</Text>
              <Text style={[styles.rowValue, { color: colors.text }]}>{r.value}</Text>
            </View>
          ))}
        </Card>
        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
        <Button label={t('onboarding.startLearning')} onPress={save} loading={saving} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, gap: 14 },
  title: { fontSize: 26, fontWeight: '800' },
  subtitle: { fontSize: 15 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  rowLabel: { fontSize: 15 },
  rowValue: { fontSize: 15, fontWeight: '700' },
  error: { fontSize: 14 },
});
