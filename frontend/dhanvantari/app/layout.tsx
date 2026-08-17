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
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        <style>{`
          html, body { margin:0; padding:0; background:${C.bg}; }
          * { box-sizing:border-box; }
          a { color:${C.accent}; text-decoration:none; }
          a:hover { text-decoration:underline; }
          ::-webkit-scrollbar { width:9px; height:9px; }
          ::-webkit-scrollbar-thumb { background:${C.border}; border-radius:5px; border:2px solid ${C.bg}; }
          select, input { font-family:${FONT}; }
          @keyframes mtRise { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:none } }
        `}</style>
      </head>
      <body style={{ font: `400 13px/1.5 ${FONT}`, color: C.ink, background: C.bg }}>
        <Nav />
        <main style={{ minWidth: 0 }}>{children}</main>
      </body>
    </html>
  );
}
