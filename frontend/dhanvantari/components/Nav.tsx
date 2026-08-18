'use client';

/**
 * Terminal shell — Dhanvantari.
 *
 * Identical chrome to Vayu by design: same geometry, same palette, same
 * mechanics. Only the identity block and the screen registry differ, because
 * the two windows sit side by side on stage (§11, 0:00) and should read as one
 * product seen from two sides.
 *
 * Ports the handoff's three-tier chrome, restyled as a premium command bar:
 *   56px header   dark ink gradient · brand mark · context line · ⌘K search ·
 *                 live clock · role chip
 *   50px nav      four numbered domains, active one on an animated underline,
 *                 plus a live store readout on the right
 *   48px sub-tabs screens within the active domain, badge counts as pills,
 *                 plus a light-touch meta line
 *
 * All three rows are sticky (top: 0, 56, 106) so the chrome stays put while a
 * long table scrolls under it. That stickiness is why the geometry is fixed
 * rather than fluid — the offsets come from SHELL in lib/theme.ts.
 */

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { getIncoming, getInventory } from '../lib/api';
import { C, EASE, EASE_IN_OUT, EASE_OUT, FONT, GRAD, MONO, pulse, SHADOW, SHELL, VIZ } from '../lib/theme';

/** Dhanvantari's identity hue — a violet distinct from Vayu's teal, so the two
 * windows read as one product seen from two sides, not two products. */
const IDENTITY = VIZ.violet;

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
    label: 'Ward',
    screens: [
      { href: '/', label: 'Control', title: 'Store Control', meta: 'line items · below reorder · inbound excursions' },
      { href: '/inventory', label: 'Inventory', title: 'Inventory', meta: 'line items across this store' },
      { href: '/pos', label: 'Dispensing', title: 'POS / Dispensing', meta: 'counter C-2 · FEFO issue' },
      { href: '/billing', label: 'Billing', title: 'Billing', meta: 'billed today · scheme covered' },
    ],
  },
  {
    idx: '02',
    label: 'Supply',
    screens: [
      { href: '/orders', label: 'Supply Orders', title: 'Supply Orders', meta: 'placed with the supplier' },
      { href: '/batches', label: 'Batch Catalogue', title: 'Batch Catalogue', meta: 'received lots · acceptance · print labels' },
      { href: '/shipments', label: 'Incoming', title: 'Incoming Shipments', meta: 'mirrored from Vayu over the contract' },
      { href: '/tracking', label: 'Tracking + Excursions', title: 'Tracking + Excursions', meta: 'live position · cold-chain warnings' },
      { href: '/scanin', label: 'Scan-in', title: 'Scan-in', meta: 'QR resolves batch, drug, expiry, QC' },
    ],
  },
  {
    idx: '03',
    label: 'Quality',
    screens: [
      { href: '/complaints', label: 'Complaints', title: 'Complaints + RCA', meta: "open · the supplier's root-cause reply" },
      { href: '/scorecard', label: 'Supplier Scorecard', title: 'Supplier Scorecard', meta: 'deliveries observed by this institution' },
      { href: '/expiring', label: 'Expiring Stock', title: 'Expiring Stock', meta: 'inside 90 days · value at risk' },
    ],
  },
  {
    idx: '04',
    label: 'Intelligence',
    screens: [
      { href: '/assistant', label: 'Nidana', title: 'Nidana Assistant', meta: "scoped to this institution's own data" },
    ],
  },
];

const ALL: Screen[] = DOMAINS.flatMap((d) => d.screens);

function activeScreen(pathname: string): Screen {
  if (pathname === '/') return ALL[0]!;
  return ALL.find((s) => s.href !== '/' && pathname.startsWith(s.href)) ?? ALL[0]!;
}

/** Small inline monogram — a stylised "D" as a rounded vessel/cross motif. A
 * soft outer glow gives the mark a touch of depth against the dark command
 * bar instead of sitting perfectly flat. */
function Monogram({ hue }: { hue: string }) {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 22 22"
      fill="none"
      aria-hidden="true"
      style={{ filter: `drop-shadow(0 0 8px ${hue}3D)`, flex: '0 0 26px' }}
    >
      <rect x="0.5" y="0.5" width="21" height="21" rx="6" fill={hue} fillOpacity="0.18" stroke={hue} strokeOpacity="0.55" />
      <path d="M8 5.5H11.2C13.9 5.5 16 8 16 11C16 14 13.9 16.5 11.2 16.5H8V5.5Z" stroke={hue} strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [clock, setClock] = useState('');
  const [palette, setPalette] = useState(false);
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);
  const [belowReorder, setBelowReorder] = useState(0);
  const [inboundExcursions, setInboundExcursions] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // The nav's store readout: what's below its reorder point, and whether any
  // inbound freight is carrying an excursion. Counted from real rows so the
  // chrome never contradicts the screen underneath it; silent on failure,
  // since a dead API shouldn't blank the whole shell.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [inv, inbound] = await Promise.all([getInventory('?take=500'), getIncoming()]);
        if (cancelled) return;
        setBelowReorder(
          inv.items.filter((r) => r.lowStock ?? r.qtyOnHand < r.reorderPoint).length,
        );
        setInboundExcursions(inbound.items.filter((s) => s.anomalyFlag).length);
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
        setCursor(0);
      } else if (e.key === 'Escape') setPalette(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const current = activeScreen(pathname);
  const currentDomain = DOMAINS.find((d) => d.screens.some((s) => s.href === current.href)) ?? DOMAINS[0]!;

  const needle = q.trim().toLowerCase();
  const hits = useMemo(
    () =>
      DOMAINS.flatMap((d) =>
        d.screens
          .filter(
            (s) =>
              !needle ||
              s.label.toLowerCase().includes(needle) ||
              s.title.toLowerCase().includes(needle),
          )
          .map((s) => ({ ...s, domain: d.label })),
      ),
    [needle],
  );

  useEffect(() => setCursor(0), [needle]);

  const go = (href: string) => {
    router.push(href);
    setPalette(false);
  };

  return (
    <>
      {/* ── Header — dark command bar ─────────────────────────────────── */}
      <header
        style={{
          display: 'flex',
          alignItems: 'stretch',
          height: SHELL.headerH,
          background: GRAD.ink,
          borderBottom: `1px solid rgba(255,255,255,0.08)`,
          position: 'sticky',
          top: 0,
          zIndex: 6,
          boxShadow: SHADOW.md,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '0 20px',
            borderRight: `1px solid rgba(255,255,255,0.08)`,
          }}
        >
          <Monogram hue={IDENTITY} />
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
            <span style={{ font: `600 10px/1 ${MONO}`, letterSpacing: '.22em', color: 'rgba(255,255,255,0.45)' }}>
              MEDTRACK
            </span>
            <span style={{ width: 1, height: 11, background: 'rgba(255,255,255,0.18)', display: 'inline-block' }} />
            <span style={{ font: `700 19px/1 ${FONT}`, letterSpacing: '-.02em', color: '#FFFFFF' }}>Dhanvantari</span>
          </div>
          <span
            style={{
              font: `700 10px/1 ${FONT}`,
              letterSpacing: '.12em',
              textTransform: 'uppercase',
              color: IDENTITY,
              background: `${IDENTITY}26`,
              border: `1px solid ${IDENTITY}55`,
              borderRadius: 999,
              padding: '4px 9px',
            }}
          >
            Institution
          </span>
        </div>

        <div
          style={{
            flex: '2 1 auto',
            minWidth: 120,
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
              color: 'rgba(255,255,255,0.5)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            Sion District Hospital · Mumbai · Ward F-North
          </span>
        </div>

        <button
          onClick={() => setPalette(true)}
          className="mt-searchfield"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            alignSelf: 'center',
            marginRight: 14,
            background: 'rgba(255,255,255,0.07)',
            border: `1px solid rgba(255,255,255,0.13)`,
            borderRadius: 7,
            padding: '8px 12px',
            flex: '1 6 220px',
            minWidth: 130,
            maxWidth: 280,
            cursor: 'pointer',
            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.18)',
            transition: `background .16s ${EASE_OUT}, border-color .16s ${EASE_OUT}, box-shadow .16s ${EASE_OUT}`,
          }}
        >
          <span style={{ font: `400 12px/1 ${MONO}`, color: 'rgba(255,255,255,0.4)' }}>⌕</span>
          <span
            style={{
              font: `400 12px/1 ${FONT}`,
              color: 'rgba(255,255,255,0.45)',
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
              font: `500 10px/1 ${MONO}`,
              color: 'rgba(255,255,255,0.55)',
              border: `1px solid rgba(255,255,255,0.16)`,
              borderRadius: 3,
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
            gap: 9,
            padding: '0 20px',
            borderLeft: `1px solid rgba(255,255,255,0.08)`,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#4ADE80',
              boxShadow: '0 0 0 3px rgba(74,222,128,0.18)',
              animation: pulse(1.8),
              flex: '0 0 6px',
            }}
          />
          <span
            style={{
              font: `600 20px/1 ${MONO}`,
              color: '#FFFFFF',
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
              className="mt-domain-tab"
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '0 20px',
                border: 0,
                background: 'transparent',
                color: active ? C.ink : C.inkFaint,
                font: `600 13px/1 ${FONT}`,
                letterSpacing: '.12em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                transition: `color .16s ${EASE_OUT}`,
              }}
            >
              <span style={{ font: `500 10px/1 ${MONO}`, color: active ? IDENTITY : C.inkSoft }}>{d.idx}</span>
              {d.label}
              <span
                style={{
                  position: 'absolute',
                  left: 12,
                  right: 12,
                  bottom: 0,
                  height: 2,
                  borderRadius: '2px 2px 0 0',
                  background: IDENTITY,
                  transform: active ? 'scaleX(1)' : 'scaleX(0)',
                  opacity: active ? 1 : 0,
                  transformOrigin: 'center',
                  transition: `transform .26s ${EASE_IN_OUT}, opacity .26s ${EASE_IN_OUT}`,
                }}
              />
            </button>
          );
        })}

        <div style={{ flex: 1 }} />

        {/* Store readout — the two numbers that decide whether a pharmacist
            needs to act, visible from every screen. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              font: `600 11px/1 ${FONT}`,
              letterSpacing: '.1em',
              textTransform: 'uppercase',
              color: C.inkFaint,
            }}
          >
            Store
          </span>
          <span
            style={{
              padding: '3px 9px',
              borderRadius: 999,
              background: belowReorder > 0 ? `${C.red}14` : C.greyTint,
              border: `1px solid ${belowReorder > 0 ? C.red + '44' : C.borderSoft}`,
              font: `600 11px/1.4 ${MONO}`,
              color: belowReorder > 0 ? C.red : C.inkSoft,
            }}
          >
            {belowReorder} below reorder
          </span>
          <span
            style={{
              padding: '3px 9px',
              borderRadius: 999,
              background: inboundExcursions > 0 ? `${C.amber}18` : C.greyTint,
              border: `1px solid ${inboundExcursions > 0 ? C.amber + '44' : C.borderSoft}`,
              font: `600 11px/1.4 ${MONO}`,
              color: inboundExcursions > 0 ? C.amber : C.inkSoft,
            }}
          >
            {inboundExcursions} inbound excursion{inboundExcursions === 1 ? '' : 's'}
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
              className="mt-subtab"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                border: `1px solid ${active ? C.borderActive : 'transparent'}`,
                background: active ? C.surface : 'transparent',
                color: active ? C.ink : C.inkMuted,
                padding: '8px 13px',
                borderRadius: SHELL.radius,
                font: `500 13px/1 ${FONT}`,
                textDecoration: 'none',
                boxShadow: active ? SHADOW.sm : 'none',
                transition: `border-color .16s ${EASE}, background .16s ${EASE}, box-shadow .16s ${EASE}`,
              }}
            >
              {s.label}
              {s.badge && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: 16,
                    padding: '1px 5px',
                    borderRadius: 999,
                    font: `600 10px/1.5 ${MONO}`,
                    color: active ? '#FFFFFF' : C.inkSoft,
                    background: active ? C.amber : C.borderSoft,
                  }}
                >
                  {s.badge}
                </span>
              )}
            </Link>
          );
        })}
        <div style={{ flex: 1 }} />
        <span style={{ font: `400 11px/1 ${FONT}`, color: C.inkGhost }}>{current.meta}</span>
      </div>

      {/* ── Command palette ────────────────────────────────────────────── */}
      {palette && (
        <div
          onClick={() => setPalette(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,14,12,0.5)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            zIndex: 50,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            paddingTop: '12vh',
            animation: 'mtFade .16s ease both',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 580,
              maxWidth: '92vw',
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              overflow: 'hidden',
              boxShadow: SHADOW.lg,
              animation: `mtScaleIn .22s cubic-bezier(.34,1.56,.64,1) both`,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '13px 16px',
                borderBottom: `1px solid ${C.border}`,
                background: GRAD.header,
              }}
            >
              <span style={{ font: `400 14px/1 ${MONO}`, color: IDENTITY }}>⌕</span>
              <input
                ref={inputRef}
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setCursor((c) => Math.min(c + 1, Math.max(hits.length - 1, 0)));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setCursor((c) => Math.max(c - 1, 0));
                  } else if (e.key === 'Enter' && hits[cursor]) {
                    go(hits[cursor].href);
                  }
                }}
                placeholder="Jump to a screen, drug or shipment…"
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
                  borderRadius: 3,
                  padding: '3px 5px',
                }}
              >
                ESC
              </span>
            </div>
            <div style={{ maxHeight: 340, overflowY: 'auto' }}>
              {hits.length === 0 ? (
                <div style={{ padding: 18, font: `400 12px/1 ${FONT}`, color: C.inkGhost }}>
                  Nothing matches “{q}”.
                </div>
              ) : (
                DOMAINS.map((d) => {
                  const domainHits = hits.filter((h) => h.domain === d.label);
                  if (domainHits.length === 0) return null;
                  return (
                    <div key={d.label}>
                      <div
                        style={{
                          padding: '8px 16px 6px',
                          font: `700 10px/1.5 ${MONO}`,
                          letterSpacing: '.14em',
                          textTransform: 'uppercase',
                          color: C.inkGhost,
                          background: C.surfaceAlt,
                        }}
                      >
                        {d.idx} · {d.label}
                      </div>
                      {domainHits.map((s) => {
                        const i = hits.indexOf(s);
                        const highlighted = i === cursor;
                        return (
                          <button
                            key={s.href}
                            onClick={() => go(s.href)}
                            onMouseEnter={() => setCursor(i)}
                            style={{
                              display: 'flex',
                              width: '100%',
                              alignItems: 'center',
                              gap: 12,
                              padding: '10px 16px',
                              border: 0,
                              borderLeft: `2px solid ${highlighted ? IDENTITY : 'transparent'}`,
                              background: highlighted ? `${IDENTITY}12` : 'transparent',
                              cursor: 'pointer',
                              textAlign: 'left',
                              transition: `background .12s ${EASE_OUT}, border-color .12s ${EASE_OUT}`,
                            }}
                          >
                            <span style={{ flex: 1, font: `${highlighted ? 600 : 500} 13px/1 ${FONT}`, color: C.ink }}>
                              {s.title}
                            </span>
                            <span
                              style={{
                                font: `500 10px/1 ${MONO}`,
                                letterSpacing: '.06em',
                                color: highlighted ? IDENTITY : C.inkSoft,
                                padding: '3px 6px',
                                borderRadius: 3,
                                background: highlighted ? `${IDENTITY}14` : 'transparent',
                              }}
                            >
                              SCREEN
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '9px 16px',
                borderTop: `1px solid ${C.borderSoft}`,
                background: C.surfaceAlt,
                font: `400 10px/1 ${MONO}`,
                color: C.inkGhost,
              }}
            >
              <span>↑↓ navigate</span>
              <span>↵ select</span>
              <span>esc close</span>
              <span style={{ marginLeft: 'auto' }}>{hits.length} result{hits.length === 1 ? '' : 's'}</span>
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
