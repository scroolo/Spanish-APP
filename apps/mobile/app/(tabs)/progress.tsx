import { useQuery } from '@tanstack/react-query';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card } from '@/src/components/Card';
import { ProgressBar } from '@/src/components/ProgressBar';
import { Screen } from '@/src/components/Screen';
import { StatTile } from '@/src/components/StatTile';
import { api } from '@/src/api/client';
import { useTheme } from '@/src/theme';
import { useI18n } from '@/src/i18n';

export default function ProgressScreen() {
  const { colors, spacing } = useTheme();
  const { t } = useI18n();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['progress'],
    queryFn: () => api().progress(),
  });

  const v = data?.vocabStats;
  const g = data?.grammarStats;
  const s = data?.studyStats;
  const totalHours = data?.studyStats
    ? Math.round((data.studyStats.totalMinutes / 60) * 10) / 10
    : (data?.totalLearningMinutes ?? 0) > 0
      ? Math.round(((data?.totalLearningMinutes ?? 0) / 60) * 10) / 10
      : 0;

  const skills = data?.skills ?? [];
  const strongest = data?.strongestTopics ?? [];
  const weakest = data?.weakestTopics ?? [];

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[styles.content, { padding: spacing.lg }]}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => refetch()} />}
      >
        <Text style={[styles.title, { color: colors.text }]}>{t('progress.title')}</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          {t('progress.subtitle', { level: data?.cefrLevel ?? '—' })}
        </Text>

        <Card>
          <Text style={[styles.cardLabel, { color: colors.textMuted }]}>{t('progress.toNextLevel')}</Text>
          <ProgressBar percent={data?.levelPercent ?? 0} label={`${t('progress.subtitle', { level: data?.cefrLevel ?? '' })}`} />
        </Card>

        <Card>
          <Text style={[styles.cardLabel, { color: colors.textMuted }]}>{t('progress.vocabulary')}</Text>
          <View style={styles.metricRow}>
            <Text style={{ color: colors.textMuted }}>{t('progress.vocabLearned', { count: v?.learned ?? data?.vocabularyLearned ?? 0 })}</Text>
          </View>
          <View style={styles.metricRow}>
            <Text style={{ color: colors.textMuted }}>{t('progress.vocabStrong', { count: v?.strong ?? 0 })}</Text>
            <Text style={{ color: colors.text }}>{t('progress.vocabNeedsReview', { count: v?.needsReview ?? 0 })}</Text>
          </View>
        </Card>

        <Card>
          <Text style={[styles.cardLabel, { color: colors.textMuted }]}>{t('progress.grammar')}</Text>
          <View style={styles.metricRow}>
            <Text style={{ color: colors.textMuted }}>{t('progress.grammarMastered', { count: g?.mastered ?? 0 })}</Text>
          </View>
          <View style={styles.metricRow}>
            <Text style={{ color: colors.textMuted }}>{t('progress.grammarLearning', { count: g?.learning ?? 0 })}</Text>
            <Text style={{ color: colors.text }}>{t('progress.grammarWeak', { count: g?.weak ?? 0 })}</Text>
          </View>
        </Card>

        <View style={styles.statsRow}>
          <StatTile icon="🔥" value={String(s?.currentStreak ?? 0)} label={t('home.streakDays')} />
          <StatTile icon="⏱️" value={String(totalHours)} label="h" />
          <StatTile icon="✅" value={String(s?.lessonsCompleted ?? data?.lessonsCompleted ?? 0)} label={t('home.lessons')} />
        </View>

        <Card>
          <Text style={[styles.cardLabel, { color: colors.textMuted }]}>{t('progress.skills')}</Text>
          {skills.map((skill) => (
            <ProgressBar key={skill.label} label={skill.label} percent={skill.percent} />
          ))}
        </Card>

        {strongest.length > 0 ? (
          <Card>
            <Text style={[styles.cardLabel, { color: colors.teal }]}>{t('progress.strongest')}</Text>
            {strongest.map((topic) => (
              <View key={topic.label} style={styles.topicRow}>
                <Text style={{ color: colors.text }}>{topic.label}</Text>
                <Text style={{ color: colors.textMuted }}>{t('progress.accuracy', { accuracy: topic.percent })}</Text>
              </View>
            ))}
          </Card>
        ) : null}

        {weakest.length > 0 ? (
          <Card>
            <Text style={[styles.cardLabel, { color: colors.danger }]}>{t('progress.weakest')}</Text>
            {weakest.map((topic) => (
              <View key={topic.label} style={styles.topicRow}>
                <Text style={{ color: colors.text }}>{topic.label}</Text>
                <Text style={{ color: colors.textMuted }}>{t('progress.accuracy', { accuracy: topic.percent })}</Text>
              </View>
            ))}
          </Card>
        ) : null}

        {(data?.weaknesses ?? []).length > 0 ? (
          <Card>
            <Text style={[styles.cardLabel, { color: colors.danger }]}>{t('progress.weaknesses')}</Text>
            {data!.weaknesses.map((w) => (
              <View key={w.grammarTitle} style={styles.weakRow}>
                <Text style={{ color: colors.text }}>{w.grammarTitle}</Text>
                <Text style={{ color: colors.textMuted }}>{w.accuracy}%</Text>
              </View>
            ))}
          </Card>
        ) : null}

        <Card>
          <Text style={[styles.cardLabel, { color: colors.textMuted }]}>{t('progress.modules')}</Text>
          {(data?.modules ?? []).map((m) => (
            <View key={m.id} style={{ marginBottom: 10 }}>
              <Text style={[styles.moduleTitle, { color: colors.text }]}>{m.title}</Text>
              <ProgressBar percent={m.percent} label={t('progress.lessonsPerModule', { completed: m.completedLessons, total: m.lessonCount })} />
            </View>
          ))}
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14 },
  title: { fontSize: 26, fontWeight: '800' },
  subtitle: { fontSize: 15 },
  cardLabel: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8 },
  metricRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  statsRow: { flexDirection: 'row', gap: 10 },
  topicRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  weakRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  moduleTitle: { fontSize: 16, fontWeight: '700', marginBottom: 6 },
});
