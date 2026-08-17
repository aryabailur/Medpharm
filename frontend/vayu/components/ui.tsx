/**
 * Terminal UI primitives.
 *
 * Square corners, hairline rules, monospace figures — the handoff reads as an
 * operations terminal rather than a consumer dashboard. Radii are 3–4px at
 * most; anything rounder breaks the language.
 *
 * Terminology (§1): never "vendor" in UI copy for the two parties. The
 * supplier/manufacturer ships; the institution receives. The dataset's
 * VEN01..VEN06 entities are literally called vendors, so that word is correct
 * as a column header for them.
 */

import type { CSSProperties, ReactNode } from 'react';

import { C, FONT, LABEL, MONO, statusColors } from '../lib/theme';

export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 20,
        padding: '20px 26px 16px',
        borderBottom: `1px solid ${C.border}`,
        background: C.surfaceAlt,
      }}
    >
      <div>
        <h1 style={{ margin: 0, font: `600 18px/1.2 ${FONT}`, color: C.ink, letterSpacing: '-0.01em' }}>
          {title}
        </h1>
        {subtitle && (
          <div style={{ font: `400 12px/1.5 ${FONT}`, color: C.inkSoft, marginTop: 5 }}>{subtitle}</div>
        )}
      </div>
      {right}
    </div>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 3, ...style }}>
      {children}
    </div>
  );
}

export function CardTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '10px 14px',
        borderBottom: `1px solid ${C.borderSoft}`,
        background: C.surfaceAlt,
      }}
    >
      <div style={LABEL}>{children}</div>
      {right}
    </div>
  );
}

export function Pill({ label, color, tint }: { label: string; color?: string; tint?: string }) {
  const auto = statusColors(label);
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 7px',
        borderRadius: 3,
        background: tint ?? auto.tint,
        color: color ?? auto.color,
        font: `600 10px/1.5 ${MONO}`,
        letterSpacing: '.04em',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

/**
 * Edge-to-edge KPI band — the handoff's signature element.
 *
 * Not cards in a row: a single grid flush to the page edges, hairline dividers
 * between cells, 44px tabular figures. Wrap Kpi children in this.
 */
export function KpiBand({ children, columns = 5 }: { children: ReactNode; columns?: number }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        background: C.surface,
        borderBottom: `1px solid ${C.border}`,
      }}
    >
      {children}
    </div>
  );
}

/** One cell of the KPI band. Figures are monospace and tabular so they align. */
export function Kpi({
  label,
  value,
  delta,
  deltaColor,
  note,
}: {
  label: string;
  value: string | number;
  delta?: string;
  deltaColor?: string;
  note?: string;
}) {
  return (
    <div style={{ padding: '26px 26px 24px', borderRight: `1px solid ${C.borderFaint}` }}>
      <div style={LABEL}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 9, marginTop: 14 }}>
        <span
          style={{
            font: `600 44px/1 ${MONO}`,
            letterSpacing: '-.04em',
            fontVariantNumeric: 'tabular-nums',
            color: C.ink,
          }}
        >
          {value}
        </span>
        {delta && (
          <span style={{ font: `500 11px/1 ${FONT}`, color: deltaColor ?? C.inkFaint, paddingBottom: 5 }}>
            {delta}
          </span>
        )}
      </div>
      {note && (
        <div style={{ font: `400 12px/1.7 ${FONT}`, color: C.inkFaint, marginTop: 9 }}>{note}</div>
      )}
    </div>
  );
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          {head.map((h) => (
            <th
              key={h}
              style={{
                textAlign: 'left',
                padding: '8px 14px',
                ...LABEL,
                borderBottom: `1px solid ${C.borderSoft}`,
                background: C.surfaceAlt,
                whiteSpace: 'nowrap',
              }}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

export function Td({ children, style }: { children?: ReactNode; style?: CSSProperties }) {
  return (
    <td
      style={{
        padding: '10px 14px',
        font: `400 13px/1.45 ${FONT}`,
        color: C.inkMuted,
        borderBottom: `1px solid ${C.borderSoft}`,
        verticalAlign: 'middle',
        ...style,
      }}
    >
      {children}
    </td>
  );
}

export function Mono({ children, color }: { children: ReactNode; color?: string }) {
  return <span style={{ font: `500 12px/1.4 ${MONO}`, color: color ?? C.ink }}>{children}</span>;
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
}) {
  const styles: Record<string, CSSProperties> = {
    primary: { background: C.ink, color: C.bg, border: `1px solid ${C.ink}` },
    ghost: { background: C.surface, color: C.inkMuted, border: `1px solid ${C.border}` },
    danger: { background: C.surface, color: C.red, border: `1px solid #E4C7C4` },
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '6px 12px',
        borderRadius: 3,
        font: `600 11px/1.3 ${FONT}`,
        letterSpacing: '.02em',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        ...styles[variant],
      }}
    >
      {children}
    </button>
  );
}

/** Segmented filter control, as used across the handoff's list screens. */
export function Segmented({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: 'inline-flex', border: `1px solid ${C.border}`, borderRadius: 3, overflow: 'hidden' }}>
      {options.map((o, i) => {
        const active = o.value === value;
        return (
          <button
            key={o.value || 'all'}
            onClick={() => onChange(o.value)}
            style={{
              padding: '5px 11px',
              border: 'none',
              borderLeft: i === 0 ? 'none' : `1px solid ${C.border}`,
              background: active ? C.ink : C.surface,
              color: active ? C.bg : C.inkFaint,
              font: `600 11px/1.4 ${FONT}`,
              cursor: 'pointer',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div style={{ padding: '30px 14px', textAlign: 'center', font: `400 12px/1.6 ${FONT}`, color: C.inkGhost }}>
      {children}
    </div>
  );
}

export function ApiError({ error, service = 'vayu-api' }: { error: string; service?: string }) {
  return (
    <Card style={{ padding: 16, borderColor: '#E4C7C4', background: C.redTint }}>
      <div style={{ font: `600 12px/1.4 ${FONT}`, color: C.red }}>Cannot reach {service}</div>
      <div style={{ font: `400 12px/1.6 ${FONT}`, color: C.inkMuted, marginTop: 5 }}>{error}</div>
      <div style={{ font: `400 11px/1.6 ${MONO}`, color: C.inkFaint, marginTop: 7 }}>
        npm run dev:{service}
      </div>
    </Card>
  );
}

/** Thin labelled progress rail. */
export function Meter({ pct, color }: { pct: number; color?: string }) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
  return (
    <div style={{ width: 90, height: 4, background: C.borderSoft, borderRadius: 2, overflow: 'hidden' }}>
      <div style={{ width: `${clamped}%`, height: '100%', background: color ?? C.accent }} />
    </div>
  );
}
