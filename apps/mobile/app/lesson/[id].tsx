import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, router } from 'expo-router';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/src/components/Button';
import { Card } from '@/src/components/Card';
import { Screen } from '@/src/components/Screen';
import { AudioPlayer } from '@/src/components/AudioPlayer';
import { RecordButton } from '@/src/components/RecordButton';
import { api } from '@/src/api/client';
import { useTheme } from '@/src/theme';
import { useI18n, type MessageKey } from '@/src/i18n';
import type { ExerciseDto, LessonDto, SpeakingAttemptResult, SpeakingEvaluation } from '@spanish/shared';

const EVALUATION_KEYS: Record<SpeakingEvaluation, MessageKey> = {
  correct: 'speaking.evaluation.correct',
  close: 'speaking.evaluation.close',
  retry: 'speaking.evaluation.retry',
  unrecognized: 'speaking.evaluation.unrecognized',
};

type Phase = 'intro' | 'review' | 'vocab' | 'grammar' | 'exercises' | 'results';

export default function LessonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, spacing } = useTheme();
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const { data: lesson, isError: lessonError, refetch: refetchLesson } = useQuery({
    queryKey: ['lesson', id],
    queryFn: () => api().lessonById(id).then((r) => r.lesson),
  });

  const [phase, setPhase] = useState<Phase>('intro');
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [answer, setAnswer] = useState('');
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ correct: boolean; correctAnswer: string; explanation: string | null } | null>(null);
  const [grading, setGrading] = useState(false);
  const [speakingResult, setSpeakingResult] = useState<SpeakingAttemptResult | null>(null);
  const [speakingBusy, setSpeakingBusy] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [result, setResult] = useState<{
    xp: number;
    streak: number;
    achievements: { title: string }[];
    nextLessonId: string | null;
  } | null>(null);

  useEffect(() => {
    setPhase('intro');
    setIdx(0);
    setRevealed(false);
    setAnswer('');
    setSelectedOption(null);
    setFeedback(null);
    setSpeakingResult(null);
    setCorrectCount(0);
    setResult(null);
  }, [id]);

  const exercises = useMemo(() => lesson?.parts.exercises ?? [], [lesson]);
  const reviewItems = useMemo(() => lesson?.parts.review ?? [], [lesson]);
  const vocab = useMemo(() => lesson?.parts.vocabulary ?? [], [lesson]);
  const exercise: ExerciseDto | undefined = exercises[idx];

  const move = (next: Phase) => {
    setPhase(next);
    setIdx(0);
    setRevealed(false);
    setAnswer('');
    setSelectedOption(null);
    setFeedback(null);
    setSpeakingResult(null);
  };

  const submitAnswer = async () => {
    if (!exercise || !id) return;
    const a = exercise.options ? (selectedOption ?? '') : answer.trim();
    if (!a) return;
    setGrading(true);
    try {
      const res = await api().attempt(id, exercise.id, a);
      setFeedback({
        correct: res.correct,
        correctAnswer: res.correctAnswer,
        explanation: res.explanation,
      });
      if (res.correct) setCorrectCount((c) => c + 1);
    } finally {
      setGrading(false);
    }
  };

  const nextExercise = () => {
    if (idx + 1 >= exercises.length) {
      void finish();
    } else {
      setIdx((i) => i + 1);
      setAnswer('');
      setSelectedOption(null);
      setFeedback(null);
      setSpeakingResult(null);
    }
  };

  const submitSpeaking = async (base64: string, mimeType: string, seconds: number) => {
    if (!exercise || !id || !exercise.targetEs) return;
    setSpeakingBusy(true);
    try {
      const res = await api().speakingAttempt({
        audio: base64,
        mimeType,
        targetEs: exercise.targetEs,
        recordedSeconds: seconds,
        exerciseId: exercise.id,
      });
      setSpeakingResult(res);
      if (res.evaluation === 'correct') setCorrectCount((c) => c + 1);
    } finally {
      setSpeakingBusy(false);
    }
  };

  const finish = async () => {
    if (!id) return;
    const res = await api().completeLesson(id);
    queryClient.invalidateQueries({ queryKey: ['summary'] });
    queryClient.invalidateQueries({ queryKey: ['curriculum'] });
    queryClient.invalidateQueries({ queryKey: ['progress'] });
    setResult({
      xp: res.xpEarned,
      streak: res.currentStreak,
      achievements: res.achievementsUnlocked,
      nextLessonId: res.nextLessonId ?? null,
    });
    setPhase('results');
  };

  const hasReview = reviewItems.length > 0;
  const hasGrammar = !!lesson?.parts.grammar;
  const accuracy = exercises.length > 0 ? Math.round((correctCount / exercises.length) * 100) : 0;

  const renderSection = () => {
    if (lessonError) {
      return (
        <Card>
          <Text style={{ color: colors.text, fontWeight: '700' }}>{t('error.network')}</Text>
          <Button label={t('error.retry')} variant="ghost" onPress={() => refetchLesson()} style={{ marginTop: spacing.md }} />
        </Card>
      );
    }
    if (!lesson) return null;

    switch (phase) {
      case 'intro':
        return (
          <Card>
            <Text style={[styles.dayTag, { color: colors.teal }]}>{t('lesson.day', { day: lesson.dayNumber })}</Text>
            <Text style={[styles.lessonTitle, { color: colors.text }]}>{lesson.title}</Text>
            <Text style={[styles.lessonDesc, { color: colors.textMuted }]}>{lesson.description}</Text>
            <View style={styles.metaRow}>
              <Ionicons name="time-outline" size={16} color={colors.textMuted} />
              <Text style={{ color: colors.textMuted }}>{t('home.minutes', { minutes: lesson.estimatedMinutes })}</Text>
            </View>
            <Button label={t('lesson.start')} onPress={() => move(hasReview ? 'review' : 'vocab')} style={{ marginTop: spacing.lg }} />
          </Card>
        );

      case 'review': {
        const item = reviewItems[idx];
        return (
          <Card>
            <Text style={[styles.dayTag, { color: colors.teal }]}>
              {t('lesson.reviewSection', { index: idx + 1, total: reviewItems.length })}
            </Text>
            <Text style={[styles.bigText, { color: colors.text }]}>{item?.spanish}</Text>
            {revealed ? <Text style={[styles.muted, { color: colors.textMuted }]}>{item?.translation}</Text> : null}
            {revealed ? (
              <Button
                label={idx + 1 >= reviewItems.length ? t('lesson.continue') : t('lesson.next')}
                onPress={() => {
                  if (idx + 1 >= reviewItems.length) move('vocab');
                  else {
                    setIdx((i) => i + 1);
                    setRevealed(false);
                  }
                }}
                style={{ marginTop: spacing.lg }}
              />
            ) : (
              <Button label={t('translation.show')} onPress={() => setRevealed(true)} style={{ marginTop: spacing.lg }} />
            )}
          </Card>
        );
      }

      case 'vocab': {
        const item = vocab[idx];
        return (
          <Card>
            <Text style={[styles.dayTag, { color: colors.teal }]}>
              {t('lesson.vocabulary', { index: idx + 1, total: vocab.length })}
            </Text>
            <Text style={[styles.bigText, { color: colors.text }]}>{item?.spanish}</Text>
            {item?.pronunciation ? <Text style={[styles.pron, { color: colors.textMuted }]}>[{item.pronunciation}]</Text> : null}
            {revealed ? (
              <View style={{ gap: spacing.sm }}>
                <Text style={[styles.muted, { color: colors.text }]}>{item?.translation}</Text>
                {item?.exampleSentence ? (
                  <View>
                    <Text style={[styles.muted, { color: colors.textMuted }]}>{item?.exampleSentence}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 13 }}>{item?.exampleTranslation}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
            {revealed ? (
              <Button
                label={idx + 1 >= vocab.length ? (hasGrammar ? t('lesson.continue') : t('lesson.continue')) : t('lesson.next')}
                onPress={() => {
                  if (idx + 1 >= vocab.length) move(hasGrammar ? 'grammar' : 'exercises');
                  else {
                    setIdx((i) => i + 1);
                    setRevealed(false);
                  }
                }}
                style={{ marginTop: spacing.lg }}
              />
            ) : (
              <Button label={t('translation.show')} onPress={() => setRevealed(true)} style={{ marginTop: spacing.lg }} />
            )}
          </Card>
        );
      }

      case 'grammar': {
        const g = lesson.parts.grammar;
        if (!g) return null;
        return (
          <Card>
            <Text style={[styles.dayTag, { color: colors.teal }]}>{t('lesson.grammar')}</Text>
            <Text style={[styles.lessonTitle, { color: colors.text }]}>{g.title}</Text>
            <Text style={[styles.muted, { color: colors.textMuted }]}>{g.explanation}</Text>
            <View style={[styles.ruleBox, { backgroundColor: colors.surfaceAlt, borderRadius: 12, padding: spacing.md }]}>
              <Text style={[styles.ruleText, { color: colors.text }]}>{g.rule}</Text>
            </View>
            {g.examples.map((ex, i) => (
              <View key={i} style={{ marginTop: spacing.sm }}>
                <Text style={[styles.muted, { color: colors.text }]}>{ex.spanish}</Text>
                <Text style={[styles.smallMuted, { color: colors.textMuted }]}>{ex.translation}</Text>
              </View>
            ))}
            <Button label={t('lesson.continue')} onPress={() => move('exercises')} style={{ marginTop: spacing.lg }} />
          </Card>
        );
      }

      case 'exercises': {
        if (!exercise) return null;
        const isChoice = (exercise.type === 'multiple_choice' || exercise.type === 'listening') && exercise.options;
        const isSpeaking = exercise.type === 'speaking';

        if (isSpeaking) {
          const ev = speakingResult?.evaluation ?? 'unrecognized';
          const evColor =
            ev === 'correct' ? colors.success : ev === 'close' ? colors.warning : colors.danger;
          return (
            <Card>
              <Text style={[styles.dayTag, { color: colors.teal }]}>
                {t('lesson.exercise', { index: idx + 1, total: exercises.length })}
              </Text>
              <Text style={[styles.lessonDesc, { color: colors.text }]}>{exercise.prompt}</Text>
              <Text style={[styles.bigText, { color: colors.text }]}>{exercise.targetEs}</Text>
              {exercise.audioUrl ? (
                <View style={{ marginTop: spacing.md }}>
                  <AudioPlayer url={api().mediaUrl(exercise.audioUrl)} label={t('speaking.listenAgain')} />
                </View>
              ) : null}
              <View style={{ marginTop: spacing.lg }}>
                <RecordButton
                  onResult={(r) => void submitSpeaking(r.base64, r.mimeType, r.seconds)}
                  onError={(msg) => setFeedback({ correct: false, correctAnswer: '', explanation: msg })}
                  label={t('speaking.record')}
                  recordingLabel={t('speaking.recording')}
                />
              </View>
              {speakingBusy ? (
                <Text style={[styles.smallMuted, { color: colors.textMuted, marginTop: spacing.md }]}>
                  {t('teacher.loading')}
                </Text>
              ) : null}
              {speakingResult ? (
                <View style={[styles.feedbackBox, { backgroundColor: evColor === colors.success ? colors.primarySoft : colors.surfaceAlt, borderRadius: 12, padding: spacing.md, marginTop: spacing.md }]}>
                  <Text style={{ color: evColor, fontWeight: '800' }}>{t(EVALUATION_KEYS[ev])}</Text>
                  {speakingResult.recognized ? (
                    <Text style={{ color: colors.textMuted, marginTop: 4 }}>
                      {t('speaking.recognized', { text: speakingResult.recognized })}
                    </Text>
                  ) : null}
                </View>
              ) : null}
              {speakingResult ? (
                <Button
                  label={idx + 1 >= exercises.length ? t('lesson.finish') : t('lesson.next')}
                  onPress={nextExercise}
                  style={{ marginTop: spacing.lg }}
                />
              ) : null}
            </Card>
          );
        }

        return (
          <Card>
            <Text style={[styles.dayTag, { color: colors.teal }]}>
              {t('lesson.exercise', { index: idx + 1, total: exercises.length })}
            </Text>
            {exercise.audioUrl ? (
              <View style={{ marginBottom: spacing.md }}>
                <AudioPlayer url={api().mediaUrl(exercise.audioUrl)} label={t('speaking.listen')} />
              </View>
            ) : null}
            <Text style={[styles.lessonDesc, { color: colors.text }]}>{exercise.prompt}</Text>

            {isChoice ? (
              <View style={styles.choiceWrap}>
                {exercise.options!.map((opt) => {
                  const selected = selectedOption === opt;
                  const showResult = !!feedback;
                  const isCorrectOpt = feedback?.correctAnswer === opt;
                  const isWrongPick = selected && feedback && !feedback.correct;
                  const bg = showResult && isCorrectOpt ? colors.success : showResult && isWrongPick ? colors.danger : selected ? colors.primarySoft : colors.surfaceAlt;
                  const fg = showResult && isCorrectOpt ? '#fff' : showResult && isWrongPick ? '#fff' : colors.text;
                  return (
                    <Pressable
                      key={opt}
                      onPress={() => setSelectedOption(opt)}
                      disabled={!!feedback}
                      style={({ pressed }) => [styles.choice, { backgroundColor: bg, borderRadius: 12, opacity: pressed ? 0.85 : 1 }]}
                    >
                      <Text style={{ color: fg, fontSize: 16, fontWeight: '600' }}>{opt}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceAlt, borderRadius: 12 }]}
                placeholder={t('lesson.inputPlaceholder')}
                placeholderTextColor={colors.textMuted}
                value={answer}
                onChangeText={setAnswer}
                autoCapitalize="none"
                editable={!feedback}
                onSubmitEditing={submitAnswer}
              />
            )}

            {feedback ? (
              <View style={[styles.feedbackBox, { backgroundColor: feedback.correct ? colors.primarySoft : colors.surfaceAlt, borderRadius: 12, padding: spacing.md, marginTop: spacing.md }]}>
                <Text style={{ color: feedback.correct ? colors.success : colors.danger, fontWeight: '800' }}>
                  {feedback.correct ? t('lesson.correct') : t('lesson.incorrect', { answer: feedback.correctAnswer })}
                </Text>
                {feedback.explanation ? <Text style={{ color: colors.textMuted, marginTop: 4 }}>{feedback.explanation}</Text> : null}
              </View>
            ) : null}

            {feedback ? (
              <Button label={idx + 1 >= exercises.length ? t('lesson.finish') : t('lesson.next')} onPress={nextExercise} style={{ marginTop: spacing.lg }} />
            ) : (
              <Button label={t('lesson.check')} onPress={submitAnswer} loading={grading} disabled={isChoice ? !selectedOption : !answer.trim()} style={{ marginTop: spacing.lg }} />
            )}
          </Card>
        );
      }

      case 'results': {
        if (!result) return null;
        return (
          <Card>
            <Text style={styles.emoji}>🎉</Text>
            <Text style={[styles.lessonTitle, { color: colors.text, textAlign: 'center' }]}>{t('lesson.completed')}</Text>
            <View style={styles.resultRow}>
              <Text style={{ color: colors.textMuted }}>{t('results.accuracy')}</Text>
              <Text style={{ color: colors.text, fontWeight: '800' }}>{t('results.accuracyValue', { percent: accuracy })}</Text>
            </View>
            <View style={styles.resultRow}>
              <Text style={{ color: colors.textMuted }}>{t('lesson.xpEarned')}</Text>
              <Text style={{ color: colors.text, fontWeight: '800' }}>+{result.xp}</Text>
            </View>
            <View style={styles.resultRow}>
              <Text style={{ color: colors.textMuted }}>{t('lesson.streak')}</Text>
              <Text style={{ color: colors.text, fontWeight: '800' }}>🔥 {result.streak}</Text>
            </View>
            {result.achievements.map((a) => (
              <View key={a.title} style={[styles.achievement, { backgroundColor: colors.primarySoft, borderRadius: 10, padding: spacing.sm }]}>
                <Ionicons name="trophy" size={18} color={colors.warning} />
                <Text style={{ color: colors.text, fontWeight: '700' }}>{a.title}</Text>
              </View>
            ))}
            {result.nextLessonId ? (
              <Button
                label={t('lesson.continueToNext')}
                onPress={() => router.replace(`/lesson/${result.nextLessonId}`)}
                style={{ marginTop: spacing.lg }}
              />
            ) : null}
            <Button
              label={t('lesson.backHome')}
              variant={result.nextLessonId ? 'ghost' : 'primary'}
              onPress={() => router.replace('/(tabs)')}
              style={{ marginTop: spacing.md }}
            />
          </Card>
        );
      }
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[styles.content, { padding: spacing.lg }]}>{renderSection()}</ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { gap: 14 },
  dayTag: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', marginBottom: 8 },
  lessonTitle: { fontSize: 24, fontWeight: '800' },
  lessonDesc: { fontSize: 16, marginTop: 6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  bigText: { fontSize: 28, fontWeight: '800', marginTop: 8 },
  pron: { fontSize: 15, marginTop: 2 },
  muted: { fontSize: 16, marginTop: 8 },
  smallMuted: { fontSize: 14, marginTop: 2 },
  ruleBox: { marginTop: 12 },
  ruleText: { fontSize: 15, lineHeight: 22 },
  choiceWrap: { gap: 10, marginTop: 14 },
  choice: { paddingHorizontal: 16, paddingVertical: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  input: { height: 52, borderWidth: 1.5, paddingHorizontal: 14, fontSize: 16, marginTop: 14 },
  feedbackBox: {},
  emoji: { fontSize: 48, textAlign: 'center' },
  resultRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  achievement: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
});
