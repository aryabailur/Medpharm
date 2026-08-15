export default function Home() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '3rem', maxWidth: 720 }}>
      <p style={{ color: '#666', margin: 0, fontSize: 14, letterSpacing: '0.08em' }}>MEDTRACK</p>
      <h1 style={{ margin: '0.25rem 0' }}>Dhanvantari</h1>
      <p style={{ color: '#666', marginTop: 0 }}>Institution side — hospital / CHC / PHC</p>

      <p>
        Scaffold. See <code>ARCHITECTURE.md</code> for the build order — the order
        loop (Phase 3) is the hard gate before anything else here.
      </p>

      <ul style={{ color: '#444', lineHeight: 1.8 }}>
        <li>Inventory, POS, billing</li>
        <li>Supply-order placement + one-tap reorder</li>
        <li>Scan-in with photo evidence</li>
        <li>Complaint filing</li>
        <li>Supplier scorecard</li>
        <li>Assistant — own-data scope</li>
      </ul>
    </main>
  );
}
