/**
 * Dhanvantari design tokens — lifted verbatim from the approved mockup.
 *
 * Deliberately distinct from Vayu: a LIGHT sidebar with a green accent, versus
 * Vayu's dark steel-blue rail. On stage the two windows sit side by side
 * (§11, 0:00), so they must be instantly tellable apart.
 */

export const C = {
  green: '#186A3B',
  greenTint: '#E8F1EB',
  greenDark: '#0F4C29',
  amber: '#B45309',
  amberTint: '#FDF3E2',
  red: '#B42318',
  redTint: '#FBEAE8',
  blue: '#175CD3',
  blueTint: '#E7F0F9',
  grey: '#5D5B52',
  greyTint: '#F0EFEB',

  // Surfaces — warmer than Vayu's cool greys
  bg: '#F6F5F2',
  bgAlt: '#F9F8F5',
  surface: '#FFFFFF',
  border: '#E5E4E0',
  borderSoft: '#EFEEEA',
  ink: '#1E1D1A',
  inkMuted: '#4A4842',
  inkFaint: '#77746B',
  inkGhost: '#9A968C',

  // Sidebar (light)
  navBg: '#FFFFFF',
  navBorder: '#E5E4E0',
  navActive: '#E8F1EB',
  navText: '#5D5B52',
  navTextActive: '#0F4C29',
  navLabel: '#9A968C',
  navDot: '#D6D4CE',
  navDotActive: '#186A3B',
} as const;

export const FONT =
  'Geist, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
export const MONO = '"Geist Mono", ui-monospace, "SF Mono", Menlo, monospace';

/** Status → {color, tint}. Covers order, shipment, complaint and QC states. */
export function statusColors(status: string): { color: string; tint: string } {
  switch (status) {
    case 'APPROVED':
    case 'DELIVERED':
    case 'RESOLVED':
    case 'PASS':
    case 'ACCEPTED':
      return { color: C.green, tint: C.greenTint };
    case 'PENDING':
    case 'PENDING_SYNC':
    case 'DISPATCHED':
    case 'IN_TRANSIT':
    case 'OUT_FOR_DELIVERY':
    case 'INVESTIGATING':
      return { color: C.blue, tint: C.blueTint };
    case 'PARTIAL':
    case 'OPEN':
    case 'MAJOR':
    case 'LOW':
      return { color: C.amber, tint: C.amberTint };
    case 'REJECTED':
    case 'EXCEPTION':
    case 'CRITICAL':
    case 'FAIL':
      return { color: C.red, tint: C.redTint };
    default:
      return { color: C.grey, tint: C.greyTint };
  }
}

/** Risk band → colour pair. */
export function bandColors(band: string): { color: string; tint: string } {
  switch (band) {
    case 'CRITICAL':
      return { color: C.red, tint: C.redTint };
    case 'HIGH':
      return { color: C.amber, tint: C.amberTint };
    case 'MEDIUM':
      return { color: C.blue, tint: C.blueTint };
    default:
      return { color: C.green, tint: C.greenTint };
  }
}

/** ₹ formatting — the mockup uses lakh notation throughout. */
export function rupees(n: number): string {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n.toFixed(0)}`;
}
