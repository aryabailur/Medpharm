/**
 * Cross-app identity resolution.
 *
 * ARCHITECTURE.md §4.1 says neither app invents an ID — it only echoes one it
 * received. In practice the two schemas were seeded independently, so this app's
 * local `Drug.id` values are its own UUIDs while Vayu's are `DRG004`-style
 * codes, and this app had no idea which `Institution` row it *is* in Vayu's
 * network. The UI papered over that with the literal string `'self'`, which Vayu
 * rejected on its foreign key — every outbound `complaint.file` event failed
 * while `order.place` events that happened to carry a real id succeeded.
 *
 * Resolution belongs HERE, at the boundary, not in the browser: the frontend
 * must never guess a foreign id, and a UI that sends `'self'` is not wrong so
 * much as unresolved. Both helpers below translate a local reference into the
 * identity Vayu actually stores, immediately before the event is enqueued.
 */

import { prisma } from './prisma.js';

/**
 * Which Institution this deployment is, as Vayu knows it.
 *
 * Configured, never inferred — a wrong guess here would file another
 * institution's complaints under our name. `'self'` is accepted as an alias for
 * "whatever the env says" so existing callers keep working.
 */
export function selfInstitutionId(): string {
  const id = process.env.SELF_INSTITUTION_ID?.trim();
  if (!id) {
    throw new Error(
      'SELF_INSTITUTION_ID is not set — this server cannot tell Vayu which institution it is',
    );
  }
  return id;
}

/** Treats the UI's `'self'` placeholder (and empty string) as "use config". */
export function resolveInstitutionId(incoming: string | undefined | null): string {
  const v = (incoming ?? '').trim();
  if (!v || v.toLowerCase() === 'self') return selfInstitutionId();
  return v;
}

/** Strips packaging noise so "Amoxicillin 500 mg" can match "Amoxicillin 500mg Capsule". */
function normalise(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(tablet|tab|capsule|cap|injection|inj|vial|syrup|suspension|sachet|iu|ml|mg|g)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Map a local drug reference to Vayu's drug id.
 *
 * A local UUID means nothing to Vayu, so we look the row up here and match on
 * the shared vocabulary — NLEM code first (authoritative), then a normalised
 * name. Anything already shaped like a Vayu code (`DRG###`) passes straight
 * through, so a caller that legitimately echoes a Vayu id is untouched.
 *
 * Returns `null` when no confident match exists. The caller must drop that line
 * and say so — inventing a plausible id would file an order for the wrong drug,
 * which is worse than a short order.
 */
export async function resolveDrugIdsForVayu(
  localDrugIds: string[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const needsLookup: string[] = [];

  for (const id of localDrugIds) {
    if (/^DRG\d+$/i.test(id)) out.set(id, id.toUpperCase());
    else needsLookup.push(id);
  }
  if (needsLookup.length === 0) return out;

  const locals = await prisma.drug.findMany({
    where: { id: { in: needsLookup } },
    select: { id: true, name: true, genericName: true, nlemCode: true },
  });

  for (const l of locals) {
    // NLEM code is the shared vocabulary both catalogues were built from.
    const code = l.nlemCode?.trim();
    const viaCode = code && /^DRG\d+$/i.test(code) ? code.toUpperCase() : null;
    out.set(l.id, viaCode ?? nameMatch(l.name, l.genericName));
  }
  // Anything we never found locally stays unresolved rather than guessed.
  for (const id of needsLookup) if (!out.has(id)) out.set(id, null);
  return out;
}

/**
 * Vayu's catalogue, cached for the process.
 *
 * It is a small, slow-changing table (55 rows) and this runs on the order path,
 * so re-fetching it per request would be pure latency.
 */
let vayuCatalogue: Array<{ id: string; name: string }> | null = null;
let vayuCatalogueAt = 0;
const CATALOGUE_TTL_MS = 5 * 60_000;

export async function primeVayuCatalogue(fetchImpl = fetch): Promise<void> {
  if (vayuCatalogue && Date.now() - vayuCatalogueAt < CATALOGUE_TTL_MS) return;
  const base = process.env.VAYU_API_URL ?? 'http://localhost:4000';
  try {
    const res = await fetchImpl(`${base}/api/catalog?take=200`);
    if (!res.ok) return;
    const json = (await res.json()) as { items?: Array<{ id: string; name: string }> };
    if (json.items?.length) {
      vayuCatalogue = json.items.map((d) => ({ id: d.id, name: d.name }));
      vayuCatalogueAt = Date.now();
    }
  } catch {
    // Offline is fine — callers fall back to leaving the line unresolved.
  }
}

function nameMatch(name: string, generic: string | null): string | null {
  if (!vayuCatalogue) return null;
  const candidates = [name, generic].filter((s): s is string => !!s).map(normalise);
  for (const want of candidates) {
    if (!want) continue;
    const exact = vayuCatalogue.find((d) => normalise(d.name) === want);
    if (exact) return exact.id;
  }
  // Fall back to a containment match, longest-first so the most specific
  // catalogue entry wins over a broader one.
  for (const want of candidates) {
    if (!want) continue;
    const hits = vayuCatalogue
      .map((d) => ({ d, n: normalise(d.name) }))
      .filter((x) => x.n.includes(want) || want.includes(x.n))
      .sort((a, b) => b.n.length - a.n.length);
    if (hits[0]) return hits[0].d.id;
  }
  return null;
}
