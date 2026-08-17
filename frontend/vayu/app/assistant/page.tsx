'use client';

/**
 * Nidana — the network-scope assistant.
 *
 * ARCHITECTURE.md §7.1, §7.3.
 *
 * Named for the Ayurvedic term for diagnosis. Every answer ships with the
 * evidence bundle that produced it, because that is the claim: the model never
 * queries the database, it narrates typed JSON assembled by hand-written
 * Prisma calls.
 */

import { useRef, useState } from 'react';

import { askAssistant, type AssistantAnswer } from '../../lib/api';
import { C, FONT, MONO, rise } from '../../lib/theme';
import { Card, CardTitle, Empty } from '../../components/ui';

/** The six demo questions (§11, 5:30). Pre-warming these is pre-flight. */
const PROMPTS = [
  "what's pending approval",
  'where are we about to stock out',
  'what will we need next month',
  'how many excursions this month',
  'which institutions report the most damage',
  'which drug is moving fastest',
];

interface Turn {
  question: string;
  answer?: AssistantAnswer;
  error?: string;
}

export default function AssistantPage() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setBusy(true);
    setInput('');
    setTurns((t) => [...t, { question: q }]);
    try {
      const answer = await askAssistant(q);
      setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, answer } : x)));
    } catch (e) {
      setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, error: (e as Error).message } : x)));
    } finally {
      setBusy(false);
      requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }));
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.45fr) minmax(0,1fr)', gap: 24, padding: '26px 26px 52px' }}>
      <Card style={{ display: 'flex', flexDirection: 'column', minHeight: 540, animation: rise(0) }}>
        <CardTitle>Nidana · network scope</CardTitle>

        <div style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>
          {turns.length === 0 ? (
            <Empty>Ask a question about the network, or pick a suggestion from Try.</Empty>
          ) : (
            <>
              {turns.map((t, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <div
                      style={{
                        maxWidth: '80%',
                        background: '#F0EEEB',
                        border: '1px solid #E4E2DF',
                        borderRadius: 4,
                        padding: '12px 13px',
                      }}
                    >
                      <div style={{ font: `400 13px/1.65 ${FONT}`, color: C.ink }}>{t.question}</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                    <div
                      style={{
                        maxWidth: '80%',
                        background: C.surface,
                        border: '1px solid #E4E2DF',
                        borderRadius: 4,
                        padding: '12px 13px',
                      }}
                    >
                      {t.error ? (
                        <div style={{ font: `400 13px/1.65 ${FONT}`, color: C.red }}>{t.error}</div>
                      ) : !t.answer ? (
                        <div style={{ font: `400 13px/1.65 ${FONT}`, color: C.inkGhost }}>Thinking…</div>
                      ) : (
                        <>
                          <div style={{ font: `400 13px/1.65 ${FONT}`, color: C.ink, whiteSpace: 'pre-wrap' }}>
                            {t.answer.answer}
                          </div>
                          <div
                            style={{
                              font: `400 11px/1.5 ${MONO}`,
                              color: C.inkFaint,
                              marginTop: 10,
                              paddingTop: 9,
                              borderTop: `1px solid ${C.borderSoft}`,
                            }}
                          >
                            {t.answer.evidence.summary} · {t.answer.intent} · {t.answer.narration} · {t.answer.ms}ms
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={endRef} />
            </>
          )}
        </div>

        <div style={{ padding: 18, borderTop: `1px solid ${C.border}`, display: 'flex', gap: 9 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void ask(input);
            }}
            placeholder="Ask about batches, shipments, risk or demand…"
            style={{
              flex: 1,
              border: `1px solid ${C.border}`,
              borderRadius: 4,
              padding: '11px 12px',
              font: `400 13px/1 ${FONT}`,
              color: C.ink,
              background: C.surface,
            }}
          />
          <button
            onClick={() => void ask(input)}
            disabled={busy || !input.trim()}
            style={{
              border: 0,
              background: C.ink,
              color: C.bg,
              font: `500 12px/1 ${FONT}`,
              padding: '11px 16px',
              borderRadius: 4,
              cursor: busy || !input.trim() ? 'not-allowed' : 'pointer',
              opacity: busy || !input.trim() ? 0.6 : 1,
            }}
          >
            {busy ? '…' : 'Send'}
          </button>
        </div>
      </Card>

      <Card style={{ alignSelf: 'start', animation: rise(60) }}>
        <CardTitle>Try</CardTitle>
        {PROMPTS.map((p) => (
          <div
            key={p}
            onClick={() => void ask(p)}
            style={{
              padding: '16px 18px',
              borderBottom: `1px solid ${C.borderSoft}`,
              font: `400 12px/1.5 ${FONT}`,
              color: C.inkMuted,
              cursor: busy ? 'not-allowed' : 'pointer',
              opacity: busy ? 0.6 : 1,
            }}
          >
            {p}
          </div>
        ))}
      </Card>
    </div>
  );
}
