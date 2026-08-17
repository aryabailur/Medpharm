'use client';

/**
 * Assistant — grounded Q&A over the vayu-api evidence bundles.
 *
 * The model never queries the database (§ complaints RCA note reused here):
 * every answer is a narration of a JSON bundle assembled by code, and that
 * bundle is always shown alongside the prose so the claim is checkable.
 */

import { useState } from 'react';

import { askAssistant, type AssistantAnswer } from '../../lib/api';
import { C, FONT, MONO } from '../../lib/theme';
import { ApiError, Button, Card, CardTitle, PageHeader } from '../../components/ui';

const SUGGESTIONS = [
  "what's pending approval",
  'how many excursions this month',
  'where are we about to stock out',
  'which institutions report the most damage',
  'which drug is moving fastest',
  'trace batch B4417',
];

interface Turn {
  question: string;
  answer: AssistantAnswer | null;
  error: string | null;
}

export default function AssistantPage() {
  const [input, setInput] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setBusy(true);
    setInput('');
    setTurns((prev) => [...prev, { question: q, answer: null, error: null }]);
    try {
      const res = await askAssistant(q);
      setTurns((prev) => prev.map((t, i) => (i === prev.length - 1 ? { ...t, answer: res } : t)));
    } catch (e) {
      const msg = (e as Error).message;
      setTurns((prev) => prev.map((t, i) => (i === prev.length - 1 ? { ...t, error: msg } : t)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Assistant" subtitle="Grounded in evidence — the model never queries the database" />

      <div style={{ padding: 28, display: 'grid', gap: 18, maxWidth: 900 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => void ask(s)}
              disabled={busy}
              style={{
                padding: '6px 11px',
                borderRadius: 7,
                border: `1px solid ${C.border}`,
                background: C.surface,
                color: C.inkFaint,
                font: `600 11px/1.2 ${FONT}`,
                cursor: busy ? 'not-allowed' : 'pointer',
                opacity: busy ? 0.6 : 1,
              }}
            >
              {s}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void ask(input);
            }}
            placeholder="Ask about orders, shipments, risk, or a batch…"
            style={{
              flex: 1,
              border: `1px solid ${C.border}`,
              borderRadius: 7,
              padding: '8px 11px',
              font: `400 13px/1.2 ${FONT}`,
              color: C.ink,
              background: C.surface,
            }}
          />
          <Button onClick={() => void ask(input)} disabled={busy || !input.trim()}>
            {busy ? '…' : 'Ask'}
          </Button>
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          {turns.map((t, i) => (
            <div key={i} style={{ display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div
                  style={{
                    background: C.steelTint,
                    color: C.ink,
                    borderRadius: 10,
                    padding: '9px 14px',
                    font: `500 13px/1.5 ${FONT}`,
                    maxWidth: '75%',
                  }}
                >
                  {t.question}
                </div>
              </div>

              {t.error ? (
                <ApiError error={t.error} />
              ) : !t.answer ? (
                <div style={{ font: `400 13px/1.5 ${FONT}`, color: C.inkFaint }}>Thinking…</div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <div style={{ maxWidth: '85%', display: 'grid', gap: 8 }}>
                    <div
                      style={{
                        background: C.surface,
                        border: `1px solid ${C.border}`,
                        borderRadius: 10,
                        padding: '9px 14px',
                        font: `400 13px/1.6 ${FONT}`,
                        color: C.inkMuted,
                      }}
                    >
                      {t.answer.answer}
                    </div>
                    <div style={{ font: `400 11px/1.4 ${MONO}`, color: C.inkGhost }}>
                      {t.answer.intent} · {t.answer.narration} · {t.answer.ms}ms
                    </div>

                    <Card>
                      <CardTitle>Evidence</CardTitle>
                      <div style={{ padding: '12px 16px', display: 'grid', gap: 10 }}>
                        <div style={{ font: `400 12px/1.6 ${FONT}`, color: C.inkMuted }}>
                          {t.answer.evidence.summary}
                        </div>
                        <pre
                          style={{
                            font: `400 11px/1.5 ${MONO}`,
                            background: C.greyTint,
                            padding: 12,
                            borderRadius: 8,
                            maxHeight: 320,
                            overflow: 'auto',
                            whiteSpace: 'pre-wrap',
                            margin: 0,
                          }}
                        >
                          {JSON.stringify(t.answer.evidence.data, null, 2)}
                        </pre>
                      </div>
                    </Card>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div style={{ font: `400 11px/1.5 ${FONT}`, color: C.inkFaint }}>
          Every answer ships with the evidence bundle that produced it. It cannot invent a number it was never
          given.
        </div>
      </div>
    </>
  );
}
