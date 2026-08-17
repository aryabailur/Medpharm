'use client';

/**
 * Terminal shell — Vayu.
 *
 * Ports the handoff's three-tier chrome verbatim:
 *   56px header   brand · context line · ⌘K palette · live clock
 *   50px nav      four numbered domains, active one underlined in ink, plus a
 *                 live network readout on the right
 *   48px sub-tabs screens within the active domain, plus a context meta line
 *
 * All three rows are sticky (top: 0, 56, 106) so the chrome stays put while a
 * long table scrolls under it. That stickiness is why the geometry is fixed
 * rather than fluid — the offsets come from SHELL in lib/theme.ts.
 */

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { getShipments } from '../lib/api';
import { C, EASE, FONT, MONO, SHELL } from '../lib/theme';

const IN_FLIGHT = ['DISPATCHED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'];

interface Screen {
  href: string;
  label: string;
  title: string;
  meta: string;
  /** Count shown beside the sub-tab label, as the handoff's badges do. */
  badge?: string;
}

const DOMAINS: Array<{ idx: string; label: string; screens: Screen[] }> = [
  {
    idx: '01',
    label: 'Plant',
    screens: [
      { href: '/', label: 'Control', title: 'Plant Control', meta: 'live over SSE' },
      { href: '/batches', label: 'Batches + QC', title: 'Batches + QC', meta: 'lots, QR payloads, inspection state' },
    ],
  },
  {
    idx: '02',
    label: 'Fulfilment',
    screens: [
      { href: '/orders', label: 'Approvals', title: 'Supply-order Approvals', meta: 'institutions request · the supplier decides' },
      { href: '/shipments', label: 'Dispatch', title: 'Shipment Dispatch', meta: 'warehouse to institution' },
      { href: '/telemetry', label: 'Telemetry + Excursions', title: 'Telemetry + Excursions', meta: 'live position and temperature' },
    ],
  },
  {
    idx: '03',
    label: 'Evidence',
    screens: [
      { href: '/complaints', label: 'Complaints + RCA', title: 'Complaints + Root Cause', meta: 'pre-linked to batch and shipment' },
      { href: '/trace', label: 'Trace', title: 'Supply-chain Trace', meta: 'full custody chain' },
    ],
  },
  {
    idx: '04',
    label: 'Intelligence',
    screens: [
      { href: '/risk', label: 'Risk + Forecast', title: 'Risk + Demand Forecast', meta: 'five signals · 80% band' },
      { href: '/reliability', label: 'Reliability', title: 'Institution Reliability', meta: 'rolling 90 days · how predictable each institution is to supply' },
      { href: '/analytics', label: 'Network Analytics', title: 'Network Analytics', meta: 'ledger-wide aggregates across the network' },
      { href: '/assistant', label: 'Nidana', title: 'Nidana Assistant', meta: 'network scope · every institution this plant supplies' },
    ],
  },
];

const ALL: Screen[] = DOMAINS.flatMap((d) => d.screens);

function activeScreen(pathname: string): Screen {
  if (pathname === '/') return ALL[0]!;
  return ALL.find((s) => s.href !== '/' && pathname.startsWith(s.href)) ?? ALL[0]!;
}

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [clock, setClock] = useState('');
  const [palette, setPalette] = useState(false);
  const [q, setQ] = useState('');
  const [inFlight, setInFlight] = useState(0);
  const [openExcursions, setOpenExcursions] = useState(0);

  // The nav's network readout. Counted from real shipments so the chrome never
  // contradicts the screen underneath it; silent on failure, since a dead API
  // shouldn't blank the whole shell.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getShipments('?take=200');
        if (cancelled) return;
        setInFlight(res.items.filter((s) => IN_FLIGHT.includes(s.status)).length);
        setOpenExcursions(res.items.reduce((a, s) => a + (s.excursionCount ?? 0), 0));
      } catch {
        /* leave the counters at zero */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  // Live clock, as the handoff's header shows.
  useEffect(() => {
    const tick = () =>
      setClock(
        new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }),
      );
    tick();
    const id = setInterval(tick, 10_000);
    return () => clearInterval(id);
  }, []);

  // ⌘K / Ctrl+K opens the palette; Escape closes it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((p) => !p);
        setQ('');
      } else if (e.key === 'Escape') setPalette(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const current = activeScreen(pathname);
  const currentDomain = DOMAINS.find((d) => d.screens.some((s) => s.href === current.href)) ?? DOMAINS[0]!;

  const needle = q.trim().toLowerCase();
  const hits = DOMAINS.flatMap((d) =>
    d.screens
      .filter(
        (s) =>
          !needle ||
          s.label.toLowerCase().includes(needle) ||
          s.title.toLowerCase().includes(needle),
      )
      .map((s) => ({ ...s, domain: d.label })),
  );

  return (
    <>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header
        style={{
          display: 'flex',
          alignItems: 'stretch',
          height: SHELL.headerH,
          background: C.surface,
          borderBottom: `1px solid ${C.border}`,
          position: 'sticky',
          top: 0,
          zIndex: 6,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '0 22px',
            borderRight: `1px solid ${C.borderFaint}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
            <span style={{ font: `600 11px/1 ${MONO}`, letterSpacing: '.22em', color: C.inkSoft }}>
              MEDTRACK
            </span>
            <span style={{ width: 1, height: 11, background: C.border, display: 'inline-block' }} />
            <span style={{ font: `700 20px/1 ${FONT}`, letterSpacing: '-.02em', color: C.ink }}>Vayu</span>
          </div>
          <span
            style={{
              font: `600 11px/1 ${FONT}`,
              letterSpacing: '.1em',
              textTransform: 'uppercase',
              color: C.inkSoft,
            }}
          >
            Manufacturer
          </span>
        </div>

        <div
          style={{
            flex: '3 1 auto',
            minWidth: 150,
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '0 18px',
            overflow: 'hidden',
          }}
        >
          <span
            style={{
              font: `400 11px/1.4 ${MONO}`,
              color: C.inkMuted,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            Bharat Biologicals · Pune plant · 49 institutions
          </span>
        </div>

        <button
          onClick={() => setPalette(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            alignSelf: 'center',
            marginRight: 14,
            background: C.bg,
            border: `1px solid ${C.border}`,
            borderRadius: SHELL.radius,
            padding: '8px 11px',
            flex: '1 6 210px',
            minWidth: 120,
            maxWidth: 250,
            cursor: 'pointer',
          }}
        >
          <span style={{ font: `400 12px/1 ${MONO}`, color: C.inkSoft }}>⌕</span>
          <span
            style={{
              font: `400 12px/1 ${FONT}`,
              color: C.inkSoft,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            Search or jump to…
          </span>
          <span
            style={{
              marginLeft: 'auto',
              font: `400 10px/1 ${MONO}`,
              color: C.inkSoft,
              border: `1px solid ${C.border}`,
              borderRadius: 2,
              padding: '3px 5px',
            }}
          >
            ⌘K
          </span>
        </button>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '0 20px',
            borderLeft: `1px solid ${C.borderFaint}`,
          }}
        >
          <span
            style={{
              font: `600 21px/1 ${MONO}`,
              color: C.ink,
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '-.01em',
            }}
          >
            {clock || '--:--'}
          </span>
        </div>
      </header>

      {/* ── Domain nav ─────────────────────────────────────────────────── */}
      <nav
        style={{
          display: 'flex',
          alignItems: 'stretch',
          background: C.surface,
          borderBottom: `1px solid ${C.border}`,
          padding: `0 ${SHELL.gutter}px`,
          height: SHELL.navH,
          position: 'sticky',
          top: SHELL.headerH,
          zIndex: 5,
        }}
      >
        {DOMAINS.map((d) => {
          const active = d.label === currentDomain.label;
          return (
            <button
              key={d.idx}
              onClick={() => router.push(d.screens[0]!.href)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '0 20px',
                border: 0,
                borderBottom: `2px solid ${active ? C.ink : 'transparent'}`,
                background: 'transparent',
                color: active ? C.ink : C.inkFaint,
                font: `600 13px/1 ${FONT}`,
                letterSpacing: '.12em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                transition: 'color .12s ease',
              }}
            >
              <span style={{ font: `500 10px/1 ${MONO}`, color: C.inkSoft }}>{d.idx}</span>
              {d.label}
            </button>
          );
        })}

        <div style={{ flex: 1 }} />

        {/* Network readout — the handoff keeps the two numbers that decide
            whether an operator needs to act anywhere in the app. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span
            style={{
              font: `600 11px/1 ${FONT}`,
              letterSpacing: '.1em',
              textTransform: 'uppercase',
              color: C.inkFaint,
            }}
          >
            Network
          </span>
          <span style={{ font: `500 11px/1 ${MONO}`, color: C.ink }}>{inFlight} in flight</span>
          <span style={{ width: 1, height: 10, background: C.border }} />
          <span style={{ font: `500 11px/1 ${MONO}`, color: openExcursions > 0 ? C.amber : C.inkSoft }}>
            {openExcursions} excursion{openExcursions === 1 ? '' : 's'} open
          </span>
        </div>
      </nav>

      {/* ── Sub-tabs ───────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          background: C.bg,
          borderBottom: `1px solid ${C.border}`,
          padding: `0 ${SHELL.gutter}px`,
          height: SHELL.subTabH,
          position: 'sticky',
          top: SHELL.headerH + SHELL.navH,
          zIndex: 4,
        }}
      >
        {currentDomain.screens.map((s) => {
          const active = s.href === current.href;
          return (
            <Link
              key={s.href}
              href={s.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                border: `1px solid ${active ? C.borderActive : 'transparent'}`,
                background: active ? C.surface : 'transparent',
                color: active ? C.ink : C.inkMuted,
                padding: '9px 13px',
                borderRadius: SHELL.radius,
                font: `500 13px/1 ${FONT}`,
                textDecoration: 'none',
                borderBottom: `1px solid ${active ? C.borderActive : 'transparent'}`,
                transition: 'border-color .12s ease',
              }}
            >
              {s.label}
              {s.badge && (
                <span
                  style={{
                    font: `500 10px/1 ${MONO}`,
                    color: active ? C.amber : C.inkGhost,
                  }}
                >
                  {s.badge}
                </span>
              )}
            </Link>
          );
        })}
        <div style={{ flex: 1 }} />
        <span style={{ font: `400 11px/1 ${MONO}`, letterSpacing: '.08em', color: C.inkFaint }}>
          {current.meta}
        </span>
      </div>

      {/* ── Command palette ────────────────────────────────────────────── */}
      {palette && (
        <div
          onClick={() => setPalette(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(23,22,20,0.22)',
            zIndex: 50,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            paddingTop: '12vh',
            animation: 'mtFade .14s ease both',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 560,
              maxWidth: '92vw',
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              overflow: 'hidden',
              animation: `mtRise .22s ${EASE} both`,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '13px 15px',
                borderBottom: `1px solid ${C.border}`,
              }}
            >
              <span style={{ font: `400 13px/1 ${MONO}`, color: C.inkSoft }}>⌕</span>
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && hits[0]) {
                    router.push(hits[0].href);
                    setPalette(false);
                  }
                }}
                placeholder="Jump to a screen, batch or shipment…"
                style={{
                  flex: 1,
                  border: 0,
                  outline: 'none',
                  font: `400 14px/1.2 ${FONT}`,
                  color: C.ink,
                  background: 'transparent',
                }}
              />
              <span
                style={{
                  font: `400 10px/1 ${MONO}`,
                  color: C.inkSoft,
                  border: `1px solid ${C.border}`,
                  borderRadius: 2,
                  padding: '3px 5px',
                }}
              >
                ESC
              </span>
            </div>
            <div style={{ maxHeight: 320, overflowY: 'auto' }}>
              {hits.length === 0 ? (
                <div style={{ padding: 15, font: `400 12px/1 ${FONT}`, color: C.inkGhost }}>
                  Nothing matches “{q}”.
                </div>
              ) : (
                hits.map((s) => (
                  <button
                    key={s.href}
                    onClick={() => {
                      router.push(s.href);
                      setPalette(false);
                    }}
                    style={{
                      display: 'flex',
                      width: '100%',
                      alignItems: 'center',
                      gap: 12,
                      padding: '11px 15px',
                      border: 0,
                      borderBottom: `1px solid ${C.borderSoft}`,
                      background: 'transparent',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span
                      style={{
                        font: `500 10px/1 ${MONO}`,
                        letterSpacing: '.08em',
                        color: C.inkSoft,
                        width: 64,
                        flex: '0 0 64px',
                      }}
                    >
                      {s.domain}
                    </span>
                    <span style={{ flex: 1, font: `400 13px/1 ${FONT}`, color: C.ink }}>{s.title}</span>
                    <span
                      style={{
                        font: `400 10px/1 ${MONO}`,
                        letterSpacing: '.06em',
                        color: C.inkSoft,
                      }}
                    >
                      SCREEN
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Page title + meta for the active route, so screens don't restate them. */
export function useScreenMeta() {
  const pathname = usePathname();
  return activeScreen(pathname);
}
