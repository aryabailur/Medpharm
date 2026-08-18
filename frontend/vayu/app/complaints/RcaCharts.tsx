'use client';

/**
 * Root-cause dashboard — deterministic chart data (Prisma aggregation) paired
 * with a short AI-narrated cause + suggestion under each chart (§6.3).
 *
 * The charts render even if `insights` is null (Nidana/Groq unreachable and
 * the caller hasn't resolved yet) — the numbers never depend on the LLM.
 */

import type { RcaCategoryInsight, RcaChartInsight, RcaInsights, RcaSummary } from '../../lib/api';
import { C, FONT, MONO, SERIES, rise } from '../../lib/theme';
import { EmptyState, Panel, PanelTitle, SkeletonRows } from '../../components/ui';
import { BarChart, ColumnChart, PieChart } from '../../components/charts';

function InsightNote({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        font: `400 12px/1.55 ${FONT}`,
        color: C.inkMuted,
        padding: '10px 14px',
        background: C.greyTint,
        borderRadius: 4,
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
      <Panel accent={C.accent}>
        <PanelTitle dot={C.accent}>Root-cause dashboard</PanelTitle>
        <SkeletonRows rows={4} />
      </Panel>
    );
  }
  if (!summary || summary.totalComplaints === 0) {
    return (
      <Panel accent={C.accent}>
        <PanelTitle dot={C.accent}>Root-cause dashboard</PanelTitle>
        <EmptyState title="No complaints yet" hint="Nothing to analyse — the dashboard fills in as complaints are filed." />
      </Panel>
    );
  }

  const byCategoryInsight = new Map<string, RcaCategoryInsight>(
    (insights?.categoryInsights ?? []).map((i) => [i.category, i]),
  );

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ font: `600 11px/1 ${FONT}`, letterSpacing: '.15em', textTransform: 'uppercase', color: C.inkFaint }}>
          Root-cause insight
        </div>
        <div style={{ font: `500 10px/1.2 ${MONO}`, color: C.inkGhost }}>
          {insights ? `narration: ${insights.source}` : loading ? 'narrating…' : ''}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        {/* Complaints by category — pie */}
        <Panel accent={SERIES[0]} delayMs={0} hover>
          <PanelTitle dot={SERIES[0]}>Complaints by category</PanelTitle>
          <div style={{ padding: 16, display: 'flex', gap: 18, alignItems: 'center' }}>
            <PieChart
              size={140}
              data={summary.byCategory.map((c, i) => ({ label: c.category, value: c.count, color: SERIES[i % SERIES.length] }))}
              centre={String(summary.byCategory.reduce((a, c) => a + c.count, 0))}
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
                      background: SERIES[i % SERIES.length],
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
        </Panel>

        {/* Complaints by assigned team — bar */}
        <Panel accent={SERIES[1]} delayMs={40} hover style={{ display: 'flex', flexDirection: 'column' }}>
          <PanelTitle dot={SERIES[1]}>Complaints by assigned team</PanelTitle>
          <div style={{ padding: 16 }}>
            <BarChart
              data={summary.byTeam.map((t, i) => ({ label: t.label, value: t.count, color: SERIES[i % SERIES.length] }))}
            />
          </div>
          <div style={{ padding: '0 16px 16px', marginTop: 'auto' }}>
            <ChartInsightBlock insight={insights?.teamInsight} />
          </div>
        </Panel>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        {/* Excursion severity behind complaints — column chart, status colours */}
        <Panel accent={C.amber} delayMs={80} hover style={{ display: 'flex', flexDirection: 'column' }}>
          <PanelTitle dot={C.amber}>Cold-chain excursions behind complaints</PanelTitle>
          {summary.excursionSeverity.length === 0 ? (
            <EmptyState glyph="⚠" title="No excursion link" hint="No complaint is linked to a temperature excursion." tone={C.amber} />
          ) : (
            <>
              <div style={{ padding: 16 }}>
                <ColumnChart
                  bars={summary.excursionSeverity.map((s) => ({
                    label: s.label,
                    count: s.count,
                    color: s.label === 'CRITICAL' ? C.red : s.label === 'MAJOR' ? C.amber : C.grey,
                  }))}
                />
              </div>
              <div style={{ padding: '0 16px 16px', marginTop: 'auto' }}>
                <ChartInsightBlock insight={insights?.excursionInsight} />
              </div>
            </>
          )}
        </Panel>

        {/* Monthly trend — column chart */}
        <Panel accent={C.accent} delayMs={120} hover style={{ display: 'flex', flexDirection: 'column' }}>
          <PanelTitle dot={C.accent}>Complaint volume, last 6 months</PanelTitle>
          <div style={{ padding: 16 }}>
            <ColumnChart bars={summary.monthlyTrend.map((t) => ({ label: t.label, count: t.count, color: C.accent }))} />
          </div>
          <div style={{ padding: '0 16px 16px', marginTop: 'auto' }}>
            <ChartInsightBlock insight={insights?.trendInsight} />
          </div>
        </Panel>
      </div>
    </div>
  );
}
