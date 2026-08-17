/**
 * Seed the `dhanvantari` schema — one institution's stockroom.
 *
 * ARCHITECTURE.md §4.3, §10. Phase 1.
 *
 * This side represents a SINGLE institution (Sion District Hospital). That is
 * the whole point of §7.2's scope rule: the schema holds one facility's data,
 * so the assistant physically cannot read another institution's.
 *
 * The catalogue MIRRORS Vayu's by name and pack size. It is deliberately not
 * FK'd across the boundary (§3.1) — the two are kept aligned by the HTTP
 * contract, not by the database. Names must match or the order loop places
 * orders for drugs the supplier does not recognise.
 *
 * Stock levels are shaped so the demo has something true to find:
 *   - ORS is below reorder point with rising consumption  -> the reorder beat
 *   - Insulin is thin and cold-chain                      -> the excursion beat
 *   - Paracetamol is healthy                              -> a control case
 *   - Two lots are near expiry                            -> stock.expiring (V6)
 *
 * Idempotent: wipes and reseeds rather than duplicating.
 *
 *   node backend/data-gen/seed_dhanvantari.mjs
 *   node backend/data-gen/seed_dhanvantari.mjs --keep
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('../dhanvantari-api/node_modules/.prisma/client');

const prisma = new PrismaClient();
const KEEP = process.argv.includes('--keep');

const DAY = 86_400_000;
const now = Date.now();
const daysFromNow = (n) => new Date(now + n * DAY);
const daysAgo = (n) => new Date(now - n * DAY);

/** Mirrors Vayu's catalogue. Names and pack sizes must match exactly. */
const DRUGS = [
  { key: 'ors',        name: 'ORS Sachet',                generic: 'Oral Rehydration Salts', nlem: 'NLEM-ORS-01', cat: 'Electrolyte',  pack: '21 g sachet',    cold: false, price: 4.5 },
  { key: 'paracetamol',name: 'Paracetamol 500 mg',        generic: 'Paracetamol',            nlem: 'NLEM-PCM-01', cat: 'Analgesic',    pack: '10 x 10 tabs',   cold: false, price: 18 },
  { key: 'amox',       name: 'Amoxicillin 500 mg',        generic: 'Amoxicillin',            nlem: 'NLEM-AMX-01', cat: 'Antibiotic',   pack: '10 x 10 caps',   cold: false, price: 62 },
  { key: 'metformin',  name: 'Metformin 500 mg',          generic: 'Metformin',              nlem: 'NLEM-MET-01', cat: 'Antidiabetic', pack: '10 x 10 tabs',   cold: false, price: 24 },
  { key: 'ceftriaxone',name: 'Ceftriaxone 1 g inj',       generic: 'Ceftriaxone',            nlem: 'NLEM-CFT-01', cat: 'Antibiotic',   pack: '1 g vial',       cold: false, price: 41 },
  { key: 'ringer',     name: 'Ringer Lactate 500 mL',     generic: 'Ringer Lactate',         nlem: 'NLEM-RL-01',  cat: 'IV Fluid',     pack: '500 mL bottle',  cold: false, price: 55 },
  { key: 'adrenaline', name: 'Adrenaline 1 mg/mL',        generic: 'Adrenaline',             nlem: 'NLEM-ADR-01', cat: 'Emergency',    pack: '1 mL amp',       cold: false, price: 12 },
  { key: 'insulin',    name: 'Insulin Glargine 100IU/mL', generic: 'Insulin Glargine',       nlem: 'NLEM-INS-01', cat: 'Hormone',      pack: '10 mL vial',     cold: true,  price: 385 },
  { key: 'oxytocin',   name: 'Oxytocin 5IU/mL',           generic: 'Oxytocin',               nlem: 'NLEM-OXY-01', cat: 'Hormone',      pack: '1 mL amp',       cold: true,  price: 28 },
  { key: 'rabies',     name: 'Rabies Vaccine 2.5IU',      generic: 'Rabies Vaccine',         nlem: 'NLEM-RAB-01', cat: 'Vaccine',      pack: '1 dose vial',    cold: true,  price: 340 },
];

/**
 * [drug, qtyOnHand, reorderPoint, daysToExpiry, location]
 *
 * Cover is the story: ORS and insulin are under their reorder point, so V5
 * flags them and V8 suggests reordering. Two lots expire inside 60 days so V6
 * has something to report.
 */
const STOCK = [
  ['ors',          95,  400, 240, 'Rack A-1'],   // below reorder, rising demand
  ['paracetamol',14000, 6000, 400, 'Rack A-2'],  // healthy control
  ['amox',        9800, 4000,  38, 'Rack A-3'],  // NEAR EXPIRY
  ['metformin',   5200, 3000, 300, 'Rack A-4'],
  ['ceftriaxone',  820, 1200, 180, 'Rack B-1'],  // below reorder
  ['ringer',      2400, 1500, 500, 'Rack B-2'],
  ['adrenaline',   140,  200,  52, 'Rack B-3'],  // below reorder + NEAR EXPIRY
  ['insulin',      210,  400, 210, 'Cold store 1'], // below reorder, cold chain
  ['oxytocin',     640,  300, 160, 'Cold store 1'],
  ['rabies',        40,  100, 130, 'Cold store 2'], // below reorder, cold chain
];

/**
 * Dispensing profile: [drug, dailyBase, dailyGrowthPerDay]
 * 90 days of ledger so V7's month-on-month delta and the risk score's
 * consumption trend both have a real series to read.
 */
const DISPENSE_PROFILE = [
  ['ors',          14, 0.10],  // clearly rising -> drives the risk signal
  ['paracetamol', 120, 0.20],
  ['amox',         40, -0.05],
  ['metformin',    35, 0.02],
  ['ceftriaxone',  12, 0.03],
  ['ringer',       18, 0.00],
  ['adrenaline',    3, 0.01],
  ['insulin',       7, 0.04],
  ['oxytocin',      9, 0.00],
  ['rabies',        2, 0.01],
];

async function wipe() {
  for (const t of [
    'dispense', 'inventory', 'receivedBatch', 'incomingShipment',
    'localComplaint', 'supplierScore', 'outboundEvent', 'processedEvent', 'drug',
  ]) {
    await prisma[t].deleteMany();
  }
}

async function main() {
  if (KEEP && (await prisma.inventory.count()) > 0) {
    console.log('data already present — nothing to do (--keep)');
    return;
  }

  await wipe();

  const drug = {};
  for (const d of DRUGS) {
    drug[d.key] = await prisma.drug.create({
      data: {
        name: d.name, genericName: d.generic, nlemCode: d.nlem,
        category: d.cat, packSize: d.pack, coldChain: d.cold, unitPrice: d.price,
      },
    });
  }

  for (const [key, qty, reorder, expDays, location] of STOCK) {
    await prisma.inventory.create({
      data: {
        drugId: drug[key].id,
        batchRef: null, // set when stock arrives via a scanned shipment
        qtyOnHand: qty,
        reorderPoint: reorder,
        expiryDate: daysFromNow(expDays),
        location,
      },
    });
  }

  // ─── Dispensing ledger — 90 days ─────────────────────────────────────────
  // Weekday-weighted with noise: a flat series would make the trend signal and
  // the forecast look fake (§10).
  const rows = [];
  for (const [key, base, growth] of DISPENSE_PROFILE) {
    for (let d = 89; d >= 0; d--) {
      const date = daysAgo(d);
      const dow = date.getDay();
      const weekday = dow === 0 ? 0.45 : dow === 6 ? 0.7 : 1;   // quiet Sundays
      const noise = 0.82 + ((d * 17) % 37) / 100;
      const qty = Math.max(0, Math.round((base + growth * (89 - d)) * weekday * noise));
      if (qty === 0) continue;
      rows.push({
        drugId: drug[key].id,
        qty,
        dispensedAt: new Date(date.getTime() + 9 * 3_600_000 + (d % 7) * 1_800_000),
        dispensedBy: ['A. Kulkarni', 'S. Pawar', 'R. Menon'][d % 3],
        patientRef: `OPD-${String(10_000 + d * 7 + qty).slice(0, 5)}`,
      });
    }
  }
  await prisma.dispense.createMany({ data: rows });

  // ─── Inbound shipment history ────────────────────────────────────────────
  // Feeds the Supplier Scorecard. Mixed outcomes so the numbers are not all
  // 100% — a scorecard where the supplier is perfect proves nothing.
  const shipments = [
    // [id, status, etaDaysAgo, deliveredDaysAgo, coldChain, anomaly]
    ['SHP-HIST-01', 'DELIVERED', 34, 34, false, false], // on time
    ['SHP-HIST-02', 'DELIVERED', 27, 26, true,  false], // on time, cold
    ['SHP-HIST-03', 'DELIVERED', 20, 18, false, false], // 2 days LATE
    ['SHP-HIST-04', 'DELIVERED', 13, 13, true,  true],  // on time, EXCURSION
    ['SHP-HIST-05', 'DELIVERED',  6,  5, false, false], // on time
    ['SHP-HIST-06', 'IN_TRANSIT', -1, null, true, false], // due tomorrow
  ];

  for (const [id, status, eta, delivered, cold, anomaly] of shipments) {
    await prisma.incomingShipment.create({
      data: {
        id,
        supplyOrderId: `SO-HIST-${id.slice(-2)}`,
        status,
        etaAt: daysFromNow(-eta),
        coldChain: cold,
        anomalyFlag: anomaly,
        ...(delivered != null
          ? { progressPct: 1, lastTempC: cold ? (anomaly ? 12.4 : 5.1) : null }
          : { progressPct: 0.35, lastTempC: cold ? 4.8 : null }),
      },
    });
  }

  // Received batches: one short-count and one rejection, so rejection rate and
  // shortfall are non-zero and the scorecard has something to say.
  //
  // `scannedAt` is the delivery time the scorecard measures against, so it must
  // match each shipment's intent above: SHP-HIST-03 was 2 days late, the rest
  // arrived on or before their ETA.
  //
  // [id, shipmentId, drugRef, expected, received, accepted, scannedDaysAgo]
  const received = [
    ['BT-HIST-01', 'SHP-HIST-01', 'Paracetamol 500 mg',        6000, 6000, true,  34],
    ['BT-HIST-02', 'SHP-HIST-02', 'Insulin Glargine 100IU/mL',  400,  400, true,  27],
    ['BT-HIST-03', 'SHP-HIST-03', 'Amoxicillin 500 mg',        5000, 4960, true,  18], // 2 days LATE (eta 20)
    ['BT-HIST-04', 'SHP-HIST-04', 'Insulin Glargine 100IU/mL',  300,  300, false, 13], // REJECTED, excursion
    ['BT-HIST-05', 'SHP-HIST-05', 'ORS Sachet',                4000, 4000, true,   6],
  ];
  for (const [id, shipmentId, drugRef, expected, got, accepted, scannedDaysAgo] of received) {
    await prisma.receivedBatch.create({
      data: {
        id, incomingShipmentId: shipmentId, drugRef,
        qtyExpected: expected, qtyReceived: got, accepted,
        scannedBy: 'A. Kulkarni',
        scannedAt: daysAgo(scannedDaysAgo),
        conditionPhotoUrls: accepted ? [] : ['https://example.invalid/evidence/BT-HIST-04-1.jpg'],
      },
    });
  }

  // ─── Complaints filed by this institution ────────────────────────────────
  await prisma.localComplaint.create({
    data: {
      batchId: 'BT-HIST-04', shipmentId: 'SHP-HIST-04',
      category: 'TEMP_DAMAGE',
      description: 'Insulin carton warm on arrival; vials cloudy. Full consignment quarantined.',
      photoUrls: ['https://example.invalid/evidence/BT-HIST-04-1.jpg'],
      filedAt: daysAgo(13),
      remoteStatus: 'INVESTIGATING',
      rcaSummary:
        '47-minute excursion peaking at 12.4 °C on the Nashik–Igatpuri segment, coinciding with a transit delay in high ambient temperature.',
    },
  });
  await prisma.localComplaint.create({
    data: {
      batchId: 'BT-HIST-03', shipmentId: 'SHP-HIST-03',
      category: 'QTY_MISMATCH',
      description: '40 capsules short against the manifest.',
      photoUrls: [],
      filedAt: daysAgo(18),
      remoteStatus: 'RESOLVED',
      rcaSummary: 'Miscount at dispatch; credit note issued.',
    },
  });

  const counts = {
    drugs: await prisma.drug.count(),
    inventory: await prisma.inventory.count(),
    dispenses: await prisma.dispense.count(),
    incomingShipments: await prisma.incomingShipment.count(),
    receivedBatches: await prisma.receivedBatch.count(),
    complaints: await prisma.localComplaint.count(),
  };
  console.log('seeded dhanvantari schema:');
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(18)} ${v}`);

  const low = await prisma.inventory.findMany({ include: { drug: true } });
  const below = low.filter((r) => r.qtyOnHand <= r.reorderPoint);
  console.log(`  below reorder      ${below.length} (${below.map((r) => r.drug.name.split(' ')[0]).join(', ')})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
