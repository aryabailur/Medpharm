/**
 * Inline-SVG chart primitives for the Vayu terminal.
 *
 * No chart library — Recharts is installed but its SSR/hydration cost and
 * default visual language don't match the operations-terminal read. Every
 * primitive here guards empty data, a single point, and all-equal values so a
 * zero denominator never reaches an SVG coordinate as NaN.
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
  const padL = 8;
  const padR = 8;
  const padT = 10;
  const padB = 18;
  const stroke = color ?? C.accent;

  if (series.length === 0) {
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <text x={W / 2} y={H / 2} textAnchor="middle" style={{ font: `400 11px ${FONT}`, fill: C.inkGhost }}>
          No data
        </text>
      </svg>
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

  const gridLines = [0.25, 0.5, 0.75].map((f) => padT + innerH * f);

  const midIdx = Math.floor((n - 1) / 2);

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
        {gridLines.map((gy, i) => (
          <line key={i} x1={padL} x2={padL + innerW} y1={gy} y2={gy} stroke={C.borderSoft} strokeWidth={1} />
        ))}

        {showArea && <polygon points={areaPoints} fill={stroke} opacity={0.1} stroke="none" />}

        {n === 1 ? (
          <circle cx={xAt(0)} cy={yAt(series[0].y)} r={3} fill={stroke} />
        ) : (
          <polyline points={points} fill="none" stroke={stroke} strokeWidth={1.5} />
        )}

        <text x={padL} y={padT - 2} style={{ font: `500 10px ${MONO}`, fill: C.inkGhost }}>
          {max.toFixed(1)}
          {yLabel ? ` ${yLabel}` : ''}
        </text>
        <text x={padL} y={padT + innerH + 9} style={{ font: `500 10px ${MONO}`, fill: C.inkGhost }}>
          {min.toFixed(1)}
          {yLabel ? ` ${yLabel}` : ''}
        </text>

        <text x={padL} y={H - 2} textAnchor="start" style={{ font: `400 9px ${MONO}`, fill: C.inkGhost }}>
          {series[0]?.x}
        </text>
        {n > 2 && (
          <text x={xAt(midIdx)} y={H - 2} textAnchor="middle" style={{ font: `400 9px ${MONO}`, fill: C.inkGhost }}>
            {series[midIdx]?.x}
          </text>
        )}
        <text x={padL + innerW} y={H - 2} textAnchor="end" style={{ font: `400 9px ${MONO}`, fill: C.inkGhost }}>
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
  const padL = 8;
  const padR = 8;
  const padT = 10;
  const padB = 18;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const nonEmpty = series.filter((s) => s.points.length > 0);

  if (nonEmpty.length === 0) {
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <text x={W / 2} y={H / 2} textAnchor="middle" style={{ font: `400 11px ${FONT}`, fill: C.inkGhost }}>
          No data
        </text>
      </svg>
    );
  }

  const allValues = nonEmpty.flatMap((s) => s.points.map((p) => p.y));
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const scaleY = safeScale(min, max);

  const maxN = Math.max(...nonEmpty.map((s) => s.points.length));
  const xAt = (i: number) => (maxN === 1 ? padL + innerW / 2 : padL + (i / (maxN - 1)) * innerW);
  const yAt = (v: number) => padT + innerH - scaleY(v) * innerH;

  const gridLines = [0.25, 0.5, 0.75].map((f) => padT + innerH * f);

  const xLabelsSource = nonEmpty.reduce((a, b) => (b.points.length > a.points.length ? b : a));
  const n = xLabelsSource.points.length;
  const midIdx = Math.floor((n - 1) / 2);

  return (
    <div>
      <div style={{ display: 'flex', gap: 14, marginBottom: 6, flexWrap: 'wrap' }}>
        {series.map((s) => (
          <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 8, height: 8, background: s.color, display: 'inline-block' }} />
            <span style={{ font: `500 10px ${FONT}`, color: C.inkSoft }}>{s.name}</span>
          </div>
        ))}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
          {gridLines.map((gy, i) => (
            <line key={i} x1={padL} x2={padL + innerW} y1={gy} y2={gy} stroke={C.borderSoft} strokeWidth={1} />
          ))}
          {nonEmpty.map((s) => {
            if (s.points.length === 1) {
              return <circle key={s.name} cx={xAt(0)} cy={yAt(s.points[0].y)} r={3} fill={s.color} />;
            }
            const pts = s.points.map((p, i) => `${xAt(i)},${yAt(p.y)}`).join(' ');
            return <polyline key={s.name} points={pts} fill="none" stroke={s.color} strokeWidth={1.5} />;
          })}
          <text x={padL} y={padT - 2} style={{ font: `500 10px ${MONO}`, fill: C.inkGhost }}>
            {max.toFixed(1)}
          </text>
          <text x={padL} y={padT + innerH + 9} style={{ font: `500 10px ${MONO}`, fill: C.inkGhost }}>
            {min.toFixed(1)}
          </text>
          <text x={padL} y={H - 2} textAnchor="start" style={{ font: `400 9px ${MONO}`, fill: C.inkGhost }}>
            {xLabelsSource.points[0]?.x}
          </text>
          {n > 2 && (
            <text x={xAt(midIdx)} y={H - 2} textAnchor="middle" style={{ font: `400 9px ${MONO}`, fill: C.inkGhost }}>
              {xLabelsSource.points[midIdx]?.x}
            </text>
          )}
          <text x={padL + innerW} y={H - 2} textAnchor="end" style={{ font: `400 9px ${MONO}`, fill: C.inkGhost }}>
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
    const rowH = 26;
    const H = height ?? data.length * rowH + 8;
    return (
      <div style={{ display: 'grid', gap: 4 }}>
        {data.map((d, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, height: rowH }}>
            <div
              style={{
                width: 110,
                flex: '0 0 110px',
                font: `500 11px ${FONT}`,
                color: C.inkMuted,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {d.label}
            </div>
            <div style={{ flex: 1, background: C.borderSoft, height: 12, position: 'relative' }}>
              <div
                style={{
                  width: `${scale(d.value) * 100}%`,
                  height: '100%',
                  background: d.color ?? C.accent,
                }}
              />
            </div>
            <div style={{ width: 70, flex: '0 0 70px', textAlign: 'right', font: `500 11px ${MONO}`, color: C.ink }}>
              {fmt(d.value)}
            </div>
          </div>
        ))}
      </div>
    );
  }

  const W = Math.max(data.length * 46, 200);
  const H = height ?? 160;
  const padB = 30;
  const padT = 16;
  const innerH = H - padB - padT;
  const barW = Math.min(28, (W / data.length) * 0.6);

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
        {data.map((d, i) => {
          const cx = (i + 0.5) * (W / data.length);
          const h = scale(d.value) * innerH;
          const y = padT + innerH - h;
          return (
            <g key={i}>
              <rect x={cx - barW / 2} y={y} width={barW} height={Math.max(h, 1)} fill={d.color ?? C.accent} />
              <text x={cx} y={y - 4} textAnchor="middle" style={{ font: `500 10px ${MONO}`, fill: C.ink }}>
                {fmt(d.value)}
              </text>
              <text
                x={cx}
                y={H - 8}
                textAnchor="middle"
                style={{ font: `400 9px ${FONT}`, fill: C.inkGhost }}
              >
                {d.label.length > 8 ? `${d.label.slice(0, 7)}…` : d.label}
              </text>
            </g>
          );
        })}
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
  const padL = 44;
  const padR = 24;
  const padT = 16;
  const padB = 36;
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

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
        <line x1={padL} x2={padL} y1={padT} y2={padT + innerH} stroke={C.border} strokeWidth={1} />
        <line x1={padL} x2={padL + innerW} y1={padT + innerH} y2={padT + innerH} stroke={C.border} strokeWidth={1} />

        <text x={padL} y={padT + innerH + 16} style={{ font: `500 10px ${MONO}`, fill: C.inkGhost }}>
          {xMin.toFixed(0)}
        </text>
        <text x={padL + innerW} y={padT + innerH + 16} textAnchor="end" style={{ font: `500 10px ${MONO}`, fill: C.inkGhost }}>
          {xMax.toFixed(0)}
        </text>
        {xLabel && (
          <text x={padL + innerW / 2} y={H - 4} textAnchor="middle" style={{ font: `500 10px ${FONT}`, fill: C.inkSoft }}>
            {xLabel}
          </text>
        )}
        {yLabel && (
          <text
            x={-(padT + innerH / 2)}
            y={12}
            textAnchor="middle"
            transform="rotate(-90)"
            style={{ font: `500 10px ${FONT}`, fill: C.inkSoft }}
          >
            {yLabel}
          </text>
        )}

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

  const W = Math.max(buckets.length * 60, 200);
  const H = height;
  const padB = 30;
  const padT = 16;
  const innerH = H - padB - padT;
  const max = Math.max(...buckets.map((b) => b.count), 0);
  const scale = max === 0 ? () => 0 : (v: number) => v / max;
  const barW = Math.min(36, (W / buckets.length) * 0.6);

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
        {buckets.map((b, i) => {
          const cx = (i + 0.5) * (W / buckets.length);
          const h = scale(b.count) * innerH;
          const y = padT + innerH - h;
          return (
            <g key={i}>
              <rect x={cx - barW / 2} y={y} width={barW} height={Math.max(h, b.count > 0 ? 1 : 0)} fill={color ?? C.accent} />
              <text x={cx} y={y - 4} textAnchor="middle" style={{ font: `500 10px ${MONO}`, fill: C.ink }}>
                {b.count}
              </text>
              <text x={cx} y={H - 8} textAnchor="middle" style={{ font: `400 9px ${FONT}`, fill: C.inkGhost }}>
                {b.label}
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
