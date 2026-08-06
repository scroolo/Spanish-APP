import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/src/components/Card';
import { Screen } from '@/src/components/Screen';
import { api } from '@/src/api/client';
import { useTheme } from '@/src/theme';
import { useI18n } from '@/src/i18n';

export default function LearnScreen() {
  const { colors, spacing } = useTheme();
  const { t } = useI18n();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['curriculum'],
    queryFn: () => api().curriculum(),
  });

  const modules = useMemo(() => data?.courses.flatMap((c) => c.modules) ?? [], [data]);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[styles.content, { padding: spacing.lg }]}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => refetch()} />}
      >
        <Text style={[styles.title, { color: colors.text }]}>{t('learn.title')}</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          {data?.languageCode ? t('learn.subtitle', { level: data.cefrLevel }) : t('learn.loading')}
        </Text>

        {modules.length === 0 ? (
          <Text style={{ color: colors.textMuted }}>{t('learn.empty')}</Text>
        ) : (
          modules.map((module) => (
            <Card key={module.id}>
              <Text style={[styles.moduleTitle, { color: colors.text }]}>{module.title}</Text>
              <Text style={[styles.moduleDesc, { color: colors.textMuted }]}>{module.description}</Text>
              <View style={styles.lessonList}>
                {module.lessons.map((lesson) => {
                  const done = lesson.status === 'completed';
                  const locked = lesson.status === 'locked';
                  const started = lesson.status === 'not_started' || lesson.status === 'in_progress';
                  return (
                    <Pressable
                      key={lesson.id}
                      onPress={locked ? undefined : () => router.push(`/lesson/${lesson.id}`)}
                      disabled={locked}
                      style={({ pressed }) => [
                        styles.lessonRow,
                        { opacity: pressed ? 0.7 : locked ? 0.55 : 1 },
                      ]}
                    >
                      <View
                        style={[
                          styles.iconCircle,
                          { backgroundColor: done ? colors.success : started ? colors.primarySoft : colors.surfaceAlt },
                        ]}
                      >
                        <Ionicons
                          name={done ? 'checkmark' : started ? 'play' : 'lock-closed'}
                          size={14}
                          color={done ? '#fff' : started ? colors.primary : colors.textMuted}
                        />
                      </View>
                      <View style={styles.lessonText}>
                        <Text style={[styles.lessonTitle, { color: locked ? colors.textMuted : colors.text }]}>
                          {lesson.title}
                        </Text>
                        <Text style={[styles.lessonDay, { color: colors.textMuted }]}>
                          {t('learn.day', { day: lesson.dayNumber })}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </Card>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14 },
  title: { fontSize: 26, fontWeight: '800' },
  subtitle: { fontSize: 15 },
  moduleTitle: { fontSize: 18, fontWeight: '800' },
  moduleDesc: { fontSize: 14, marginTop: 2, marginBottom: 8 },
  lessonList: { gap: 2 },
  lessonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
  },
  iconCircle: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  lessonText: { flex: 1 },
  lessonTitle: { fontSize: 16, fontWeight: '600' },
  lessonDay: { fontSize: 13 },
});
