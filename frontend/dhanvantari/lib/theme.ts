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
