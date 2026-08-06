import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/src/components/Button';
import { Card } from '@/src/components/Card';
import { Screen } from '@/src/components/Screen';
import { api } from '@/src/api/client';
import { useTheme } from '@/src/theme';
import { useI18n } from '@/src/i18n';
import type { ConversationScenarioDto, ConversationSessionDto, TutorReplyDto } from '@spanish/shared';

interface Message {
  role: 'user' | 'assistant';
  text: string;
}

export default function AiTutorScreen() {
  const { colors, spacing } = useTheme();
  const { t } = useI18n();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  const [session, setSession] = useState<ConversationSessionDto | null>(null);
  const [lastFeedback, setLastFeedback] = useState<string | null>(null);
  const [convInput, setConvInput] = useState('');
  const [convBusy, setConvBusy] = useState(false);
  const [convError, setConvError] = useState<string | null>(null);

  const { data: scenarios } = useQuery({
    queryKey: ['conversation-scenarios'],
    queryFn: () => api().conversationScenarios(),
  });

  const quickPrompts = useMemo(
    () => [
      t('teacher.quick.whatIs'),
      t('teacher.quick.say'),
      t('teacher.quick.exercise'),
      t('teacher.quick.practice'),
    ],
    [t],
  );

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    setMessages((m) => [...m, { role: 'user', text: q }]);
    setInput('');
    setBusy(true);
    try {
      const reply: TutorReplyDto = await api().tutorAsk(q);
      const parts = [reply.replySk, reply.spanishExample, reply.exampleTranslationSk, reply.followUpQuestionSk]
        .filter((s): s is string => !!s);
      setMessages((m) => [...m, { role: 'assistant', text: parts.join('\n\n') }]);
    } catch {
      setMessages((m) => [...m, { role: 'assistant', text: t('error.tryAgain') }]);
    } finally {
      setBusy(false);
    }
  };

  const startConversation = async (scenario: ConversationScenarioDto) => {
    setConvError(null);
    setConvBusy(true);
    try {
      const s = await api().conversationStart(scenario.slug);
      setSession(s);
      setLastFeedback(null);
      setConvInput('');
    } catch {
      setConvError(t('error.tryAgain'));
    } finally {
      setConvBusy(false);
    }
  };

  const sendReply = async () => {
    const text = convInput.trim();
    if (!text || !session || convBusy) return;
    setConvBusy(true);
    setConvError(null);
    try {
      const res = await api().conversationReply(session.id, text);
      setSession(res.session);
      setLastFeedback(res.feedbackSk);
      setConvInput('');
    } catch {
      setConvError(t('error.tryAgain'));
    } finally {
      setConvBusy(false);
    }
  };

  const finishConversation = async () => {
    if (!session) return;
    setConvBusy(true);
    try {
      const s = await api().conversationFinish(session.id);
      setSession(s);
    } catch {
      setConvError(t('error.tryAgain'));
    } finally {
      setConvBusy(false);
    }
  };

  const turns = session?.turns ?? [];
  const showConversation = !!session;

  if (showConversation) {
    return (
      <Screen>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <FlatList
            data={turns}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
            ListHeaderComponent={
              <View style={{ marginBottom: spacing.sm }}>
                {session.status === 'finished' ? (
                  <Card>
                    <Text style={{ color: colors.success, fontWeight: '800' }}>{t('teacher.conversationFinished')}</Text>
                    {session.summary?.newPhrases?.length ? (
                      <View style={{ marginTop: spacing.sm }}>
                        <Text style={{ color: colors.textMuted, fontWeight: '700' }}>{t('teacher.summaryNew')}</Text>
                        {session.summary.newPhrases.map((p) => (
                          <Text key={p} style={{ color: colors.text }}>• {p}</Text>
                        ))}
                      </View>
                    ) : null}
                  </Card>
                ) : (
                  <Text style={{ color: colors.textMuted, fontSize: 13 }}>{t('teacher.conversationFeedback')}</Text>
                )}
              </View>
            }
            renderItem={({ item }) => (
              <View
                style={[
                  styles.bubble,
                  {
                    alignSelf: item.role === 'learner' ? 'flex-end' : 'flex-start',
                    backgroundColor: item.role === 'learner' ? colors.primary : colors.surfaceAlt,
                    borderRadius: 14,
                  },
                ]}
              >
                <Text style={{ color: item.role === 'learner' ? '#FFFFFF' : colors.text, fontSize: 16 }}>{item.spanish}</Text>
                {item.translationSk ? (
                  <Text style={{ color: item.role === 'learner' ? 'rgba(255,255,255,0.85)' : colors.textMuted, marginTop: 4, fontSize: 13 }}>
                    {item.translationSk}
                  </Text>
                ) : null}
              </View>
            )}
            ListFooterComponent={
              <View style={{ marginTop: spacing.md }}>
                {lastFeedback ? (
                  <View style={[styles.bubble, { backgroundColor: colors.primarySoft, borderRadius: 14, marginBottom: spacing.sm }]}>
                    <Text style={{ color: colors.text, fontSize: 14 }}>{lastFeedback}</Text>
                  </View>
                ) : null}
                {convError ? <Text style={{ color: colors.danger, marginBottom: spacing.sm }}>{convError}</Text> : null}
                {session.status === 'active' ? (
                  <>
                    <TextInput
                      style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceAlt, borderRadius: 12 }]}
                      placeholder={t('teacher.conversationInput')}
                      placeholderTextColor={colors.textMuted}
                      value={convInput}
                      onChangeText={setConvInput}
                      autoCapitalize="none"
                      editable={!convBusy}
                      onSubmitEditing={sendReply}
                    />
                    <Button label={t('teacher.send')} onPress={sendReply} loading={convBusy} disabled={!convInput.trim()} style={{ marginTop: spacing.sm }} />
                    <Button label={t('teacher.finishConversation')} variant="ghost" onPress={finishConversation} style={{ marginTop: spacing.xs }} />
                  </>
                ) : null}
              </View>
            }
          />
        </KeyboardAvoidingView>
      </Screen>
    );
  }

  return (
    <Screen>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          data={messages}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
          ListHeaderComponent={
            <View>
              <Text style={[styles.title, { color: colors.text }]}>{t('teacher.title')}</Text>
              <Text style={[styles.subtitle, { color: colors.textMuted }]}>{t('teacher.subtitle')}</Text>
              <View style={styles.quickWrap}>
                {quickPrompts.map((p) => (
                  <Pressable
                    key={p}
                    onPress={() => void ask(p)}
                    disabled={busy}
                    style={({ pressed }) => [
                      styles.chip,
                      { backgroundColor: colors.surfaceAlt, borderColor: colors.border, opacity: pressed ? 0.8 : 1 },
                    ]}
                  >
                    <Text style={{ color: colors.primary }}>{p}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={[styles.section, { color: colors.textMuted }]}>{t('teacher.startConversation')}</Text>
              <Text style={[styles.subtitle, { color: colors.textMuted }]}>{t('teacher.startConversationSub')}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View
              style={[
                styles.bubble,
                {
                  alignSelf: item.role === 'user' ? 'flex-end' : 'flex-start',
                  backgroundColor: item.role === 'user' ? colors.primary : colors.surfaceAlt,
                  borderRadius: 14,
                },
              ]}
            >
              <Text style={{ color: item.role === 'user' ? '#FFFFFF' : colors.text, fontSize: 16 }}>{item.text}</Text>
            </View>
          )}
          ListFooterComponent={
            <View style={{ gap: spacing.sm }}>
              {busy ? <ActivityIndicator color={colors.primary} /> : null}
              {(scenarios ?? []).map((s) => (
                <Card key={s.slug} style={{ paddingVertical: spacing.md }}>
                  <Text style={{ color: colors.text, fontWeight: '700' }}>{s.titleSk}</Text>
                  <Text style={{ color: colors.textMuted, marginTop: 2 }}>{s.descriptionSk}</Text>
                  <Text style={{ color: colors.teal, marginTop: 4, fontSize: 13 }}>{s.openingEs}</Text>
                  <Button label={t('teacher.startConversation')} onPress={() => void startConversation(s)} loading={convBusy} style={{ marginTop: spacing.sm }} />
                </Card>
              ))}
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceAlt, borderRadius: 12 }]}
                placeholder={t('teacher.placeholder')}
                placeholderTextColor={colors.textMuted}
                value={input}
                onChangeText={setInput}
                autoCapitalize="none"
                editable={!busy}
                onSubmitEditing={() => void ask(input)}
              />
              <Button label={t('teacher.send')} onPress={() => void ask(input)} loading={busy} disabled={!input.trim()} />
            </View>
          }
        />
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  title: { fontSize: 24, fontWeight: '800' },
  subtitle: { fontSize: 15, marginTop: 2 },
  section: { fontSize: 15, fontWeight: '700', textTransform: 'uppercase', marginTop: 18 },
  quickWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderRadius: 999 },
  bubble: { paddingHorizontal: 14, paddingVertical: 10, maxWidth: '85%' },
  input: { height: 52, borderWidth: 1.5, paddingHorizontal: 14, fontSize: 16 },
});
