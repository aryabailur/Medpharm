/**
 * Root-cause analysis for the Complaints + Root Cause tab.
 *
 * ARCHITECTURE.md §6.3. Part 2 (same track as complaints/incoming.ts).
 *
 * GET  /api/complaints/rca-summary  — deterministic chart aggregates + one
 *                                      Groq-narrated cause/suggestion per chart.
 * POST /api/complaints/:id/rca      — single-complaint deep-dive, cached to
 *                                      Complaint.rcaJson (§6.3, echoed to
 *                                      Dhanvantari on status change).
 *
 * Step 1 (this file, before any Nidana call) is a plain Prisma aggregation —
 * no LLM involvement. Step 2 hands that evidence to nidana-client, which
 * calls Groq via Nidana and falls back to a deterministic template if Nidana
 * is unreachable. The tab never breaks because an LLM call failed.
 */

import type { FastifyInstance } from 'fastify';

import { prisma } from '../../lib/prisma.js';
import {
  rcaComplaint,
  rcaInsights,
  type RcaCategoryCount,
  type RcaNamedCount,
} from '../../lib/nidana-client.js';

const DAY_MS = 86_400_000;

export async function complaintRcaRoutes(app: FastifyInstance): Promise<void> {
  app.get('/rca-summary', async () => {
    const complaints = await prisma.complaint.findMany({
      select: {
        id: true,
        category: true,
        assignedTeam: true,
        filedAt: true,
        shipment: { select: { excursions: { select: { severity: true } } } },
      },
    });

    const total = complaints.length;

    // ─── by category (pie chart) ───────────────────────────────────────────
    const categoryCounts = new Map<string, number>();
    for (const c of complaints) categoryCounts.set(c.category, (categoryCounts.get(c.category) ?? 0) + 1);
    const byCategory: RcaCategoryCount[] = [...categoryCounts.entries()]
      .map(([category, count]) => ({ category, count, pct: total ? Math.round((count / total) * 1000) / 10 : 0 }))
      .sort((a, b) => b.count - a.count);

    // ─── by assigned team (bar chart) ──────────────────────────────────────
    const teamCounts = new Map<string, number>();
    for (const c of complaints) {
      const label = c.assignedTeam ?? 'UNASSIGNED';
      teamCounts.set(label, (teamCounts.get(label) ?? 0) + 1);
    }
    const byTeam: RcaNamedCount[] = [...teamCounts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);

    // ─── worst excursion severity per complaint (bar chart) ────────────────
    const severityRank = { CRITICAL: 3, MAJOR: 2, MINOR: 1 } as const;
    const severityCounts = new Map<string, number>();
    for (const c of complaints) {
      const severities = c.shipment?.excursions.map((e) => e.severity) ?? [];
      if (severities.length === 0) continue;
      const worst = severities.reduce((a, b) => (severityRank[b] > severityRank[a] ? b : a));
      severityCounts.set(worst, (severityCounts.get(worst) ?? 0) + 1);
    }
    const excursionSeverity: RcaNamedCount[] = (['CRITICAL', 'MAJOR', 'MINOR'] as const)
      .filter((s) => severityCounts.has(s))
      .map((label) => ({ label, count: severityCounts.get(label)! }));

    // ─── monthly trend, last 6 months (bar chart) ───────────────────────────
    const now = Date.now();
    const months: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now - i * 30 * DAY_MS);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const trendCounts = new Map(months.map((m) => [m, 0]));
    for (const c of complaints) {
      const d = c.filedAt;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (trendCounts.has(key)) trendCounts.set(key, trendCounts.get(key)! + 1);
    }
    const monthlyTrend: RcaNamedCount[] = months.map((label) => ({ label, count: trendCounts.get(label)! }));

    const summary = { totalComplaints: total, byCategory, byTeam, excursionSeverity, monthlyTrend };

    if (total === 0) {
      return { summary, insights: null };
    }

    const insights = await rcaInsights({
      totalComplaints: total,
      byCategory,
      byTeam,
      excursionSeverity,
      monthlyTrend,
    });

    return { summary, insights };
  });

  app.post<{ Params: { id: string } }>('/:id/rca', async (req, reply) => {
    const complaint = await prisma.complaint.findUnique({
      where: { id: req.params.id },
      include: {
        batch: { include: { drug: true } },
        drug: true,
        institution: { select: { name: true, district: true } },
        shipment: { include: { excursions: { orderBy: { startedAt: 'asc' } } } },
      },
    });
    if (!complaint) return reply.code(404).send({ error: 'not_found' });

    // A complaint names a drug directly; the batch/lot is optional detail
    // (only present when the filer scanned a QR).
    const drug = complaint.drug ?? complaint.batch?.drug ?? null;

    const since90d = new Date(Date.now() - 90 * DAY_MS);
    const [sameDrug90d, sameInstitution90d, sameCategory90d] = await Promise.all([
      drug?.id
        ? prisma.complaint.count({
            where: {
              id: { not: complaint.id },
              filedAt: { gte: since90d },
              OR: [{ drugId: drug.id }, { batch: { drugId: drug.id } }],
            },
          })
        : Promise.resolve(0),
      complaint.institutionId
        ? prisma.complaint.count({
            where: { id: { not: complaint.id }, institutionId: complaint.institutionId, filedAt: { gte: since90d } },
          })
        : Promise.resolve(0),
      prisma.complaint.count({
        where: { id: { not: complaint.id }, category: complaint.category, filedAt: { gte: since90d } },
      }),
    ]);

    const result = await rcaComplaint({
      complaint: {
        id: complaint.id,
        category: complaint.category,
        description: complaint.description,
        status: complaint.status,
        filedAt: complaint.filedAt.toISOString(),
      },
      product: drug
        ? {
            name: drug.name,
            coldChain: drug.coldChain,
            minTempC: drug.minTempC,
            maxTempC: drug.maxTempC,
          }
        : {},
      excursions: (complaint.shipment?.excursions ?? []).map((e) => ({
        severity: e.severity,
        minTempC: e.minTempC,
        maxTempC: e.maxTempC,
        durationMin: e.durationMin,
      })),
      shipment: complaint.shipment
        ? {
            status: complaint.shipment.status,
            dispatchedAt: complaint.shipment.dispatchedAt?.toISOString() ?? null,
            deliveredAt: complaint.shipment.deliveredAt?.toISOString() ?? null,
            coldChain: complaint.shipment.coldChain,
            excursionCount: complaint.shipment.excursionCount,
          }
        : {},
      history: { sameDrug90d, sameInstitution90d, sameCategory90d },
    });

    const rcaJson = {
      probable_cause: result.probableCause,
      contributing_pattern: result.contributingPattern,
      recommended_actions: result.recommendedActions,
      source: result.source,
      generatedAt: new Date().toISOString(),
    };

    await prisma.complaint.update({ where: { id: complaint.id }, data: { rcaJson } });

    return rcaJson;
  });
}
