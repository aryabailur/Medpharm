import React, { useMemo, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Role, roleConfig, quickActions, statusItems, activityFeed } from './roleConfig';

type DashboardTab = 'overview' | 'queue' | 'insights';

function DashboardHeader({ role, onBack }: { role: Role; onBack: () => void }) {
  const config = roleConfig[role];
  return (
    <View style={[styles.header, { backgroundColor: config.accentSoft }]}>
      <Pressable onPress={onBack} style={styles.backButton}>
        <Text style={[styles.backButtonText, { color: config.accent }]}>← Switch role</Text>
      </Pressable>
      <View style={styles.headerContent}>
        <View>
          <Text style={[styles.headerTitle, { color: config.accent }]}>{config.title}</Text>
          <Text style={styles.headerSubtitle}>{config.subtitle}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: config.accent, borderColor: config.accentDeep }]}>
          <Text style={styles.statusBadgeText}>Live</Text>
        </View>
      </View>
    </View>
  );
}

function KpiCard({ label, value, detail, accent }: { label: string; value: string; detail: string; accent: string }) {
  return (
    <View style={styles.kpiCard}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValue, { color: accent }]}>{value}</Text>
      <Text style={styles.kpiDetail}>{detail}</Text>
    </View>
  );
}

export default function RoleDashboard({ role }: { role: Role }) {
  const router = useRouter();
  const config = roleConfig[role];
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');

  const summaryMetrics = useMemo(
    () => [
      {
        label: role === 'vayu' ? 'Pending orders' : 'Inventory stock',
        value: role === 'vayu' ? '28' : '415 SKU',
        detail: role === 'vayu' ? '4 above SLA' : '₹18.2L on hand',
      },
      {
        label: role === 'vayu' ? 'In transit' : 'Low stock',
        value: role === 'vayu' ? '14' : '12 items',
        detail: role === 'vayu' ? '3 temperature alerts' : '5 critical',
      },
      {
        label: role === 'vayu' ? 'Quality checks' : 'Expiring soon',
        value: role === 'vayu' ? '96%' : '42 packs',
        detail: role === 'vayu' ? 'pass rate' : 'within 90d',
      },
    ],
    [role],
  );

  const tabs = role === 'vayu'
    ? [
        { id: 'overview', label: 'Overview' },
        { id: 'queue', label: 'Approval queue' },
        { id: 'insights', label: 'Insights' },
      ]
    : [
        { id: 'overview', label: 'Overview' },
        { id: 'queue', label: 'Watchlist' },
        { id: 'insights', label: 'Trends' },
      ];

  const renderTabContent = () => {
    if (activeTab === 'queue') {
      return (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>{role === 'vayu' ? 'Approval queue' : 'Operational watchlist'}</Text>
          <View style={styles.queueList}>
            {statusItems[role].map((item) => (
              <View key={item.id} style={styles.queueItem}>
                <View style={styles.queueBody}>
                  <Text style={styles.queueId}>{item.id}</Text>
                  <Text style={styles.queueTitle}>{item.title}</Text>
                  <Text style={styles.queueMeta}>{item.meta}</Text>
                </View>
                <View style={styles.queueValueWrap}>
                  <Text style={styles.queueValue}>{item.value}</Text>
                  <View style={[styles.queueStatus, { backgroundColor: item.color }]}>
                    <Text style={styles.queueStatusText}>{item.status}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        </View>
      );
    }

    if (activeTab === 'insights') {
      return (
        <View style={styles.twoColumnLayout}>
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Status</Text>
            {[{ label: 'Last sync', value: '2 min ago' }, { label: 'Active lanes', value: '4' }, { label: 'Escalations', value: '2' }].map((item) => (
              <View key={item.label} style={styles.listRow}>
                <Text style={styles.listLabel}>{item.label}</Text>
                <Text style={styles.listValue}>{item.value}</Text>
              </View>
            ))}
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Alerts</Text>
            {activityFeed[role].map((item) => (
              <View key={item} style={styles.alertRow}>
                <View style={[styles.alertDot, { backgroundColor: config.accent }]} />
                <Text style={styles.alertText}>{item}</Text>
              </View>
            ))}
          </View>
        </View>
      );
    }

    return (
      <>
        <View style={styles.kpiRow}>
          {summaryMetrics.map((item) => (
            <KpiCard key={item.label} label={item.label} value={item.value} detail={item.detail} accent={config.accent} />
          ))}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Quick actions</Text>
          <View style={styles.quickActionGrid}>
            {quickActions[role].map((action) => (
              <Pressable
                key={action.label}
                onPress={() => router.push(`/${role}/${action.route}`)}
                style={[styles.quickAction, { borderColor: config.accent }]}
              >
                <Text style={[styles.quickActionText, { color: config.accent }]}>{action.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F7FA" />
      <DashboardHeader role={role} onBack={() => router.back()} />

      <View style={styles.tabBar}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <Pressable
              key={tab.id}
              onPress={() => setActiveTab(tab.id as DashboardTab)}
              style={[styles.tabButton, isActive && [styles.tabButtonActive, { backgroundColor: config.accentSoft, borderColor: config.accent }]]}
            >
              <Text style={[styles.tabButtonText, isActive && { color: config.accent }]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={styles.dashboardScroll}>{renderTabContent()}</ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backButton: {
    alignSelf: 'flex-start',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginBottom: 10,
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.7,
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475467',
    textTransform: 'uppercase',
    letterSpacing: 1.1,
  },
  statusBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  tabBar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: '#F5F7FA',
  },
  tabButton: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D8E1EC',
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    alignItems: 'center',
  },
  tabButtonActive: {
    borderWidth: 1,
  },
  tabButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#526274',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  dashboardScroll: {
    padding: 16,
    paddingBottom: 28,
    gap: 16,
  },
  kpiRow: {
    gap: 12,
  },
  kpiCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.3,
    color: '#64748B',
    textTransform: 'uppercase',
  },
  kpiValue: {
    marginTop: 12,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.7,
  },
  kpiDetail: {
    marginTop: 6,
    fontSize: 12,
    color: '#64748B',
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 14,
  },
  quickActionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  quickAction: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#F8FAFC',
  },
  quickActionText: {
    fontWeight: '700',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  queueList: {
    gap: 10,
  },
  queueItem: {
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  queueBody: {
    flex: 1,
  },
  queueId: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: '#64748B',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  queueTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  queueMeta: {
    marginTop: 4,
    fontSize: 12,
    color: '#64748B',
  },
  queueValueWrap: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  queueValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  queueStatus: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 6,
  },
  queueStatusText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  twoColumnLayout: {
    gap: 16,
  },
  listRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F7',
  },
  listLabel: {
    fontSize: 13,
    color: '#475467',
  },
  listValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 10,
  },
  alertDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  alertText: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 18,
    flex: 1,
  },
});
