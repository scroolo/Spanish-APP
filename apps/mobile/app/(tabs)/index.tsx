import { useQuery } from '@tanstack/react-query';
import { Redirect, router } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/src/components/Button';
import { Card } from '@/src/components/Card';
import { ProgressBar } from '@/src/components/ProgressBar';
import { Screen } from '@/src/components/Screen';
import { StatTile } from '@/src/components/StatTile';
import { api } from '@/src/api/client';
import { useTheme } from '@/src/theme';
import { useAuth } from '@/src/store/auth';
import { useI18n } from '@/src/i18n';
import type { DailyPlanItemDto } from '@spanish/shared';

const PLAN_ICONS: Record<DailyPlanItemDto['kind'], keyof typeof Ionicons.glyphMap> = {
  review: 'refresh',
  lesson: 'book',
  speaking: 'mic',
  personalized: 'sparkles',
  conversation: 'chatbubbles',
};

export default function HomeScreen() {
  const { colors, spacing } = useTheme();
  const { t } = useI18n();
  const status = useAuth((s) => s.status);
  const user = useAuth((s) => s.user);
  const language = useAuth((s) => s.language);
  const logout = useAuth((s) => s.logout);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['summary'],
    queryFn: () => api().summary(),
  });

  if (status !== 'authed') {
    return <Redirect href={status === 'onboarding' ? '/(onboarding)/level' : '/(auth)/login'} />;
  }

  const firstName = user?.displayName?.split(' ')[0];

  const openPlanItem = (item: DailyPlanItemDto) => {
    if (item.kind === 'lesson' && item.lessonId) router.push(`/lesson/${item.lessonId}`);
    else if (item.kind === 'review') router.push('/(tabs)/review');
    else if (item.kind === 'speaking') router.push('/(tabs)/speaking');
    else if (item.kind === 'conversation') router.push('/ai-tutor');
  };

  const planPercent = data?.plan
    ? Math.min(100, Math.round((data.plan.completedMinutes / Math.max(1, data.plan.durationGoal)) * 100))
    : 0;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[styles.content, { padding: spacing.lg }]}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => refetch()} />}
      >
        <View style={styles.header}>
          <View>
            <Text style={[styles.greeting, { color: colors.textMuted }]}>
              {t('home.greeting', { name: firstName ?? t('home.student') })}
            </Text>
            <Text style={[styles.bigTitle, { color: colors.text }]}>
              {data ? t('home.day', { day: data.dayNumber }) : t('home.todayWeLearn')}
            </Text>
          </View>
          <Pressable onPress={() => router.push('/profile')} hitSlop={8}>
            <View style={[styles.avatar, { backgroundColor: colors.primarySoft }]}>
              <Ionicons name="person" size={22} color={colors.primary} />
            </View>
          </Pressable>
        </View>

        {isError ? (
          <Card>
            <Text style={{ color: colors.text, fontWeight: '700' }}>{t('error.network')}</Text>
            <Button label={t('error.retry')} variant="ghost" onPress={() => refetch()} style={{ marginTop: spacing.md }} />
          </Card>
        ) : null}

        {data?.plan ? (
          <Card>
            <View style={styles.planHeader}>
              <Text style={[styles.cardLabel, { color: colors.textMuted, marginBottom: 0 }]}>{t('home.todayPlan')}</Text>
              <Text style={{ color: colors.textMuted, fontWeight: '700' }}>
                {t('home.planProgress', {
                  done: Math.min(data.plan.completedMinutes, data.plan.durationGoal),
                  goal: data.plan.durationGoal,
                })}
              </Text>
            </View>
            {data.plan.status === 'done' ? (
              <Text style={[styles.planDone, { color: colors.success }]}>{t('home.planDone')}</Text>
            ) : (
              <ProgressBar percent={planPercent} />
            )}

            {data.plan.items.map((item) => (
              <Pressable
                key={item.kind}
                onPress={() => openPlanItem(item)}
                style={({ pressed }) => [styles.planItem, { opacity: pressed ? 0.7 : 1 }]}
              >
                <View style={[styles.planIcon, { backgroundColor: colors.surfaceAlt }]}>
                  <Ionicons name={PLAN_ICONS[item.kind]} size={16} color={colors.primary} />
                </View>
                <View style={styles.planItemText}>
                  <Text style={[styles.planItemTitle, { color: colors.text }]}>{item.title}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 13 }}>{t('home.minutes', { minutes: item.minutes })}</Text>
                </View>
                {item.done ? (
                  <Ionicons name="checkmark-circle" size={22} color={colors.success} />
                ) : (
                  <View style={[styles.pendingDot, { borderColor: colors.border }]} />
                )}
              </Pressable>
            ))}

            {data.plan.emphasizeReview ? (
              <Text style={[styles.planHint, { color: colors.warning }]}>{t('home.planReviewFirst')}</Text>
            ) : null}
            {data.plan.fastLearner ? (
              <Text style={[styles.planHint, { color: colors.textMuted }]}>{t('home.planFastLearner')}</Text>
            ) : null}
          </Card>
        ) : null}

        {data?.todayLesson ? (
          <Card>
            <View style={styles.lessonBadgeRow}>
              <Text style={[styles.cardLabel, { color: colors.textMuted, marginBottom: 0 }]}>{t('home.nextLessonLabel')}</Text>
              <Ionicons name="book" size={18} color={colors.teal} />
            </View>
            <Text style={[styles.lessonTitle, { color: colors.text }]}>{data.todayLesson.title}</Text>
            <Text style={[styles.lessonDesc, { color: colors.textMuted }]}>{data.todayLesson.description}</Text>
            <Text style={[styles.lessonMeta, { color: colors.textMuted }]}>
              {t('home.minutes', { minutes: data.todayLesson.estimatedMinutes })}
            </Text>
            {data.todayLesson.id ? (
              <Button
                label={t('home.continueLesson')}
                onPress={() => router.push(`/lesson/${data.todayLesson!.id}`)}
                style={{ marginTop: spacing.md }}
              />
            ) : null}
          </Card>
        ) : (
          <Card>
            <Text style={{ color: colors.textMuted }}>{t('home.courseComplete')}</Text>
          </Card>
        )}

        {data?.nextMilestone ? (
          <Card>
            <Text style={[styles.cardLabel, { color: colors.textMuted }]}>{t('home.nextMilestone')}</Text>
            <Text style={[styles.milestone, { color: colors.text }]}>{data.nextMilestone.label}</Text>
            <ProgressBar percent={data.nextMilestone.progress} />
          </Card>
        ) : null}

        <Card>
          <View style={styles.lessonBadgeRow}>
            <Text style={[styles.cardLabel, { color: colors.textMuted, marginBottom: 0 }]}>{t('teacher.title')}</Text>
            <Ionicons name="sparkles" size={18} color={colors.primary} />
          </View>
          <Text style={[styles.lessonDesc, { color: colors.textMuted }]}>{t('teacher.subtitle')}</Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
            <Button label={t('teacher.startConversation')} onPress={() => router.push('/ai-tutor')} style={{ flex: 1 }} />
          </View>
        </Card>

        <View style={styles.statsRow}>
          <StatTile icon="🔥" value={String(data?.currentStreak ?? 0)} label={t('home.streakDays')} />
          <StatTile icon="📚" value={String(data?.vocabularyLearned ?? 0)} label={t('home.words')} />
          <StatTile icon="✅" value={String(data?.lessonsCompleted ?? 0)} label={t('home.lessons')} />
        </View>

        <Card>
          <Text style={[styles.cardLabel, { color: colors.textMuted }]}>{t('home.skills')}</Text>
          {data?.progress ? (
            Object.values(data.progress).map((s) => (
              <ProgressBar key={s.label} label={s.label} percent={s.percent} />
            ))
          ) : (
            <Text style={{ color: colors.textMuted }}>{t('home.noData')}</Text>
          )}
        </Card>

        <Text style={[styles.levelInfo, { color: colors.textMuted }]}>
          {t('home.yourLevel', { level: language?.cefrLevel ?? data?.cefrLevel ?? '' })}
        </Text>

        <Button label={t('auth.logout')} variant="ghost" onPress={logout} style={{ marginTop: spacing.sm }} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  greeting: { fontSize: 15 },
  bigTitle: { fontSize: 26, fontWeight: '800' },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  planHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  planDone: { fontSize: 16, fontWeight: '800', marginBottom: 4 },
  planItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  planIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  planItemText: { flex: 1 },
  planItemTitle: { fontSize: 16, fontWeight: '700' },
  pendingDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2 },
  planHint: { fontSize: 13, fontWeight: '700', marginTop: 6 },
  lessonBadgeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  lessonTitle: { fontSize: 20, fontWeight: '800' },
  lessonDesc: { fontSize: 14, marginTop: 4 },
  lessonMeta: { fontSize: 13, marginTop: 8 },
  cardLabel: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8 },
  milestone: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  statsRow: { flexDirection: 'row', gap: 10 },
  levelInfo: { fontSize: 14, textAlign: 'center', marginTop: 4 },
});
