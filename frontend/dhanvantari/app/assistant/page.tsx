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
import { C, FONT, LABEL, MONO } from '../../lib/theme';
import { ApiError, Button, Card, Empty, PageHeader } from '../../components/ui';

const PROMPTS = [
  'how much ORS do we have',
  'what is expiring in 60 days',
  'what should I reorder',
  'which of my shipments are delayed',
  'was my insulin shipment kept cold',
  'is this supplier reliable',
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

      <div style={{ padding: 26, display: 'grid', gap: 16, maxWidth: 1100 }}>
        <div style={{ animation: 'mtRise .44s cubic-bezier(.16,1,.3,1) both' }}>
          <div style={{ ...LABEL, marginBottom: 8 }}>Suggested</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {PROMPTS.map((p) => (
              <button
                key={p}
                onClick={() => void ask(p)}
                disabled={busy}
                style={{
                  padding: '5px 10px',
                  borderRadius: 4,
                  border: `1px solid ${C.border}`,
                  background: C.surface,
                  color: C.inkMuted,
                  font: `500 11px/1.4 ${FONT}`,
                  cursor: busy ? 'not-allowed' : 'pointer',
                  opacity: busy ? 0.5 : 1,
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {turns.length === 0 ? (
          <Card>
            <Empty>Ask a question about this institution&rsquo;s stock, shipments or complaints, or pick a suggestion above.</Empty>
          </Card>
        ) : (
          <div style={{ display: 'grid', gap: 14 }}>
            {turns.map((t, i) => (
              <div key={i} style={{ display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <div
                    style={{
                      background: C.ink,
                      color: C.bg,
                      padding: '7px 12px',
                      borderRadius: 4,
                      font: `500 12px/1.5 ${FONT}`,
                      maxWidth: '70%',
                    }}
                  >
                    {t.question}
                  </div>
                </div>

                {t.error ? (
                  <ApiError error={t.error} service="dhanvantari-api" />
                ) : !t.answer ? (
                  <Card style={{ padding: 14 }}>
                    <div style={{ font: `400 12px/1.5 ${FONT}`, color: C.inkGhost }}>Thinking…</div>
                  </Card>
                ) : (
                  <>
                    <Card style={{ padding: 14 }}>
                      <div style={{ font: `400 13px/1.65 ${FONT}`, color: C.ink, whiteSpace: 'pre-wrap' }}>
                        {t.answer.answer}
                      </div>
                      <div style={{ font: `400 10px/1.6 ${MONO}`, color: C.inkGhost, marginTop: 9 }}>
                        {t.answer.intent} · {t.answer.narration} · {t.answer.ms}ms
                      </div>
                    </Card>

                    <Card>
                      <div
                        style={{
                          padding: '8px 12px',
                          borderBottom: `1px solid ${C.borderSoft}`,
                          background: C.surfaceAlt,
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: 10,
                        }}
                      >
                        <div style={LABEL}>Evidence</div>
                        <div style={{ font: `400 10px/1.4 ${FONT}`, color: C.inkGhost }}>
                          {t.answer.evidence.summary}
                        </div>
                      </div>
                      <pre
                        style={{
                          margin: 0,
                          padding: 12,
                          font: `400 11px/1.6 ${MONO}`,
                          color: C.inkMuted,
                          background: C.greyTint,
                          maxHeight: 300,
                          overflow: 'auto',
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {JSON.stringify(t.answer.evidence.data, null, 2)}
                      </pre>
                    </Card>
                  </>
                )}
              </div>
            ))}
            <div ref={endRef} />
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void ask(input);
            }}
            placeholder="Ask about stock, expiry, reorders, shipments, complaints…"
            style={{
              flex: 1,
              padding: '7px 10px',
              border: `1px solid ${C.border}`,
              borderRadius: 4,
              font: `400 13px/1.4 ${FONT}`,
              color: C.ink,
              background: C.surface,
            }}
          />
          <Button onClick={() => void ask(input)} disabled={busy || !input.trim()}>
            {busy ? '…' : 'Ask'}
          </Button>
        </div>

        <div style={{ font: `400 11px/1.6 ${FONT}`, color: C.inkGhost }}>
          Scoped to this institution&rsquo;s own data. The assistant physically cannot read another
          facility&rsquo;s stock — this server only reaches its own schema.
        </div>
      </div>
    </>
  );
}
