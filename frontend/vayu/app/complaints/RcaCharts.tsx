'use client';

/**
 * Root-cause dashboard — deterministic chart data (Prisma aggregation) paired
 * with a short AI-narrated cause + suggestion under each chart (§6.3).
 *
 * The charts render even if `insights` is null (Nidana/Groq unreachable and
 * the caller hasn't resolved yet) — the numbers never depend on the LLM.
 */

import type { RcaCategoryInsight, RcaChartInsight, RcaInsights, RcaSummary } from '../../lib/api';
import { C, FONT, LABEL, MONO, statusColors } from '../../lib/theme';
import { Card, CardTitle, Empty } from '../../components/ui';
import { BarChart, PieChart } from '../../components/charts';

const PALETTE = [C.accent, C.amber, C.red, C.blue, C.green, C.grey];

function InsightNote({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        font: `400 12px/1.55 ${FONT}`,
        color: C.inkMuted,
        padding: '10px 14px',
        background: C.greyTint,
        borderRadius: 3,
      }}
    >
      {children}
    </div>
  );
}

function ChartInsightBlock({ insight }: { insight: RcaChartInsight | undefined }) {
  if (!insight) return <InsightNote>Analysing…</InsightNote>;
  return (
    <InsightNote>
      <div style={{ color: C.ink }}>{insight.cause}</div>
      <div style={{ color: C.accent, marginTop: 4 }}>→ {insight.suggestion}</div>
    </InsightNote>
  );
}

export function RcaDashboard({
  summary,
  insights,
  loading,
}: {
  summary: RcaSummary | null;
  insights: RcaInsights | null;
  loading: boolean;
}) {
  if (loading && !summary) {
    return (
      <Card>
        <Empty>Loading root-cause dashboard…</Empty>
      </Card>
    );
  }
  if (!summary || summary.totalComplaints === 0) {
    return (
      <Card>
        <Empty>No complaints yet — nothing to analyse.</Empty>
      </Card>
    );
  }

  const byCategoryInsight = new Map<string, RcaCategoryInsight>(
    (insights?.categoryInsights ?? []).map((i) => [i.category, i]),
  );

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={LABEL}>Root-cause insight</div>
        <div style={{ font: `500 10px/1.2 ${MONO}`, color: C.inkGhost }}>
          {insights ? `narration: ${insights.source}` : loading ? 'narrating…' : ''}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        {/* Complaints by category — pie */}
        <Card>
          <CardTitle>Complaints by category</CardTitle>
          <div style={{ padding: 16, display: 'flex', gap: 18, alignItems: 'center' }}>
            <PieChart
              size={140}
              data={summary.byCategory.map((c, i) => ({ label: c.category, value: c.count, color: PALETTE[i % PALETTE.length] }))}
            />
          </div>
          <div style={{ display: 'grid', gap: 8, padding: '0 16px 16px' }}>
            {summary.byCategory.map((c, i) => {
              const insight = byCategoryInsight.get(c.category);
              return (
                <div key={c.category} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      background: PALETTE[i % PALETTE.length],
                      marginTop: 5,
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ font: `600 12px/1.3 ${FONT}`, color: C.ink }}>
                      {c.category} <span style={{ color: C.inkGhost, fontWeight: 400 }}>· {c.count} ({c.pct}%)</span>
                    </div>
                    {insight ? (
                      <div style={{ font: `400 11.5px/1.5 ${FONT}`, color: C.inkMuted, marginTop: 2 }}>
                        {insight.cause} <span style={{ color: C.accent }}>→ {insight.suggestion}</span>
                      </div>
                    ) : (
                      <div style={{ font: `400 11.5px/1.5 ${FONT}`, color: C.inkGhost, marginTop: 2 }}>
                        {loading ? 'Analysing…' : '—'}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Complaints by assigned team — bar */}
        <Card style={{ display: 'flex', flexDirection: 'column' }}>
          <CardTitle>Complaints by assigned team</CardTitle>
          <div style={{ padding: 16 }}>
            <BarChart
              data={summary.byTeam.map((t, i) => ({ label: t.label, value: t.count, color: PALETTE[i % PALETTE.length] }))}
            />
          </div>
          <div style={{ padding: '0 16px 16px', marginTop: 'auto' }}>
            <ChartInsightBlock insight={insights?.teamInsight} />
          </div>
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        {/* Excursion severity behind complaints — horizontal bar */}
        <Card style={{ display: 'flex', flexDirection: 'column' }}>
          <CardTitle>Cold-chain excursions behind complaints</CardTitle>
          {summary.excursionSeverity.length === 0 ? (
            <Empty>No complaint is linked to a temperature excursion.</Empty>
          ) : (
            <>
              <div style={{ padding: 16 }}>
                <BarChart
                  horizontal
                  data={summary.excursionSeverity.map((s) => ({ label: s.label, value: s.count, color: statusColors(s.label).color }))}
                />
              </div>
              <div style={{ padding: '0 16px 16px', marginTop: 'auto' }}>
                <ChartInsightBlock insight={insights?.excursionInsight} />
              </div>
            </>
          )}
        </Card>

        {/* Monthly trend — bar */}
        <Card style={{ display: 'flex', flexDirection: 'column' }}>
          <CardTitle>Complaint volume, last 6 months</CardTitle>
          <div style={{ padding: 16 }}>
            <BarChart data={summary.monthlyTrend.map((t) => ({ label: t.label, value: t.count, color: C.accent }))} />
          </div>
          <div style={{ padding: '0 16px 16px', marginTop: 'auto' }}>
            <ChartInsightBlock insight={insights?.trendInsight} />
          </div>
        </Card>
      </div>
    </div>
  );
}
