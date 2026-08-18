import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { askAssistant, type AssistantAnswer } from '../../lib/api';

const PROMPTS = [
  'How much ORS do we have on hand?',
  'What is below reorder point right now?',
  'Which shipments are delayed?',
  'What expires in the next 30 days?',
  'Which complaints are still open?',
  'Is my supplier getting worse on cold chain?',
];

interface Turn {
  question: string;
  answer?: AssistantAnswer;
  error?: string;
}

export default function DhanvantariAssistantScreen({ onBack }: { onBack: () => void }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const ask = useCallback(async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    setBusy(true);
    setInput('');
    setTurns(t => [...t, { question: q }]);
    try {
      const answer = await askAssistant(q);
      setTurns(t => t.map((x, i) => i === t.length - 1 ? { ...x, answer } : x));
    } catch (e) {
      setTurns(t => t.map((x, i) => i === t.length - 1 ? { ...x, error: (e as Error).message } : x));
    } finally {
      setBusy(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [busy]);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF4E5" />

      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>Nidana</Text>
        <Text style={styles.subtitle}>Institution assistant</Text>
      </View>

      {/* Suggested prompts */}
      {turns.length === 0 && (
        <View style={styles.promptsContainer}>
          <Text style={styles.promptsLabel}>Try asking</Text>
          <View style={styles.promptChips}>
            {PROMPTS.map(p => (
              <Pressable key={p} onPress={() => ask(p)} style={styles.chip}>
                <Text style={styles.chipText}>{p}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* Conversation */}
      <ScrollView ref={scrollRef} style={styles.conversation} contentContainerStyle={styles.convContent}>
        {turns.map((t, i) => (
          <View key={i} style={styles.turnContainer}>
            {/* User bubble */}
            <View style={styles.userBubbleWrap}>
              <View style={styles.userBubble}>
                <Text style={styles.userText}>{t.question}</Text>
              </View>
            </View>

            {/* Answer */}
            {!t.answer && !t.error ? (
              <View style={styles.aiBubbleWrap}>
                <View style={styles.aiBubble}>
                  <ActivityIndicator color="#D97706" size="small" />
                  <Text style={styles.thinkingText}>Thinking…</Text>
                </View>
              </View>
            ) : t.error ? (
              <View style={styles.aiBubbleWrap}>
                <View style={[styles.aiBubble, styles.errorBubble]}>
                  <Text style={styles.errorText}>⚠ {t.error}</Text>
                </View>
              </View>
            ) : (
              <View style={styles.aiBubbleWrap}>
                <View style={styles.aiBubble}>
                  <Text style={styles.aiText}>{t.answer!.answer}</Text>
                  <View style={styles.evidenceDivider} />
                  <Text style={styles.evidenceText}>{t.answer!.evidence.summary}</Text>
                  <Text style={styles.msText}>{t.answer!.ms}ms · {t.answer!.narration}</Text>
                </View>
              </View>
            )}
          </View>
        ))}
      </ScrollView>

      {/* Input */}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Ask about stock, orders, shipments…"
          placeholderTextColor="#94A3B8"
          onSubmitEditing={() => ask(input)}
          returnKeyType="send"
          editable={!busy}
          multiline
        />
        <Pressable
          onPress={() => ask(input)}
          disabled={busy || !input.trim()}
          style={[styles.sendBtn, (busy || !input.trim()) && { opacity: 0.4 }]}
        >
          <Text style={styles.sendText}>Send</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { backgroundColor: '#FFF4E5', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F5D9A0' },
  backBtn: { alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 8, marginBottom: 8 },
  backText: { fontSize: 14, fontWeight: '700', color: '#D97706' },
  title: { fontSize: 24, fontWeight: '800', color: '#111827', letterSpacing: -0.5 },
  subtitle: { fontSize: 12, color: '#475467', textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 },
  promptsContainer: { padding: 16 },
  promptsLabel: { fontSize: 11, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  promptChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8 },
  chipText: { fontSize: 12, color: '#374151', fontWeight: '500' },
  conversation: { flex: 1 },
  convContent: { padding: 12, gap: 16 },
  turnContainer: { gap: 10 },
  userBubbleWrap: { alignItems: 'flex-end' },
  userBubble: { backgroundColor: '#1E293B', borderRadius: 16, borderBottomRightRadius: 4, paddingHorizontal: 14, paddingVertical: 10, maxWidth: '85%' },
  userText: { color: '#F8FAFC', fontSize: 14, lineHeight: 20 },
  aiBubbleWrap: { alignItems: 'flex-start' },
  aiBubble: { backgroundColor: '#fff', borderRadius: 16, borderBottomLeftRadius: 4, paddingHorizontal: 14, paddingVertical: 12, maxWidth: '90%', borderWidth: 1, borderColor: '#E2E8F0', gap: 4 },
  errorBubble: { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' },
  thinkingText: { color: '#94A3B8', fontSize: 13, marginLeft: 8 },
  aiText: { color: '#111827', fontSize: 14, lineHeight: 22 },
  evidenceDivider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 6 },
  evidenceText: { color: '#94A3B8', fontSize: 11, lineHeight: 17, fontFamily: 'monospace' },
  msText: { color: '#CBD5E1', fontSize: 10, marginTop: 4 },
  errorText: { color: '#DC2626', fontSize: 13 },
  inputRow: { flexDirection: 'row', padding: 12, gap: 10, borderTopWidth: 1, borderTopColor: '#E2E8F0', backgroundColor: '#fff', alignItems: 'flex-end' },
  input: { flex: 1, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#111827', maxHeight: 120 },
  sendBtn: { backgroundColor: '#D97706', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 11 },
  sendText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
