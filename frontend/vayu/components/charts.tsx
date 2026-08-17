/**
 * Reusable inline-SVG chart primitives for the Network Analytics screen.
 *
 * No chart library — Recharts is installed but these are plain SVG,
 * matching the sparkline approach already used in app/risk/page.tsx.
 * Every chart guards empty data, a single point, and all-equal values so
 * no coordinate ever evaluates to NaN.
 */

import { C, FONT, MONO } from '../lib/theme';

const VIEW_W = 600;

/** Safe divide: returns `fallback` instead of NaN/Infinity when range is 0. */
function safeDiv(num: number, den: number, fallback: number): number {
  return den === 0 || !Number.isFinite(den) ? fallback : num / den;
}

// ─── LineChart ───────────────────────────────────────────────────────────────

export function LineChart({
  series,
  height = 160,
  color = C.steel,
  showArea = false,
  yLabel,
}: {
  series: Array<{ x: string; y: number }>;
  height?: number;
  color?: string;
  showArea?: boolean;
  yLabel?: string;
}) {
  const padL = 8;
  const padR = 8;
  const padT = 14;
  const padB = 20;
  const innerW = VIEW_W - padL - padR;
  const innerH = height - padT - padB;

  const values = series.map((p) => p.y);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 0;
  const range = max - min;

  const xAt = (i: number) => padL + safeDiv(i, series.length - 1, 0) * innerW;
  const yAt = (v: number) => padT + (1 - safeDiv(v - min, range, 0.5)) * innerH;

  const points = series.map((p, i) => `${xAt(i)},${yAt(p.y)}`).join(' ');
  const areaPoints =
    series.length > 0
      ? `${xAt(0)},${padT + innerH} ${points} ${xAt(series.length - 1)},${padT + innerH}`
      : '';

  const gridYs = [0, 0.5, 1].map((f) => padT + f * innerH);

  const firstLabel = series[0]?.x;
  const midLabel = series[Math.floor((series.length - 1) / 2)]?.x;
  const lastLabel = series[series.length - 1]?.x;

  return (
    <div>
      <svg width="100%" height={height} viewBox={`0 0 ${VIEW_W} ${height}`} preserveAspectRatio="none">
        {gridYs.map((gy, i) => (
          <line key={i} x1={padL} y1={gy} x2={VIEW_W - padR} y2={gy} stroke={C.borderSoft} strokeWidth={1} />
        ))}

        {series.length === 0 ? null : (
          <>
            {showArea && (
              <polygon points={areaPoints} fill={color} opacity={0.12} stroke="none" />
            )}
            {series.length === 1 ? (
              <circle cx={xAt(0)} cy={yAt(series[0]!.y)} r={3} fill={color} />
            ) : (
              <polyline points={points} fill="none" stroke={color} strokeWidth={1.75} />
            )}
          </>
        )}

        {series.length > 0 && (
          <>
            <text x={padL} y={padT - 4} fontSize={10} fontFamily={MONO} fill={C.inkGhost}>
              {max.toFixed(0)}
            </text>
            <text x={padL} y={height - 4} fontSize={10} fontFamily={MONO} fill={C.inkGhost}>
              {min.toFixed(0)}
            </text>
          </>
        )}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
        <span style={{ font: `400 10px/1.2 ${MONO}`, color: C.inkGhost }}>{firstLabel ?? ''}</span>
        <span style={{ font: `400 10px/1.2 ${MONO}`, color: C.inkGhost }}>
          {series.length > 2 ? midLabel ?? '' : ''}
        </span>
        <span style={{ font: `400 10px/1.2 ${MONO}`, color: C.inkGhost }}>
          {series.length > 1 ? lastLabel ?? '' : ''}
        </span>
      </div>
      {yLabel && (
        <div style={{ font: `400 10px/1.2 ${FONT}`, color: C.inkGhost, marginTop: 4 }}>{yLabel}</div>
      )}
    </div>
  );
}

// ─── MultiLineChart ──────────────────────────────────────────────────────────

export function MultiLineChart({
  series,
  height = 180,
}: {
  series: Array<{ name: string; color: string; points: Array<{ x: string; y: number }> }>;
  height?: number;
}) {
  const padL = 8;
  const padR = 8;
  const padT = 14;
  const padB = 20;
  const innerW = VIEW_W - padL - padR;
  const innerH = height - padT - padB;

  const allValues = series.flatMap((s) => s.points.map((p) => p.y));
  const min = allValues.length ? Math.min(...allValues) : 0;
  const max = allValues.length ? Math.max(...allValues) : 0;
  const range = max - min;

  const maxLen = Math.max(0, ...series.map((s) => s.points.length));
  const xAt = (i: number) => padL + safeDiv(i, maxLen - 1, 0) * innerW;
  const yAt = (v: number) => padT + (1 - safeDiv(v - min, range, 0.5)) * innerH;

  const gridYs = [0, 0.5, 1].map((f) => padT + f * innerH);

  const labels = series[0]?.points ?? [];
  const firstLabel = labels[0]?.x;
  const midLabel = labels[Math.floor((labels.length - 1) / 2)]?.x;
  const lastLabel = labels[labels.length - 1]?.x;

  return (
    <div>
      {series.length > 0 && (
        <div style={{ display: 'flex', gap: 14, marginBottom: 6, flexWrap: 'wrap' }}>
          {series.map((s) => (
            <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: s.color, display: 'inline-block' }} />
              <span style={{ font: `500 11px/1 ${FONT}`, color: C.inkMuted }}>{s.name}</span>
            </div>
          ))}
        </div>
      )}
      <svg width="100%" height={height} viewBox={`0 0 ${VIEW_W} ${height}`} preserveAspectRatio="none">
        {gridYs.map((gy, i) => (
          <line key={i} x1={padL} y1={gy} x2={VIEW_W - padR} y2={gy} stroke={C.borderSoft} strokeWidth={1} />
        ))}

        {series.map((s) => {
          if (s.points.length === 0) return null;
          if (s.points.length === 1) {
            return <circle key={s.name} cx={xAt(0)} cy={yAt(s.points[0]!.y)} r={3} fill={s.color} />;
          }
          const pts = s.points.map((p, i) => `${xAt(i)},${yAt(p.y)}`).join(' ');
          return <polyline key={s.name} points={pts} fill="none" stroke={s.color} strokeWidth={1.75} />;
        })}

        {allValues.length > 0 && (
          <>
            <text x={padL} y={padT - 4} fontSize={10} fontFamily={MONO} fill={C.inkGhost}>
              {max.toFixed(0)}
            </text>
            <text x={padL} y={height - 4} fontSize={10} fontFamily={MONO} fill={C.inkGhost}>
              {min.toFixed(0)}
            </text>
          </>
        )}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
        <span style={{ font: `400 10px/1.2 ${MONO}`, color: C.inkGhost }}>{firstLabel ?? ''}</span>
        <span style={{ font: `400 10px/1.2 ${MONO}`, color: C.inkGhost }}>
          {labels.length > 2 ? midLabel ?? '' : ''}
        </span>
        <span style={{ font: `400 10px/1.2 ${MONO}`, color: C.inkGhost }}>
          {labels.length > 1 ? lastLabel ?? '' : ''}
        </span>
      </div>
    </div>
  );
}

// ─── BarChart ────────────────────────────────────────────────────────────────

export function BarChart({
  data,
  height = 220,
  horizontal = false,
  valueFormat,
}: {
  data: Array<{ label: string; value: number; color?: string }>;
  height?: number;
  horizontal?: boolean;
  valueFormat?: (n: number) => string;
}) {
  const fmt = valueFormat ?? ((n: number) => n.toFixed(0));
  const maxVal = data.length ? Math.max(...data.map((d) => Math.abs(d.value)), 0.0001) : 1;

  if (horizontal) {
    const rowH = 28;
    const totalH = Math.max(height, data.length * rowH + 8);
    return (
      <svg width="100%" height={totalH} viewBox={`0 0 ${VIEW_W} ${totalH}`} preserveAspectRatio="none">
        {data.length === 0
          ? null
          : data.map((d, i) => {
              const y = i * rowH + 6;
              const barMaxW = VIEW_W - 110 - 60;
              const w = Math.max(1, safeDiv(Math.abs(d.value), maxVal, 0) * barMaxW);
              return (
                <g key={d.label}>
                  <text x={0} y={y + 13} fontSize={12} fontFamily={FONT} fill={C.inkMuted}>
                    {d.label.length > 16 ? `${d.label.slice(0, 15)}…` : d.label}
                  </text>
                  <rect x={110} y={y} width={w} height={18} rx={3} fill={d.color ?? C.steel} />
                  <text x={110 + w + 8} y={y + 13} fontSize={11} fontFamily={MONO} fill={C.inkFaint}>
                    {fmt(d.value)}
                  </text>
                </g>
              );
            })}
      </svg>
    );
  }

  const padB = 30;
  const padT = 20;
  const innerH = height - padT - padB;
  const n = Math.max(data.length, 1);
  const gap = 8;
  const barW = Math.max(4, safeDiv(VIEW_W - gap * (n + 1), n, VIEW_W / 2));

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${VIEW_W} ${height}`} preserveAspectRatio="none">
      {data.length === 0
        ? null
        : data.map((d, i) => {
            const h = Math.max(1, safeDiv(Math.abs(d.value), maxVal, 0) * innerH);
            const x = gap + i * (barW + gap);
            const y = padT + (innerH - h);
            return (
              <g key={d.label}>
                <text x={x + barW / 2} y={y - 6} fontSize={10} fontFamily={MONO} fill={C.inkFaint} textAnchor="middle">
                  {fmt(d.value)}
                </text>
                <rect x={x} y={y} width={barW} height={h} rx={2} fill={d.color ?? C.steel} />
                <text
                  x={x + barW / 2}
                  y={height - 10}
                  fontSize={10}
                  fontFamily={FONT}
                  fill={C.inkGhost}
                  textAnchor="middle"
                >
                  {d.label.length > 12 ? `${d.label.slice(0, 11)}…` : d.label}
                </text>
              </g>
            );
          })}
    </svg>
  );
}

// ─── ScatterPlot ─────────────────────────────────────────────────────────────

export function ScatterPlot({
  points,
  xLabel,
  yLabel,
  height = 260,
}: {
  points: Array<{ x: number; y: number; label: string; color?: string }>;
  xLabel: string;
  yLabel: string;
  height?: number;
}) {
  const padL = 40;
  const padR = 50;
  const padT = 16;
  const padB = 36;
  const innerW = VIEW_W - padL - padR;
  const innerH = height - padT - padB;

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const xMin = xs.length ? Math.min(...xs) : 0;
  const xMax = xs.length ? Math.max(...xs) : 1;
  const yMin = ys.length ? Math.min(...ys) : 0;
  const yMax = ys.length ? Math.max(...ys) : 1;
  const xRange = xMax - xMin;
  const yRange = yMax - yMin;

  const xAt = (v: number) => padL + safeDiv(v - xMin, xRange, 0.5) * innerW;
  const yAt = (v: number) => padT + (1 - safeDiv(v - yMin, yRange, 0.5)) * innerH;

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${VIEW_W} ${height}`} preserveAspectRatio="none">
      <line x1={padL} y1={padT} x2={padL} y2={padT + innerH} stroke={C.border} strokeWidth={1} />
      <line x1={padL} y1={padT + innerH} x2={padL + innerW} y2={padT + innerH} stroke={C.border} strokeWidth={1} />

      <text x={padL + innerW / 2} y={height - 6} fontSize={11} fontFamily={FONT} fill={C.inkFaint} textAnchor="middle">
        {xLabel}
      </text>
      <text
        x={12}
        y={padT + innerH / 2}
        fontSize={11}
        fontFamily={FONT}
        fill={C.inkFaint}
        textAnchor="middle"
        transform={`rotate(-90, 12, ${padT + innerH / 2})`}
      >
        {yLabel}
      </text>

      {points.map((p) => (
        <g key={p.label}>
          <circle cx={xAt(p.x)} cy={yAt(p.y)} r={5} fill={p.color ?? C.steel} />
          <text x={xAt(p.x) + 8} y={yAt(p.y) + 3} fontSize={10} fontFamily={FONT} fill={C.inkMuted}>
            {p.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

// ─── Histogram ───────────────────────────────────────────────────────────────

export function Histogram({
  buckets,
  height = 200,
  color = C.steel,
}: {
  buckets: Array<{ label: string; count: number }>;
  height?: number;
  color?: string;
}) {
  const padB = 30;
  const padT = 20;
  const innerH = height - padT - padB;
  const n = Math.max(buckets.length, 1);
  const gap = 10;
  const barW = Math.max(4, safeDiv(VIEW_W - gap * (n + 1), n, VIEW_W / 2));
  const maxCount = buckets.length ? Math.max(...buckets.map((b) => b.count), 0.0001) : 1;

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${VIEW_W} ${height}`} preserveAspectRatio="none">
      {buckets.length === 0
        ? null
        : buckets.map((b, i) => {
            const h = Math.max(1, safeDiv(b.count, maxCount, 0) * innerH);
            const x = gap + i * (barW + gap);
            const y = padT + (innerH - h);
            return (
              <g key={b.label}>
                <text x={x + barW / 2} y={y - 6} fontSize={10} fontFamily={MONO} fill={C.inkFaint} textAnchor="middle">
                  {b.count}
                </text>
                <rect x={x} y={y} width={barW} height={h} rx={2} fill={color} />
                <text
                  x={x + barW / 2}
                  y={height - 10}
                  fontSize={10}
                  fontFamily={FONT}
                  fill={C.inkGhost}
                  textAnchor="middle"
                >
                  {b.label}
                </text>
              </g>
            );
          })}
    </svg>
  );
}
