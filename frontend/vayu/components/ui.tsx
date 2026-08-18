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

import {
  bandColors,
  BORDER,
  C,
  countIn,
  EASE_OUT,
  EDGE,
  FONT,
  GRAD,
  HOVER,
  LABEL,
  MONO,
  pulse,
  rise,
  riseScale,
  SHADOW,
  shimmer,
  stagger,
  statusColors,
  TYPE,
} from '../lib/theme';

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
        <h1 style={{ margin: 0, ...TYPE.scaleH1, color: C.ink }}>
          {title}
        </h1>
        {subtitle && (
          <div style={{ ...TYPE.scaleCaption, color: C.inkSoft, marginTop: 5 }}>{subtitle}</div>
        )}
      </div>
      {right}
    </div>
  );
}

/**
 * Base card. Same square-ish geometry as the handoff drew it — this stays the
 * plain, static building block; `Panel` below is the elevated sibling with
 * motion and hover. Both share one radius/shadow scale so a screen can mix
 * them without the seams showing.
 */
export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        background: C.surface,
        border: BORDER.card,
        borderRadius: 4,
        boxShadow: SHADOW.sm,
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
        gap: 12,
        padding: '11px 14px',
        borderBottom: `1px solid ${C.borderSoft}`,
        background: GRAD.header,
      }}
    >
      <div style={LABEL}>{children}</div>
      {right}
    </div>
  );
}

/**
 * Status pill — part of a coherent badge family with `LiveChip` and
 * `ScoreBadge`: same 20px optical height, same radius logic, same monospace
 * label treatment, so the eye doesn't have to re-learn a shape per badge.
 */
export function Pill({ label, color, tint }: { label: string; color?: string; tint?: string }) {
  const auto = statusColors(label);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 20,
        padding: '0 7px',
        borderRadius: 4,
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
        borderTop: BORDER.card,
        borderBottom: BORDER.card,
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
    <div style={{ padding: '26px 26px 24px', borderRight: BORDER.divider }}>
      <div style={LABEL}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 9, marginTop: 14 }}>
        <span
          style={{
            font: `600 44px/1 ${MONO}`,
            letterSpacing: '-.04em',
            fontVariantNumeric: 'tabular-nums',
            fontFeatureSettings: '"tnum" 1, "case" 1',
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

/**
 * Data table. `sticky` pins the header to the top of its scroll container —
 * pair with a fixed-height wrapper. `zebra` adds a faint alternating wash on
 * top of the existing hairline separators; `dense` tightens cell padding for
 * a screen with many rows. All three default to the original look, so every
 * existing call site renders exactly as before.
 */
export function Table({
  head,
  children,
  sticky = false,
  zebra = false,
  dense = false,
}: {
  head: string[];
  children: ReactNode;
  /** Pin the header row via `position: sticky; top: 0`. */
  sticky?: boolean;
  /** Faint alternating row wash, layered under the hairline rules. */
  zebra?: boolean;
  /** Tighter cell padding for dense data screens. */
  dense?: boolean;
}) {
  return (
    <table
      className={zebra ? 'mt-table-zebra' : undefined}
      style={{ width: '100%', borderCollapse: 'collapse' }}
    >
      <thead>
        <tr>
          {head.map((h) => (
            <th
              key={h}
              style={{
                textAlign: 'left',
                padding: dense ? '6px 12px' : '8px 14px',
                ...LABEL,
                borderBottom: BORDER.divider,
                background: C.surfaceAlt,
                whiteSpace: 'nowrap',
                ...(sticky ? { position: 'sticky', top: 0, zIndex: 1 } : null),
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

export function Td({
  children,
  style,
  numeric = false,
  hoverable = false,
}: {
  children?: ReactNode;
  style?: CSSProperties;
  /** Right-align + tabular figures, for a numeric column. */
  numeric?: boolean;
  /** Deprecated no-op retained for API stability — hover now lives on the
   * enclosing `<tr>` via the `mt-row` class; wrap rows in that class instead. */
  hoverable?: boolean;
}) {
  void hoverable;
  return (
    <td
      style={{
        padding: '10px 14px',
        font: `400 13px/1.45 ${FONT}`,
        color: C.inkMuted,
        borderBottom: `1px solid ${C.borderSoft}`,
        verticalAlign: 'middle',
        ...(numeric
          ? { textAlign: 'right', fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }
          : null),
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

/** Buttons depress on `:active` and lift a touch on hover via `.mt-btn` (see
 * the global `<style>` block) — CSS-only, so this stays a plain function. */
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
      className="mt-btn"
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

/** Segmented filter control, as used across the handoff's list screens. The
 * active pill slides via `left`/`width` transitions on the underlying
 * buttons rather than a separate absolutely-positioned thumb, so it keeps
 * working with any number of options without extra layout math. */
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
    <div style={{ display: 'inline-flex', border: BORDER.inner, borderRadius: 4, overflow: 'hidden' }}>
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
              transition: `background .16s ${EASE_OUT}, color .16s ${EASE_OUT}`,
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

/**
 * Thin progress rail.
 *
 * Re-exported from charts.tsx so a table cell and a chart axis can never drift
 * apart — there is one meter in the product, not two.
 */
export { Meter } from './charts';

// ===========================================================================
// VIBRANT LAYER - additive primitives for the pitch build.
//
// The primitives above stay as the approved handoff drew them. These add depth,
// hover affordance and richer empty/loading states, because a blank hairline
// box reads as "broken" on a projector and several screens legitimately have
// no rows yet.
// ===========================================================================

/**
 * Elevated card \u2014 the workhorse container. Same square-ish geometry as
 * `Card`, plus a warm shadow, an optional accent hairline along the top
 * edge, an entrance animation, and (new) a resting/raised elevation choice
 * and an optional gradient surface for a panel that wants to read as a
 * step up from its neighbours (e.g. a hero/summary panel).
 */
export function Panel({
  children,
  style,
  accent,
  delayMs = 0,
  hover = false,
  elevation = 'resting',
  surface = 'flat',
}: {
  children: ReactNode;
  style?: CSSProperties;
  /** Draws a 2px accent rule along the top edge. */
  accent?: string;
  delayMs?: number;
  hover?: boolean;
  /** Resting = `SHADOW.md` (default, unchanged). Raised = `SHADOW.lg`, for a
   * panel that should visually sit above its neighbours without a hover. */
  elevation?: 'resting' | 'raised';
  /** 'flat' (default, unchanged) or 'wash' for a faint gradient body fill. */
  surface?: 'flat' | 'wash';
}) {
  return (
    <div
      className={hover ? 'mt-panel-hover' : undefined}
      style={{
        position: 'relative',
        background: surface === 'wash' ? GRAD.band : C.surface,
        border: BORDER.card,
        borderRadius: 6,
        boxShadow: elevation === 'raised' ? SHADOW.lg : SHADOW.md,
        animation: riseScale(delayMs),
        transition: HOVER,
        ...style,
      }}
    >
      {accent && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 2,
            background: `linear-gradient(90deg,${accent} 0%,${accent}44 100%)`,
            borderRadius: '6px 6px 0 0',
          }}
        />
      )}
      {children}
    </div>
  );
}

/**
 * Panel header \u2014 gradient wash, optional status dot, a real title (not just
 * a label strip): `children` renders as the uppercase section label as
 * before, and the new optional `title`/`subtitle` sit below it at body
 * weight so a panel can carry an actual headline when it needs one.
 */
export function PanelTitle({
  children,
  right,
  dot,
  title,
  subtitle,
}: {
  children: ReactNode;
  right?: ReactNode;
  /** Small status dot in this colour, left of the label. */
  dot?: string;
  /** Optional headline rendered below the label, at H2 weight. */
  title?: ReactNode;
  /** Optional caption under the title. */
  subtitle?: ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: title ? '12px 16px 13px' : '13px 16px',
        borderBottom: `1px solid ${C.borderSoft}`,
        background: GRAD.header,
        borderRadius: '6px 6px 0 0',
      }}
    >
      {dot && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: dot,
            boxShadow: `0 0 0 3px ${dot}1F`,
            flex: '0 0 6px',
            marginTop: title ? 3 : 0,
            alignSelf: title ? 'flex-start' : 'center',
          }}
        />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...LABEL, letterSpacing: '.15em' }}>{children}</div>
        {title && (
          <div style={{ ...TYPE.scaleH2, color: C.ink, marginTop: 3 }}>{title}</div>
        )}
        {subtitle && (
          <div style={{ ...TYPE.scaleCaption, color: C.inkFaint, marginTop: 2 }}>{subtitle}</div>
        )}
      </div>
      {right}
    </div>
  );
}

/** A live "streaming" chip - pulsing dot plus label. Signals SSE is attached.
 * Scales gently on hover via `.mt-chip`, part of the shared badge family. */
export function LiveChip({ label = 'live', color = C.green }: { label?: string; color?: string }) {
  return (
    <span
      className="mt-chip"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 20,
        gap: 6,
        padding: '0 9px 0 7px',
        borderRadius: 999,
        background: `${color}14`,
        border: `1px solid ${color}33`,
        font: `600 10px/1.4 ${MONO}`,
        letterSpacing: '.08em',
        color,
        textTransform: 'uppercase',
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: color,
          animation: pulse(1.8),
        }}
      />
      {label}
    </span>
  );
}

/**
 * Trend chip - a signed delta with direction colour.
 * `goodDirection` decides whether up is green or red (rising complaints is bad).
 */
export function Trend({
  value,
  suffix = '',
  goodDirection = 'up',
}: {
  value: number;
  suffix?: string;
  goodDirection?: 'up' | 'down' | 'none';
}) {
  const up = value > 0;
  const flat = value === 0;
  const good = goodDirection === 'none' ? null : goodDirection === 'up' ? up : !up;
  const color = flat ? C.inkFaint : good == null ? C.inkFaint : good ? C.green : C.red;
  const tint = flat ? C.greyTint : good == null ? C.greyTint : good ? C.greenTint : C.redTint;
  return (
    <span
      className="mt-chip"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 20,
        gap: 3,
        padding: '0 7px',
        borderRadius: 999,
        background: tint,
        font: `600 11px/1 ${MONO}`,
        color,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <span style={{ font: `600 9px/1 ${FONT}` }}>{flat ? '\u2192' : up ? '\u25B2' : '\u25BC'}</span>
      {up && !flat ? '+' : ''}
      {value}
      {suffix}
    </span>
  );
}

/**
 * Hero KPI cell — the signature element. Wider type ramp than `Kpi`, an
 * optional icon slot, an optional inline sparkline, a trend chip, and a
 * hover lift (`.mt-kpi`, defined in the global `<style>` block). Use inside
 * `KpiBand`. The figure animates in with `rollUp` instead of the plainer
 * `countIn` so it reads as a number resolving into place, not just fading.
 */
export function KpiHero({
  label,
  value,
  sub,
  trend,
  accent = C.accent,
  spark,
  index = 0,
  icon,
}: {
  label: string;
  value: string | number;
  sub?: ReactNode;
  trend?: ReactNode;
  accent?: string;
  spark?: ReactNode;
  index?: number;
  /** Optional small icon/glyph slot, right-aligned beside the label. */
  icon?: ReactNode;
}) {
  return (
    <div
      className="mt-kpi"
      style={{
        position: 'relative',
        padding: '22px 24px 20px',
        borderRight: BORDER.divider,
        background: GRAD.band,
        animation: stagger(index),
        transition: HOVER,
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            width: 3,
            height: 11,
            background: accent,
            borderRadius: 2,
            flex: '0 0 3px',
          }}
        />
        <div style={{ ...LABEL, letterSpacing: '.15em', flex: 1 }}>{label}</div>
        {icon && (
          <span style={{ color: accent, display: 'flex', alignItems: 'center', opacity: 0.85 }}>
            {icon}
          </span>
        )}
      </div>

      <div
        className="mt-kpi-value"
        style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginTop: 12, transition: `transform .22s ${EASE_OUT}` }}
      >
        <span
          style={{
            font: `600 40px/1 ${MONO}`,
            letterSpacing: TYPE.display,
            fontVariantNumeric: 'tabular-nums',
            fontFeatureSettings: '"tnum" 1',
            color: C.ink,
            animation: countIn(120 + index * 55),
          }}
        >
          {value}
        </span>
        {trend && <span style={{ paddingBottom: 6 }}>{trend}</span>}
      </div>

      {sub && (
        <div style={{ font: `400 12px/1.6 ${FONT}`, color: C.inkFaint, marginTop: 7 }}>{sub}</div>
      )}
      {spark && <div style={{ marginTop: 10 }}>{spark}</div>}
    </div>
  );
}

/**
 * Designed empty state. Replaces a bare "No data" line: a glyph, a headline, a
 * why-line, and an optional action. An empty screen should still look built.
 */
export function EmptyState({
  glyph = '\u25C7',
  title,
  hint,
  action,
  height = 200,
  tone = C.inkGhost,
}: {
  glyph?: string;
  title: string;
  hint?: string;
  action?: ReactNode;
  height?: number;
  tone?: string;
}) {
  return (
    <div
      style={{
        minHeight: height,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        padding: '28px 20px',
        textAlign: 'center',
        animation: rise(60),
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          display: 'grid',
          placeItems: 'center',
          background: GRAD.header,
          border: `1px solid ${C.borderSoft}`,
          boxShadow: SHADOW.sm,
          font: `400 18px/1 ${FONT}`,
          color: tone,
          marginBottom: 10,
        }}
      >
        {glyph}
      </div>
      <div style={{ ...TYPE.scaleH2, color: C.inkMuted }}>{title}</div>
      {hint && (
        <div style={{ ...TYPE.scaleCaption, color: C.inkGhost, maxWidth: 320 }}>{hint}</div>
      )}
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </div>
  );
}

/** Shimmering placeholder block, for a panel awaiting its first payload. */
export function Skeleton({
  height = 14,
  width = '100%',
  radius = 4,
}: {
  height?: number | string;
  width?: number | string;
  radius?: number;
}) {
  return (
    <div
      style={{
        height,
        width,
        borderRadius: radius,
        background: `linear-gradient(90deg,${C.raised} 0%,${C.borderSoft} 50%,${C.raised} 100%)`,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(90deg,transparent 0%,#FFFFFFB0 50%,transparent 100%)',
          animation: shimmer(1.6),
        }}
      />
    </div>
  );
}

/** Several skeleton rows, sized like a table body. */
export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Skeleton width={64} height={11} />
          <div style={{ flex: 1 }}>
            <Skeleton height={11} />
          </div>
          <Skeleton width={44} height={11} />
        </div>
      ))}
    </div>
  );
}

/**
 * Severity/score badge with a filled leading block - louder than `Pill` for the
 * one number on screen that should draw the eye first.
 */
export function ScoreBadge({
  score,
  band,
  digits = 2,
}: {
  score: number;
  band: string;
  digits?: number;
}) {
  const { color, tint } = bandColors(band.toUpperCase());
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'stretch',
        height: 22,
        borderRadius: 5,
        overflow: 'hidden',
        border: `1px solid ${color}33`,
        background: tint,
        boxShadow: SHADOW.sm,
      }}
    >
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '0 8px',
          font: `600 13px/1.3 ${MONO}`,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-.02em',
          color: '#FFFFFF',
          background: color,
        }}
      >
        {score.toFixed(digits)}
      </span>
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '0 8px',
          font: `600 10px/1.6 ${MONO}`,
          letterSpacing: '.06em',
          color,
          textTransform: 'uppercase',
        }}
      >
        {band}
      </span>
    </span>
  );
}

/** Section heading between stacked panels, with a hairline rule. */
export function SectionRule({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0 2px' }}>
      <div style={{ ...LABEL, letterSpacing: '.15em', whiteSpace: 'nowrap' }}>{children}</div>
      <div style={{ flex: 1, height: 1, background: C.borderSoft }} />
      {right}
    </div>
  );
}

// ===========================================================================
// NEW PRIMITIVES — additive, server-renderable (CSS-only interactivity).
// ===========================================================================

/**
 * A labelled value on one line — label left, value right, hairline beneath.
 * The compact alternative to a full `Kpi`/`KpiHero` cell for a dense panel
 * (e.g. a details drawer, a summary list).
 */
export function StatRow({
  label,
  value,
  valueColor,
  hairline = true,
}: {
  label: ReactNode;
  value: ReactNode;
  valueColor?: string;
  /** Draw the bottom hairline (default) or omit it for the last row. */
  hairline?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '9px 0',
        borderBottom: hairline ? `1px solid ${C.borderSoft}` : 'none',
      }}
    >
      <span style={{ ...TYPE.scaleCaption, color: C.inkFaint }}>{label}</span>
      <span
        style={{
          font: `600 13px/1.3 ${MONO}`,
          fontVariantNumeric: 'tabular-nums',
          color: valueColor ?? C.ink,
        }}
      >
        {value}
      </span>
    </div>
  );
}

/** A plain hairline divider, horizontal by default. Use inside a panel body
 * to separate stacked content without reaching for `SectionRule`'s label. */
export function Divider({
  vertical = false,
  style,
}: {
  vertical?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        background: C.borderSoft,
        ...(vertical ? { width: 1, alignSelf: 'stretch' } : { height: 1, width: '100%' }),
        ...style,
      }}
    />
  );
}

/**
 * CSS-only tooltip. Wrap a trigger element; the tooltip renders as a sibling
 * that fades/slides in on `:hover` via `.mt-tooltip-wrap` / `.mt-tooltip` in
 * the global stylesheet — no JS, no portal, safe in a server component.
 */
export function Tooltip({
  children,
  label,
  side = 'top',
}: {
  children: ReactNode;
  label: ReactNode;
  side?: 'top' | 'bottom';
}) {
  return (
    <span className="mt-tooltip-wrap" style={{ display: 'inline-flex' }}>
      {children}
      <span
        className="mt-tooltip"
        style={{
          position: 'absolute',
          left: '50%',
          [side === 'top' ? 'bottom' : 'top']: 'calc(100% + 6px)',
          transform: 'translateX(-50%)',
          background: C.ink,
          color: C.bg,
          font: `500 11px/1.4 ${FONT}`,
          padding: '5px 8px',
          borderRadius: 5,
          whiteSpace: 'nowrap',
          boxShadow: SHADOW.md,
          zIndex: 20,
        }}
      >
        {label}
      </span>
    </span>
  );
}

/**
 * Icon-only button — a hit-target for a `lucide-react` icon or any small
 * glyph. Hover/active feedback via `.mt-icon-btn` in the global stylesheet.
 */
export function IconButton({
  children,
  onClick,
  label,
  active = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  /** Accessible label — required since the button is icon-only. */
  label: string;
  active?: boolean;
}) {
  return (
    <button
      className="mt-icon-btn"
      onClick={onClick}
      aria-label={label}
      title={label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 28,
        height: 28,
        borderRadius: 6,
        border: `1px solid ${active ? EDGE.medium : 'transparent'}`,
        background: active ? C.raised : 'transparent',
        color: active ? C.ink : C.inkFaint,
        cursor: 'pointer',
        padding: 0,
      }}
    >
      {children}
    </button>
  );
}

/**
 * Toolbar row — a horizontal strip for filters/actions above a table or
 * panel body, with consistent gap and a hairline beneath.
 */
export function Toolbar({
  children,
  right,
}: {
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 16px',
        borderBottom: `1px solid ${C.borderSoft}`,
        background: C.surfaceAlt,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
        {children}
      </div>
      {right && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{right}</div>}
    </div>
  );
}

/**
 * A signed metric delta with an inline mini-context — like `Trend`, but
 * pairs the direction glyph with a plain-language comparison (e.g. "vs last
 * week") instead of standing alone in a KPI header. Useful in a table cell
 * or a stat list where `Trend`'s pill would be too loud.
 */
export function MetricDelta({
  value,
  suffix = '',
  goodDirection = 'up',
  compareLabel,
}: {
  value: number;
  suffix?: string;
  goodDirection?: 'up' | 'down' | 'none';
  compareLabel?: string;
}) {
  const up = value > 0;
  const flat = value === 0;
  const good = goodDirection === 'none' ? null : goodDirection === 'up' ? up : !up;
  const color = flat ? C.inkFaint : good == null ? C.inkFaint : good ? C.green : C.red;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5 }}>
      <span
        style={{
          font: `600 12px/1 ${MONO}`,
          color,
          fontVariantNumeric: 'tabular-nums',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 3,
        }}
      >
        <span style={{ font: `600 9px/1 ${FONT}` }}>{flat ? '→' : up ? '▲' : '▼'}</span>
        {up && !flat ? '+' : ''}
        {value}
        {suffix}
      </span>
      {compareLabel && (
        <span style={{ font: `400 11px/1.3 ${FONT}`, color: C.inkGhost }}>{compareLabel}</span>
      )}
    </span>
  );
}
