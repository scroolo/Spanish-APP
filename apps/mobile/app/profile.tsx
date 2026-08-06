import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/src/components/Button';
import { Card } from '@/src/components/Card';
import { Screen } from '@/src/components/Screen';
import { useTheme } from '@/src/theme';
import { useAuth } from '@/src/store/auth';
import { useI18n } from '@/src/i18n';

export default function ProfileScreen() {
  const { colors, spacing } = useTheme();
  const { t } = useI18n();
  const user = useAuth((s) => s.user);
  const language = useAuth((s) => s.language);
  const logout = useAuth((s) => s.logout);

  const rows = [
    { label: t('profile.name'), value: user?.displayName ?? '—' },
    { label: t('profile.email'), value: user?.email ?? '' },
    { label: t('profile.level'), value: language?.cefrLevel ?? '—' },
    { label: t('profile.goal'), value: language?.mainGoal ?? '—' },
    { label: t('profile.variant'), value: language?.spanishVariant ?? '—' },
    { label: t('profile.dailyGoal'), value: language ? t('profile.minutes', { minutes: language.dailyMinutes }) : '—' },
  ];

  return (
    <Screen>
      <ScrollView contentContainerStyle={[styles.content, { padding: spacing.lg }]}>
        <Text style={[styles.title, { color: colors.text }]}>{t('profile.title')}</Text>
        <Card>
          {rows.map((r) => (
            <View key={r.label} style={styles.row}>
              <Text style={{ color: colors.textMuted }}>{r.label}</Text>
              <Text style={{ color: colors.text, fontWeight: '700' }}>{r.value}</Text>
            </View>
          ))}
        </Card>
        <Button
          label={t('auth.logout')}
          variant="danger"
          onPress={() => {
            logout();
            router.replace('/(auth)/login');
          }}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14 },
  title: { fontSize: 26, fontWeight: '800' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
});
