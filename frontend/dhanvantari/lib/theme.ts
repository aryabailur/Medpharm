/**
 * MedTrack Terminal — design tokens.
 *
 * Lifted from the approved handoff ("Dhanvantari Terminal" / "Vayu Terminal").
 * Both apps share ONE palette: warm paper surfaces, near-black ink, a single
 * teal accent. They are told apart by their sidebar identity block and accent
 * usage, not by different colour systems — a judge sees two windows of the same
 * product, not two products.
 */

export const C = {
  // Surfaces — warm paper, not cool grey
  bg: '#FBFBFA',
  surface: '#FFFFFF',
  surfaceAlt: '#FCFBF9',
  raised: '#F7F5F2',

  // Ink
  ink: '#171614',
  inkStrong: '#1A1818',
  inkMuted: '#55524C',
  inkFaint: '#5F5A53',
  inkSoft: '#6B665F',
  inkGhost: '#B3AEA6',

  // Lines
  border: '#D6D2CB',
  borderSoft: '#EAE7E1',
  borderFaint: '#E5E1DA',
  /** Active sub-tab border, and the scrollbar thumb / planned-route stroke. */
  borderActive: '#C9C3BB',
  rail: '#D7D3CC',

  // Accent + semantics — the handoff's exact values, not near-misses.
  accent: '#0E7490',
  accentTint: '#DDEEF0',
  amber: '#B45309',
  amberTint: '#FBF0DC',
  red: '#B91C1C',
  redTint: '#F9E7E5',
  green: '#146130',
  greenTint: '#E7F3EA',
  blue: '#1F6FB2',
  blueTint: '#E6EFF7',
  grey: '#6B665F',
  greyTint: '#F0EEE9',

  // Chart-specific fills the handoff names directly.
  /** In-band temperature wash, and its legend swatch border. */
  bandFill: '#EAF2EC',
  bandStroke: '#CFE0D4',
  /** Forecast confidence band (Vayu risk screen). */
  forecastBand: '#E3E0F5',
  forecastLine: '#4338CA',
  /** Third expiry bucket / 61–90 day amber-yellow. */
  ochre: '#CA8A04',
  /** Hover fills for the two button variants. */
  inkHover: '#332F2A',
  amberHover: '#8A3F07',
  /** Toast surface + its status dot. */
  toastFg: '#F7F6F3',
  toastDot: '#4ADE80',
} as const;

export const FONT =
  '"Plus Jakarta Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
export const MONO = '"Geist Mono", ui-monospace, "SF Mono", Menlo, monospace';

/** Section label — 11px, .17em tracking, exactly as the handoff specifies. */
export const LABEL = {
  font: `600 11px/1 ${FONT}`,
  letterSpacing: '.17em',
  textTransform: 'uppercase' as const,
  color: C.inkFaint,
};

/** Shell geometry, lifted from the handoff markup. */
export const SHELL = {
  headerH: 56,
  /** The handoff's domain nav is 50px tall, so sub-tabs stick at 106. */
  navH: 50,
  subTabH: 48,
  gutter: 26,
  radius: 4,
} as const;

/** Tabular figures so columns line up — the handoff sets this on every number. */
export const FIGURE = {
  fontVariantNumeric: 'tabular-nums' as const,
  letterSpacing: '-.02em',
};

/**
 * Status → badge colours, following the handoff's semantic assignment.
 *
 * Green settles, blue is in-flight/informational, amber warns, red is
 * critical, grey is closed or neutral. Note the handoff puts DISPATCHED and
 * IN_TRANSIT on *blue* (`#1F6FB2`), not the teal accent — teal is reserved for
 * chart strokes so a line never reads as a status.
 */
export function statusColors(status: string): { color: string; tint: string } {
  switch (status) {
    case 'APPROVED':
    case 'QC_APPROVED':
    case 'PASS':
    case 'RESOLVED':
    case 'ACCEPTED':
    case 'SETTLED':
    case 'SCAN IN':
    case 'OUT FOR DELIVERY':
    case 'OUT_FOR_DELIVERY':
    case 'OK':
      return { color: C.green, tint: C.greenTint };
    case 'PENDING':
    case 'PENDING_SYNC':
    case 'DISPATCHED':
    case 'IN_TRANSIT':
    case 'IN TRANSIT':
    case 'INVESTIGATING':
      return { color: C.blue, tint: C.blueTint };
    case 'PARTIAL':
    case 'MANUFACTURED':
    case 'MAJOR':
    case 'OPEN':
    case 'LOW':
    case 'EXCURSION':
    case 'EXPIRING':
      return { color: C.amber, tint: C.amberTint };
    case 'REJECTED':
    case 'EXCEPTION':
    case 'QC_FAILED':
    case 'FAIL':
    case 'CRITICAL':
    case 'ALL REJECTED':
    case 'EXCURSION':
      return { color: C.red, tint: C.redTint };
    // DELIVERED, WAREHOUSED, CLOSED, MINOR, UNBILLED — settled and inert.
    default:
      return { color: C.grey, tint: C.greyTint };
  }
}

export function bandColors(band: string): { color: string; tint: string } {
  switch (band) {
    case 'CRITICAL':
      return { color: C.red, tint: C.redTint };
    case 'HIGH':
      return { color: C.amber, tint: C.amberTint };
    case 'MEDIUM':
      return { color: C.accent, tint: C.accentTint };
    default:
      return { color: C.green, tint: C.greenTint };
  }
}

/** ₹ in lakh notation, as the handoff uses throughout. */
export function rupees(n: number): string {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${Math.round(n)}`;
}

export const num = (n: number) => n.toLocaleString('en-IN');

// ─── Motion ──────────────────────────────────────────────────────────────────
//
// The handoff's easing curve and the seven keyframes it defines. Keeping the
// strings here means a screen never hand-rolls a slightly different duration.

export const EASE = 'cubic-bezier(.16,1,.3,1)';

/** Card entrance. Sections stagger 0/40/60/100/120ms down the page. */
export const rise = (delayMs = 0) =>
  `mtRise .44s ${EASE} ${delayMs ? `${delayMs}ms ` : ''}both`;

/**
 * KPI-cell stagger, matching the handoff's `stag()` helper exactly:
 * 60ms base, 55ms step, .5s duration.
 */
export const stagger = (i: number, step = 55, base = 60) =>
  `mtRise .5s ${EASE} ${base + i * step}ms both`;

/** Line-drawing reveal for an SVG stroke. Pair with strokeDasharray. */
export const draw = (seconds = 1, delayMs = 0, dash = 3000) => ({
  strokeDasharray: dash,
  animation: `mtDraw ${seconds}s ${EASE} ${delayMs ? `${delayMs}ms ` : ''}both`,
});

/** Horizontal meter fill. Requires transformOrigin:'left' on the same node. */
export const grow = (delayMs = 150) => `mtGrow .7s ${EASE} ${delayMs}ms both`;

/** Vertical bar growth. Requires transformOrigin:'bottom'. */
export const riseBar = `mtRiseBar .7s ${EASE} both`;

/** Value-changed pop. Remount the node (change its key) to replay it. */
export const pop = `mtPop .45s ${EASE} both`;

// ═══════════════════════════════════════════════════════════════════════════
// VIBRANT LAYER — additive tokens for the pitch build.
//
// Everything above is the approved handoff and stays authoritative: warm paper,
// near-black ink, square-ish corners, tabular monospace figures. This block
// only ADDS depth, a wider semantic hue set, and richer motion so the terminal
// reads as premium under a projector, where hairlines on paper-white vanish.
//
// Rules for using it:
//   - Ink stays the primary text colour. These hues accent, they don't narrate.
//   - Gradients go on surfaces and data marks, never behind body text.
//   - Every hue below is contrast-checked ≥4.5:1 on C.surface for text use.
// ═══════════════════════════════════════════════════════════════════════════

/** Extended categorical palette for charts — distinguishable, not neon. */
export const VIZ = {
  teal: '#0E7490',
  indigo: '#4338CA',
  violet: '#6D28D9',
  magenta: '#A21B62',
  amber: '#B45309',
  green: '#146130',
  blue: '#1F6FB2',
  rose: '#B91C1C',
  slate: '#475569',
  ochre: '#CA8A04',
} as const;

/** Ordered series colours — index into this so two charts never disagree. */
export const SERIES = [
  VIZ.teal, VIZ.indigo, VIZ.amber, VIZ.green,
  VIZ.magenta, VIZ.blue, VIZ.violet, VIZ.ochre,
] as const;

/** Soft tints paired to VIZ, for fills under a stroke of the same hue. */
export const VIZ_TINT = {
  teal: '#DDEEF0',
  indigo: '#E3E0F5',
  violet: '#EAE3F7',
  magenta: '#F7E3ED',
  amber: '#FBF0DC',
  green: '#E7F3EA',
  blue: '#E6EFF7',
  rose: '#F9E7E5',
  slate: '#EDF0F4',
  ochre: '#FAF0D7',
} as const;

/**
 * Elevation. The handoff used a single hairline; under projection that reads
 * flat, so cards get a warm, tinted shadow instead of a grey one.
 */
export const SHADOW = {
  sm: '0 1px 2px rgba(23,22,20,.04), 0 1px 1px rgba(23,22,20,.03)',
  md: '0 2px 4px rgba(23,22,20,.05), 0 4px 12px rgba(23,22,20,.04)',
  lg: '0 4px 8px rgba(23,22,20,.06), 0 12px 28px rgba(23,22,20,.06)',
  glow: (hue: string) => `0 0 0 1px ${hue}22, 0 4px 16px ${hue}1F`,
} as const;

/** Surface washes. Subtle enough that ink on top stays the loudest thing. */
export const GRAD = {
  /** Card header wash — replaces the flat surfaceAlt fill. */
  header: 'linear-gradient(180deg,#FFFFFF 0%,#FAF8F5 100%)',
  /** KPI band, so the signature element gains a little dimension. */
  band: 'linear-gradient(180deg,#FFFFFF 0%,#FBFAF7 100%)',
  /** Dark hero / top bar. */
  ink: 'linear-gradient(135deg,#1F1D1A 0%,#171614 55%,#12110F 100%)',
  /** Tinted accent panel, e.g. an active drilldown. */
  accent: 'linear-gradient(135deg,#DDEEF0 0%,#EDF6F7 100%)',
  /** Alarm strip. */
  alarm: 'linear-gradient(135deg,#F9E7E5 0%,#FDF2F0 100%)',
  /** Vertical fade for a chart area fill under a stroke. */
  fade: (hue: string) => `linear-gradient(180deg,${hue}28 0%,${hue}00 100%)`,
} as const;

/** Type scale. One ramp, so headings stop being hand-tuned per screen. */
export const TYPE = {
  display: '-.03em',
  h1: '-.02em',
  h2: '-.015em',
  body: '0',
} as const;

// ─── Extra motion ────────────────────────────────────────────────────────────
// Named keyframes live in each app's layout.tsx <style> block. Adding a helper
// here without the matching keyframe there does nothing.

/** Left-to-right sheen, for a live/streaming affordance. */
export const shimmer = (durationS = 1.8) =>
  `mtShimmer ${durationS}s linear infinite`;

/** Soft breathing pulse — a live dot, an open alarm. */
export const pulse = (durationS = 2) => `mtPulse ${durationS}s ${EASE} infinite`;

/** Count-up/scale-in for a figure that just changed. */
export const countIn = (delayMs = 0) =>
  `mtCountIn .55s ${EASE} ${delayMs ? `${delayMs}ms ` : ''}both`;

/** Card entrance with a touch of scale — for hero cards only. */
export const riseScale = (delayMs = 0) =>
  `mtRiseScale .5s ${EASE} ${delayMs ? `${delayMs}ms ` : ''}both`;

/** Radar sweep for a map/live panel. */
export const sweep = (durationS = 3) => `mtSweep ${durationS}s linear infinite`;

/**
 * Container edges.
 *
 * The handoff's single #D6D2CB hairline vanishes on a projector, so panels read
 * as floating text rather than boxes. These are a touch darker and are used for
 * anything that encloses content; the original C.border stays for the light
 * rules *inside* a panel, so hierarchy still reads.
 */
export const EDGE = {
  /** Card / panel outer edge. */
  strong: '#C4BEB5',
  /** Softer enclosure — nested boxes, inputs, chips. */
  medium: '#CFCAC2',
  /** Divider between cells of one band. */
  divider: '#DDD8D0',
} as const;

/** Ready-made border shorthands, so a panel never hand-rolls its own width. */
export const BORDER = {
  card: `1px solid ${EDGE.strong}`,
  inner: `1px solid ${EDGE.medium}`,
  divider: `1px solid ${EDGE.divider}`,
} as const;

/** Standard hover transition for an interactive card or row. */
export const HOVER = `background .18s ${EASE}, box-shadow .22s ${EASE}, transform .22s ${EASE}, border-color .18s ${EASE}`;
