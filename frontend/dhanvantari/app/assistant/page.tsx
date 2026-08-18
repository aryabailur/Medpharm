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
import { C, FONT, MONO, rise, VIZ } from '../../lib/theme';
import { ApiError, Button, EmptyState, LiveChip, PageHeader, Panel, PanelTitle } from '../../components/ui';

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
        <Panel delayMs={0} style={{ display: 'flex', flexDirection: 'column', minHeight: 540 }}>
          <PanelTitle dot={VIZ.violet} right={<LiveChip label="scoped to this institution" color={VIZ.violet} />}>
            Nidana · this institution
          </PanelTitle>

          <div style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>
            {turns.length === 0 ? (
              <EmptyState
                title="Ask about this institution's own stock, orders, shipments or suppliers"
                hint="Try one of the suggested questions on the right, or type your own below."
                height={260}
              />
            ) : (
              turns.map((t, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <div
                      style={{
                        maxWidth: '80%',
                        borderRadius: 8,
                        padding: '12px 13px',
                        background: '#F0EEEB',
                        border: '1px solid #E4E2DF',
                        font: `400 13px/1.65 ${FONT}`,
                        color: C.ink,
                        animation: rise(0),
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
                          borderRadius: 8,
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
                    <div style={{ display: 'flex', justifyContent: 'flex-start', animation: rise(40) }}>
                      <div
                        style={{
                          maxWidth: '92%',
                          borderRadius: 8,
                          padding: 0,
                          background: C.surface,
                          border: '1px solid #E4E2DF',
                          overflow: 'hidden',
                          boxShadow: '0 1px 2px rgba(23,22,20,.04)',
                        }}
                      >
                        <div style={{ padding: '13px 14px' }}>
                          <div style={{ font: `400 13px/1.65 ${FONT}`, color: C.ink }}>{t.answer.answer}</div>
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 8,
                            padding: '9px 14px 11px',
                            borderTop: `1px solid ${C.borderSoft}`,
                            background: C.surfaceAlt,
                          }}
                        >
                          <span
                            style={{
                              font: `600 9px/1.4 ${MONO}`,
                              letterSpacing: '.1em',
                              textTransform: 'uppercase',
                              color: VIZ.violet,
                              background: `${VIZ.violet}14`,
                              border: `1px solid ${VIZ.violet}33`,
                              borderRadius: 3,
                              padding: '2px 6px',
                              flex: '0 0 auto',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            EVIDENCE
                          </span>
                          <span style={{ font: `400 11px/1.5 ${MONO}`, color: C.inkFaint }}>
                            {t.answer.evidence.summary}
                          </span>
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
        </Panel>

        <Panel delayMs={60} style={{ alignSelf: 'start' }}>
          <PanelTitle>Try</PanelTitle>
          <div style={{ padding: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {PROMPTS.map((p, i) => (
              <button
                key={p}
                onClick={() => void ask(p)}
                disabled={busy}
                style={{
                  textAlign: 'left',
                  padding: '9px 12px',
                  border: `1px solid ${C.border}`,
                  borderRadius: 999,
                  background: C.surface,
                  font: `500 11.5px/1.4 ${FONT}`,
                  color: C.inkMuted,
                  cursor: busy ? 'not-allowed' : 'pointer',
                  opacity: busy ? 0.5 : 1,
                  animation: rise(i * 40),
                  transition: 'background .15s ease, border-color .15s ease',
                }}
                onMouseEnter={(e) => {
                  if (busy) return;
                  e.currentTarget.style.background = C.raised;
                  e.currentTarget.style.borderColor = C.borderActive;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = C.surface;
                  e.currentTarget.style.borderColor = C.border;
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}
