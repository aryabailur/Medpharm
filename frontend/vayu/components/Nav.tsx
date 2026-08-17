'use client';

/**
 * Terminal sidebar — Vayu.
 *
 * Ports the handoff's nav verbatim: four groups, numbered rows, near-black
 * active state. Light rail on warm paper, distinguished from Dhanvantari by
 * the identity block rather than by a different palette.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { C, FONT, LABEL, MONO } from '../lib/theme';

const GROUPS: Array<{ label: string; items: Array<[string, string]> }> = [
  {
    label: 'Plant',
    items: [
      ['/', 'Control'],
      ['/batches', 'Batches + QC'],
    ],
  },
  {
    label: 'Fulfilment',
    items: [
      ['/orders', 'Approvals'],
      ['/shipments', 'Dispatch'],
      ['/telemetry', 'Telemetry + Excursions'],
    ],
  },
  {
    label: 'Evidence',
    items: [
      ['/complaints', 'Complaints + RCA'],
      ['/trace', 'Trace'],
    ],
  },
  {
    label: 'Intelligence',
    items: [
      ['/risk', 'Risk + Forecast'],
      ['/analytics', 'Network Analytics'],
      ['/assistant', 'Nidana'],
    ],
  },
];

export default function Nav() {
  const pathname = usePathname();
  let n = 0;

  return (
    <aside
      style={{
        width: 224,
        flex: '0 0 224px',
        background: C.surfaceAlt,
        borderRight: `1px solid ${C.border}`,
        display: 'flex',
        flexDirection: 'column',
        position: 'sticky',
        top: 0,
        height: '100vh',
      }}
    >
      <div style={{ padding: '16px 14px 14px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ ...LABEL, color: C.inkGhost }}>MedTrack</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 9 }}>
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: 3,
              background: C.ink,
              color: C.bg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              font: `600 12px/1 ${MONO}`,
            }}
          >
            V
          </div>
          <div>
            <div style={{ font: `600 13px/1.2 ${FONT}`, color: C.ink }}>Vayu</div>
            <div style={{ font: `400 10px/1.4 ${FONT}`, color: C.inkGhost }}>Supplier terminal</div>
          </div>
        </div>
      </div>

      <div style={{ padding: '12px 8px', overflowY: 'auto', flex: 1 }}>
        {GROUPS.map((g) => (
          <div key={g.label} style={{ marginBottom: 14 }}>
            <div style={{ ...LABEL, padding: '0 8px 7px' }}>{g.label}</div>
            {g.items.map(([href, label]) => {
              n += 1;
              const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 9,
                    padding: '6px 8px',
                    borderRadius: 3,
                    marginBottom: 1,
                    background: active ? C.ink : 'transparent',
                    color: active ? C.bg : C.inkMuted,
                    font: `${active ? 600 : 400} 12px/1.4 ${FONT}`,
                    textDecoration: 'none',
                  }}
                >
                  <span
                    style={{
                      font: `500 9px/1 ${MONO}`,
                      color: active ? C.bg : C.inkGhost,
                      opacity: active ? 0.7 : 1,
                      minWidth: 12,
                    }}
                  >
                    {String(n).padStart(2, '0')}
                  </span>
                  {label}
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      <div style={{ padding: '10px 14px', borderTop: `1px solid ${C.border}` }}>
        <div style={{ font: `400 10px/1.5 ${MONO}`, color: C.inkGhost }}>PS-SS04 · network scope</div>
      </div>
    </aside>
  );
}
