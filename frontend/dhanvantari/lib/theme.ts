/**
 * MedTrack Terminal — design tokens.
 *
 * Lifted from the approved handoff ("Vayu Terminal" / "Dhanvantari Terminal").
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

  // Accent + semantics
  accent: '#0E7490',
  accentTint: '#E3F0F4',
  amber: '#B45309',
  amberTint: '#FDF3E2',
  red: '#B42318',
  redTint: '#FBEAE8',
  green: '#186A3B',
  greenTint: '#E8F1EB',
  greenDark: '#0F4C29',
  blue: '#175CD3',
  blueTint: '#E7F0F9',
  grey: '#5F5A53',
  greyTint: '#F0EFEB',
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
  navH: 48,
  subTabH: 48,
  gutter: 26,
  radius: 4,
} as const;

/** Tabular figures so columns line up — the handoff sets this on every number. */
export const FIGURE = {
  fontVariantNumeric: 'tabular-nums' as const,
  letterSpacing: '-.02em',
};

export function statusColors(status: string): { color: string; tint: string } {
  switch (status) {
    case 'APPROVED':
    case 'DELIVERED':
    case 'QC_APPROVED':
    case 'PASS':
    case 'RESOLVED':
    case 'ACCEPTED':
      return { color: C.green, tint: C.greenTint };
    case 'PENDING':
    case 'PENDING_SYNC':
    case 'DISPATCHED':
    case 'IN_TRANSIT':
    case 'OUT_FOR_DELIVERY':
    case 'MANUFACTURED':
    case 'INVESTIGATING':
      return { color: C.accent, tint: C.accentTint };
    case 'PARTIAL':
    case 'WAREHOUSED':
    case 'MAJOR':
    case 'OPEN':
      return { color: C.amber, tint: C.amberTint };
    case 'LOW':
      return { color: C.amber, tint: C.amberTint };
    case 'REJECTED':
    case 'EXCEPTION':
    case 'QC_FAILED':
    case 'FAIL':
    case 'CRITICAL':
      return { color: C.red, tint: C.redTint };
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

