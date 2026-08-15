export default function Home() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '3rem', maxWidth: 720 }}>
      <p style={{ color: '#666', margin: 0, fontSize: 14, letterSpacing: '0.08em' }}>MEDTRACK</p>
      <h1 style={{ margin: '0.25rem 0' }}>Vayu</h1>
      <p style={{ color: '#666', marginTop: 0 }}>Supplier / manufacturer side</p>

      <p>
        Scaffold. See <code>ARCHITECTURE.md</code> for the build order — this app is
        built out from Phase 2 onward.
      </p>

      <ul style={{ color: '#444', lineHeight: 1.8 }}>
        <li>Catalog, batches, QC records</li>
        <li>Supply-order approval queue</li>
        <li>Shipment dispatch + QR manifest</li>
        <li>Telemetry console (live map + temp graph)</li>
        <li>Evidence layer + complaint RCA</li>
        <li>Assistant — network scope</li>
      </ul>
    </main>
  );
}
