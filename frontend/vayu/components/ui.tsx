/**
 * Shared presentational primitives, styled from the mockup's tokens.
 *
 * Terminology (§1): never the word "vendor" in UI copy. Supplier/Manufacturer
 * ships; Institution receives.
 */

import type { CSSProperties, ReactNode } from 'react';

import { C, FONT, MONO, statusColors } from '../lib/theme';

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        padding: '22px 28px 16px',
        borderBottom: `1px solid ${C.border}`,
        background: C.surface,
      }}
    >
      <div>
        <h1 style={{ margin: 0, font: `600 19px/1.2 ${FONT}`, color: C.ink }}>{title}</h1>
        {subtitle && (
          <div style={{ font: `400 13px/1.4 ${FONT}`, color: C.inkFaint, marginTop: 4 }}>
            {subtitle}
          </div>
        )}
      </div>
      {right}
    </div>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        ...style,
      }}
    >
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
        padding: '13px 16px',
        borderBottom: `1px solid ${C.borderSoft}`,
      }}
    >
      <div style={{ font: `600 13px/1.2 ${FONT}`, color: C.ink }}>{children}</div>
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
        padding: '3px 8px',
        borderRadius: 6,
        background: tint ?? auto.tint,
        color: color ?? auto.color,
        font: `600 10px/1.4 ${MONO}`,
        letterSpacing: '.04em',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

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
    <Card style={{ padding: '14px 16px', flex: '1 1 200px', minWidth: 190 }}>
      <div style={{ font: `500 11px/1.2 ${FONT}`, color: C.inkFaint, letterSpacing: '.02em' }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 7 }}>
        <div style={{ font: `600 26px/1 ${FONT}`, color: C.ink }}>{value}</div>
        {delta && (
          <div style={{ font: `600 11px/1 ${FONT}`, color: deltaColor ?? C.grey }}>{delta}</div>
        )}
      </div>
      {note && (
        <div style={{ font: `400 11px/1.45 ${FONT}`, color: C.inkGhost, marginTop: 7 }}>{note}</div>
      )}
    </Card>
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
                padding: '9px 16px',
                font: `600 10px/1.2 ${FONT}`,
                letterSpacing: '.08em',
                textTransform: 'uppercase',
                color: C.inkGhost,
                borderBottom: `1px solid ${C.borderSoft}`,
                background: '#FAFBFB',
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
        padding: '11px 16px',
        font: `400 13px/1.4 ${FONT}`,
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

export function Mono({ children }: { children: ReactNode }) {
  return <span style={{ font: `500 12px/1.4 ${MONO}`, color: C.ink }}>{children}</span>;
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
    primary: { background: C.steel, color: '#FFF', border: `1px solid ${C.steel}` },
    ghost: { background: C.surface, color: C.inkMuted, border: `1px solid ${C.border}` },
    danger: { background: C.surface, color: C.red, border: `1px solid #E7C9C6` },
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '7px 13px',
        borderRadius: 7,
        font: `600 12px/1.2 ${FONT}`,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        ...styles[variant],
      }}
    >
      {children}
    </button>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        padding: '34px 16px',
        textAlign: 'center',
        font: `400 13px/1.5 ${FONT}`,
        color: C.inkGhost,
      }}
    >
      {children}
    </div>
  );
}

/** Shown when the API server is unreachable — the most common dev failure. */
export function ApiError({ error }: { error: string }) {
  return (
    <Card style={{ padding: 18, borderColor: '#E7C9C6', background: C.redTint }}>
      <div style={{ font: `600 13px/1.3 ${FONT}`, color: C.red }}>Cannot reach vayu-api</div>
      <div style={{ font: `400 12px/1.5 ${FONT}`, color: C.inkMuted, marginTop: 6 }}>
        {error}
      </div>
      <div style={{ font: `400 12px/1.5 ${MONO}`, color: C.inkFaint, marginTop: 8 }}>
        npm run dev:vayu-api
      </div>
    </Card>
  );
}
