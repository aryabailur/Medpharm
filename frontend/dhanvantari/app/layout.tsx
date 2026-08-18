import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import Nav from '../components/Nav';
import { C, FONT } from '../lib/theme';

export const metadata: Metadata = {
  title: 'Dhanvantari — MedTrack',
  description: 'Institution terminal: inventory, dispensing, incoming shipments, scan-in, complaints',
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
          .mt-panel-hover:hover { box-shadow:0 4px 8px rgba(23,22,20,.06), 0 12px 28px rgba(23,22,20,.06); transform:translateY(-1px); border-color:${C.borderActive}; }
          .mt-kpi:hover { background:${C.surfaceAlt}; }
          .mt-domain-tab:hover { color:${C.ink}; }
          .mt-subtab:hover { border-color:${C.borderSoft}; background:${C.surfaceAlt}; }

          /* ─── Accessibility: visible focus ring everywhere, including inside the dark header ─── */
          a:focus-visible, button:focus-visible, input:focus-visible, [tabindex]:focus-visible {
            outline:2px solid #6D28D9;
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
          @keyframes mtGlow { 0%,100% { opacity:.35; } 50% { opacity:.85; } }

          @media (prefers-reduced-motion: reduce) {
            *, *::before, *::after {
              animation-duration:.001ms !important;
              animation-iteration-count:1 !important;
              transition-duration:.001ms !important;
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
