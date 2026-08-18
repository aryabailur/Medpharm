/**
 * Chart primitives for the MedTrack terminal.
 *
 * Inline SVG, no chart library: the handoff's visual language is hairline grid
 * rules, a single 2.5px stroke, square end-markers and a wash for the in-band
 * region. Recharts' defaults fight all four, and its SSR/hydration cost buys
 * nothing here.
 *
 * Shared conventions, taken from the handoff and applied to every primitive:
 *   · grid rules      1px #E5E1DA, drawn under the data
 *   · axis labels     Geist Mono 10px #6B665F
 *   · data stroke     2.5px, strokeLinejoin round, revealed with mtDraw
 *   · end marker      8×8 square in the series colour
 *   · in-band wash    #EAF2EC behind the series, never on top
 *
 * Every primitive guards empty input, a single point, and all-equal values, so
 * a zero denominator can never reach an SVG coordinate as NaN.
 */

import type { CSSProperties, ReactNode } from 'react';

import { C, draw, EASE, FONT, grow, MONO, riseBar, SERIES, VIZ_TINT } from '../lib/theme';

// ─── Shared internals ────────────────────────────────────────────────────────

/** Maps a value into 0..1. Collapses to the midline when the span is zero. */
function safeScale(min: number, max: number) {
  const span = max - min;
  if (!Number.isFinite(span) || span === 0) return () => 0.5;
  return (v: number) => (v - min) / span;
}

function NoData({ height = 120 }: { height?: number }) {
  return (
    <div
      style={{
        height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        font: `400 11px/1 ${FONT}`,
        color: C.inkGhost,
      }}
    >
      No data
    </div>
  );
}

/** Horizontal hairline rules at the given y positions. */
function Grid({ ys, x1, x2 }: { ys: number[]; x1: number; x2: number }) {
  return (
    <g stroke={C.borderFaint} strokeWidth={1}>
      <path d={ys.map((y) => `M${x1} ${y} H${x2}`).join(' ')} />
    </g>
  );
}

/** The axis-label type style, used for every `<text>` in this file. */
const axisText: CSSProperties = { font: `400 10px ${MONO}`, fill: C.inkSoft };

/**
 * Deterministic gradient id, built from stable inputs (a caller-supplied id,
 * or the series label/colour) rather than `useId()` or `Math.random()` — these
 * components render on the server, so the id must match byte-for-byte between
 * the server render and the client hydration pass.
 */
function gradId(seed: string, salt: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return `mtg-${salt}-${(h >>> 0).toString(36)}`;
}

/** Skip every Nth label so ticks never overlap when the axis is crowded. */
function tickStep(count: number, maxLabels: number) {
  return Math.max(1, Math.ceil(count / Math.max(1, maxLabels)));
}

/** Caption strip under a chart — evenly spaced mono ticks. */
export function AxisStrip({ labels }: { labels: string[] }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        font: `400 10px/1 ${MONO}`,
        color: C.inkSoft,
        marginTop: 6,
        padding: '0 6px',
      }}
    >
      {labels.map((l, i) => (
        <span key={i}>{l}</span>
      ))}
    </div>
  );
}

/** Legend row. `kind` picks the swatch geometry the handoff uses per series. */
export function Legend({
  items,
}: {
  items: Array<{ label: string; color: string; kind?: 'line' | 'thin' | 'band' }>;
}) {
  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
      {items.map((it) => {
        const swatch: CSSProperties =
          it.kind === 'band'
            ? { width: 14, height: 9, background: it.color, border: `1px solid ${C.bandStroke}` }
            : { width: 14, height: it.kind === 'thin' ? 2 : 3, background: it.color };
        return (
          <span
            key={it.label}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              font: `400 12px/1.7 ${FONT}`,
              color: C.inkFaint,
            }}
          >
            <span style={{ ...swatch, display: 'inline-block', flex: '0 0 auto' }} />
            {it.label}
          </span>
        );
      })}
    </div>
  );
}

// ─── TemperatureChart ────────────────────────────────────────────────────────

export interface TempReading {
  /** Any parseable timestamp, or a pre-formatted tick label. */
  ts: string;
  tempC: number;
}

/**
 * Cold-chain temperature trace — the handoff's signature chart.
 *
 * Draws the permitted band as a wash, the full series in teal, and re-draws
 * only the out-of-band runs in red on top, so a breach reads at a glance
 * without a legend. Excursion windows get an amber column behind the line.
 *
 * The y-axis is fixed to the band plus headroom rather than fitted to the
 * data: a flat in-band trace must look flat, not fill the frame.
 */
export function TemperatureChart({
  readings,
  minC = 2,
  maxC = 8,
  bands = [],
  height = 222,
  ticks,
  gradId: gradIdProp,
  ariaLabel,
}: {
  readings: TempReading[];
  minC?: number;
  maxC?: number;
  /** Excursion windows, as fractions 0..1 across the series. */
  bands?: Array<{ from: number; to: number; label?: string }>;
  height?: number;
  ticks?: string[];
  /** Deterministic id for the under-line gradient wash. Defaults from the data. */
  gradId?: string;
  ariaLabel?: string;
}) {
  if (readings.length === 0) return <NoData height={height} />;

  const W = 1100;
  const H = 220;
  const padL = 52;
  const padR = 18;
  const padT = 30;
  const padB = 22;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  // Fix the scale around the band so an in-band trace reads as calm.
  const temps = readings.map((r) => r.tempC);
  const lo = Math.min(0, minC - 2, ...temps);
  const hi = Math.max(maxC + 6, ...temps);
  const scale = safeScale(lo, hi);
  const yAt = (v: number) => padT + innerH - scale(v) * innerH;

  const n = readings.length;
  const xAt = (i: number) => (n === 1 ? padL + innerW / 2 : padL + (i / (n - 1)) * innerW);

  const pts = readings.map((r, i) => `${xAt(i)},${yAt(r.tempC)}`);
  const gid = gradId(gradIdProp ?? `${readings[0]!.ts}-${n}-${minC}-${maxC}`, 'temp');
  const last0 = readings[n - 1]!;
  const label =
    ariaLabel ?? `Temperature trace, ${n} readings, latest ${last0.tempC}°C, band ${minC}° to ${maxC}°C`;

  // Contiguous out-of-band runs, each drawn as its own red polyline. Extending
  // one index either side joins the run to the in-band line it breaks from.
  const runs: string[][] = [];
  let run: string[] = [];
  readings.forEach((r, i) => {
    const out = r.tempC < minC || r.tempC > maxC;
    if (out) {
      if (run.length === 0 && i > 0) run.push(pts[i - 1]!);
      run.push(pts[i]!);
    } else if (run.length) {
      run.push(pts[i]!);
      runs.push(run);
      run = [];
    }
  });
  if (run.length) runs.push(run);

  const gridYs = [padT, yAt(maxC), yAt((minC + maxC) / 2), yAt(minC), padT + innerH];
  const last = readings[n - 1]!;

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height, display: 'block' }}
        role="img"
        aria-label={label}
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={`${C.accent}28`} />
            <stop offset="100%" stopColor={`${C.accent}00`} />
          </linearGradient>
        </defs>
        {/* Permitted band, behind everything. */}
        <rect x={padL} y={yAt(maxC)} width={innerW} height={yAt(minC) - yAt(maxC)} fill={C.bandFill}>
          <title>{`Permitted band ${minC}°–${maxC}°C`}</title>
        </rect>

        {/* Excursion columns. */}
        {bands.map((b, i) => {
          const x = padL + Math.max(0, Math.min(1, b.from)) * innerW;
          const w = Math.max(2, (Math.min(1, b.to) - Math.max(0, b.from)) * innerW);
          return (
            <g key={i}>
              <rect x={x} y={padT} width={w} height={innerH} fill={C.amberTint}>
                <title>{b.label ?? 'Excursion window'}</title>
              </rect>
              {b.label && (
                <text x={x + 8} y={padT + 15} style={{ font: `400 10px ${MONO}`, fill: C.amber }}>
                  {b.label}
                </text>
              )}
            </g>
          );
        })}

        <Grid ys={gridYs} x1={padL} x2={W - padR} />

        {/* Y axis: the band edges are the labels that matter. */}
        <g>
          <text x={14} y={padT + 4} style={axisText}>
            {hi.toFixed(0)}°
          </text>
          <text x={18} y={yAt(maxC) + 4} style={axisText}>
            {maxC}°
          </text>
          <text x={18} y={yAt(minC) + 4} style={axisText}>
            {minC}°
          </text>
          <text x={14} y={padT + innerH + 4} style={axisText}>
            {lo.toFixed(0)}°
          </text>
        </g>

        {n === 1 ? (
          <circle cx={xAt(0)} cy={yAt(last.tempC)} r={4} fill={C.accent}>
            <title>{`${last.ts}: ${last.tempC}°C`}</title>
          </circle>
        ) : (
          <>
            <polyline
              points={[...pts, `${xAt(n - 1)},${padT + innerH}`, `${xAt(0)},${padT + innerH}`].join(' ')}
              fill={`url(#${gid})`}
              stroke="none"
              style={{ animation: `mtFade .8s ${EASE} .2s both` }}
            />
            <polyline
              points={pts.join(' ')}
              fill="none"
              stroke={C.accent}
              strokeWidth={2.5}
              strokeLinejoin="round"
              style={draw(1)}
            />
          </>
        )}

        {runs.map((r, i) => (
          <polyline
            key={i}
            points={r.join(' ')}
            fill="none"
            stroke={C.red}
            strokeWidth={2.5}
            strokeLinejoin="round"
            style={draw(1.2, 200)}
          />
        ))}

        {/* Square end-marker on the latest reading. */}
        <rect x={xAt(n - 1) - 4} y={yAt(last.tempC) - 4} width={8} height={8} fill={C.accent}>
          <title>{`${last.ts}: ${last.tempC}°C`}</title>
        </rect>
      </svg>
      {ticks && ticks.length > 0 && <AxisStrip labels={ticks} />}
    </div>
  );
}

// ─── RouteMap ────────────────────────────────────────────────────────────────

/**
 * Shipment route — travelled solid, remaining as marching dashes.
 *
 * A schematic, not a geographic projection: the handoff draws a bezier sweep
 * with labelled square waypoints. `progress` (0..1) splits the curve, so the
 * "now" ring lands wherever the shipment actually is.
 */
export function RouteMap({
  progress,
  origin,
  destination,
  now,
  incident,
  height = 296,
  stats,
}: {
  progress: number;
  origin: string;
  destination: string;
  now?: string;
  incident?: string;
  height?: number;
  stats?: Array<{ label: string; value: string }>;
}) {
  const W = 720;
  const H = 296;
  const p = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));

  // A quadratic sweep from lower-left to upper-right, sampled so the "now"
  // marker and the travelled/remaining split all sit exactly on the curve.
  const A = { x: 40, y: 244 };
  const B = { x: 300, y: 120 };
  const D = { x: 560, y: 66 };
  const at = (t: number) => ({
    x: (1 - t) ** 2 * A.x + 2 * (1 - t) * t * B.x + t ** 2 * D.x,
    y: (1 - t) ** 2 * A.y + 2 * (1 - t) * t * B.y + t ** 2 * D.y,
  });

  const path = (from: number, to: number) => {
    const steps = 24;
    return Array.from({ length: steps + 1 }, (_, i) => {
      const pt = at(from + ((to - from) * i) / steps);
      return `${i === 0 ? 'M' : 'L'}${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
    }).join(' ');
  };

  const here = at(p);
  const inc = at(Math.max(0.08, p * 0.55));

  return (
    <div style={{ position: 'relative', height, background: C.bg }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height, display: 'block' }}
        role="img"
        aria-label={`Route from ${origin} to ${destination}, ${Math.round(p * 100)}% complete${incident ? `, incident: ${incident}` : ''}`}
      >
        <g stroke={C.borderFaint} strokeWidth={1}>
          <path d="M0 37 H720 M0 96 H720 M0 155 H720 M0 214 H720 M0 273 H720" />
          <path d="M60 0 V296 M180 0 V296 M300 0 V296 M420 0 V296 M540 0 V296 M660 0 V296" />
        </g>

        {/* Planned route, full width, under everything. */}
        <path d={path(0, 1)} fill="none" stroke={C.rail} strokeWidth={7} strokeLinecap="round" />

        {/* Travelled. */}
        <path
          d={path(0, p)}
          fill="none"
          stroke={C.ink}
          strokeWidth={3}
          strokeLinecap="round"
          style={{ strokeDasharray: 900, animation: `mtDraw 1.1s ${EASE} both` }}
        />

        {/* Remaining. */}
        {p < 1 && (
          <path
            d={path(p, 1)}
            fill="none"
            stroke={C.inkGhost}
            strokeWidth={2}
            strokeDasharray="5 6"
            style={{ animation: 'mtDash 2.4s linear infinite' }}
          />
        )}

        <rect x={A.x - 5} y={A.y - 5} width={10} height={10} fill={C.inkMuted}>
          <title>{`Origin: ${origin}`}</title>
        </rect>
        {incident && (
          <rect x={inc.x - 5} y={inc.y - 5} width={10} height={10} fill={C.amber}>
            <title>{incident}</title>
          </rect>
        )}
        <rect x={D.x - 5} y={D.y - 5} width={10} height={10} fill={C.green}>
          <title>{`Destination: ${destination}`}</title>
        </rect>

        {/* Current position: ring + dot, so it reads as live. */}
        <circle cx={here.x} cy={here.y} r={11} fill="none" stroke={C.ink} strokeWidth={1} />
        <circle cx={here.x} cy={here.y} r={5} fill={C.ink}>
          <title>{now ? `Now: ${now}` : `${Math.round(p * 100)}% complete`}</title>
        </circle>

        <text x={A.x - 5} y={A.y + 24} style={{ font: `400 11px ${MONO}`, fill: C.inkMuted }}>
          {origin}
        </text>
        {incident && (
          <text
            x={Math.max(6, inc.x - 48)}
            y={inc.y - 14}
            style={{ font: `400 11px ${MONO}`, fill: C.amber }}
          >
            {incident}
          </text>
        )}
        {now && (
          <text x={here.x + 18} y={here.y - 3} style={{ font: `400 11px ${MONO}`, fill: C.ink }}>
            {now}
          </text>
        )}
        <text x={D.x - 48} y={D.y - 14} style={{ font: `400 11px ${MONO}`, fill: C.green }}>
          {destination}
        </text>
      </svg>

      {stats && stats.length > 0 && (
        <div
          style={{
            position: 'absolute',
            left: 16,
            bottom: 16,
            display: 'flex',
            background: C.surface,
            border: `1px solid ${C.border}`,
          }}
        >
          {stats.map((s, i) => (
            <div
              key={s.label}
              style={{
                padding: '9px 13px',
                borderRight: i === stats.length - 1 ? 'none' : `1px solid ${C.borderFaint}`,
              }}
            >
              <div
                style={{
                  font: `600 11px/1 ${FONT}`,
                  letterSpacing: '.17em',
                  textTransform: 'uppercase',
                  color: C.inkFaint,
                }}
              >
                {s.label}
              </div>
              <div style={{ font: `600 24px/1 ${MONO}`, marginTop: 6, color: C.ink }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Donut ───────────────────────────────────────────────────────────────────

/**
 * Composition donut with a centred total, plus its legend.
 *
 * Segments are stroke-dasharray arcs on a shared circle, rotated -90° so the
 * first one starts at twelve o'clock — the handoff's exact construction.
 */
export function Donut({
  segments,
  totalLabel,
  size = 124,
}: {
  segments: Array<{ label: string; count: number; color: string }>;
  totalLabel: string;
  size?: number;
}) {
  const total = segments.reduce((a, s) => a + s.count, 0);
  const R = 46;
  const CIRC = 2 * Math.PI * R;

  let acc = 0;
  const arcs = segments
    .filter((s) => s.count > 0)
    .map((s) => {
      const frac = total === 0 ? 0 : s.count / total;
      const arc = {
        ...s,
        dash: `${(frac * CIRC).toFixed(1)} ${CIRC.toFixed(1)}`,
        offset: (-acc * CIRC).toFixed(1),
        pct: `${Math.round(frac * 100)}%`,
      };
      acc += frac;
      return arc;
    });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
      <svg
        viewBox="0 0 120 120"
        style={{
          width: size,
          height: size,
          flex: `0 0 ${size}px`,
          animation: `mtFade .7s ease .15s both`,
        }}
        role="img"
        aria-label={`${totalLabel}: ${total} total, ${arcs.map((a) => `${a.label} ${a.pct}`).join(', ')}`}
      >
        <circle cx={60} cy={60} r={R} fill="none" stroke={C.borderSoft} strokeWidth={15} />
        {arcs.map((a) => (
          <circle
            key={a.label}
            cx={60}
            cy={60}
            r={R}
            fill="none"
            stroke={a.color}
            strokeWidth={15}
            strokeDasharray={a.dash}
            strokeDashoffset={a.offset}
            transform="rotate(-90 60 60)"
          >
            <title>{`${a.label}: ${a.count} (${a.pct})`}</title>
          </circle>
        ))}
        <text
          x={60}
          y={57}
          textAnchor="middle"
          style={{ font: `600 24px ${MONO}`, fill: C.ink }}
        >
          {total}
        </text>
        <text
          x={60}
          y={75}
          textAnchor="middle"
          style={{ font: `400 8px ${MONO}`, letterSpacing: '1.6px', fill: C.inkFaint }}
        >
          {totalLabel}
        </text>
      </svg>

      <div style={{ flex: '1 1 150px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {arcs.map((a) => (
          <div key={a.label} style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span
              style={{ width: 11, height: 11, borderRadius: 2, background: a.color, flex: '0 0 11px' }}
            />
            <span
              style={{
                flex: 1,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                font: `500 13px/1.3 ${FONT}`,
                color: C.ink,
              }}
            >
              {a.label}
            </span>
            <span style={{ font: `600 14px/1 ${MONO}`, color: a.color }}>{a.count}</span>
            <span
              style={{
                font: `400 12px/1 ${MONO}`,
                color: C.inkFaint,
                width: 38,
                flex: '0 0 38px',
                textAlign: 'right',
              }}
            >
              {a.pct}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Bare ring, for callers that render their own legend beside it.
 *
 * Same construction as `Donut` but without the built-in legend — the RCA
 * dashboard pairs each slice with a narrated insight, so it needs the swatches
 * inline with its own prose.
 *
 * Only use this for values that genuinely partition a whole. The centre label
 * must be supplied by the caller and pre-formatted: summing the raw values
 * would print a meaningless figure whenever they're currency or percentages
 * (₹32231327, or 109.4 rendered as a float artifact), and it would silently
 * overflow the 46px ring. Pass `centre=""` to leave it empty.
 */
export function PieChart({
  data,
  size = 140,
  centre,
}: {
  data: Array<{ label: string; value: number; color: string }>;
  size?: number;
  /** Pre-formatted centre label. Kept short — the ring is only 46px across. */
  centre?: string;
}) {
  const total = data.reduce((a, d) => a + d.value, 0);
  if (total === 0) return <NoData height={size} />;

  const R = 46;
  const CIRC = 2 * Math.PI * R;
  let acc = 0;

  return (
    <svg
      viewBox="0 0 120 120"
      style={{ width: size, height: size, flex: `0 0 ${size}px`, animation: `mtFade .7s ease .15s both` }}
      role="img"
      aria-label={data.map((d) => `${d.label}: ${d.value}`).join(', ')}
    >
      <circle cx={60} cy={60} r={R} fill="none" stroke={C.borderSoft} strokeWidth={15} />
      {data
        .filter((d) => d.value > 0)
        .map((d) => {
          const frac = d.value / total;
          const seg = (
            <circle
              key={d.label}
              cx={60}
              cy={60}
              r={R}
              fill="none"
              stroke={d.color}
              strokeWidth={15}
              strokeDasharray={`${(frac * CIRC).toFixed(1)} ${CIRC.toFixed(1)}`}
              strokeDashoffset={(-acc * CIRC).toFixed(1)}
              transform="rotate(-90 60 60)"
            >
              <title>{`${d.label}: ${d.value} (${Math.round(frac * 100)}%)`}</title>
            </circle>
          );
          acc += frac;
          return seg;
        })}
      {centre && (
        <text x={60} y={65} textAnchor="middle" style={{ font: `600 20px ${MONO}`, fill: C.ink }}>
          {centre}
        </text>
      )}
    </svg>
  );
}

// ─── Sparkline (area + stroke) ───────────────────────────────────────────────

/**
 * Trend sparkline with a filled area, as the handoff's dispensing card shows.
 *
 * Bigger than a table sparkline and always paired with an axis strip; for the
 * inline table variant use `MiniSparkline`.
 */
export function AreaSparkline({
  values,
  height = 104,
  color = C.accent,
  fill = C.accentTint,
  ticks,
  gradient = false,
  gradId: gradIdProp,
  ariaLabel,
}: {
  values: number[];
  height?: number;
  color?: string;
  fill?: string;
  ticks?: string[];
  /** Use a top-to-bottom fade of `color` instead of the flat `fill` tint. */
  gradient?: boolean;
  gradId?: string;
  ariaLabel?: string;
}) {
  if (values.length === 0) return <NoData height={height} />;

  const W = 320;
  const H = 104;
  const padX = 4;
  const padT = 14;
  const padB = 8;
  const innerW = W - padX * 2;
  const innerH = H - padT - padB;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const scale = safeScale(min, max);
  const n = values.length;
  const xAt = (i: number) => (n === 1 ? W / 2 : padX + (i / (n - 1)) * innerW);
  const yAt = (v: number) => padT + innerH - scale(v) * innerH;

  const pts = values.map((v, i) => `${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`);
  const area = [...pts, `${xAt(n - 1).toFixed(1)},${H - 8}`, `${padX},${H - 8}`];
  const lastX = xAt(n - 1);
  const lastY = yAt(values[n - 1]!);
  const last = values[n - 1]!;
  const gid = gradient ? gradId(gradIdProp ?? `${color}-${n}-${min}-${max}`, 'area') : '';
  const label = ariaLabel ?? `Trend, ${n} points, latest ${last}`;

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height, display: 'block' }}
        role="img"
        aria-label={label}
      >
        {gradient && (
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={`${color}28`} />
              <stop offset="100%" stopColor={`${color}00`} />
            </linearGradient>
          </defs>
        )}
        <Grid ys={[padT + innerH * 0.25, padT + innerH * 0.5, padT + innerH * 0.75]} x1={0} x2={W} />
        <polyline
          points={area.join(' ')}
          fill={gradient ? `url(#${gid})` : fill}
          stroke="none"
          style={{ animation: `mtFade .7s ease .25s both` }}
        />
        {n === 1 ? (
          <circle cx={lastX} cy={lastY} r={3} fill={color}>
            <title>{String(last)}</title>
          </circle>
        ) : (
          <polyline
            points={pts.join(' ')}
            fill="none"
            stroke={color}
            strokeWidth={2.5}
            strokeLinejoin="round"
            style={draw(0.9)}
          />
        )}
        <rect x={Math.min(lastX, W - 8) - 4} y={lastY - 4} width={8} height={8} fill={color}>
          <title>{String(last)}</title>
        </rect>
      </svg>
      {ticks && ticks.length > 0 && <AxisStrip labels={ticks} />}
    </div>
  );
}

// ─── ForecastChart ───────────────────────────────────────────────────────────

/**
 * History + forecast with a confidence band, split by a "now" rule.
 *
 * History is solid ink; the forecast continues dashed in indigo inside its
 * band, so the eye can tell measurement from projection without a legend.
 */
export function ForecastChart({
  history,
  forecast,
  band,
  height = 238,
  yFormat = (v: number) => String(Math.round(v)),
  gradient = false,
  gradId: gradIdProp,
  ariaLabel,
}: {
  history: Array<{ x: string; y: number }>;
  forecast: Array<{ x: string; y: number }>;
  /** Upper/lower bounds aligned to `forecast`. */
  band?: Array<{ hi: number; lo: number }>;
  height?: number;
  yFormat?: (v: number) => string;
  /** Add a top-to-bottom fade under the history line, in `C.ink`. */
  gradient?: boolean;
  gradId?: string;
  ariaLabel?: string;
}) {
  if (history.length === 0 && forecast.length === 0) return <NoData height={height} />;

  const W = 620;
  const H = 240;
  const padL = 46;
  const padR = 20;
  const padT = 30;
  const padB = 34;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const all = [
    ...history.map((p) => p.y),
    ...forecast.map((p) => p.y),
    ...(band?.flatMap((b) => [b.hi, b.lo]) ?? []),
  ];
  const max = Math.max(...all, 0);
  const scale = safeScale(0, max * 1.08 || 1);
  const yAt = (v: number) => padT + innerH - scale(v) * innerH;

  // One shared x axis: history then forecast, laid end to end.
  const total = history.length + forecast.length;
  const xAt = (i: number) => (total <= 1 ? padL : padL + (i / (total - 1)) * innerW);
  const splitX = xAt(Math.max(0, history.length - 1));

  const hPts = history.map((p, i) => `${xAt(i)},${yAt(p.y)}`);
  const fPts = forecast.map((p, i) => `${xAt(history.length + i)},${yAt(p.y)}`);
  // Join the dashed forecast to the last measured point.
  const fJoined = history.length ? [hPts[hPts.length - 1]!, ...fPts] : fPts;

  const bandPath = band?.length
    ? [
        ...band.map((b, i) => `${i === 0 ? 'M' : 'L'}${xAt(history.length + i)} ${yAt(b.hi)}`),
        ...band
          .map((b, i) => `L${xAt(history.length + i)} ${yAt(b.lo)}`)
          .reverse(),
        'Z',
      ].join(' ')
    : null;

  const gridYs = [0, 0.25, 0.5, 0.75, 1].map((f) => padT + innerH * f);
  const labels = [...history, ...forecast];
  const everyNth = tickStep(total, 10);
  const gid = gradient ? gradId(gradIdProp ?? `${history.length}-${forecast.length}-${max}`, 'fc') : '';
  const label =
    ariaLabel ??
    `History and forecast, ${history.length} measured points, ${forecast.length} forecast points`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height, display: 'block' }}
      role="img"
      aria-label={label}
    >
      {gradient && (
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={`${C.ink}1F`} />
            <stop offset="100%" stopColor={`${C.ink}00`} />
          </linearGradient>
        </defs>
      )}
      <Grid ys={gridYs} x1={padL} x2={W - padR} />

      <g>
        {[1, 0.75, 0.5, 0.25, 0].map((f) => (
          <text key={f} x={8} y={padT + innerH * (1 - f) + 4} style={axisText}>
            {yFormat(max * 1.08 * f)}
          </text>
        ))}
      </g>

      {bandPath && (
        <path d={bandPath} fill={C.forecastBand} style={{ animation: `mtFade .8s ease .3s both` }}>
          <title>Forecast confidence band</title>
        </path>
      )}

      {gradient && hPts.length > 1 && (
        <polyline
          points={[...hPts, `${xAt(history.length - 1)},${padT + innerH}`, `${xAt(0)},${padT + innerH}`].join(
            ' ',
          )}
          fill={`url(#${gid})`}
          stroke="none"
          style={{ animation: `mtFade .8s ease .2s both` }}
        />
      )}

      {hPts.length > 1 && (
        <polyline
          points={hPts.join(' ')}
          fill="none"
          stroke={C.ink}
          strokeWidth={2.5}
          strokeLinejoin="round"
          style={draw(0.9)}
        />
      )}

      {fJoined.length > 1 && (
        <polyline
          points={fJoined.join(' ')}
          fill="none"
          stroke={C.forecastLine}
          strokeWidth={2.5}
          strokeDasharray="6 5"
          style={{ animation: `mtFade .6s ease .7s both` }}
        />
      )}

      {forecast.length > 0 && history.length > 0 && (
        <>
          <line
            x1={splitX}
            y1={padT}
            x2={splitX}
            y2={padT + innerH}
            stroke={C.inkGhost}
            strokeWidth={1}
            strokeDasharray="3 4"
          />
          <text x={splitX + 6} y={padT + 14} style={{ font: `400 10px ${MONO}`, fill: C.forecastLine }}>
            FORECAST →
          </text>
        </>
      )}

      <g>
        {labels.map((p, i) =>
          i % everyNth === 0 ? (
            <text key={i} x={xAt(i)} y={H - 14} textAnchor="middle" style={axisText}>
              {p.x}
            </text>
          ) : null,
        )}
      </g>
    </svg>
  );
}

// ─── ColumnChart ─────────────────────────────────────────────────────────────

/**
 * Vertical bars with the count above and a mono label below — the handoff's
 * "by severity" and "value at risk" cards.
 */
export function ColumnChart({
  bars,
  height = 120,
  barMax = 76,
  gap = 14,
  valueFont = `600 13px/1 ${MONO}`,
  footnote,
  rounded = true,
  ariaLabel,
}: {
  bars: Array<{ label: string; count: number; color: string; note?: string }>;
  height?: number;
  barMax?: number;
  gap?: number;
  valueFont?: string;
  footnote?: ReactNode;
  /** Small corner radius on the bar tops. Set false to match the old square look. */
  rounded?: boolean;
  ariaLabel?: string;
}) {
  if (bars.length === 0) return <NoData height={height} />;
  const worst = Math.max(...bars.map((b) => b.count), 0) || 1;

  return (
    <div
      role="img"
      aria-label={ariaLabel ?? bars.map((b) => `${b.label}: ${b.count}`).join(', ')}
    >
      <style>{`.mt-col-bar { transition: filter .15s ${EASE}, opacity .15s ${EASE}; } .mt-col-bar:hover { filter: brightness(1.08); opacity: .92; }`}</style>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap, height }}>
        {bars.map((b) => (
          <div
            key={b.label}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
              height: '100%',
              justifyContent: 'flex-end',
            }}
          >
            <span style={{ font: valueFont, color: b.color }}>{b.count}</span>
            <div
              className="mt-col-bar"
              title={`${b.label}: ${b.count}`}
              style={{
                width: '100%',
                height: Math.round((b.count / worst) * barMax),
                background: b.color,
                borderRadius: rounded ? '3px 3px 0 0' : 0,
                transformOrigin: 'bottom',
                animation: riseBar,
              }}
            />
            <span
              style={{
                font: `500 9px/1 ${MONO}`,
                letterSpacing: '.08em',
                color: C.inkFaint,
                textAlign: 'center',
              }}
            >
              {b.label}
            </span>
            {b.note && (
              <span style={{ font: `500 10px/1 ${MONO}`, color: C.inkMuted }}>{b.note}</span>
            )}
          </div>
        ))}
      </div>
      {footnote && (
        <div
          style={{
            font: `400 12px/1.7 ${FONT}`,
            color: C.inkFaint,
            marginTop: 14,
            borderTop: `1px solid ${C.borderSoft}`,
            paddingTop: 11,
          }}
        >
          {footnote}
        </div>
      )}
    </div>
  );
}

// ─── BarChart (horizontal rows) ──────────────────────────────────────────────

/**
 * Ranked horizontal bars — one row per category, value right-aligned.
 *
 * `horizontal` is accepted and ignored: rows are the only orientation here.
 * For vertical bars use `ColumnChart`.
 */
export function BarChart({
  data,
  valueFormat,
  labelWidth = 130,
  rounded = true,
  ariaLabel,
}: {
  data: Array<{ label: string; value: number; color?: string }>;
  valueFormat?: (v: number) => string;
  labelWidth?: number;
  horizontal?: boolean;
  height?: number;
  /** Small corner radius on the bar's leading end. Set false for the old square look. */
  rounded?: boolean;
  ariaLabel?: string;
}) {
  const fmt = valueFormat ?? ((v: number) => v.toLocaleString('en-IN'));
  if (data.length === 0) return <NoData height={80} />;

  const max = Math.max(...data.map((d) => Math.abs(d.value)), 0);
  const scale = max === 0 ? () => 0 : (v: number) => Math.abs(v) / max;

  return (
    <div
      style={{ display: 'grid', gap: 10 }}
      role="img"
      aria-label={ariaLabel ?? data.map((d) => `${d.label}: ${fmt(d.value)}`).join(', ')}
    >
      <style>{`.mt-bar-fill { transition: filter .15s ${EASE}; } .mt-bar-fill:hover { filter: brightness(1.08); }`}</style>
      {data.map((d, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: labelWidth,
              flex: `0 0 ${labelWidth}px`,
              font: `400 12px/1.4 ${FONT}`,
              color: C.inkMuted,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {d.label}
          </div>
          <div style={{ flex: 1, background: C.borderSoft, height: 6, borderRadius: rounded ? 3 : 0 }}>
            <div
              className="mt-bar-fill"
              title={`${d.label}: ${fmt(d.value)}`}
              style={{
                width: `${scale(d.value) * 100}%`,
                height: 6,
                background: d.color ?? C.accent,
                borderRadius: rounded ? 3 : 0,
                transformOrigin: 'left',
                animation: grow(200),
              }}
            />
          </div>
          <div
            style={{
              width: 64,
              flex: '0 0 64px',
              textAlign: 'right',
              font: `500 11px/1 ${MONO}`,
              color: C.ink,
            }}
          >
            {fmt(d.value)}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Meter + MiniSparkline (table-cell scale) ────────────────────────────────

/** Thin progress rail, as used in every table's coverage/progress column. */
export function Meter({
  pct,
  color,
  width = 72,
  thickness = 6,
  delayMs = 150,
}: {
  pct: number;
  color?: string;
  /** Fixed px width, or 'full' to fill the container. */
  width?: number | 'full';
  thickness?: number;
  delayMs?: number;
}) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
  // Several callers pass width={9999} meaning "fill the row" — a leftover from
  // before `width="full"` existed. Anything above 4000px isn't a real fixed
  // width anyone wants rendered, so treat it the same as 'full' rather than
  // overflowing the container.
  const full = width === 'full' || (typeof width === 'number' && width > 4000);
  return (
    <div
      style={{
        width: full ? '100%' : width,
        height: thickness,
        background: C.borderSoft,
        flex: full ? '1 1 auto' : `0 0 ${width}px`,
        borderRadius: thickness / 2,
        overflow: 'hidden',
      }}
      role="img"
      aria-label={`${Math.round(clamped)}%`}
    >
      <div
        title={`${Math.round(clamped)}%`}
        style={{
          width: `${clamped}%`,
          height: thickness,
          background: color ?? C.accent,
          transformOrigin: 'left',
          animation: grow(delayMs),
        }}
      />
    </div>
  );
}

/** Bare trend line for inline use in a table cell. */
export function MiniSparkline({
  values,
  width = 80,
  height = 24,
  color = C.accent,
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  if (values.length === 0) return <svg width={width} height={height} />;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const scale = safeScale(min, max);
  const pad = 2;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const n = values.length;
  const xAt = (i: number) => (n === 1 ? width / 2 : pad + (i / (n - 1)) * innerW);
  const yAt = (v: number) => pad + innerH - scale(v) * innerH;

  if (n === 1) {
    return (
      <svg width={width} height={height} role="img" aria-label={String(values[0])}>
        <circle cx={xAt(0)} cy={yAt(values[0]!)} r={2} fill={color} />
      </svg>
    );
  }

  return (
    <svg width={width} height={height} role="img" aria-label={`Trend, ${n} points, latest ${values[n - 1]}`}>
      <polyline
        points={values.map((v, i) => `${xAt(i)},${yAt(v)}`).join(' ')}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── SparkBars ───────────────────────────────────────────────────────────────

/**
 * Tiny inline bar sparkline, the bar-chart sibling of `MiniSparkline`.
 *
 * For a table cell where the shape of small discrete counts (not a trend
 * line) is the point — e.g. weekly excursion counts per route row.
 */
export function SparkBars({
  values,
  width = 80,
  height = 24,
  color = C.accent,
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  if (values.length === 0) return <svg width={width} height={height} />;

  const max = Math.max(...values.map((v) => Math.abs(v)), 0) || 1;
  const pad = 1;
  const innerH = height - pad * 2;
  const n = values.length;
  const gap = 1.5;
  const barW = Math.max(1, (width - pad * 2 - gap * (n - 1)) / n);

  return (
    <svg width={width} height={height} role="img" aria-label={`${n} values, latest ${values[n - 1]}`}>
      {values.map((v, i) => {
        const h = Math.max(1, (Math.abs(v) / max) * innerH);
        const x = pad + i * (barW + gap);
        const y = height - pad - h;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barW}
            height={h}
            fill={color}
            style={{ transformOrigin: `${(x + barW / 2).toFixed(1)}px ${height - pad}px`, animation: riseBar }}
          >
            <title>{String(v)}</title>
          </rect>
        );
      })}
    </svg>
  );
}

// ─── SignalBars ──────────────────────────────────────────────────────────────

/**
 * Risk signals — a labelled 0..1 score per row over a full-width rail.
 *
 * The handoff pairs each with a note explaining what the signal saw, including
 * when one signal *disagrees* with the rest; confidence here is signal
 * agreement, not model certainty.
 */
export function SignalBars({
  signals,
}: {
  signals: Array<{ label: string; value: string; pct: number; color: string; note?: string }>;
}) {
  if (signals.length === 0) return <NoData height={80} />;
  return (
    <div>
      {signals.map((s) => (
        <div key={s.label} style={{ padding: '11px 0', borderTop: `1px solid ${C.borderSoft}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ font: `500 12px/1.35 ${FONT}`, color: C.ink }}>{s.label}</span>
            <span style={{ font: `600 12px/1 ${MONO}`, color: s.color }}>{s.value}</span>
          </div>
          <div style={{ height: 4, background: C.borderSoft, marginTop: 8, borderRadius: 2 }}>
            <div
              title={`${s.label}: ${s.value}`}
              style={{
                height: 4,
                width: `${Math.max(0, Math.min(100, s.pct))}%`,
                background: s.color,
                borderRadius: 2,
                transformOrigin: 'left',
                animation: grow(150),
              }}
            />
          </div>
          {s.note && (
            <div style={{ font: `400 12px/1.7 ${FONT}`, color: C.inkFaint, marginTop: 6 }}>
              {s.note}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── StepRail ────────────────────────────────────────────────────────────────

/**
 * Chain-of-custody rail: square dots joined by a hairline.
 *
 * Squares, not circles — the handoff never rounds a status marker. Colour the
 * connector with the *next* step's state so the rail shows where things went
 * wrong between two events.
 */
export function StepRail({
  steps,
}: {
  steps: Array<{ label: string; time: string; dot: string; line?: string; fg?: string }>;
}) {
  if (steps.length === 0) return <NoData height={80} />;
  return (
    <div>
      {steps.map((s, i) => (
        <div key={i} style={{ display: 'flex', gap: 13 }}>
          <div
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 10 }}
          >
            <span style={{ width: 9, height: 9, background: s.dot, display: 'inline-block' }} />
            {i < steps.length - 1 && (
              <span
                style={{
                  width: 1,
                  flex: 1,
                  background: s.line ?? C.border,
                  minHeight: 30,
                }}
              />
            )}
          </div>
          <div style={{ paddingBottom: 15, flex: 1 }}>
            <div style={{ font: `500 12px/1.35 ${FONT}`, color: s.fg ?? C.ink }}>{s.label}</div>
            <div style={{ font: `400 11px/1.4 ${MONO}`, color: C.inkFaint, marginTop: 4 }}>
              {s.time}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── MultiLineChart ──────────────────────────────────────────────────────────

/** Several series on one shared scale, with a swatch legend above. */
export function MultiLineChart({
  series,
  height = 200,
  yUnit = '',
}: {
  series: Array<{ name: string; color: string; points: Array<{ x: string; y: number }> }>;
  height?: number;
  /** Suffix appended to each y-axis tick, e.g. '%' or ' units'. */
  yUnit?: string;
}) {
  const nonEmpty = series.filter((s) => s.points.length > 0);
  if (nonEmpty.length === 0) return <NoData height={height} />;

  const W = 620;
  const H = 200;
  const padL = 46;
  const padR = 20;
  const padT = 20;
  const padB = 30;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const all = nonEmpty.flatMap((s) => s.points.map((p) => p.y));
  const max = Math.max(...all, 0);
  const scale = safeScale(0, max * 1.08 || 1);
  const yAt = (v: number) => padT + innerH - scale(v) * innerH;

  const maxN = Math.max(...nonEmpty.map((s) => s.points.length));
  const xAt = (i: number) => (maxN === 1 ? padL + innerW / 2 : padL + (i / (maxN - 1)) * innerW);

  const ticks = nonEmpty.reduce((a, b) => (b.points.length > a.points.length ? b : a)).points;
  const everyNth = tickStep(ticks.length, 8);

  return (
    <div>
      <div style={{ marginBottom: 10 }}>
        <Legend items={nonEmpty.map((s) => ({ label: s.name, color: s.color }))} />
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height, display: 'block' }}
        role="img"
        aria-label={nonEmpty.map((s) => s.name).join(', ')}
      >
        <Grid
          ys={[0, 0.25, 0.5, 0.75, 1].map((f) => padT + innerH * f)}
          x1={padL}
          x2={W - padR}
        />
        <g>
          {[1, 0.5, 0].map((f) => (
            <text key={f} x={8} y={padT + innerH * (1 - f) + 4} style={axisText}>
              {Math.round(max * 1.08 * f).toLocaleString('en-IN')}
              {yUnit}
            </text>
          ))}
        </g>
        {nonEmpty.map((s, si) =>
          s.points.length === 1 ? (
            <circle key={s.name} cx={xAt(0)} cy={yAt(s.points[0]!.y)} r={3.5} fill={s.color}>
              <title>{`${s.name}: ${s.points[0]!.y}`}</title>
            </circle>
          ) : (
            <polyline
              key={s.name}
              points={s.points.map((p, i) => `${xAt(i)},${yAt(p.y)}`).join(' ')}
              fill="none"
              stroke={s.color}
              strokeWidth={2.5}
              strokeLinejoin="round"
              style={draw(0.9, si * 120)}
            >
              <title>{s.name}</title>
            </polyline>
          ),
        )}
        <g>
          {ticks.map((p, i) =>
            i % everyNth === 0 ? (
              <text key={i} x={xAt(i)} y={H - 10} textAnchor="middle" style={axisText}>
                {p.x}
              </text>
            ) : null,
          )}
        </g>
      </svg>
    </div>
  );
}

// ─── ScatterPlot ─────────────────────────────────────────────────────────────

/** Two-axis scatter with labelled points and real axis rules. */
export function ScatterPlot({
  points,
  xLabel,
  yLabel,
  height = 260,
}: {
  points: Array<{ x: number; y: number; label: string; color?: string }>;
  xLabel?: string;
  yLabel?: string;
  height?: number;
}) {
  if (points.length === 0) return <NoData height={height} />;

  const W = 620;
  const H = 260;
  const padL = 52;
  const padR = 28;
  const padT = 20;
  const padB = 42;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const sx = safeScale(xMin, xMax);
  const sy = safeScale(yMin, yMax);
  const xAt = (v: number) => padL + sx(v) * innerW;
  const yAt = (v: number) => padT + innerH - sy(v) * innerH;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height, display: 'block' }}
      role="img"
      aria-label={`Scatter of ${points.length} points${xLabel ? `, ${xLabel}` : ''}${yLabel ? ` vs ${yLabel}` : ''}`}
    >
      <Grid
        ys={[0, 0.25, 0.5, 0.75, 1].map((f) => padT + innerH * f)}
        x1={padL}
        x2={W - padR}
      />
      <line x1={padL} x2={padL} y1={padT} y2={padT + innerH} stroke={C.border} strokeWidth={1} />
      <line
        x1={padL}
        x2={padL + innerW}
        y1={padT + innerH}
        y2={padT + innerH}
        stroke={C.border}
        strokeWidth={1}
      />

      <text x={padL} y={padT + innerH + 18} style={axisText}>
        {xMin.toFixed(1)}
      </text>
      <text x={padL + innerW} y={padT + innerH + 18} textAnchor="end" style={axisText}>
        {xMax.toFixed(1)}
      </text>
      <text x={12} y={padT + 6} style={axisText}>
        {yMax.toFixed(0)}
      </text>
      <text x={12} y={padT + innerH} style={axisText}>
        {yMin.toFixed(0)}
      </text>

      {xLabel && (
        <text
          x={padL + innerW / 2}
          y={H - 8}
          textAnchor="middle"
          style={{ font: `500 10px ${FONT}`, fill: C.inkFaint }}
        >
          {xLabel}
        </text>
      )}
      {yLabel && (
        <text
          x={-(padT + innerH / 2)}
          y={14}
          textAnchor="middle"
          transform="rotate(-90)"
          style={{ font: `500 10px ${FONT}`, fill: C.inkFaint }}
        >
          {yLabel}
        </text>
      )}

      {points.map((p, i) => (
        <g key={i} style={{ animation: `mtFade .5s ease ${i * 60}ms both` }}>
          <rect
            x={xAt(p.x) - 4}
            y={yAt(p.y) - 4}
            width={8}
            height={8}
            fill={p.color ?? C.accent}
          >
            <title>{`${p.label}: (${p.x}, ${p.y})`}</title>
          </rect>
          <text x={xAt(p.x) + 9} y={yAt(p.y) + 4} style={{ font: `400 10px ${MONO}`, fill: C.inkMuted }}>
            {p.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

// ─── Legacy aliases ──────────────────────────────────────────────────────────
//
// The analytics screen predates this file's rewrite. `LineChart` and
// `Histogram` keep it compiling against the new primitives.

export function LineChart({
  series,
  height = 160,
  color,
  yLabel,
}: {
  series: Array<{ x: string; y: number }>;
  height?: number;
  color?: string;
  showArea?: boolean;
  yLabel?: string;
}) {
  if (series.length === 0) return <NoData height={height} />;
  const ticks =
    series.length > 2
      ? [series[0]!.x, series[Math.floor((series.length - 1) / 2)]!.x, series[series.length - 1]!.x]
      : series.map((s) => s.x);
  return (
    <AreaSparkline
      values={series.map((s) => s.y)}
      height={height}
      color={color}
      ticks={yLabel ? ticks.map((t) => `${t}`) : ticks}
    />
  );
}

export function Histogram({
  buckets,
  height = 160,
  color,
}: {
  buckets: Array<{ label: string; count: number }>;
  height?: number;
  color?: string;
}) {
  return (
    <ColumnChart
      bars={buckets.map((b) => ({ label: b.label, count: b.count, color: color ?? C.accent }))}
      height={height}
      barMax={Math.max(40, height - 44)}
    />
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// NEW PRIMITIVES — fill the blank boxes. Same guards, same motion language:
// entrance-only animation, NoData on empty input, safeScale discipline so a
// zero span never reaches an SVG coordinate as NaN.
// ═══════════════════════════════════════════════════════════════════════════

// ─── StackedBarChart ─────────────────────────────────────────────────────────

/**
 * Stacked categorical columns with a legend — order-status mix by district or
 * institution, drug-class share of dispatch volume, and similar "parts of a
 * whole, per category" breakdowns.
 */
export interface StackedBarDatum {
  label: string;
  /** Segment values, same series across every datum (missing = 0). */
  values: number[];
}

export function StackedBarChart({
  data,
  seriesNames,
  colors = SERIES,
  height = 220,
  valueFormat = (v: number) => v.toLocaleString('en-IN'),
  ariaLabel,
}: {
  data: StackedBarDatum[];
  seriesNames: string[];
  colors?: readonly string[];
  height?: number;
  valueFormat?: (v: number) => string;
  ariaLabel?: string;
}) {
  if (data.length === 0 || seriesNames.length === 0) return <NoData height={height} />;

  const totals = data.map((d) => d.values.reduce((a, v) => a + (v || 0), 0));
  const max = Math.max(...totals, 0) || 1;
  const barMax = height - 30;

  return (
    <div>
      <div style={{ marginBottom: 10 }}>
        <Legend items={seriesNames.map((name, i) => ({ label: name, color: colors[i % colors.length]! }))} />
      </div>
      <div
        style={{ display: 'flex', alignItems: 'flex-end', gap: 14, height }}
        role="img"
        aria-label={
          ariaLabel ?? `Stacked bars: ${data.map((d, i) => `${d.label} total ${totals[i]}`).join(', ')}`
        }
      >
        {data.map((d, di) => {
          const total = totals[di]!;
          const barH = Math.max(1, Math.round((total / max) * barMax));
          return (
            <div
              key={d.label}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
                height: '100%',
                justifyContent: 'flex-end',
              }}
            >
              <div
                style={{
                  width: '100%',
                  height: barH,
                  display: 'flex',
                  flexDirection: 'column-reverse',
                  borderRadius: '3px 3px 0 0',
                  overflow: 'hidden',
                  transformOrigin: 'bottom',
                  animation: `mtRiseBar .6s ${EASE} ${di * 60}ms both`,
                }}
              >
                {d.values.map((v, si) => {
                  if (!v) return null;
                  const segH = (v / total) * barH;
                  return (
                    <div
                      key={si}
                      title={`${seriesNames[si]}: ${valueFormat(v)}`}
                      style={{
                        width: '100%',
                        height: Math.max(0, segH - 1),
                        marginTop: si === 0 ? 0 : 2,
                        background: colors[si % colors.length],
                      }}
                    />
                  );
                })}
              </div>
              <span
                style={{
                  font: `500 9px/1 ${MONO}`,
                  letterSpacing: '.08em',
                  color: C.inkFaint,
                  textAlign: 'center',
                }}
              >
                {d.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── GroupedBarChart ─────────────────────────────────────────────────────────

/**
 * Side-by-side comparison bars — requested vs approved quantity, planned vs
 * actual, this-period vs last-period — grouped per category with a legend.
 */
export function GroupedBarChart({
  data,
  seriesNames,
  colors = SERIES,
  height = 200,
  valueFormat = (v: number) => v.toLocaleString('en-IN'),
  ariaLabel,
}: {
  data: Array<{ label: string; values: number[] }>;
  seriesNames: string[];
  colors?: readonly string[];
  height?: number;
  valueFormat?: (v: number) => string;
  ariaLabel?: string;
}) {
  if (data.length === 0 || seriesNames.length === 0) return <NoData height={height} />;

  const max = Math.max(...data.flatMap((d) => d.values.map((v) => v || 0)), 0) || 1;
  const barMax = height - 46;

  return (
    <div>
      <div style={{ marginBottom: 10 }}>
        <Legend items={seriesNames.map((name, i) => ({ label: name, color: colors[i % colors.length]! }))} />
      </div>
      <style>{`.mt-grp-bar { transition: filter .15s ${EASE}; } .mt-grp-bar:hover { filter: brightness(1.08); }`}</style>
      <div
        style={{ display: 'flex', alignItems: 'flex-end', gap: 20, height }}
        role="img"
        aria-label={ariaLabel ?? data.map((d) => `${d.label}: ${d.values.join('/')}`).join(', ')}
      >
        {data.map((d, di) => (
          <div
            key={d.label}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
              height: '100%',
              justifyContent: 'flex-end',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: barMax, width: '100%' }}>
              {d.values.map((v, si) => (
                <div
                  key={si}
                  className="mt-grp-bar"
                  title={`${seriesNames[si] ?? `Series ${si + 1}`}: ${valueFormat(v || 0)}`}
                  style={{
                    flex: 1,
                    height: Math.max(1, Math.round(((v || 0) / max) * barMax)),
                    background: colors[si % colors.length],
                    borderRadius: '2px 2px 0 0',
                    transformOrigin: 'bottom',
                    animation: `mtRiseBar .6s ${EASE} ${di * 70 + si * 40}ms both`,
                  }}
                />
              ))}
            </div>
            <span
              style={{
                font: `500 9px/1 ${MONO}`,
                letterSpacing: '.08em',
                color: C.inkFaint,
                textAlign: 'center',
              }}
            >
              {d.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── GaugeArc ────────────────────────────────────────────────────────────────

/**
 * Semicircular arc gauge with a big centred figure — a single 0–100 KPI, e.g.
 * on-time delivery %, QC pass rate. Colour follows caller-supplied thresholds
 * so the same component reads green/amber/red without hardcoding a metric.
 */
export function GaugeArc({
  value,
  max = 100,
  label,
  size = 180,
  thresholds = [
    { at: 60, color: C.red },
    { at: 85, color: C.amber },
    { at: Infinity, color: C.green },
  ],
  unit = '%',
}: {
  value: number;
  max?: number;
  label?: string;
  size?: number;
  /** Ascending breakpoints; the first one `value` is below wins its colour. */
  thresholds?: Array<{ at: number; color: string }>;
  unit?: string;
}) {
  const v = Math.max(0, Math.min(max, Number.isFinite(value) ? value : 0));
  const frac = max === 0 ? 0 : v / max;
  const color = thresholds.find((t) => v <= t.at)?.color ?? C.accent;

  const R = 78;
  const CX = 100;
  const CY = 100;
  const CIRC = Math.PI * R; // half circumference — the arc spans 180°
  const dash = frac * CIRC;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg
        viewBox="0 0 200 116"
        style={{ width: size, height: size * 0.58, display: 'block' }}
        role="img"
        aria-label={`${label ?? 'Gauge'}: ${v}${unit} of ${max}${unit}`}
      >
        <path
          d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`}
          fill="none"
          stroke={C.borderSoft}
          strokeWidth={14}
          strokeLinecap="round"
        />
        <path
          d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`}
          fill="none"
          stroke={color}
          strokeWidth={14}
          strokeLinecap="round"
          strokeDasharray={`${dash.toFixed(1)} ${CIRC.toFixed(1)}`}
          style={draw(1, 0, CIRC)}
        >
          <title>{`${v}${unit}`}</title>
        </path>
        <text x={CX} y={CY - 6} textAnchor="middle" style={{ font: `600 30px ${MONO}`, fill: C.ink }}>
          {Math.round(v)}
          <tspan style={{ font: `600 14px ${MONO}` }}>{unit}</tspan>
        </text>
      </svg>
      {label && (
        <div
          style={{
            font: `600 11px/1 ${FONT}`,
            letterSpacing: '.14em',
            textTransform: 'uppercase',
            color: C.inkFaint,
            marginTop: 4,
            textAlign: 'center',
          }}
        >
          {label}
        </div>
      )}
    </div>
  );
}

// ─── Heatmap ─────────────────────────────────────────────────────────────────

/**
 * Labelled grid with a sequential colour ramp and a legend — consumption by
 * drug × month, excursions by route × week, or any rows × cols magnitude.
 */
export function Heatmap({
  rows,
  cols,
  values,
  hue = VIZ_TINT.teal,
  hueStrong = C.accent,
  valueFormat = (v: number) => v.toLocaleString('en-IN'),
  cellSize = 34,
  ariaLabel,
}: {
  rows: string[];
  cols: string[];
  /** values[rowIndex][colIndex]. Missing cells are treated as 0. */
  values: number[][];
  /** Tint used for the low end of the ramp. */
  hue?: string;
  /** Solid colour used for the high end of the ramp. */
  hueStrong?: string;
  valueFormat?: (v: number) => string;
  cellSize?: number;
  ariaLabel?: string;
}) {
  if (rows.length === 0 || cols.length === 0) return <NoData height={120} />;

  const flat = values.flatMap((r) => r ?? []);
  const max = Math.max(...flat, 0);
  const min = Math.min(...flat, 0);
  const scale = safeScale(min, max);

  const labelColW = 96;

  return (
    <div style={{ overflowX: 'auto' }}>
      <div
        role="img"
        aria-label={ariaLabel ?? `Heatmap of ${rows.length} rows by ${cols.length} columns`}
        style={{ display: 'inline-block' }}
      >
        <div style={{ display: 'flex', paddingLeft: labelColW, gap: 3, marginBottom: 4 }}>
          {cols.map((c) => (
            <div
              key={c}
              style={{
                width: cellSize,
                flex: `0 0 ${cellSize}px`,
                font: `400 9px/1.2 ${MONO}`,
                color: C.inkFaint,
                textAlign: 'center',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {c}
            </div>
          ))}
        </div>
        {rows.map((r, ri) => (
          <div key={r} style={{ display: 'flex', gap: 3, marginBottom: 3, alignItems: 'center' }}>
            <div
              style={{
                width: labelColW,
                flex: `0 0 ${labelColW}px`,
                font: `400 11px/1.3 ${FONT}`,
                color: C.inkMuted,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                paddingRight: 8,
              }}
            >
              {r}
            </div>
            {cols.map((c, ci) => {
              const v = values[ri]?.[ci] ?? 0;
              const t = scale(v);
              return (
                <div
                  key={c}
                  title={`${r} · ${c}: ${valueFormat(v)}`}
                  style={{
                    width: cellSize,
                    height: cellSize,
                    flex: `0 0 ${cellSize}px`,
                    borderRadius: 3,
                    background: t <= 0 ? C.borderSoft : mixHex(hue, hueStrong, t),
                    animation: `mtFade .4s ${EASE} ${(ri * cols.length + ci) * 12}ms both`,
                  }}
                />
              );
            })}
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, paddingLeft: labelColW }}>
          <span style={{ font: `400 9px ${MONO}`, color: C.inkFaint }}>{valueFormat(min)}</span>
          <div
            style={{
              width: 90,
              height: 8,
              borderRadius: 4,
              background: `linear-gradient(90deg, ${C.borderSoft}, ${hueStrong})`,
            }}
          />
          <span style={{ font: `400 9px ${MONO}`, color: C.inkFaint }}>{valueFormat(max)}</span>
        </div>
      </div>
    </div>
  );
}

/** Linear-interpolates two `#rrggbb` hex colours at `t` in 0..1. */
function mixHex(a: string, b: string, t: number): string {
  const pa = hexToRgb(a);
  const pb = hexToRgb(b);
  const c = Math.max(0, Math.min(1, t));
  const r = Math.round(pa.r + (pb.r - pa.r) * c);
  const g = Math.round(pa.g + (pb.g - pa.g) * c);
  const bl = Math.round(pa.b + (pb.b - pa.b) * c);
  return `rgb(${r},${g},${bl})`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const num = parseInt(full.slice(0, 6), 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

// ─── RadarChart ──────────────────────────────────────────────────────────────

/**
 * Radial chart, 3–8 axes, one or two overlaid polygons — institution
 * reliability or a 5-signal risk profile, compared against a benchmark.
 */
export function RadarChart({
  axes,
  series,
  size = 260,
  max = 100,
}: {
  /** Axis labels, 3 to 8 of them. */
  axes: string[];
  series: Array<{ name: string; color: string; values: number[] }>;
  size?: number;
  max?: number;
}) {
  const n = axes.length;
  if (n < 3 || series.length === 0) return <NoData height={size} />;

  const CX = 130;
  const CY = 130;
  const R = 92;
  const scale = safeScale(0, max || 1);

  const angleAt = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pointAt = (i: number, frac: number) => {
    const a = angleAt(i);
    const r = Math.max(0, Math.min(1, frac)) * R;
    return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) };
  };

  const rings = [0.25, 0.5, 0.75, 1];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <svg
        viewBox="0 0 260 260"
        style={{ width: size, height: size, display: 'block' }}
        role="img"
        aria-label={`Radar of ${axes.join(', ')} for ${series.map((s) => s.name).join(', ')}`}
      >
        {rings.map((f, i) => (
          <polygon
            key={i}
            points={axes.map((_, ai) => pointAt(ai, f)).map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke={C.borderFaint}
            strokeWidth={1}
          />
        ))}
        {axes.map((_, ai) => {
          const p = pointAt(ai, 1);
          return <line key={ai} x1={CX} y1={CY} x2={p.x} y2={p.y} stroke={C.borderFaint} strokeWidth={1} />;
        })}

        {series.map((s, si) => {
          const vals = axes.map((_, ai) => scale(s.values[ai] ?? 0));
          const pts = vals.map((f, ai) => pointAt(ai, f));
          const path = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
          return (
            <g key={s.name} style={{ animation: `mtFade .6s ${EASE} ${si * 150}ms both` }}>
              <polygon points={path} fill={`${s.color}22`} stroke="none" />
              <polygon
                points={path}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinejoin="round"
                style={draw(0.9, si * 150, 900)}
              />
              {pts.map((p, ai) => (
                <circle key={ai} cx={p.x} cy={p.y} r={3} fill={s.color}>
                  <title>{`${s.name} · ${axes[ai]}: ${s.values[ai] ?? 0}`}</title>
                </circle>
              ))}
            </g>
          );
        })}

        {axes.map((label, ai) => {
          const p = pointAt(ai, 1.16);
          return (
            <text
              key={label}
              x={p.x}
              y={p.y}
              textAnchor="middle"
              dominantBaseline="middle"
              style={axisText}
            >
              {label}
            </text>
          );
        })}
      </svg>
      {series.length > 1 && (
        <Legend items={series.map((s) => ({ label: s.name, color: s.color, kind: 'thin' }))} />
      )}
    </div>
  );
}

// ─── WaterfallChart ──────────────────────────────────────────────────────────

/**
 * Running-total contribution bars — stock movement (opening, +receipts,
 * -dispatch, -expiry, closing) or SHAP-style driver contributions toward a
 * risk score. Positive steps float up in green, negative in red, totals in
 * ink.
 */
export interface WaterfallStep {
  label: string;
  /** Delta for a step, or the absolute value when `isTotal` is set. */
  value: number;
  isTotal?: boolean;
}

export function WaterfallChart({
  steps,
  height = 220,
  valueFormat = (v: number) => v.toLocaleString('en-IN'),
}: {
  steps: WaterfallStep[];
  height?: number;
  valueFormat?: (v: number) => string;
}) {
  if (steps.length === 0) return <NoData height={height} />;

  const W = 640;
  const H = height;
  const padL = 50;
  const padR = 16;
  const padT = 24;
  const padB = 34;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  let running = 0;
  const bars = steps.map((s) => {
    const from = running;
    const to = s.isTotal ? s.value : running + s.value;
    running = to;
    return { ...s, from, to, lo: Math.min(from, to), hi: Math.max(from, to) };
  });

  const allVals = [0, ...bars.flatMap((b) => [b.from, b.to])];
  const max = Math.max(...allVals);
  const min = Math.min(...allVals);
  const scale = safeScale(Math.min(0, min), Math.max(0, max));
  const yAt = (v: number) => padT + innerH - scale(v) * innerH;
  const zeroY = yAt(0);

  const n = bars.length;
  const gap = 10;
  const barW = (innerW - gap * (n - 1)) / n;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height, display: 'block' }}
      role="img"
      aria-label={`Waterfall: ${bars.map((b) => `${b.label} ${b.isTotal ? b.value : (b.value >= 0 ? '+' : '') + b.value}`).join(', ')}`}
    >
      <Grid ys={[padT, zeroY, padT + innerH].filter((y, i, a) => a.indexOf(y) === i)} x1={padL} x2={W - padR} />
      <line
        x1={padL}
        x2={W - padR}
        y1={zeroY}
        y2={zeroY}
        stroke={C.borderActive}
        strokeWidth={1}
        strokeDasharray="3 4"
      />
      {bars.map((b, i) => {
        const x = padL + i * (barW + gap);
        const y = yAt(b.hi);
        const h = Math.max(1, yAt(b.lo) - yAt(b.hi));
        const color = b.isTotal ? C.ink : b.value >= 0 ? C.green : C.red;
        const connectorPrev = i > 0 ? bars[i - 1]!.to : null;
        return (
          <g key={b.label}>
            {connectorPrev !== null && (
              <line
                x1={x - gap}
                x2={x}
                y1={yAt(connectorPrev)}
                y2={yAt(connectorPrev)}
                stroke={C.borderFaint}
                strokeWidth={1}
                strokeDasharray="2 3"
              />
            )}
            <rect
              x={x}
              y={y}
              width={barW}
              height={h}
              fill={color}
              rx={2}
              style={{ transformOrigin: `${(x + barW / 2).toFixed(1)}px ${zeroY}px`, animation: `mtRiseBar .5s ${EASE} ${i * 70}ms both` }}
            >
              <title>{`${b.label}: ${b.isTotal ? valueFormat(b.value) : `${b.value >= 0 ? '+' : ''}${valueFormat(b.value)}`}`}</title>
            </rect>
            <text
              x={x + barW / 2}
              y={y - 6}
              textAnchor="middle"
              style={{ font: `600 10px ${MONO}`, fill: color }}
            >
              {b.isTotal ? valueFormat(b.value) : `${b.value >= 0 ? '+' : ''}${valueFormat(b.value)}`}
            </text>
            <text x={x + barW / 2} y={H - 12} textAnchor="middle" style={axisText}>
              {b.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── TimelineBars ────────────────────────────────────────────────────────────

/**
 * Gantt-ish horizontal timeline of spans with status colours — shipment legs
 * or a custody chain, one row per actor/leg, spans positioned by fraction
 * 0..1 across the visible window.
 */
export function TimelineBars({
  rows,
  height,
  rowH = 28,
  labelWidth = 120,
}: {
  rows: Array<{
    label: string;
    spans: Array<{ from: number; to: number; color: string; note?: string }>;
  }>;
  height?: number;
  rowH?: number;
  labelWidth?: number;
}) {
  if (rows.length === 0) return <NoData height={height ?? 120} />;

  const W = 640;
  const H = height ?? rows.length * (rowH + 8) + 16;
  const padL = labelWidth;
  const padR = 12;
  const innerW = W - padL - padR;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: H, display: 'block' }}
      role="img"
      aria-label={`Timeline of ${rows.length} rows`}
    >
      <line x1={padL} x2={W - padR} y1={8} y2={8} stroke={C.borderFaint} strokeWidth={1} />
      {rows.map((row, ri) => {
        const y = 16 + ri * (rowH + 8);
        return (
          <g key={row.label}>
            <text x={0} y={y + rowH / 2 + 4} style={{ font: `400 11px ${FONT}`, fill: C.inkMuted }}>
              {row.label}
            </text>
            <rect x={padL} y={y} width={innerW} height={rowH} fill={C.raised} rx={3} />
            {row.spans.map((s, si) => {
              const from = Math.max(0, Math.min(1, s.from));
              const to = Math.max(from, Math.min(1, s.to));
              const x = padL + from * innerW;
              const w = Math.max(3, (to - from) * innerW);
              return (
                <rect
                  key={si}
                  x={x}
                  y={y}
                  width={w}
                  height={rowH}
                  fill={s.color}
                  rx={3}
                  style={{
                    transformOrigin: `${x.toFixed(1)}px ${(y + rowH / 2).toFixed(1)}px`,
                    animation: `mtGrow .5s ${EASE} ${(ri * 3 + si) * 60}ms both`,
                  }}
                >
                  <title>{s.note ?? `${row.label}: ${Math.round((to - from) * 100)}% of window`}</title>
                </rect>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

// ─── ProgressRing ────────────────────────────────────────────────────────────

/**
 * Compact circular progress with a centred percentage — shipment progress in
 * a list row, or any inline 0–100 completion figure beside text.
 */
export function ProgressRing({
  pct,
  size = 40,
  color = C.accent,
  thickness = 4,
}: {
  pct: number;
  size?: number;
  color?: string;
  thickness?: number;
}) {
  const v = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
  const R = 18;
  const CIRC = 2 * Math.PI * R;
  const dash = (v / 100) * CIRC;

  return (
    <svg
      viewBox="0 0 40 40"
      style={{ width: size, height: size, display: 'block' }}
      role="img"
      aria-label={`${Math.round(v)}% complete`}
    >
      <circle cx={20} cy={20} r={R} fill="none" stroke={C.borderSoft} strokeWidth={thickness} />
      <circle
        cx={20}
        cy={20}
        r={R}
        fill="none"
        stroke={color}
        strokeWidth={thickness}
        strokeLinecap="round"
        strokeDasharray={`${dash.toFixed(1)} ${CIRC.toFixed(1)}`}
        transform="rotate(-90 20 20)"
        style={draw(0.7, 0, CIRC)}
      >
        <title>{`${Math.round(v)}%`}</title>
      </circle>
      <text x={20} y={23.5} textAnchor="middle" style={{ font: `600 10px ${MONO}`, fill: C.ink }}>
        {Math.round(v)}
      </text>
    </svg>
  );
}

// ─── CalendarHeatmap ─────────────────────────────────────────────────────────

/**
 * Day-grid intensity map for a 30–90 day window — deliveries or excursions
 * per day, laid out as ISO weeks (columns) × weekday (rows), GitHub-style.
 */
export function CalendarHeatmap({
  days,
  hueStrong = C.accent,
  cell = 13,
  ariaLabel,
}: {
  /** One entry per day, in chronological order. */
  days: Array<{ date: string; value: number }>;
  hueStrong?: string;
  cell?: number;
  ariaLabel?: string;
}) {
  if (days.length === 0) return <NoData height={100} />;

  // Pad the front so the first column starts on a Sunday (col-major weeks).
  const first = new Date(days[0]!.date);
  const firstDow = Number.isNaN(first.getTime()) ? 0 : first.getDay();
  const padded: Array<{ date: string; value: number } | null> = [
    ...Array.from({ length: firstDow }, () => null),
    ...days,
  ];
  const weeks = Math.ceil(padded.length / 7);
  const max = Math.max(...days.map((d) => d.value), 0);
  const scale = safeScale(0, max || 1);
  const gap = 3;
  const W = weeks * (cell + gap);
  const H = 7 * (cell + gap);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', maxWidth: W, height: H, display: 'block' }}
      role="img"
      aria-label={ariaLabel ?? `Calendar heatmap over ${days.length} days, max ${max}`}
    >
      {padded.map((d, i) => {
        if (!d) return null;
        const col = Math.floor(i / 7);
        const row = i % 7;
        const t = scale(d.value);
        return (
          <rect
            key={d.date}
            x={col * (cell + gap)}
            y={row * (cell + gap)}
            width={cell}
            height={cell}
            rx={2}
            fill={d.value === 0 ? C.borderSoft : mixHex(VIZ_TINT.teal, hueStrong, Math.max(0.15, t))}
            style={{ animation: `mtFade .35s ${EASE} ${i * 4}ms both` }}
          >
            <title>{`${d.date}: ${d.value}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

// ─── BulletChart ─────────────────────────────────────────────────────────────

/**
 * Actual vs target vs qualitative range — a compact alternative to `GaugeArc`
 * for a KPI row where several metrics need to line up vertically (e.g. a
 * dashboard's "targets" panel: on-time %, QC pass %, SLA adherence).
 */
export function BulletChart({
  label,
  value,
  target,
  max,
  ranges,
  valueFormat = (v: number) => v.toLocaleString('en-IN'),
  color = C.accent,
  height = 36,
}: {
  label: string;
  value: number;
  target: number;
  max: number;
  /** Qualitative bands (e.g. poor/ok/good), ascending, summing to `max`. */
  ranges?: Array<{ to: number; color: string }>;
  valueFormat?: (v: number) => string;
  color?: string;
  height?: number;
}) {
  const m = max > 0 ? max : 1;
  const v = Math.max(0, Math.min(m, value));
  const t = Math.max(0, Math.min(m, target));
  const bands = ranges && ranges.length > 0 ? ranges : [{ to: m, color: C.borderSoft }];

  const W = 100; // percent-based inner scale
  const barH = 14;
  const barY = (height - barH) / 2;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div
        style={{
          width: 110,
          flex: '0 0 110px',
          font: `400 11px/1.3 ${FONT}`,
          color: C.inkMuted,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </div>
      <svg
        viewBox={`0 0 ${W} ${height}`}
        style={{ width: '100%', height, display: 'block', flex: '1 1 auto' }}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${label}: ${valueFormat(v)} of target ${valueFormat(t)}, max ${valueFormat(m)}`}
      >
        {bands.map((b, i) => {
          const prevTo = i === 0 ? 0 : bands[i - 1]!.to;
          const x = (prevTo / m) * W;
          const w = ((b.to - prevTo) / m) * W;
          return <rect key={i} x={x} y={barY} width={w} height={barH} fill={b.color} />;
        })}
        <rect
          x={0}
          y={barY + barH / 4}
          width={(v / m) * W}
          height={barH / 2}
          fill={color}
          style={{ transformOrigin: '0px center', animation: grow(150) }}
        >
          <title>{`${label}: ${valueFormat(v)}`}</title>
        </rect>
        <line
          x1={(t / m) * W}
          x2={(t / m) * W}
          y1={2}
          y2={height - 2}
          stroke={C.ink}
          strokeWidth={2}
        >
          <title>{`Target: ${valueFormat(t)}`}</title>
        </line>
      </svg>
      <div style={{ width: 56, flex: '0 0 56px', textAlign: 'right', font: `500 11px/1 ${MONO}`, color: C.ink }}>
        {valueFormat(v)}
      </div>
    </div>
  );
}
