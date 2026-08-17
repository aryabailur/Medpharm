/**
 * Seed the `vayu` schema from the MedTrack dataset.
 *
 * ARCHITECTURE.md §10. Phase 1.
 *
 * Replaces the hand-authored mockup seed with a 48-month causally simulated
 * supply chain (2022-08 .. 2026-07): vendors → district warehouses → PHC/CHC/DH.
 *
 * Why that matters: late vendors starve warehouses, starved warehouses
 * short-supply facilities, and short-supplied facilities stock out. Every
 * stockout has a traceable upstream cause, which is exactly what makes the risk
 * drilldown and the assistant's "why" answer honest rather than decorative.
 *
 * TIER MAPPING. The dataset has three tiers; our schema has two parties. Vayu is
 * the network operator, so it holds all of it — the vendors it buys from, the
 * warehouses it runs, and the facilities it supplies. Dhanvantari remains a
 * single facility, seeded separately by seed_dhanvantari.mjs.
 *
 * GROUND TRUTH: `estimated_true_demand` and `unmet_demand` are simulation
 * ground truth. They are loaded for measuring demand censoring but MUST NOT be
 * fed to the forecaster as features — a model trained on them reads the answer.
 * `stockout_days` is derived and is a legitimate feature.
 *
 *   node backend/data-gen/seed_medtrack.mjs
 *   node backend/data-gen/seed_medtrack.mjs --keep
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('../vayu-api/node_modules/.prisma/client');

const prisma = new PrismaClient();
const KEEP = process.argv.includes('--keep');

const DATA_DIR =
  process.env.MEDTRACK_DATA_DIR ??
  'C:/Users/aryab/Downloads/medtrack-datasets/medtrack-datasets/data';

/** Minimal CSV reader — the dataset quotes fields containing commas. */
function readCsv(file) {
  const text = fs.readFileSync(path.join(DATA_DIR, file), 'utf8');
  const lines = text.split(/\r?\n/).filter((l) => l.length);
  const headers = splitRow(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitRow(line);
    const row = {};
    headers.forEach((h, i) => (row[h] = cells[i] ?? ''));
    return row;
  });
}

function splitRow(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

const num = (v) => (v === '' || v == null ? null : Number(v));
const int = (v) => (v === '' || v == null ? null : Math.round(Number(v)));
const bool = (v) => v === 'True' || v === 'true' || v === '1';
const date = (v) => (v ? new Date(v) : null);

/** Dataset facility types → our InstitutionType enum. */
const TYPE_MAP = {
  WAREHOUSE: 'WAREHOUSE',
  DH: 'DISTRICT_HOSPITAL',
  CHC: 'CHC',
  PHC: 'PHC',
};

/** Cold-chain products get a 2–8 °C band; the dataset flags storage per drug. */
function coldChainBand(storage) {
  const cold = /2.*8|cold|refriger/i.test(storage ?? '');
  return cold ? { coldChain: true, minTempC: 2, maxTempC: 8 } : { coldChain: false };
}

async function wipe() {
  for (const t of [
    'diseaseSignal', 'currentStock', 'stockLedger', 'purchaseOrder', 'vendor',
    'excursion', 'telemetryPoint', 'consumptionFeed', 'complaint', 'outboundEvent',
    'processedEvent', 'shipmentBatch', 'shipment', 'qCRecord', 'supplyOrderLine',
    'supplyOrder', 'batch', 'drug', 'institution',
  ]) {
    await prisma[t].deleteMany();
  }
}

async function main() {
  if (KEEP && (await prisma.stockLedger.count()) > 0) {
    console.log('dataset already loaded — nothing to do (--keep)');
    return;
  }
  if (!fs.existsSync(DATA_DIR)) {
    console.error(`dataset not found at ${DATA_DIR}\nSet MEDTRACK_DATA_DIR to override.`);
    process.exitCode = 1;
    return;
  }

  console.log('loading CSVs…');
  const drugs = readCsv('drugs.csv');
  const institutions = readCsv('institutions.csv');
  const vendors = readCsv('vendors.csv');
  const currentStock = readCsv('current_stock.csv');
  const batches = readCsv('stock_batches.csv');
  const ledger = readCsv('stock_ledger.csv');
  const pos = readCsv('purchase_orders.csv');
  const disease = readCsv('disease_signal.csv');
  const complaints = readCsv('complaints.csv');

  await wipe();

  // ─── Catalogue ────────────────────────────────────────────────────────────
  await prisma.drug.createMany({
    data: drugs.map((d) => ({
      id: d.drug_id,
      name: `${d.drug_name}${d.strength ? ' ' + d.strength : ''}`.trim(),
      genericName: d.generic_name || null,
      nlemCode: d.drug_id,
      category: d.nlem_category || null,
      packSize: d.pack_size || null,
      shelfLifeDays: int(d.shelf_life_months) ? int(d.shelf_life_months) * 30 : null,
      form: d.form || null,
      strength: d.strength || null,
      unitCostInr: num(d.unit_cost_inr),
      abcClass: d.abc_class || null,
      seasonalProfile: d.seasonal_profile || null,
      tierMin: d.tier_min || null,
      ...coldChainBand(d.storage),
    })),
  });

  // ─── Network ──────────────────────────────────────────────────────────────
  await prisma.institution.createMany({
    data: institutions.map((i) => ({
      id: i.institution_id,
      name: i.name,
      type: TYPE_MAP[i.type] ?? 'PHC',
      district: i.district_name || null,
      state: i.state || null,
      lat: num(i.latitude),
      lng: num(i.longitude),
      population: int(i.population_served),
      tier: i.tier || null,
      districtId: i.district_id || null,
      block: i.block || null,
      beds: int(i.beds),
      monthlyOpdAvg: int(i.monthly_opd_avg),
      parentInstitutionId: i.parent_institution_id || null,
      hasColdChain: bool(i.has_cold_chain),
      staffCount: int(i.staff_count),
    })),
  });

  await prisma.vendor.createMany({
    data: vendors.map((v) => ({
      id: v.vendor_id,
      name: v.vendor_name,
      reliabilityProfile: v.reliability_profile || null,
      quotedLeadTimeDays: int(v.quoted_lead_time_days),
      gstin: v.gstin || null,
      contactEmail: v.contact_email || null,
      empanelledSince: date(v.empanelled_since),
    })),
  });

  // ─── The big tables ───────────────────────────────────────────────────────
  // createMany in chunks: a single 88k-row insert exhausts the parameter limit.
  const CHUNK = 2000;
  const insertChunked = async (label, rows, model, map) => {
    for (let i = 0; i < rows.length; i += CHUNK) {
      await prisma[model].createMany({ data: rows.slice(i, i + CHUNK).map(map), skipDuplicates: true });
    }
    console.log(`  ${label.padEnd(16)} ${rows.length}`);
  };

  await insertChunked('purchase orders', pos, 'purchaseOrder', (p) => ({
    id: p.po_id,
    poDate: new Date(p.po_date),
    institutionId: p.institution_id,
    districtId: p.district_id || null,
    vendorId: p.vendor_id,
    drugId: p.drug_id,
    qtyOrdered: int(p.qty_ordered) ?? 0,
    unitPriceInr: num(p.unit_price_inr),
    cataloguePriceInr: num(p.catalogue_price_inr),
    priceVariancePct: num(p.price_variance_pct),
    expectedDeliveryDate: date(p.expected_delivery_date),
    actualDeliveryDate: date(p.actual_delivery_date),
    leadTimeDays: int(p.lead_time_days),
    delayDays: int(p.delay_days),
    onTime: bool(p.on_time),
    qtyReceived: int(p.qty_received),
    qtyRejected: int(p.qty_rejected),
    qtyShortSupplied: int(p.qty_short_supplied),
    rejectionReason: p.rejection_reason || null,
    status: p.status || null,
    orderValueInr: num(p.order_value_inr),
  }));

  await insertChunked('stock ledger', ledger, 'stockLedger', (l) => ({
    month: new Date(l.month),
    institutionId: l.institution_id,
    drugId: l.drug_id,
    openingStock: int(l.opening_stock) ?? 0,
    received: int(l.received) ?? 0,
    dispensed: int(l.dispensed) ?? 0,
    expiredDamaged: int(l.expired_damaged) ?? 0,
    closingStock: int(l.closing_stock) ?? 0,
    estimatedTrueDemand: int(l.estimated_true_demand),
    unmetDemand: int(l.unmet_demand),
    stockoutDays: int(l.stockout_days),
    qtyIndentedOrIssued: int(l.qty_indented_or_issued),
  }));

  await insertChunked('current stock', currentStock, 'currentStock', (c) => ({
    institutionId: c.institution_id,
    drugId: c.drug_id,
    quantityOnHand: int(c.quantity_on_hand) ?? 0,
    avgMonthlyConsumption: num(c.avg_monthly_consumption),
    monthsOfStock: num(c.months_of_stock),
    reorderLevel: int(c.reorder_level),
    belowReorder: bool(c.below_reorder),
    asOfMonth: date(c.as_of_month),
  }));

  await insertChunked('disease signal', disease, 'diseaseSignal', (d) => ({
    month: new Date(d.month),
    districtId: d.district_id,
    districtName: d.district_name,
    disease: d.disease,
    cases: int(d.cases) ?? 0,
    incidencePer100k: num(d.incidence_per_100k),
    outbreakFlag: bool(d.outbreak_flag),
    cases3mAvg: num(d.cases_3m_avg),
    trendPctVs3mAvg: num(d.trend_pct_vs_3m_avg),
  }));

  // ─── Batches ──────────────────────────────────────────────────────────────
  // Batch.id is a shared identity (§4.1) so the dataset's batch_id is kept.
  await insertChunked('batches', batches, 'batch', (b) => ({
    id: b.batch_id,
    drugId: b.drug_id,
    lotNumber: b.batch_no,
    mfgDate: new Date(b.mfg_date),
    expiryDate: new Date(b.expiry_date),
    quantity: int(b.quantity) ?? 0,
    qrPayload: `MT|B|${b.batch_id}|${b.batch_no}`,
    status: bool(b.near_expiry_flag) ? 'WAREHOUSED' : 'QC_APPROVED',
  }));

  // ─── Complaints ───────────────────────────────────────────────────────────
  const CATEGORY_MAP = {
    quality: 'BREAKAGE',
    packaging: 'BREAKAGE',
    short_supply: 'QTY_MISMATCH',
    quantity: 'QTY_MISMATCH',
    expiry: 'NEAR_EXPIRY',
    near_expiry: 'NEAR_EXPIRY',
    cold_chain: 'TEMP_DAMAGE',
    temperature: 'TEMP_DAMAGE',
    wrong_item: 'WRONG_ITEM',
    tampered: 'SEAL_TAMPERED',
  };
  await prisma.complaint.createMany({
    data: complaints.map((c) => ({
      institutionId: c.institution_id,
      // Dataset complaints name a drug directly and carry no lot, so drugId is
      // the link. batchId stays null -- inventing a lot to satisfy a relation
      // would be fabricating provenance.
      drugId: c.drug_id || null,
      batchId: null,
      category: CATEGORY_MAP[(c.category ?? '').toLowerCase()] ?? 'BREAKAGE',
      description: c.complaint_text || null,
      photoUrls: [],
      filedAt: new Date(c.reported_date),
      status: bool(c.resolved) ? 'RESOLVED' : 'OPEN',
      assignedTeam: /cold|temp/i.test(c.category ?? '') ? 'QC' : 'LOGISTICS',
    })),
    skipDuplicates: true,
  });

  // ─── Report ───────────────────────────────────────────────────────────────
  const counts = {
    drugs: await prisma.drug.count(),
    institutions: await prisma.institution.count(),
    vendors: await prisma.vendor.count(),
    purchaseOrders: await prisma.purchaseOrder.count(),
    stockLedger: await prisma.stockLedger.count(),
    currentStock: await prisma.currentStock.count(),
    batches: await prisma.batch.count(),
    diseaseSignal: await prisma.diseaseSignal.count(),
    complaints: await prisma.complaint.count(),
  };
  console.log('\nseeded vayu schema from the MedTrack dataset:');
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(16)} ${v}`);

  // Ledger invariant, verified rather than assumed.
  //
  // The dataset README claims `opening + received - dispensed - expired =
  // closing` holds on every one of the 88,224 rows. It does not, quite: 19.4%
  // of rows are off, and EVERY discrepancy is exactly +/-1 (8,533 at -1 and
  // 8,592 at +1). That is independent rounding of float columns in the
  // generator, not corrupted data, so it is harmless for every aggregate we
  // compute. Checked here with a tolerance of 1 so a real break would still
  // surface.
  const sample = await prisma.stockLedger.findMany({ take: 5000 });
  const drift = sample.map(
    (r) => r.openingStock + r.received - r.dispensed - r.expiredDamaged - r.closingStock,
  );
  const exact = drift.filter((d) => d === 0).length;
  const beyondRounding = drift.filter((d) => Math.abs(d) > 1).length;
  console.log(
    `  invariant        ${exact}/5000 exact, ${5000 - exact} off by +/-1 (rounding), ` +
      `${beyondRounding} beyond tolerance${beyondRounding === 0 ? ' — OK' : ' — INVESTIGATE'}`,
  );

  const months = await prisma.stockLedger.aggregate({ _min: { month: true }, _max: { month: true } });
  console.log(
    `  horizon          ${months._min.month?.toISOString().slice(0, 7)} .. ${months._max.month?.toISOString().slice(0, 7)}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
