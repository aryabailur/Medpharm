'use client';

/**
 * Nidana — the network-scope assistant.
 *
 * ARCHITECTURE.md §7.1, §7.3.
 *
 * Named for the Ayurvedic term for diagnosis. Every answer ships with the
 * evidence bundle that produced it, because that is the claim: the model never
 * queries the database, it narrates typed JSON assembled by hand-written
 * Prisma calls. This screen's job is to make that evidence land visually: a
 * chart of it, not just prose (see `components/assistant/EvidenceChart`).
 */

import { useRef, useState } from 'react';

import { askAssistant } from '../../lib/api';
import {
  C,
  choreograph,
  EASE_OUT,
  FONT,
  MONO,
  pulse,
  reveal,
  scaleIn,
  slideIn,
} from '../../lib/theme';
import { ApiError, EmptyState, LiveChip, Panel, PanelTitle, Skeleton } from '../../components/ui';
import { EvidenceChart } from '../../components/assistant/EvidenceChart';

/**
 * `lib/api.ts`'s `AssistantAnswer` already carries `narration`/`ms` — this
 * local alias just documents that this screen relies on both, without
 * touching the shared file.
 */
type AssistantAnswer = Awaited<ReturnType<typeof askAssistant>>;

/** The six demo questions (§11). The backend is tuned to answer these. */
const PROMPTS = [
  'where are we about to stock out',
  'which institutions are least reliable',
  'what will we need next month',
  'show me cold chain incidents',
  'what is pending approval',
  'which drugs are moving fastest',
];

interface Turn {
  question: string;
  answer?: AssistantAnswer;
  error?: string;
  showEvidence?: boolean;
}

export default function AssistantPage() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
      requestAnimationFrame(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
        inputRef.current?.focus();
      });
    }
  }

  function toggleEvidence(i: number) {
    setTurns((t) => t.map((x, idx) => (idx === i ? { ...x, showEvidence: !x.showEvidence } : x)));
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0,1.45fr) minmax(0,1fr)',
        gap: 24,
        padding: '26px 26px 52px',
      }}
    >
      <Panel accent={C.accent} delayMs={0} style={{ display: 'flex', flexDirection: 'column', minHeight: 560 }}>
        <PanelTitle
          dot={C.accent}
          right={<LiveChip label="deterministic evidence" color={C.accent} />}
        >
          Nidana · network scope
        </PanelTitle>

        <div style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 18, overflowY: 'auto' }}>
          {turns.length === 0 ? (
            <EmptyState
              glyph="✦"
              title="Ask Nidana"
              hint="Ask a question about the network, or pick a suggestion from Try. Every answer narrates a deterministic evidence bundle, charted from the real data — never free-form SQL, never a fabricated number."
              height={420}
            />
          ) : (
            <>
              {turns.map((t, i) => (
                <ChatTurn key={i} turn={t} isLast={i === turns.length - 1} onToggleEvidence={() => toggleEvidence(i)} />
              ))}
              <div ref={endRef} />
            </>
          )}
        </div>

        <div style={{ padding: 18, borderTop: `1px solid ${C.border}`, display: 'flex', gap: 9 }}>
          <input
            ref={inputRef}
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
              transition: `opacity .15s ${EASE_OUT}`,
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
              animation: slideIn('up', choreograph(1, i)),
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

function ChatTurn({
  turn,
  isLast,
  onToggleEvidence,
}: {
  turn: Turn;
  isLast: boolean;
  onToggleEvidence: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, animation: isLast ? reveal(0) : undefined }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div
          style={{
            maxWidth: '80%',
            background: '#F0EEEB',
            border: '1px solid #E4E2DF',
            borderRadius: 6,
            padding: '12px 14px',
            boxShadow: '0 1px 2px rgba(23,22,20,.04)',
            animation: isLast ? slideIn('right', 0) : undefined,
          }}
        >
          <div style={{ font: `400 13px/1.65 ${FONT}`, color: C.ink }}>{turn.question}</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
        <div
          style={{
            maxWidth: '92%',
            width: turn.answer && !turn.error ? '92%' : undefined,
            background: C.surface,
            border: '1px solid #E4E2DF',
            borderRadius: 6,
            padding: turn.error ? '13px 15px' : 0,
            overflow: 'hidden',
            boxShadow: '0 1px 2px rgba(23,22,20,.04)',
            animation: isLast ? slideIn('left', 80) : undefined,
          }}
        >
          {turn.error ? (
            <ApiError error={turn.error} service="vayu-api" />
          ) : !turn.answer ? (
            <ThinkingIndicator />
          ) : (
            <AnswerBody turn={turn} onToggleEvidence={onToggleEvidence} />
          )}
        </div>
      </div>
    </div>
  );
}

function ThinkingIndicator() {
  return (
    <div style={{ padding: '13px 15px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, font: `400 13px/1.65 ${FONT}`, color: C.inkGhost }}>
        <span style={{ display: 'inline-flex', gap: 3 }}>
          <Dot delay={0} />
          <Dot delay={0.15} />
          <Dot delay={0.3} />
        </span>
        Thinking…
      </div>
      <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
        <Skeleton height={12} width="70%" />
        <Skeleton height={120} />
      </div>
    </div>
  );
}

function AnswerBody({ turn, onToggleEvidence }: { turn: Turn; onToggleEvidence: () => void }) {
  const answer = turn.answer;
  if (!answer) return null;
  const narrationIsLlm = answer.narration === 'llm';

  return (
    <div>
      <div style={{ padding: '13px 15px 4px' }}>
        <div style={{ font: `400 13px/1.65 ${FONT}`, color: C.ink, whiteSpace: 'pre-wrap' }}>{answer.answer}</div>
      </div>

      <div style={{ padding: '4px 15px 14px' }}>
        <EvidenceChart intent={answer.evidence.intent} data={answer.evidence.data} />
      </div>

      <button
        onClick={onToggleEvidence}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          padding: '9px 15px',
          border: 'none',
          borderTop: `1px solid ${C.borderSoft}`,
          background: C.surfaceAlt,
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span
          style={{
            font: `600 10px/1 ${FONT}`,
            letterSpacing: '.13em',
            textTransform: 'uppercase',
            color: C.inkGhost,
          }}
        >
          Raw evidence · {answer.evidence.summary}
        </span>
        <span style={{ font: `600 10px/1 ${MONO}`, color: C.inkFaint }}>{turn.showEvidence ? '▲' : '▼'}</span>
      </button>

      {turn.showEvidence && (
        <div style={{ padding: '11px 15px', borderTop: `1px solid ${C.borderSoft}`, animation: scaleIn(0, 0.28) }}>
          <pre
            style={{
              margin: 0,
              maxHeight: 260,
              overflow: 'auto',
              font: `400 10.5px/1.6 ${MONO}`,
              color: C.inkMuted,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {JSON.stringify(answer.evidence.data, null, 2)}
          </pre>
        </div>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          padding: '9px 15px 11px',
          borderTop: `1px solid ${C.borderSoft}`,
        }}
      >
        <MetaChip label={answer.intent} tone={C.inkFaint} />
        <MetaChip label={`${answer.ms}ms`} tone={C.inkFaint} />
        <MetaChip
          label={narrationIsLlm ? 'llm narration' : 'template narration'}
          tone={narrationIsLlm ? C.accent : C.amber}
          dot={narrationIsLlm ? C.accent : C.amber}
        />
      </div>
    </div>
  );
}

function MetaChip({ label, tone, dot }: { label: string; tone: string; dot?: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        height: 20,
        padding: '0 8px',
        borderRadius: 999,
        background: `${tone}14`,
        border: `1px solid ${tone}33`,
        font: `500 10px/1.4 ${MONO}`,
        color: tone,
        whiteSpace: 'nowrap',
      }}
    >
      {dot && <span style={{ width: 5, height: 5, borderRadius: '50%', background: dot, animation: pulse(2) }} />}
      {label}
    </span>
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
