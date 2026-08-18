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
import { EmptyState, LiveChip, Panel, PanelTitle } from '../../components/ui';

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

/** Renders the evidence payload's shape without assuming a fixed schema —
 *  the intent decides what the data looks like, so this stays generic. */
function EvidencePreview({ data }: { data: unknown }) {
  if (data == null) return <span style={{ color: C.inkGhost }}>No evidence payload.</span>;
  if (Array.isArray(data)) {
    if (data.length === 0) return <span style={{ color: C.inkGhost }}>Empty evidence set.</span>;
    return (
      <div style={{ display: 'grid', gap: 6 }}>
        {data.slice(0, 6).map((row, i) => (
          <div
            key={i}
            style={{
              padding: '7px 10px',
              background: C.raised,
              borderRadius: 3,
              font: `400 11px/1.5 ${MONO}`,
              color: C.inkMuted,
              overflowX: 'auto',
              whiteSpace: 'nowrap',
            }}
          >
            {summarizeRow(row)}
          </div>
        ))}
        {data.length > 6 && (
          <div style={{ font: `400 10.5px/1.4 ${FONT}`, color: C.inkGhost }}>
            + {data.length - 6} more row{data.length - 6 === 1 ? '' : 's'}
          </div>
        )}
      </div>
    );
  }
  if (typeof data === 'object') {
    return (
      <div
        style={{
          padding: '9px 11px',
          background: C.raised,
          borderRadius: 3,
          font: `400 11px/1.6 ${MONO}`,
          color: C.inkMuted,
        }}
      >
        {summarizeRow(data)}
      </div>
    );
  }
  return <span style={{ font: `400 12px/1.5 ${MONO}`, color: C.inkMuted }}>{String(data)}</span>;
}

/** Flattens one evidence row to a compact `key: value · key: value` line. */
function summarizeRow(row: unknown): string {
  if (row == null || typeof row !== 'object') return String(row);
  const entries = Object.entries(row as Record<string, unknown>).filter(
    ([, v]) => typeof v !== 'object' || v === null,
  );
  return entries
    .slice(0, 5)
    .map(([k, v]) => `${k}: ${v}`)
    .join(' · ');
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
      <Panel accent={C.accent} delayMs={0} style={{ display: 'flex', flexDirection: 'column', minHeight: 560 }}>
        <PanelTitle
          dot={C.accent}
          right={<LiveChip label="deterministic evidence" color={C.accent} />}
        >
          Nidana · network scope
        </PanelTitle>

        <div style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
          {turns.length === 0 ? (
            <EmptyState
              glyph="✦"
              title="Ask Nidana"
              hint="Ask a question about the network, or pick a suggestion from Try. Every answer narrates a deterministic evidence bundle — never free-form SQL."
              height={420}
            />
          ) : (
            <>
              {turns.map((t, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 12, animation: i === turns.length - 1 ? rise(0) : undefined }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <div
                      style={{
                        maxWidth: '80%',
                        background: '#F0EEEB',
                        border: '1px solid #E4E2DF',
                        borderRadius: 6,
                        padding: '12px 14px',
                        boxShadow: '0 1px 2px rgba(23,22,20,.04)',
                      }}
                    >
                      <div style={{ font: `400 13px/1.65 ${FONT}`, color: C.ink }}>{t.question}</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                    <div
                      style={{
                        maxWidth: '86%',
                        background: C.surface,
                        border: '1px solid #E4E2DF',
                        borderRadius: 6,
                        padding: '13px 15px',
                        boxShadow: '0 1px 2px rgba(23,22,20,.04)',
                      }}
                    >
                      {t.error ? (
                        <div style={{ font: `400 13px/1.65 ${FONT}`, color: C.red }}>{t.error}</div>
                      ) : !t.answer ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, font: `400 13px/1.65 ${FONT}`, color: C.inkGhost }}>
                          <span style={{ display: 'inline-flex', gap: 3 }}>
                            <Dot delay={0} />
                            <Dot delay={0.15} />
                            <Dot delay={0.3} />
                          </span>
                          Thinking…
                        </div>
                      ) : (
                        <>
                          <div style={{ font: `400 13px/1.65 ${FONT}`, color: C.ink, whiteSpace: 'pre-wrap' }}>
                            {t.answer.answer}
                          </div>

                          <div style={{ marginTop: 12, paddingTop: 11, borderTop: `1px solid ${C.borderSoft}` }}>
                            <div
                              style={{
                                font: `600 10px/1 ${FONT}`,
                                letterSpacing: '.13em',
                                textTransform: 'uppercase',
                                color: C.inkGhost,
                                marginBottom: 8,
                              }}
                            >
                              Evidence · {t.answer.evidence.summary}
                            </div>
                            <EvidencePreview data={t.answer.evidence.data} />
                          </div>

                          <div
                            style={{
                              font: `400 10.5px/1.5 ${MONO}`,
                              color: C.inkFaint,
                              marginTop: 10,
                              paddingTop: 9,
                              borderTop: `1px solid ${C.borderSoft}`,
                            }}
                          >
                            {t.answer.intent} · narration: {t.answer.narration} · {t.answer.ms}ms
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
              font: `600 12px/1 ${FONT}`,
              padding: '11px 16px',
              borderRadius: 4,
              cursor: busy || !input.trim() ? 'not-allowed' : 'pointer',
              opacity: busy || !input.trim() ? 0.6 : 1,
            }}
          >
            {busy ? '…' : 'Send'}
          </button>
        </div>
      </Panel>

      <Panel accent={C.accent} delayMs={60} style={{ alignSelf: 'start' }}>
        <PanelTitle dot={C.accent}>Try</PanelTitle>
        {PROMPTS.map((p, i) => (
          <div
            key={p}
            onClick={() => void ask(p)}
            style={{
              padding: '15px 18px',
              borderBottom: i === PROMPTS.length - 1 ? 'none' : `1px solid ${C.borderSoft}`,
              font: `400 12.5px/1.5 ${FONT}`,
              color: C.inkMuted,
              cursor: busy ? 'not-allowed' : 'pointer',
              opacity: busy ? 0.6 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              transition: 'background .15s ease, color .15s ease',
              animation: rise(i * 40),
            }}
            onMouseEnter={(e) => {
              if (!busy) e.currentTarget.style.background = C.surfaceAlt;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <span style={{ color: C.accent, font: `600 11px/1 ${MONO}` }}>?</span>
            {p}
          </div>
        ))}
      </Panel>
    </div>
  );
}

function Dot({ delay }: { delay: number }) {
  return (
    <span
      style={{
        width: 5,
        height: 5,
        borderRadius: '50%',
        background: C.inkGhost,
        display: 'inline-block',
        animation: `mtPulse 1s ease ${delay}s infinite`,
      }}
    />
  );
}
