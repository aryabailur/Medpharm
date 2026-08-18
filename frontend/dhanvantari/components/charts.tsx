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

import { C, draw, EASE, FONT, grow, MONO, riseBar } from '../lib/theme';

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
}: {
  readings: TempReading[];
  minC?: number;
  maxC?: number;
  /** Excursion windows, as fractions 0..1 across the series. */
  bands?: Array<{ from: number; to: number; label?: string }>;
  height?: number;
  ticks?: string[];
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
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height, display: 'block' }}>
        {/* Permitted band, behind everything. */}
        <rect x={padL} y={yAt(maxC)} width={innerW} height={yAt(minC) - yAt(maxC)} fill={C.bandFill} />

        {/* Excursion columns. */}
        {bands.map((b, i) => {
          const x = padL + Math.max(0, Math.min(1, b.from)) * innerW;
          const w = Math.max(2, (Math.min(1, b.to) - Math.max(0, b.from)) * innerW);
          return (
            <g key={i}>
              <rect x={x} y={padT} width={w} height={innerH} fill={C.amberTint} />
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
          <circle cx={xAt(0)} cy={yAt(last.tempC)} r={4} fill={C.accent} />
        ) : (
          <polyline
            points={pts.join(' ')}
            fill="none"
            stroke={C.accent}
            strokeWidth={2.5}
            strokeLinejoin="round"
            style={draw(1)}
          />
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
        <rect x={xAt(n - 1) - 4} y={yAt(last.tempC) - 4} width={8} height={8} fill={C.accent} />
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
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height, display: 'block' }}>
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

        <rect x={A.x - 5} y={A.y - 5} width={10} height={10} fill={C.inkMuted} />
        {incident && <rect x={inc.x - 5} y={inc.y - 5} width={10} height={10} fill={C.amber} />}
        <rect x={D.x - 5} y={D.y - 5} width={10} height={10} fill={C.green} />

        {/* Current position: ring + dot, so it reads as live. */}
        <circle cx={here.x} cy={here.y} r={11} fill="none" stroke={C.ink} strokeWidth={1} />
        <circle cx={here.x} cy={here.y} r={5} fill={C.ink} />

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
          />
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
            />
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
}: {
  values: number[];
  height?: number;
  color?: string;
  fill?: string;
  ticks?: string[];
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

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height, display: 'block' }}>
        <Grid ys={[padT + innerH * 0.25, padT + innerH * 0.5, padT + innerH * 0.75]} x1={0} x2={W} />
        <polyline
          points={area.join(' ')}
          fill={fill}
          stroke="none"
          style={{ animation: `mtFade .7s ease .25s both` }}
        />
        {n === 1 ? (
          <circle cx={lastX} cy={lastY} r={3} fill={color} />
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
        <rect x={Math.min(lastX, W - 8) - 4} y={lastY - 4} width={8} height={8} fill={color} />
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
}: {
  history: Array<{ x: string; y: number }>;
  forecast: Array<{ x: string; y: number }>;
  /** Upper/lower bounds aligned to `forecast`. */
  band?: Array<{ hi: number; lo: number }>;
  height?: number;
  yFormat?: (v: number) => string;
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
  const everyNth = Math.max(1, Math.ceil(total / 10));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height, display: 'block' }}>
      <Grid ys={gridYs} x1={padL} x2={W - padR} />

      <g>
        {[1, 0.75, 0.5, 0.25, 0].map((f) => (
          <text key={f} x={8} y={padT + innerH * (1 - f) + 4} style={axisText}>
            {yFormat(max * 1.08 * f)}
          </text>
        ))}
      </g>

      {bandPath && (
        <path d={bandPath} fill={C.forecastBand} style={{ animation: `mtFade .8s ease .3s both` }} />
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
}: {
  bars: Array<{ label: string; count: number; color: string; note?: string }>;
  height?: number;
  barMax?: number;
  gap?: number;
  valueFont?: string;
  footnote?: ReactNode;
}) {
  if (bars.length === 0) return <NoData height={height} />;
  const worst = Math.max(...bars.map((b) => b.count), 0) || 1;

  return (
    <div>
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
              style={{
                width: '100%',
                height: Math.round((b.count / worst) * barMax),
                background: b.color,
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
}: {
  data: Array<{ label: string; value: number; color?: string }>;
  valueFormat?: (v: number) => string;
  labelWidth?: number;
  horizontal?: boolean;
  height?: number;
}) {
  const fmt = valueFormat ?? ((v: number) => v.toLocaleString('en-IN'));
  if (data.length === 0) return <NoData height={80} />;

  const max = Math.max(...data.map((d) => Math.abs(d.value)), 0);
  const scale = max === 0 ? () => 0 : (v: number) => Math.abs(v) / max;

  return (
    <div style={{ display: 'grid', gap: 10 }}>
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
          <div style={{ flex: 1, background: C.borderSoft, height: 6 }}>
            <div
              style={{
                width: `${scale(d.value) * 100}%`,
                height: 6,
                background: d.color ?? C.accent,
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
  const full = width === 'full';
  return (
    <div
      style={{
        width: full ? '100%' : width,
        height: thickness,
        background: C.borderSoft,
        flex: full ? '1 1 auto' : `0 0 ${width}px`,
      }}
    >
      <div
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
      <svg width={width} height={height}>
        <circle cx={xAt(0)} cy={yAt(values[0]!)} r={2} fill={color} />
      </svg>
    );
  }

  return (
    <svg width={width} height={height}>
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
          <div style={{ height: 4, background: C.borderSoft, marginTop: 8 }}>
            <div
              style={{
                height: 4,
                width: `${Math.max(0, Math.min(100, s.pct))}%`,
                background: s.color,
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
}: {
  series: Array<{ name: string; color: string; points: Array<{ x: string; y: number }> }>;
  height?: number;
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
  const everyNth = Math.max(1, Math.ceil(ticks.length / 8));

  return (
    <div>
      <div style={{ marginBottom: 10 }}>
        <Legend items={nonEmpty.map((s) => ({ label: s.name, color: s.color }))} />
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height, display: 'block' }}>
        <Grid
          ys={[0, 0.25, 0.5, 0.75, 1].map((f) => padT + innerH * f)}
          x1={padL}
          x2={W - padR}
        />
        <g>
          {[1, 0.5, 0].map((f) => (
            <text key={f} x={8} y={padT + innerH * (1 - f) + 4} style={axisText}>
              {Math.round(max * 1.08 * f).toLocaleString('en-IN')}
            </text>
          ))}
        </g>
        {nonEmpty.map((s, si) =>
          s.points.length === 1 ? (
            <circle key={s.name} cx={xAt(0)} cy={yAt(s.points[0]!.y)} r={3.5} fill={s.color} />
          ) : (
            <polyline
              key={s.name}
              points={s.points.map((p, i) => `${xAt(i)},${yAt(p.y)}`).join(' ')}
              fill="none"
              stroke={s.color}
              strokeWidth={2.5}
              strokeLinejoin="round"
              style={draw(0.9, si * 120)}
            />
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
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height, display: 'block' }}>
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
          />
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
