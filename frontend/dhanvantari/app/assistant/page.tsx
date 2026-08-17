'use client';

/**
 * Nidana — the institution-scope assistant.
 *
 * Same contract as Vayu's: intent → deterministic Prisma call → evidence JSON
 * → LLM narrates. This server only reaches its own schema, so the assistant
 * physically cannot answer for another institution.
 */

import { useRef, useState } from 'react';

import { askAssistant, type AssistantAnswer } from '../../lib/api';
import { C, FONT, MONO, rise } from '../../lib/theme';
import { ApiError, Button, Card, CardTitle, Empty, PageHeader } from '../../components/ui';

const PROMPTS = [
  'How much ORS do we have on hand right now?',
  'What is below reorder point right now?',
  'Which of my shipments are delayed?',
  'What expires in the next 30 days?',
  'Which complaints are still open?',
  'Is my supplier getting worse on cold chain?',
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
    <>
      <PageHeader title="Nidana Assistant" />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.45fr) minmax(0,1fr)', gap: 24, padding: '26px 26px 52px' }}>
        <Card style={{ display: 'flex', flexDirection: 'column', minHeight: 540, animation: rise(0) }}>
          <CardTitle>Nidana · this institution</CardTitle>

          <div style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>
            {turns.length === 0 ? (
              <Empty>Ask about this institution&rsquo;s own stock, orders, shipments or suppliers.</Empty>
            ) : (
              turns.map((t, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <div
                      style={{
                        maxWidth: '80%',
                        borderRadius: 4,
                        padding: '12px 13px',
                        background: '#F0EEEB',
                        border: '1px solid #E4E2DF',
                        font: `400 13px/1.65 ${FONT}`,
                        color: C.ink,
                      }}
                    >
                      {t.question}
                    </div>
                  </div>

                  {t.error ? (
                    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                      <div style={{ maxWidth: '80%' }}>
                        <ApiError error={t.error} service="dhanvantari-api" />
                      </div>
                    </div>
                  ) : !t.answer ? (
                    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                      <div
                        style={{
                          maxWidth: '80%',
                          borderRadius: 4,
                          padding: '12px 13px',
                          background: C.surface,
                          border: '1px solid #E4E2DF',
                          font: `400 13px/1.65 ${FONT}`,
                          color: C.inkGhost,
                        }}
                      >
                        Thinking…
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                      <div
                        style={{
                          maxWidth: '80%',
                          borderRadius: 4,
                          padding: '12px 13px',
                          background: C.surface,
                          border: '1px solid #E4E2DF',
                        }}
                      >
                        <div style={{ font: `400 13px/1.65 ${FONT}`, color: C.ink }}>{t.answer.answer}</div>
                        <div
                          style={{
                            font: `400 11px/1.5 ${MONO}`,
                            color: C.inkFaint,
                            marginTop: 10,
                            paddingTop: 9,
                            borderTop: `1px solid ${C.borderSoft}`,
                          }}
                        >
                          {t.answer.evidence.summary}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
            <div ref={endRef} />
          </div>

          <div style={{ padding: 18, borderTop: `1px solid ${C.border}`, display: 'flex', gap: 9 }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void ask(input);
              }}
              placeholder="Ask about stock, orders, shipments or suppliers…"
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
            <Button onClick={() => void ask(input)} disabled={busy || !input.trim()}>
              {busy ? '…' : 'Send'}
            </Button>
          </div>
        </Card>

        <Card style={{ alignSelf: 'start', animation: rise(60) }}>
          <CardTitle>Try</CardTitle>
          <div>
            {PROMPTS.map((p) => (
              <button
                key={p}
                onClick={() => void ask(p)}
                disabled={busy}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '16px 18px',
                  border: 'none',
                  borderBottom: `1px solid ${C.borderSoft}`,
                  background: 'transparent',
                  font: `400 12px/1.5 ${FONT}`,
                  color: C.inkMuted,
                  cursor: busy ? 'not-allowed' : 'pointer',
                  opacity: busy ? 0.5 : 1,
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
