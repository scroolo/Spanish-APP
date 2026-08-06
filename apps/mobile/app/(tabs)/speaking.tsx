import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/src/components/Button';
import { Card } from '@/src/components/Card';
import { Screen } from '@/src/components/Screen';
import { AudioPlayer } from '@/src/components/AudioPlayer';
import { RecordButton } from '@/src/components/RecordButton';
import { api } from '@/src/api/client';
import { useTheme } from '@/src/theme';
import { useI18n, type MessageKey } from '@/src/i18n';
import type { ExerciseDto, SpeakingAttemptResult, SpeakingEvaluation } from '@spanish/shared';

const EVALUATION_KEYS: Record<SpeakingEvaluation, MessageKey> = {
  correct: 'speaking.evaluation.correct',
  close: 'speaking.evaluation.close',
  retry: 'speaking.evaluation.retry',
  unrecognized: 'speaking.evaluation.unrecognized',
};

export default function SpeakingScreen() {
  const { colors, spacing } = useTheme();
  const { t } = useI18n();

  const { data: lessonData, isLoading, refetch } = useQuery({
    queryKey: ['lesson', 'today', 'speaking'],
    queryFn: () => api().todayLesson(),
  });

  const { data: history, refetch: refetchHistory } = useQuery({
    queryKey: ['speaking-history'],
    queryFn: () => api().speakingHistory(),
  });

  const sentences = useMemo(
    () =>
      (lessonData?.lesson?.parts.exercises ?? []).filter(
        (e): e is ExerciseDto => e.type === 'speaking' && !!e.targetEs,
      ),
    [lessonData],
  );

  const [idx, setIdx] = useState(0);
  const [result, setResult] = useState<SpeakingAttemptResult | null>(null);
  const [busy, setBusy] = useState(false);

  const current = sentences[idx];

  const submit = async (base64: string, mimeType: string, seconds: number) => {
    if (!current?.targetEs) return;
    setBusy(true);
    try {
      const res = await api().speakingAttempt({
        audio: base64,
        mimeType,
        targetEs: current.targetEs,
        recordedSeconds: seconds,
      });
      setResult(res);
      void refetchHistory();
    } finally {
      setBusy(false);
    }
  };

  const next = () => {
    if (idx + 1 >= sentences.length) setIdx(0);
    else setIdx((i) => i + 1);
    setResult(null);
  };

  const ev = result?.evaluation ?? 'unrecognized';
  const evColor = ev === 'correct' ? colors.success : ev === 'close' ? colors.warning : colors.danger;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[styles.content, { padding: spacing.lg }]}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => { void refetch(); void refetchHistory(); }} />}
      >
        <Text style={[styles.title, { color: colors.text }]}>{t('speaking.title')}</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>{t('speaking.subtitle')}</Text>

        {isLoading ? (
          <Text style={{ color: colors.textMuted }}>{t('speaking.loading')}</Text>
        ) : sentences.length === 0 ? (
          <Card>
            <Text style={{ color: colors.textMuted }}>{t('speaking.empty')}</Text>
          </Card>
        ) : (
          <Card>
            <Text style={[styles.dayTag, { color: colors.teal }]}>
              {t('lesson.exercise', { index: idx + 1, total: sentences.length })}
            </Text>
            <Text style={[styles.bigText, { color: colors.text }]}>{current.targetEs}</Text>
            {current.audioUrl ? (
              <View style={{ marginTop: spacing.md }}>
                <AudioPlayer url={api().mediaUrl(current.audioUrl)} label={t('speaking.listenAgain')} />
              </View>
            ) : null}
            <View style={{ marginTop: spacing.lg }}>
              <RecordButton
                onResult={(r) => void submit(r.base64, r.mimeType, r.seconds)}
                onError={(msg) => setResult({ id: '', recognized: '', target: current.targetEs ?? '', evaluation: 'unrecognized', feedbackSk: msg, recordedSeconds: 0, provider: '' })}
                label={t('speaking.record')}
                recordingLabel={t('speaking.recording')}
              />
            </View>
            {busy ? (
              <Text style={{ color: colors.textMuted, marginTop: spacing.md }}>{t('teacher.loading')}</Text>
            ) : null}
            {result ? (
              <View style={[styles.feedbackBox, { backgroundColor: evColor === colors.success ? colors.primarySoft : colors.surfaceAlt, borderRadius: 12, padding: spacing.md, marginTop: spacing.md }]}>
                <Text style={{ color: evColor, fontWeight: '800' }}>
                  {t(EVALUATION_KEYS[ev])}
                </Text>
                {result.recognized ? (
                  <Text style={{ color: colors.textMuted, marginTop: 4 }}>
                    {t('speaking.recognized', { text: result.recognized })}
                  </Text>
                ) : null}
              </View>
            ) : null}
            {result ? (
              <Button label={t('speaking.next')} onPress={next} style={{ marginTop: spacing.lg }} />
            ) : null}
          </Card>
        )}

        <Text style={[styles.historyTitle, { color: colors.textMuted }]}>{t('speaking.history')}</Text>
        {(history ?? []).length === 0 ? (
          <Text style={{ color: colors.textMuted }}>{t('speaking.empty')}</Text>
        ) : (
          (history ?? []).slice(0, 10).map((h) => (
            <View key={h.id} style={[styles.historyItem, { backgroundColor: colors.surfaceAlt, borderRadius: 10, padding: spacing.md }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: '600' }}>{h.target}</Text>
                {h.recognized ? (
                  <Text style={{ color: colors.textMuted, fontSize: 13 }}>{h.recognized}</Text>
                ) : null}
              </View>
              <Ionicons
                name={h.evaluation === 'correct' ? 'checkmark-circle' : h.evaluation === 'close' ? 'close-circle' : 'help-circle'}
                size={20}
                color={h.evaluation === 'correct' ? colors.success : h.evaluation === 'close' ? colors.warning : colors.textMuted}
              />
            </View>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14 },
  title: { fontSize: 24, fontWeight: '800' },
  subtitle: { fontSize: 15, marginTop: -8 },
  dayTag: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', marginBottom: 8 },
  bigText: { fontSize: 26, fontWeight: '800', marginTop: 8 },
  feedbackBox: {},
  historyTitle: { fontSize: 15, fontWeight: '700', textTransform: 'uppercase', marginTop: 8 },
  historyItem: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
