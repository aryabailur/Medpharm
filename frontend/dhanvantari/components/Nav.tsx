'use client';

/**
 * Sidebar navigation — ports the mockup's four nav groups verbatim.
 *
 * Light rail with a green accent, deliberately unlike Vayu's dark steel one:
 * the two windows sit side by side on stage (§11, 0:00).
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { C, FONT, MONO } from '../lib/theme';

const GROUPS: Array<{ label: string; items: Array<[string, string]> }> = [
  {
    label: 'Operate',
    items: [
      ['/', 'Overview'],
      ['/inventory', 'Inventory'],
      ['/pos', 'POS / Dispensing'],
      ['/billing', 'Billing'],
    ],
  },
  {
    label: 'Supply',
    items: [
      ['/orders', 'Supply Orders'],
      ['/shipments', 'Incoming Shipments'],
      ['/tracking', 'Live Tracking'],
      ['/scanin', 'Scan-in'],
    ],
  },
  {
    label: 'Quality',
    items: [
      ['/excursions', 'Excursions'],
      ['/complaints', 'Complaints'],
      ['/scorecard', 'Supplier Scorecard'],
      ['/expiring', 'Expiring Stock'],
    ],
  },
  { label: 'Ask', items: [['/assistant', 'Assistant']] },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <aside
      style={{
        width: 238,
        flex: '0 0 238px',
        background: C.navBg,
        borderRight: `1px solid ${C.navBorder}`,
        display: 'flex',
        flexDirection: 'column',
        position: 'sticky',
        top: 0,
        height: '100vh',
      }}
    >
      <div style={{ padding: '18px 16px 14px', borderBottom: `1px solid ${C.navBorder}` }}>
        <div style={{ font: `600 10px/1 ${MONO}`, letterSpacing: '.16em', color: C.inkGhost }}>
          MEDTRACK
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: 7,
              background: C.green,
              color: '#FFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              font: `700 13px/1 ${FONT}`,
            }}
          >
            D
          </div>
          <div>
            <div style={{ font: `600 14px/1.1 ${FONT}`, color: C.ink }}>Dhanvantari</div>
            <div style={{ font: `400 11px/1.3 ${FONT}`, color: C.inkFaint }}>
              Institution · Sion District Hospital
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: '14px 8px', overflowY: 'auto', flex: 1 }}>
        {GROUPS.map((g) => (
          <div key={g.label} style={{ marginBottom: 16 }}>
            <div
              style={{
                font: `600 10px/1 ${FONT}`,
                letterSpacing: '.11em',
                textTransform: 'uppercase',
                color: C.navLabel,
                padding: '0 12px 8px',
              }}
            >
              {g.label}
            </div>
            {g.items.map(([href, label]) => {
              const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 12px',
                    borderRadius: 8,
                    marginBottom: 2,
                    background: active ? C.navActive : 'transparent',
                    color: active ? C.navTextActive : C.navText,
                    font: `${active ? 600 : 400} 13px/1.2 ${FONT}`,
                    textDecoration: 'none',
                  }}
                >
                  <span
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: 99,
                      background: active ? C.navDotActive : C.navDot,
                      flex: '0 0 5px',
                    }}
                  />
                  {label}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </aside>
  );
}
