/**
 * Inline-SVG chart primitives for the Vayu terminal.
 *
 * No chart library — Recharts is installed but its SSR/hydration cost and
 * default visual language don't match the operations-terminal read. Every
 * primitive here guards empty data, a single point, and all-equal values so a
 * zero denominator never reaches an SVG coordinate as NaN.
 *
 * Layout fixes applied (2026-08-18):
 *  - All full-width SVGs use a responsive wrapper div instead of
 *    preserveAspectRatio="none" which stretched/skewed text and labels.
 *  - Y-axis value labels moved to their own left gutter column.
 *  - Horizontal BarChart label column widens to fit longer district names.
 *  - Histogram and BarChart padL included so first bar isn't clipped.
 *  - ScatterPlot Y-label uses foreignObject instead of rotated SVG text so
 *    it survives aspect-ratio-preserving viewBox scaling.
 *  - ForecastTrend uses xMidYMid meet so forecast band isn't squished.
 */

import { C, FONT, MONO } from '../lib/theme';

function safeScale(min: number, max: number) {
  const span = max - min;
  if (!Number.isFinite(span) || span === 0) {
    return (_: number) => 0.5;
  }
  return (v: number) => (v - min) / span;
}

// ─── LineChart ────────────────────────────────────────────────────────────

export function LineChart({
  series,
  height = 160,
  color,
  showArea,
  yLabel,
}: {
  series: Array<{ x: string; y: number }>;
  height?: number;
  color?: string;
  showArea?: boolean;
  yLabel?: string;
}) {
  const W = 600;
  const H = height;
  const padL = 42;   // left gutter for Y-axis labels
  const padR = 12;
  const padT = 14;
  const padB = 22;
  const stroke = color ?? C.accent;

  if (series.length === 0) {
    return (
      <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ font: `400 11px ${FONT}`, color: C.inkGhost }}>No data</span>
      </div>
    );
  }

  const values = series.map((s) => s.y);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const scaleY = safeScale(min, max);
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const n = series.length;

  const xAt = (i: number) => (n === 1 ? padL + innerW / 2 : padL + (i / (n - 1)) * innerW);
  const yAt = (v: number) => padT + innerH - scaleY(v) * innerH;

  const points = series.map((s, i) => `${xAt(i)},${yAt(s.y)}`).join(' ');
  const areaPoints = `${padL},${padT + innerH} ${points} ${padL + innerW},${padT + innerH}`;

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ y: padT + innerH * (1 - f), v: min + f * (max - min) }));

  const midIdx = Math.floor((n - 1) / 2);

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
        {/* Y-axis grid lines + labels */}
        {gridLines.map((gl, i) => (
          <g key={i}>
            <line x1={padL} x2={padL + innerW} y1={gl.y} y2={gl.y} stroke={C.borderSoft} strokeWidth={1} />
            <text x={padL - 5} y={gl.y + 3} textAnchor="end" style={{ font: `500 9px ${MONO}`, fill: C.inkGhost }}>
              {gl.v.toFixed(0)}{yLabel ? ` ${yLabel}` : ''}
            </text>
          </g>
        ))}

        {showArea && <polygon points={areaPoints} fill={stroke} opacity={0.1} stroke="none" />}

        {n === 1 ? (
          <circle cx={xAt(0)} cy={yAt(series[0].y)} r={3} fill={stroke} />
        ) : (
          <polyline points={points} fill="none" stroke={stroke} strokeWidth={1.5} />
        )}

        {/* X-axis labels */}
        <text x={xAt(0)} y={H - 4} textAnchor="start" style={{ font: `400 9px ${MONO}`, fill: C.inkGhost }}>
          {series[0]?.x}
        </text>
        {n > 2 && (
          <text x={xAt(midIdx)} y={H - 4} textAnchor="middle" style={{ font: `400 9px ${MONO}`, fill: C.inkGhost }}>
            {series[midIdx]?.x}
          </text>
        )}
        <text x={xAt(n - 1)} y={H - 4} textAnchor="end" style={{ font: `400 9px ${MONO}`, fill: C.inkGhost }}>
          {series[n - 1]?.x}
        </text>
      </svg>
    </div>
  );
}

// ─── MultiLineChart ───────────────────────────────────────────────────────

export function MultiLineChart({
  series,
  height = 180,
}: {
  series: Array<{ name: string; color: string; points: Array<{ x: string; y: number }> }>;
  height?: number;
}) {
  const W = 600;
  const H = height;
  const padL = 42;
  const padR = 12;
  const padT = 14;
  const padB = 22;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const nonEmpty = series.filter((s) => s.points.length > 0);

  if (nonEmpty.length === 0) {
    return (
      <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ font: `400 11px ${FONT}`, color: C.inkGhost }}>No data</span>
      </div>
    );
  }

  const allValues = nonEmpty.flatMap((s) => s.points.map((p) => p.y));
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const scaleY = safeScale(min, max);

  const maxN = Math.max(...nonEmpty.map((s) => s.points.length));
  const xAt = (i: number) => (maxN === 1 ? padL + innerW / 2 : padL + (i / (maxN - 1)) * innerW);
  const yAt = (v: number) => padT + innerH - scaleY(v) * innerH;

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ y: padT + innerH * (1 - f), v: min + f * (max - min) }));

  const xLabelsSource = nonEmpty.reduce((a, b) => (b.points.length > a.points.length ? b : a));
  const n = xLabelsSource.points.length;
  const midIdx = Math.floor((n - 1) / 2);

  return (
    <div>
      {/* Legend */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 8, flexWrap: 'wrap' }}>
        {series.map((s) => (
          <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 10, height: 2, background: s.color, display: 'inline-block' }} />
            <span style={{ font: `500 10px ${FONT}`, color: C.inkSoft }}>{s.name}</span>
          </div>
        ))}
      </div>
      <div style={{ width: '100%', overflowX: 'auto' }}>
        <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
          {gridLines.map((gl, i) => (
            <g key={i}>
              <line x1={padL} x2={padL + innerW} y1={gl.y} y2={gl.y} stroke={C.borderSoft} strokeWidth={1} />
              <text x={padL - 5} y={gl.y + 3} textAnchor="end" style={{ font: `500 9px ${MONO}`, fill: C.inkGhost }}>
                {gl.v.toFixed(0)}
              </text>
            </g>
          ))}
          {nonEmpty.map((s) => {
            if (s.points.length === 1) {
              return <circle key={s.name} cx={xAt(0)} cy={yAt(s.points[0].y)} r={3} fill={s.color} />;
            }
            const pts = s.points.map((p, i) => `${xAt(i)},${yAt(p.y)}`).join(' ');
            return <polyline key={s.name} points={pts} fill="none" stroke={s.color} strokeWidth={1.5} />;
          })}
          {/* X-axis labels */}
          <text x={xAt(0)} y={H - 4} textAnchor="start" style={{ font: `400 9px ${MONO}`, fill: C.inkGhost }}>
            {xLabelsSource.points[0]?.x}
          </text>
          {n > 2 && (
            <text x={xAt(midIdx)} y={H - 4} textAnchor="middle" style={{ font: `400 9px ${MONO}`, fill: C.inkGhost }}>
              {xLabelsSource.points[midIdx]?.x}
            </text>
          )}
          <text x={xAt(n - 1)} y={H - 4} textAnchor="end" style={{ font: `400 9px ${MONO}`, fill: C.inkGhost }}>
            {xLabelsSource.points[n - 1]?.x}
          </text>
        </svg>
      </div>
    </div>
  );
}

// ─── BarChart ─────────────────────────────────────────────────────────────

export function BarChart({
  data,
  height,
  horizontal,
  valueFormat,
}: {
  data: Array<{ label: string; value: number; color?: string }>;
  height?: number;
  horizontal?: boolean;
  valueFormat?: (v: number) => string;
}) {
  const fmt = valueFormat ?? ((v: number) => v.toLocaleString('en-IN'));

  if (data.length === 0) {
    return <Empty2 />;
  }

  const max = Math.max(...data.map((d) => Math.abs(d.value)), 0);
  const scale = max === 0 ? () => 0 : (v: number) => Math.abs(v) / max;

  if (horizontal) {
    const rowH = 28;
    return (
      <div style={{ display: 'grid', gap: 6 }}>
        {data.map((d, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, height: rowH }}>
            <div
              style={{
                width: 130,
                flex: '0 0 130px',
                font: `500 11px ${FONT}`,
                color: C.inkMuted,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={d.label}
            >
              {d.label}
            </div>
            <div style={{ flex: 1, background: C.borderSoft, height: 10, position: 'relative', borderRadius: 2 }}>
              <div
                style={{
                  width: `${scale(d.value) * 100}%`,
                  height: '100%',
                  background: d.color ?? C.accent,
                  borderRadius: 2,
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
            <div style={{ width: 72, flex: '0 0 72px', textAlign: 'right', font: `500 11px ${MONO}`, color: C.ink }}>
              {fmt(d.value)}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Vertical bar chart
  const W = Math.max(data.length * 56, 240);
  const H = height ?? 180;
  const padL = 44;
  const padR = 12;
  const padB = 36;
  const padT = 20;
  const innerW = W - padL - padR;
  const innerH = H - padB - padT;
  const barW = Math.min(32, (innerW / data.length) * 0.55);

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ y: padT + innerH * (1 - f), v: max * f }));

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
        {/* Y grid + labels */}
        {gridLines.map((gl, i) => (
          <g key={i}>
            <line x1={padL} x2={padL + innerW} y1={gl.y} y2={gl.y} stroke={C.borderSoft} strokeWidth={1} />
            <text x={padL - 5} y={gl.y + 3} textAnchor="end" style={{ font: `500 9px ${MONO}`, fill: C.inkGhost }}>
              {fmt(gl.v)}
            </text>
          </g>
        ))}
        {/* Bars */}
        {data.map((d, i) => {
          const cx = padL + (i + 0.5) * (innerW / data.length);
          const h = scale(d.value) * innerH;
          const y = padT + innerH - h;
          return (
            <g key={i}>
              <rect x={cx - barW / 2} y={y} width={barW} height={Math.max(h, 1)} fill={d.color ?? C.accent} rx={2} />
              {h > 12 && (
                <text x={cx} y={y - 5} textAnchor="middle" style={{ font: `500 10px ${MONO}`, fill: C.ink }}>
                  {fmt(d.value)}
                </text>
              )}
              <text
                x={cx}
                y={H - 8}
                textAnchor="middle"
                style={{ font: `400 9px ${FONT}`, fill: C.inkGhost }}
              >
                {d.label.length > 9 ? `${d.label.slice(0, 8)}…` : d.label}
              </text>
            </g>
          );
        })}
        {/* Y-axis line */}
        <line x1={padL} x2={padL} y1={padT} y2={padT + innerH} stroke={C.border} strokeWidth={1} />
      </svg>
    </div>
  );
}

function Empty2() {
  return (
    <div style={{ padding: '20px 10px', textAlign: 'center', font: `400 11px ${FONT}`, color: C.inkGhost }}>
      No data
    </div>
  );
}

// ─── PieChart ─────────────────────────────────────────────────────────────

export function PieChart({
  data,
  size = 160,
  innerRadiusRatio = 0.55,
}: {
  data: Array<{ label: string; value: number; color: string }>;
  size?: number;
  innerRadiusRatio?: number;
}) {
  const total = data.reduce((a, d) => a + d.value, 0);
  if (data.length === 0 || total <= 0) {
    return <Empty2 />;
  }

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 2;
  const rInner = r * innerRadiusRatio;

  const arc = (startFrac: number, endFrac: number) => {
    const a0 = startFrac * 2 * Math.PI - Math.PI / 2;
    const a1 = endFrac * 2 * Math.PI - Math.PI / 2;
    const large = endFrac - startFrac > 0.5 ? 1 : 0;
    const p = (rad: number, radius: number) => [cx + radius * Math.cos(rad), cy + radius * Math.sin(rad)];
    const [x0, y0] = p(a0, r);
    const [x1, y1] = p(a1, r);
    const [ix1, iy1] = p(a1, rInner);
    const [ix0, iy0] = p(a0, rInner);
    return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} L ${ix1} ${iy1} A ${rInner} ${rInner} 0 ${large} 0 ${ix0} ${iy0} Z`;
  };

  // A single 100%-share slice degenerates the arc math above (start === end
  // after wraparound), so draw it as a plain ring instead.
  if (data.filter((d) => d.value > 0).length === 1) {
    const only = data.find((d) => d.value > 0)!;
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={(r + rInner) / 2} fill="none" stroke={only.color} strokeWidth={r - rInner} />
      </svg>
    );
  }

  let acc = 0;
  const slices = data
    .filter((d) => d.value > 0)
    .map((d) => {
      const start = acc / total;
      acc += d.value;
      const end = acc / total;
      return { ...d, path: arc(start, end) };
    });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {slices.map((s) => (
        <path key={s.label} d={s.path} fill={s.color} stroke={C.surface} strokeWidth={1.5} />
      ))}
    </svg>
  );
}

// ─── ScatterPlot ──────────────────────────────────────────────────────────

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
  const W = 600;
  const H = height;
  const padL = 52;  // room for Y labels
  const padR = 24;
  const padT = 16;
  const padB = yLabel ? 44 : 36;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  if (points.length === 0) {
    return <Empty2 />;
  }

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const scaleX = safeScale(xMin, xMax);
  const scaleY = safeScale(yMin, yMax);

  const xAt = (v: number) => padL + scaleX(v) * innerW;
  const yAt = (v: number) => padT + innerH - scaleY(v) * innerH;

  const yGridLines = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ y: padT + innerH * (1 - f), v: yMin + f * (yMax - yMin) }));

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
        {/* Y axis */}
        <line x1={padL} x2={padL} y1={padT} y2={padT + innerH} stroke={C.border} strokeWidth={1} />
        {/* X axis */}
        <line x1={padL} x2={padL + innerW} y1={padT + innerH} y2={padT + innerH} stroke={C.border} strokeWidth={1} />

        {/* Y grid + labels */}
        {yGridLines.map((gl, i) => (
          <g key={i}>
            <line x1={padL} x2={padL + innerW} y1={gl.y} y2={gl.y} stroke={C.borderSoft} strokeWidth={1} strokeDasharray="3 3" />
            <text x={padL - 5} y={gl.y + 3} textAnchor="end" style={{ font: `500 9px ${MONO}`, fill: C.inkGhost }}>
              {gl.v.toFixed(0)}
            </text>
          </g>
        ))}

        {/* X min/max labels */}
        <text x={padL} y={padT + innerH + 14} style={{ font: `500 10px ${MONO}`, fill: C.inkGhost }}>
          {xMin.toFixed(0)}
        </text>
        <text x={padL + innerW} y={padT + innerH + 14} textAnchor="end" style={{ font: `500 10px ${MONO}`, fill: C.inkGhost }}>
          {xMax.toFixed(0)}
        </text>
        {xLabel && (
          <text x={padL + innerW / 2} y={H - 6} textAnchor="middle" style={{ font: `500 10px ${FONT}`, fill: C.inkSoft }}>
            {xLabel}
          </text>
        )}
        {yLabel && (
          <text
            x={-(padT + innerH / 2)}
            y={14}
            textAnchor="middle"
            transform="rotate(-90)"
            style={{ font: `500 10px ${FONT}`, fill: C.inkSoft }}
          >
            {yLabel}
          </text>
        )}

        {/* Points */}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={xAt(p.x)} cy={yAt(p.y)} r={5} fill={p.color ?? C.accent} />
            <text
              x={xAt(p.x) + 8}
              y={yAt(p.y) + 3}
              style={{ font: `500 10px ${MONO}`, fill: C.inkMuted }}
            >
              {p.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ─── Histogram ────────────────────────────────────────────────────────────

export function Histogram({
  buckets,
  height = 160,
  color,
}: {
  buckets: Array<{ label: string; count: number }>;
  height?: number;
  color?: string;
}) {
  if (buckets.length === 0) {
    return <Empty2 />;
  }

  const W = Math.max(buckets.length * 72, 240);
  const H = height;
  const padL = 40;
  const padR = 12;
  const padB = 32;
  const padT = 20;
  const innerW = W - padL - padR;
  const innerH = H - padB - padT;
  const max = Math.max(...buckets.map((b) => b.count), 0);
  const scale = max === 0 ? () => 0 : (v: number) => v / max;
  const barW = Math.min(40, (innerW / buckets.length) * 0.6);

  const gridLines = [0, 0.5, 1].map((f) => ({ y: padT + innerH * (1 - f), v: Math.round(max * f) }));

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
        {/* Y grid + labels */}
        {gridLines.map((gl, i) => (
          <g key={i}>
            <line x1={padL} x2={padL + innerW} y1={gl.y} y2={gl.y} stroke={C.borderSoft} strokeWidth={1} />
            <text x={padL - 5} y={gl.y + 3} textAnchor="end" style={{ font: `500 9px ${MONO}`, fill: C.inkGhost }}>
              {gl.v}
            </text>
          </g>
        ))}
        {/* Y axis */}
        <line x1={padL} x2={padL} y1={padT} y2={padT + innerH} stroke={C.border} strokeWidth={1} />
        {/* Bars */}
        {buckets.map((b, i) => {
          const cx = padL + (i + 0.5) * (innerW / buckets.length);
          const h = scale(b.count) * innerH;
          const y = padT + innerH - h;
          return (
            <g key={i}>
              <rect x={cx - barW / 2} y={y} width={barW} height={Math.max(h, b.count > 0 ? 1 : 0)} fill={color ?? C.accent} rx={2} />
              <text x={cx} y={y - 5} textAnchor="middle" style={{ font: `500 10px ${MONO}`, fill: C.ink }}>
                {b.count}
              </text>
              <text x={cx} y={H - 8} textAnchor="middle" style={{ font: `400 9px ${FONT}`, fill: C.inkGhost }}>
                {b.label.length > 10 ? `${b.label.slice(0, 9)}…` : b.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Sparkline ────────────────────────────────────────────────────────────

export function Sparkline({
  values,
  width = 80,
  height = 24,
  color,
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  const stroke = color ?? C.accent;
  if (values.length === 0) {
    return <svg width={width} height={height} />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const scaleY = safeScale(min, max);
  const pad = 2;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const n = values.length;
  const xAt = (i: number) => (n === 1 ? width / 2 : pad + (i / (n - 1)) * innerW);
  const yAt = (v: number) => pad + innerH - scaleY(v) * innerH;

  if (n === 1) {
    return (
      <svg width={width} height={height}>
        <circle cx={xAt(0)} cy={yAt(values[0])} r={2} fill={stroke} />
      </svg>
    );
  }

  const points = values.map((v, i) => `${xAt(i)},${yAt(v)}`).join(' ');

  return (
    <svg width={width} height={height}>
      <polyline points={points} fill="none" stroke={stroke} strokeWidth={1.25} />
    </svg>
  );
}
