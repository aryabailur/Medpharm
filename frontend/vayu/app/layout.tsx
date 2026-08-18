import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import Nav from '../components/Nav';
import { C, EASE_IN_OUT, EASE_OUT, EASE_SPRING, FONT } from '../lib/theme';

export const metadata: Metadata = {
  title: 'Vayu — MedTrack',
  description: 'Supplier terminal: catalogue, batches, QC, dispatch, telemetry, evidence',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <style>{`
          html { scroll-behavior:smooth; }
          html, body { margin:0; padding:0; background:${C.bg}; }
          * { box-sizing:border-box; }
          a { color:${C.ink}; text-decoration:none; border-bottom:1px solid ${C.inkGhost}; }
          a:hover { color:#000000; border-bottom-color:${C.ink}; }
          ::-webkit-scrollbar { width:11px; height:11px; }
          ::-webkit-scrollbar-thumb { background:${C.rail}; border-radius:0; border:4px solid ${C.bg}; }
          select, input { font-family:${FONT}; }

          /* ─── Vibrant layer hover helpers — used by components/ui.tsx and Nav.tsx ─── */
          .mt-panel-hover { cursor:default; }
          .mt-panel-hover:hover { box-shadow:0 6px 14px rgba(23,22,20,.07), 0 16px 34px rgba(23,22,20,.07); transform:translateY(-2px); border-color:${C.borderActive}; }
          .mt-kpi { cursor:default; }
          .mt-kpi:hover { background:${C.surfaceAlt}; }
          .mt-kpi:hover .mt-kpi-value { transform:translateY(-1px); }
          .mt-domain-tab { transition:color .16s ${EASE_OUT}, background .16s ${EASE_OUT}; }
          .mt-domain-tab:hover { color:${C.ink}; background:rgba(23,22,20,.03); }
          .mt-subtab:hover { border-color:${C.borderSoft}; background:${C.surfaceAlt}; }

          /* ─── Row / card / control micro-interactions ─── */
          .mt-row { transition:background .14s ${EASE_IN_OUT}, box-shadow .14s ${EASE_IN_OUT}; }
          .mt-row:hover { background:${C.surfaceAlt}; box-shadow:inset 2px 0 0 ${C.accent}; }
          .mt-table-zebra tbody tr:nth-child(even) { background:${C.surfaceAlt}; }
          .mt-table-zebra tbody tr:hover { background:${C.raised}; }
          .mt-searchfield:hover { background:rgba(255,255,255,0.11); border-color:rgba(255,255,255,0.26); box-shadow:inset 0 1px 3px rgba(0,0,0,0.24), 0 0 0 3px rgba(14,116,144,0.16); }
          .mt-searchfield:focus-visible { background:rgba(255,255,255,0.11); border-color:rgba(14,116,144,0.55); box-shadow:inset 0 1px 3px rgba(0,0,0,0.24), 0 0 0 3px rgba(14,116,144,0.22); }
          .mt-btn { transition:transform .12s ${EASE_IN_OUT}, box-shadow .12s ${EASE_IN_OUT}, background .16s ${EASE_OUT}, border-color .16s ${EASE_OUT}, opacity .16s ${EASE_OUT}; }
          .mt-btn:hover:not(:disabled) { transform:translateY(-1px); box-shadow:0 3px 8px rgba(23,22,20,.1); }
          .mt-btn:active:not(:disabled) { transform:translateY(0) scale(.98); box-shadow:none; }
          .mt-chip { transition:transform .14s ${EASE_SPRING}; }
          .mt-chip:hover { transform:scale(1.045); }
          .mt-icon-btn { transition:background .14s ${EASE_OUT}, color .14s ${EASE_OUT}, transform .12s ${EASE_IN_OUT}; }
          .mt-icon-btn:hover { background:${C.raised}; color:${C.ink}; }
          .mt-icon-btn:active { transform:scale(.92); }
          .mt-tooltip-wrap { position:relative; }
          .mt-tooltip { pointer-events:none; opacity:0; transform:translate(-50%,4px); transition:opacity .14s ${EASE_OUT}, transform .14s ${EASE_OUT}; }
          .mt-tooltip-wrap:hover .mt-tooltip { opacity:1; transform:translate(-50%,0); }

          /* ─── Accessibility: visible focus ring everywhere, including inside the dark header ─── */
          a:focus-visible, button:focus-visible, input:focus-visible, [tabindex]:focus-visible {
            outline:2px solid ${C.accent};
            outline-offset:2px;
            border-radius:2px;
          }

          /* The handoff's seven keyframes. Screens reference these by name via
             the motion helpers in lib/theme.ts — don't redefine them locally. */
          @keyframes mtRise { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }
          @keyframes mtFade { from { opacity:0; } to { opacity:1; } }
          @keyframes mtDraw { from { stroke-dashoffset:3000; } to { stroke-dashoffset:0; } }
          @keyframes mtGrow { from { transform:scaleX(0); } to { transform:scaleX(1); } }
          @keyframes mtRiseBar { from { transform:scaleY(0); } to { transform:scaleY(1); } }
          @keyframes mtPop { 0% { opacity:.5; transform:translateY(6px); } 100% { opacity:1; transform:none; } }
          @keyframes mtDash { to { stroke-dashoffset:-60; } }
          /* ─── Vibrant layer keyframes (see VIBRANT LAYER in lib/theme.ts) ─── */
          @keyframes mtShimmer { from { transform:translateX(-100%); } to { transform:translateX(100%); } }
          @keyframes mtPulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:.55; transform:scale(.86); } }
          @keyframes mtCountIn { from { opacity:0; transform:translateY(10px) scale(.96); } to { opacity:1; transform:none; } }
          @keyframes mtRiseScale { from { opacity:0; transform:translateY(12px) scale(.985); } to { opacity:1; transform:none; } }
          @keyframes mtSweep { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
          @keyframes mtSlideIn { from { opacity:0; transform:translateX(-8px); } to { opacity:1; transform:none; } }
          @keyframes mtRiskFlash {
            0%   { background:rgba(185,28,28,0); box-shadow:none; }
            18%  { background:rgba(185,28,28,.16); box-shadow:0 0 0 6px rgba(185,28,28,.10); }
            100% { background:rgba(185,28,28,0); box-shadow:none; }
          }
          @keyframes mtGlow { 0%,100% { opacity:.35; } 50% { opacity:.85; } }

          /* ─── Motion system v2 — richer entrances (see lib/theme.ts) ─── */
          @keyframes mtReveal { from { opacity:0; filter:blur(6px); transform:translateY(6px); } to { opacity:1; filter:blur(0); transform:none; } }
          @keyframes mtSlideInU { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:none; } }
          @keyframes mtSlideInL { from { opacity:0; transform:translateX(-14px); } to { opacity:1; transform:none; } }
          @keyframes mtSlideInR { from { opacity:0; transform:translateX(14px); } to { opacity:1; transform:none; } }
          @keyframes mtScaleIn { from { opacity:0; transform:scale(.92); } to { opacity:1; transform:none; } }
          @keyframes mtRollUp { from { opacity:0; filter:blur(3px); transform:translateY(10px); } to { opacity:1; filter:blur(0); transform:none; } }

          @media (prefers-reduced-motion: reduce) {
            *, *::before, *::after {
              animation-duration:.001ms !important;
              animation-iteration-count:1 !important;
              transition-duration:.001ms !important;
              scroll-behavior:auto !important;
            }
            .mt-panel-hover:hover, .mt-btn:hover:not(:disabled), .mt-chip:hover, .mt-icon-btn:active, .mt-btn:active:not(:disabled) {
              transform:none !important;
            }
          }
        `}</style>
      </head>
      <body style={{ font: `400 13px/1.5 ${FONT}`, color: C.ink, background: C.bg }}>
        <Nav />
        <main style={{ minWidth: 0 }}>{children}</main>
      </body>
    </html>
  );
}
