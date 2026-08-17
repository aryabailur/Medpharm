/**
 * Vayu design tokens — lifted verbatim from the approved dashboard mockup.
 *
 * Semantic pairs: a strong colour for text/marks, a tint for its background.
 * Keep these in sync with the mockup; do not invent new hues per component.
 */

export const C = {
  steel: '#1D4E6F',
  steelTint: '#E6EEF3',
  amber: '#B45309',
  amberTint: '#FDF3E2',
  red: '#B42318',
  redTint: '#FBEAE8',
  blue: '#175CD3',
  blueTint: '#E7F0F9',
  green: '#186A3B',
  greenTint: '#E8F1EB',
  grey: '#5A646B',
  greyTint: '#EFF1F2',

  // Surfaces and text
  bg: '#F3F4F5',
  surface: '#FFFFFF',
  border: '#E1E4E7',
  borderSoft: '#EDEFF1',
  ink: '#1E2225',
  inkMuted: '#4A555C',
  inkFaint: '#77828A',
  inkGhost: '#9AA4AB',

  // Sidebar (dark)
  navBg: '#12252F',
  navBorder: '#1D3541',
  navActive: '#1D3541',
  navText: '#A8BEC8',
  navTextActive: '#F2F6F8',
  navLabel: '#5C7784',
  navDot: '#3A5563',
  navDotActive: '#4FA3C4',
  navSub: '#7E98A4',
  navKicker: '#6C8896',
} as const;

export const FONT =
  'Geist, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
export const MONO = '"Geist Mono", ui-monospace, "SF Mono", Menlo, monospace';

/** Status → {color, tint}. Covers order, shipment, batch, complaint states. */
export function statusColors(status: string): { color: string; tint: string } {
  switch (status) {
    case 'APPROVED':
    case 'DELIVERED':
    case 'QC_APPROVED':
    case 'PASS':
    case 'RESOLVED':
      return { color: C.green, tint: C.greenTint };
    case 'PENDING':
    case 'DISPATCHED':
    case 'IN_TRANSIT':
    case 'OUT_FOR_DELIVERY':
    case 'MANUFACTURED':
      return { color: C.blue, tint: C.blueTint };
    case 'PARTIAL':
    case 'INVESTIGATING':
    case 'WAREHOUSED':
    case 'MAJOR':
      return { color: C.amber, tint: C.amberTint };
    case 'REJECTED':
    case 'EXCEPTION':
    case 'QC_FAILED':
    case 'FAIL':
    case 'CRITICAL':
      return { color: C.red, tint: C.redTint };
    case 'MINOR':
    case 'OPEN':
      return { color: C.steel, tint: C.steelTint };
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
