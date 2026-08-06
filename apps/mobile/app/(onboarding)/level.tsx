import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/src/components/Button';
import { OptionCard } from '@/src/components/OptionCard';
import { Screen } from '@/src/components/Screen';
import { api } from '@/src/api/client';
import { useTheme } from '@/src/theme';
import { useOnboarding } from '@/src/store/onboarding';
import { useI18n } from '@/src/i18n';

export default function LevelScreen() {
  const { colors, spacing } = useTheme();
  const { t } = useI18n();
  const level = useOnboarding((s) => s.cefrLevel);
  const setLevel = useOnboarding((s) => s.setLevel);
  const { data } = useQuery({ queryKey: ['onboarding-options'], queryFn: () => api().onboardingOptions() });

  return (
    <Screen>
      <ScrollView contentContainerStyle={[styles.content, { padding: spacing.xl }]}>
        <Text style={[styles.title, { color: colors.text }]}>{t('onboarding.levelTitle')}</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          {t('onboarding.levelSub')}
        </Text>
        <View style={styles.list}>
          {(data?.levels ?? []).map((opt) => (
            <OptionCard
              key={opt.value}
              title={opt.label}
              subtitle={opt.description}
              selected={level === opt.value}
              onPress={() => setLevel(opt.value)}
            />
          ))}
        </View>
        <Button label={t('onboarding.continue')} onPress={() => router.push('/(onboarding)/duration')} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, gap: 12 },
  title: { fontSize: 26, fontWeight: '800' },
  subtitle: { fontSize: 15, color: '#64748B' },
  list: { gap: 10, marginTop: 8, flex: 1 },
});
