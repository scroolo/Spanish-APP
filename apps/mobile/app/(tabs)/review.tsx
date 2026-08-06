import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '@/src/components/Button';
import { Card } from '@/src/components/Card';
import { Screen } from '@/src/components/Screen';
import { StatTile } from '@/src/components/StatTile';
import { api } from '@/src/api/client';
import { useTheme } from '@/src/theme';
import { useI18n } from '@/src/i18n';
import type { LessonReviewItemDto } from '@spanish/shared';

export default function ReviewScreen() {
  const { colors, spacing } = useTheme();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['review'],
    queryFn: () => api().review(),
  });

  const items = useMemo(() => data?.items ?? [], [data]);
  const summary = data?.summary;

  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState<{ correct: boolean; correctAnswer: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);

  const item: LessonReviewItemDto | undefined = items[index];

  const begin = () => {
    setStarted(true);
    setIndex(0);
    setAnswer('');
    setResult(null);
    setCorrectCount(0);
  };

  const submit = async () => {
    if (!item || !answer.trim() || result) return;
    setLoading(true);
    try {
      const res = await api().reviewAttempt({
        id: item.id,
        kind: item.kind,
        answer: answer.trim(),
        correctAnswer: item.correctAnswer,
      });
      setResult({ correct: res.correct, correctAnswer: res.correctAnswer });
      if (res.correct) setCorrectCount((c) => c + 1);
    } finally {
      setLoading(false);
    }
  };

  const next = () => {
    if (index + 1 >= items.length) {
      queryClient.invalidateQueries({ queryKey: ['summary'] });
      queryClient.invalidateQueries({ queryKey: ['progress'] });
      refetch();
      setStarted(false);
      setIndex(0);
      setAnswer('');
      setResult(null);
      setCorrectCount(0);
    } else {
      setIndex((i) => i + 1);
      setAnswer('');
      setResult(null);
    }
  };

  if (isLoading && items.length === 0) {
    return (
      <Screen>
        <ScrollView contentContainerStyle={[styles.content, { padding: spacing.lg }]}>
          <Text style={[styles.title, { color: colors.text }]}>{t('review.title')}</Text>
          <Text style={{ color: colors.textMuted, marginTop: spacing.lg }}>{t('review.loading')}</Text>
        </ScrollView>
      </Screen>
    );
  }

  if (items.length === 0) {
    return (
      <Screen>
        <ScrollView contentContainerStyle={[styles.content, { padding: spacing.lg }]}>
          <Text style={[styles.title, { color: colors.text }]}>{t('review.title')}</Text>
          <Card>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>{t('review.done')}</Text>
            <Text style={{ color: colors.textMuted }}>{t('review.doneSub')}</Text>
          </Card>
        </ScrollView>
      </Screen>
    );
  }

  if (!started) {
    const vocabCount = summary?.vocabCount ?? items.filter((i) => i.kind === 'vocabulary').length;
    const grammarCount = summary?.grammarCount ?? items.filter((i) => i.kind === 'grammar').length;
    const minutes = summary?.estimatedMinutes ?? Math.max(1, Math.ceil(items.length / 2));
    return (
      <Screen>
        <ScrollView contentContainerStyle={[styles.content, { padding: spacing.lg }]}>
          <Text style={[styles.title, { color: colors.text }]}>{t('review.title')}</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>{t('review.todayTitle')}</Text>
          <View style={styles.statsRow}>
            <StatTile icon="📖" value={String(vocabCount)} label={t('review.vocabCount', { count: vocabCount })} />
            <StatTile icon="🧠" value={String(grammarCount)} label={t('review.grammarCount', { count: grammarCount })} />
          </View>
          <Card>
            <Text style={{ color: colors.textMuted }}>{t('review.estimated', { minutes })}</Text>
          </Card>
          <Button label={t('review.start')} onPress={begin} />
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[styles.content, { padding: spacing.lg }]}>
          <Text style={[styles.title, { color: colors.text }]}>{t('review.title')}</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            {t('review.progress', { index: index + 1, total: items.length, correct: correctCount })}
          </Text>

          <Card>
            <Text style={[styles.tag, { color: colors.teal }]}>
              {item?.kind === 'grammar' ? t('review.grammarKind') : t('review.vocabKind')} · {item?.sourceTitle}
            </Text>
            <Text style={[styles.prompt, { color: colors.text }]}>{item?.prompt}</Text>
            <Text style={[styles.answerLabel, { color: colors.textMuted }]}>
              {t('review.writeSpanish', { spanish: item?.spanish })}
            </Text>
            <TextInput
              style={[
                styles.input,
                { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceAlt, borderRadius: 12 },
              ]}
              placeholder={t('review.placeholder')}
              placeholderTextColor={colors.textMuted}
              value={answer}
              onChangeText={setAnswer}
              autoCapitalize="none"
              editable={!result}
              onSubmitEditing={submit}
            />
            {result ? (
              <View
                style={[
                  styles.resultBox,
                  { backgroundColor: result.correct ? colors.primarySoft : colors.surfaceAlt, borderRadius: 10 },
                ]}
              >
                <Text style={{ color: result.correct ? colors.success : colors.danger, fontWeight: '800' }}>
                  {result.correct ? t('review.correct') : t('review.incorrect', { answer: result.correctAnswer })}
                </Text>
              </View>
            ) : null}
          </Card>

          {result ? (
            <Button label={index + 1 >= items.length ? t('review.finish') : t('review.next')} onPress={next} />
          ) : (
            <Button label={t('review.check')} onPress={submit} loading={loading} disabled={!answer.trim()} />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { gap: 12 },
  title: { fontSize: 26, fontWeight: '800' },
  subtitle: { fontSize: 14 },
  statsRow: { flexDirection: 'row', gap: 10 },
  tag: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', marginBottom: 8 },
  prompt: { fontSize: 22, fontWeight: '800' },
  answerLabel: { fontSize: 14, marginTop: 12, marginBottom: 8 },
  input: { height: 52, borderWidth: 1.5, paddingHorizontal: 14, fontSize: 16 },
  resultBox: { padding: 12, marginTop: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '700' },
});
