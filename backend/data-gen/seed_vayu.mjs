/**
 * Seed the `vayu` schema from the approved dashboard mockup.
 *
 * ARCHITECTURE.md §10. Phase 1.
 *
 * The mockup ("Vayu Dashboard.dc.html") carried a hand-authored dataset that is
 * internally consistent — SO-2026-0181 → SHP-8F2A → batch BT-4C19-A →
 * complaint CMP-4471, with a matching excursion on the same shipment. That
 * cross-referencing is the point: every analytical feature then has something
 * true to find, which §10 argues matters more than volume.
 *
 * Human-readable ids from the mockup (SO-2026-0181, SHP-8F2A, BT-4C19-A) are
 * kept as `lotNumber` / display fields where the schema allows. The primary
 * keys stay UUIDs, because batchId / shipmentId / supplyOrderId are the shared
 * identity contract with Dhanvantari (§4.1) and must be UUIDv7-shaped.
 *
 * Idempotent: running it twice wipes and reseeds rather than duplicating.
 *
 *   node backend/data-gen/seed_vayu.mjs
 *   node backend/data-gen/seed_vayu.mjs --keep   (skip if data already present)
 */

import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('../vayu-api/node_modules/.prisma/client');

const prisma = new PrismaClient();
const KEEP = process.argv.includes('--keep');

/** Mockup timeline is anchored on 18 Aug; re-base it onto today so ages read sensibly. */
const DAY = 86_400_000;
const HOUR = 3_600_000;
const now = Date.now();
const at = (dayOffset, h = 0, m = 0) =>
  new Date(now - dayOffset * DAY - h * HOUR - m * 60_000);

// ─── Catalogue (§10: NLEM-derived) ───────────────────────────────────────────
const DRUGS = [
  { key: 'insulin', name: 'Insulin Glargine 100IU/mL', generic: 'Insulin Glargine', nlem: 'NLEM-INS-01', cat: 'Hormone', pack: '10 mL vial', cold: true, min: 2, max: 8, shelf: 730 },
  { key: 'oxytocin', name: 'Oxytocin 5IU/mL', generic: 'Oxytocin', nlem: 'NLEM-OXY-01', cat: 'Hormone', pack: '1 mL amp', cold: true, min: 2, max: 8, shelf: 730 },
  { key: 'rabies', name: 'Rabies Vaccine 2.5IU', generic: 'Rabies Vaccine', nlem: 'NLEM-RAB-01', cat: 'Vaccine', pack: '1 dose vial', cold: true, min: 2, max: 8, shelf: 1095 },
  { key: 'amox', name: 'Amoxicillin 500 mg', generic: 'Amoxicillin', nlem: 'NLEM-AMX-01', cat: 'Antibiotic', pack: '10 x 10 caps', cold: false, shelf: 1095 },
  { key: 'ceftriaxone', name: 'Ceftriaxone 1 g inj', generic: 'Ceftriaxone', nlem: 'NLEM-CFT-01', cat: 'Antibiotic', pack: '1 g vial', cold: false, shelf: 1095 },
  { key: 'paracetamol', name: 'Paracetamol 500 mg', generic: 'Paracetamol', nlem: 'NLEM-PCM-01', cat: 'Analgesic', pack: '10 x 10 tabs', cold: false, shelf: 1095 },
  { key: 'adrenaline', name: 'Adrenaline 1 mg/mL', generic: 'Adrenaline', nlem: 'NLEM-ADR-01', cat: 'Emergency', pack: '1 mL amp', cold: false, shelf: 730 },
  { key: 'ors', name: 'ORS Sachet', generic: 'Oral Rehydration Salts', nlem: 'NLEM-ORS-01', cat: 'Electrolyte', pack: '21 g sachet', cold: false, shelf: 1095 },
  { key: 'metformin', name: 'Metformin 500 mg', generic: 'Metformin', nlem: 'NLEM-MET-01', cat: 'Antidiabetic', pack: '10 x 10 tabs', cold: false, shelf: 1095 },
  { key: 'ringer', name: 'Ringer Lactate 500 mL', generic: 'Ringer Lactate', nlem: 'NLEM-RL-01', cat: 'IV Fluid', pack: '500 mL bottle', cold: false, shelf: 730 },
];

const INSTITUTIONS = [
  { key: 'sion', name: 'Sion District Hospital', type: 'DISTRICT_HOSPITAL', district: 'Mumbai City', lat: 19.0409, lng: 72.8626, pop: 620000, tier: 'A' },
  { key: 'kurla', name: 'Kurla CHC', type: 'CHC', district: 'Mumbai Suburban', lat: 19.0726, lng: 72.8845, pop: 340000, tier: 'B' },
  { key: 'govandi', name: 'Govandi PHC', type: 'PHC', district: 'Mumbai Suburban', lat: 19.0533, lng: 72.9186, pop: 180000, tier: 'C' },
  { key: 'kalyan', name: 'Kalyan District Hospital', type: 'DISTRICT_HOSPITAL', district: 'Thane', lat: 19.2403, lng: 73.1305, pop: 480000, tier: 'A' },
  { key: 'thane', name: 'Thane CHC', type: 'CHC', district: 'Thane', lat: 19.2183, lng: 72.9781, pop: 290000, tier: 'B' },
  { key: 'palghar', name: 'Palghar PHC', type: 'PHC', district: 'Palghar', lat: 19.6967, lng: 72.7699, pop: 120000, tier: 'C' },
  { key: 'warehouse', name: 'Pune Central Warehouse', type: 'WAREHOUSE', district: 'Pune', lat: 18.5204, lng: 73.8567, pop: null, tier: null },
];

async function wipe() {
  // Children first — no cross-schema FKs, but plenty of intra-schema ones.
  for (const t of [
    'excursion', 'telemetryPoint', 'consumptionFeed', 'complaint', 'outboundEvent',
    'processedEvent', 'shipmentBatch', 'shipment', 'qCRecord', 'supplyOrderLine',
    'supplyOrder', 'batch', 'drug', 'institution',
  ]) {
    await prisma[t].deleteMany();
  }
}

async function main() {
  if (KEEP && (await prisma.supplyOrder.count()) > 0) {
    console.log('data already present — nothing to do (--keep)');
    return;
  }

  await wipe();

  // ─── Catalogue + network ───────────────────────────────────────────────────
  const drug = {};
  for (const d of DRUGS) {
    drug[d.key] = await prisma.drug.create({
      data: {
        name: d.name, genericName: d.generic, nlemCode: d.nlem, category: d.cat,
        packSize: d.pack, coldChain: d.cold, minTempC: d.min ?? null,
        maxTempC: d.max ?? null, shelfLifeDays: d.shelf,
      },
    });
  }

  const inst = {};
  for (const i of INSTITUTIONS) {
    inst[i.key] = await prisma.institution.create({
      data: {
        name: i.name, type: i.type, district: i.district, state: 'Maharashtra',
        lat: i.lat, lng: i.lng, population: i.pop, tier: i.tier,
      },
    });
  }

  // ─── Batches + QC (mockup `batches` and `qc` arrays) ───────────────────────
  const B = {};
  const batchSpec = [
    ['4C19-A', 'IG-2608-A', 'insulin', 2400, at(6, 4, 20), at(-225), 'DISPATCHED', { result: 'PASS', inspector: 'Dr. N. Rao', notes: 'Potency 99.2% of label claim', at: at(6) }],
    ['4C19-B', 'IG-2608-B', 'insulin', 3600, at(6, 4, 20), at(-225), 'WAREHOUSED', { result: 'PASS', inspector: 'Dr. N. Rao', notes: 'Within all limits', at: at(6) }],
    ['4C19-C', 'IG-2608-C', 'insulin', 3600, at(4, 6, 0), at(-227), 'MANUFACTURED', null], // held for retest
    ['77E2-B', 'AX-2608-B', 'amox', 12000, at(14), at(21), 'DISPATCHED', { result: 'PASS', inspector: 'P. Iyer', notes: 'Dissolution within pharmacopoeial limits', at: at(13) }],
    ['77E2-C', 'AX-2609-C', 'amox', 20000, at(2), at(-730), 'MANUFACTURED', null],
    ['9B31-A', 'OX-2607-A', 'oxytocin', 1800, at(20), at(-180), 'DISPATCHED', { result: 'PASS', inspector: 'Dr. N. Rao', notes: 'Assay within limits', at: at(19) }],
    ['2A55-C', 'CX-2607-B', 'ceftriaxone', 4200, at(25), at(-150), 'WAREHOUSED', { result: 'PASS', inspector: 'P. Iyer', notes: 'Sterility clear', at: at(24) }],
    ['5D08-D', 'PC-2606-D', 'paracetamol', 30000, at(40), at(-500), 'DISPATCHED', { result: 'PASS', inspector: 'S. Banerjee', notes: 'Uniformity of mass within limits', at: at(39) }],
    ['6C90-A', 'RL-2605-D', 'ringer', 11400, at(50), at(-490), 'WAREHOUSED', { result: 'PASS', inspector: 'S. Banerjee', notes: 'Particulate matter clear', at: at(49) }],
    ['3F12-A', 'RB-2604-A', 'rabies', 600, at(60), at(-400), 'QC_FAILED', { result: 'FAIL', inspector: 'Dr. N. Rao', notes: 'Potency below specification on retest — lot quarantined', at: at(58) }],
  ];

  for (const [code, lot, dkey, qty, mfg, exp, status, qc] of batchSpec) {
    const b = await prisma.batch.create({
      data: {
        id: randomUUID(), drugId: drug[dkey].id, lotNumber: lot, mfgDate: mfg,
        expiryDate: exp, quantity: qty, status,
        qrPayload: `MT|B|${code}|${lot}`,
      },
    });
    B[code] = b;
    if (qc) {
      await prisma.qCRecord.create({
        data: {
          batchId: b.id, result: qc.result, inspector: qc.inspector,
          notes: qc.notes, testedAt: qc.at,
          certificateUrl: qc.result === 'PASS' ? `QC-${code}.pdf` : null,
        },
      });
    }
  }

  // ─── Supply orders (mockup `orders` / `queue`) ─────────────────────────────
  const mkOrder = async (institution, status, hoursAgo, lines, window, reason) => {
    const o = await prisma.supplyOrder.create({
      data: {
        id: randomUUID(), institutionId: institution.id, status,
        requestedWindow: window ?? null, rejectionReason: reason ?? null,
        placedAt: new Date(now - hoursAgo * HOUR),
        lines: {
          create: lines.map(([dkey, req, appr]) => ({
            drugId: drug[dkey].id, qtyRequested: req,
            qtyApproved: appr ?? null,
          })),
        },
      },
      include: { lines: true },
    });
    return o;
  };

  const so0179 = await mkOrder(inst.sion, 'PENDING', 5.3, [['ceftriaxone', 1500], ['ringer', 900]], '19–21 Aug');
  await mkOrder(inst.kurla, 'PENDING', 2.2, [['paracetamol', 20000], ['ors', 4000], ['metformin', 9000], ['adrenaline', 600]], '20–22 Aug');
  await mkOrder(inst.govandi, 'PENDING', 0.8, [['ors', 2000], ['paracetamol', 8000], ['metformin', 3000]], '21–23 Aug');
  const so0181 = await mkOrder(inst.sion, 'APPROVED', 9.5, [['insulin', 2400, 2400], ['oxytocin', 600, 600], ['rabies', 120, 120]], '18–19 Aug');
  const so0180 = await mkOrder(inst.sion, 'DISPATCHED', 30, [['amox', 12000, 12000]], '17–18 Aug');
  const so0183 = await mkOrder(inst.kurla, 'APPROVED', 28, [['oxytocin', 1800, 1800]], '17–18 Aug');
  const so0175 = await mkOrder(inst.govandi, 'DISPATCHED', 52, [['paracetamol', 8000, 8000], ['ors', 1900, 1900]], '16–17 Aug');
  await mkOrder(inst.palghar, 'PARTIAL', 74, [['insulin', 900, 400]], '15–16 Aug');
  await mkOrder(inst.thane, 'REJECTED', 96, [['rabies', 500]], '14–15 Aug', 'Cold-chain capacity unavailable for this corridor in the requested window');

  // ─── Shipments (mockup `shipments`) ───────────────────────────────────────
  const mkShipment = async (order, batches, status, opts = {}) => {
    const s = await prisma.shipment.create({
      data: {
        id: randomUUID(), supplyOrderId: order.id,
        originWarehouseId: inst.warehouse.id,
        destinationInstitution: order.institutionId,
        status, coldChain: opts.cold ?? false,
        dispatchedAt: opts.dispatchedAt ?? null,
        etaAt: opts.etaAt ?? null,
        deliveredAt: opts.deliveredAt ?? null,
        progressPct: opts.progress ?? null,
        lastKnownLat: opts.lat ?? null,
        lastKnownLng: opts.lng ?? null,
        lastTempC: opts.temp ?? null,
      },
    });
    for (const [code, qty] of batches) {
      await prisma.shipmentBatch.create({ data: { shipmentId: s.id, batchId: B[code].id, quantity: qty } });
    }
    return s;
  };

  const shp8F2A = await mkShipment(so0181, [['4C19-A', 2400], ['9B31-A', 600], ['3F12-A', 120]], 'IN_TRANSIT',
    { cold: true, dispatchedAt: at(0, 9), etaAt: at(-0.1), progress: 0.72, lat: 18.75, lng: 73.41, temp: 6.2 });
  const shp91C7 = await mkShipment(so0180, [['77E2-B', 12000]], 'IN_TRANSIT',
    { dispatchedAt: at(0, 11), etaAt: at(-0.2), progress: 0.41, lat: 18.61, lng: 73.62, temp: null });
  const shp8F31 = await mkShipment(so0183, [['9B31-A', 1800]], 'EXCEPTION',
    { cold: true, dispatchedAt: at(1, 9), progress: 0.55, lat: 18.9, lng: 73.2, temp: 11.9 });
  await mkShipment(so0175, [['5D08-D', 8000]], 'DISPATCHED',
    { dispatchedAt: at(0, 2), etaAt: at(-0.5), progress: 0.18, lat: 18.55, lng: 73.79 });
  const shp6D14 = await mkShipment(so0179, [['2A55-C', 1500], ['6C90-A', 900]], 'DELIVERED',
    { cold: true, dispatchedAt: at(3, 6), etaAt: at(3, 1), deliveredAt: at(3), progress: 1, temp: 4.6 });

  // ─── Excursions (mockup `excursions`) ─────────────────────────────────────
  // Severity follows the §6.1 rules the detector applies at runtime, so seeded
  // history and live detection agree.
  const excSpec = [
    [shp8F2A, at(0, 12, 18), at(0, 11, 37), 8.4, 12.4, 41, 'MAJOR'],
    [shp8F31, at(1, 12, 16), at(1, 11, 40), 8.2, 11.9, 36, 'MAJOR'],
    [shp6D14, at(3, 16, 49), at(3, 16, 41), 8.1, 8.9, 8, 'MINOR'],
  ];
  for (const [s, start, end, min, max, dur, sev] of excSpec) {
    await prisma.excursion.create({
      data: { shipmentId: s.id, startedAt: start, endedAt: end, minTempC: min, maxTempC: max, durationMin: dur, severity: sev },
    });
    await prisma.shipment.update({ where: { id: s.id }, data: { excursionCount: { increment: 1 } } });
  }

  // A CRITICAL one, still open, on a shipment that was rejected in full.
  const shp4B77 = await mkShipment(so0175, [['3F12-A', 480]], 'EXCEPTION',
    { cold: true, dispatchedAt: at(7, 10), progress: 0.88, lat: 19.4, lng: 72.9, temp: 19.1 });
  await prisma.excursion.create({
    data: { shipmentId: shp4B77.id, startedAt: at(7, 8), endedAt: null, minTempC: 8.6, maxTempC: 19.1, durationMin: 94, severity: 'CRITICAL' },
  });
  await prisma.shipment.update({ where: { id: shp4B77.id }, data: { excursionCount: 1 } });

  // ─── Telemetry for the in-flight cold-chain shipment ──────────────────────
  // Enough points to make the chart legible, with the excursion visible in the
  // series so the graph and the Excursion row tell the same story.
  const pts = [];
  for (let i = 0; i < 90; i++) {
    const t = new Date(at(0, 13).getTime() + i * 60_000);
    // in band, then a sustained breach around i=40..58, then recovery
    const temp = i < 40 ? 4.6 + Math.sin(i / 6) * 0.5
      : i < 58 ? 8.6 + (i - 40) * 0.22 + Math.sin(i / 3) * 0.3
        : 6.4 - Math.min(1.6, (i - 58) * 0.09);
    pts.push({
      shipmentId: shp8F2A.id, ts: t,
      lat: 18.52 + i * 0.0026, lng: 73.85 - i * 0.005,
      tempC: Number(temp.toFixed(2)), source: 'SIMULATED', deviceId: 'sim-01',
    });
  }
  await prisma.telemetryPoint.createMany({ data: pts });

  // ─── Complaints (mockup `complaints`) ─────────────────────────────────────
  const complaintSpec = [
    [shp8F2A, '4C19-A', inst.sion, 'TEMP_DAMAGE', 'Insulin vials cloudy on arrival; 2 condition photos attached.', 'INVESTIGATING', 'LOGISTICS', 2, at(0, 3)],
    [shp8F31, '9B31-A', inst.kurla, 'TEMP_DAMAGE', 'Oxytocin carton warm to touch at the dock.', 'OPEN', null, 1, at(1, 2)],
    [null, '5D08-D', inst.sion, 'QTY_MISMATCH', '40 strips short against the manifest.', 'INVESTIGATING', 'LOGISTICS', 0, at(2)],
    [shp4B77, '77E2-B', inst.thane, 'SEAL_TAMPERED', 'Outer seal broken on two cartons; stock replaced.', 'RESOLVED', 'QC', 3, at(6)],
    [null, '3F12-A', inst.kalyan, 'NEAR_EXPIRY', 'Rabies vaccine delivered with under 4 months of shelf life.', 'OPEN', 'QC', 0, at(4)],
  ];
  for (const [ship, bcode, institution, cat, desc, status, team, photos, filed] of complaintSpec) {
    await prisma.complaint.create({
      data: {
        shipmentId: ship?.id ?? null, batchId: B[bcode].id, institutionId: institution.id,
        category: cat, description: desc, status, assignedTeam: team, filedAt: filed,
        photoUrls: Array.from({ length: photos }, (_, i) => `https://example.invalid/evidence/${bcode}-${i + 1}.jpg`),
      },
    });
  }

  // ─── Consumption history (§10: trend + seasonality + noise) ───────────────
  // Thirty months, not twelve. LightGBM needs ~18 usable rows after lag
  // construction (the longest lag is 12), so a 12-month series can only ever
  // fall back to a rolling mean. Thirty months lets the trained path actually
  // engage and gives the seasonal term two full cycles to learn from. Deliberately not clean: §10 warns
  // that a too-tidy generator makes every downstream feature look fake.
  const months = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(now - (29 - i) * 30 * DAY);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const profiles = [
    // [institution, drug, base, monthly growth, seasonal amplitude, closing stock]
    [inst.sion, 'ors', 300, 28, 0.18, 95],       // rising hard + thin cover -> the risk story
    [inst.sion, 'paracetamol', 9000, 120, 0.10, 14000],
    [inst.kurla, 'ors', 180, 6, 0.22, 900],
    [inst.kurla, 'insulin', 260, 4, 0.05, 210],
    [inst.govandi, 'ors', 120, 9, 0.25, 140],    // small facility, rising
    [inst.kalyan, 'amox', 5200, -40, 0.12, 9800],
    [inst.thane, 'paracetamol', 6400, 30, 0.09, 11000],
    [inst.palghar, 'insulin', 90, 2, 0.06, 40],  // thin cover
  ];

  for (const [institution, dkey, base, growth, amp, closing] of profiles) {
    for (let i = 0; i < months.length; i++) {
      // seasonal peak mid-monsoon + reporting noise
      const seasonal = 1 + amp * Math.sin(((i + 5) / 12) * 2 * Math.PI);
      const noise = 0.94 + ((i * 37) % 13) / 100;
      const dispensed = Math.max(0, Math.round((base + growth * i) * seasonal * noise));
      await prisma.consumptionFeed.create({
        data: {
          institutionId: institution.id, drugId: drug[dkey].id, periodMonth: months[i],
          opening: Math.round(dispensed * 1.2), received: Math.round(dispensed * 1.05),
          dispensed,
          closing: i === months.length - 1 ? closing : Math.round(dispensed * 0.9),
          receivedAt: new Date(now - (months.length - 1 - i) * 30 * DAY),
        },
      });
    }
  }

  const counts = {
    drugs: await prisma.drug.count(),
    institutions: await prisma.institution.count(),
    batches: await prisma.batch.count(),
    qc: await prisma.qCRecord.count(),
    orders: await prisma.supplyOrder.count(),
    shipments: await prisma.shipment.count(),
    excursions: await prisma.excursion.count(),
    telemetry: await prisma.telemetryPoint.count(),
    complaints: await prisma.complaint.count(),
    consumption: await prisma.consumptionFeed.count(),
  };
  console.log('seeded vayu schema:');
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(14)} ${v}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
