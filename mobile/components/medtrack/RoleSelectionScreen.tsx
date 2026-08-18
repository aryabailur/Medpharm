import React, { useMemo, useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import VayuOrdersScreen from './VayuOrdersScreen';
import VayuBatchesScreen from './VayuBatchesScreen';
import VayuShipmentsScreen from './VayuShipmentsScreen';
import VayuTelemetryScreen from './VayuTelemetryScreen';
import DhanvantariInventoryScreen from './DhanvantariInventoryScreen';
import DhanvantariExpiryScreen from './DhanvantariExpiryScreen';
import DhanvantariIncomingScreen from './DhanvantariIncomingScreen';
import DhanvantariScanInScreen from './DhanvantariScanInScreen';
import DhanvantariComplaintsScreen from './DhanvantariComplaintsScreen';
import DhanvantariPosScreen from './DhanvantariPosScreen';
import DhanvantariAssistantScreen from './DhanvantariAssistantScreen';

type Role = 'vayu' | 'dhanvantari';
type DashboardTab = 'overview' | 'queue' | 'insights';
type DashboardScreen = 'main' | 'orders' | 'batches' | 'shipments' | 'telemetry' | 'inventory' | 'expiry' | 'incoming' | 'scanin' | 'complaints' | 'pos' | 'assistant';

type RoleConfig = {
  id: Role;
  title: string;
  subtitle: string;
  accent: string;
  accentSoft: string;
  accentDeep: string;
  description: string;
  stats: Array<{ label: string; value: string; detail: string }>;
};

type QueueItem = {
  id: string;
  title: string;
  meta: string;
  value: string;
  status: string;
  color: string;
};

const roleConfig: Record<Role, RoleConfig> = {
  vayu: {
    id: 'vayu',
    title: 'Vayu',
    subtitle: 'Manufacturer / Supplier',
    accent: '#1F6FEB',
    accentSoft: '#EAF2FF',
    accentDeep: '#0E4AA8',
    description: 'Catalog, batch QC, dispatch and shipment intelligence for supplier operations.',
    stats: [
      { label: 'Pending approval', value: '28', detail: 'oldest 5h' },
      { label: 'Shipments in flight', value: '14', detail: '3 on-time risk' },
      { label: 'Open complaints', value: '06', detail: '2 escalated' },
    ],
  },
  dhanvantari: {
    id: 'dhanvantari',
    title: 'Dhanvantari',
    subtitle: 'Institution / Hospital',
    accent: '#D97706',
    accentSoft: '#FFF4E5',
    accentDeep: '#A35B00',
    description: 'Inventory, dispensing, expiry monitoring, and receipt workflows for institution stores.',
    stats: [
      { label: 'Inventory value', value: '₹18.2L', detail: '415 SKUs' },
      { label: 'Expiring soon', value: '42', detail: '7 critical' },
      { label: 'Open complaints', value: '04', detail: '2 pending' },
    ],
  },
};

const quickActions: Record<Role, string[]> = {
  vayu: ['Orders', 'Batches', 'Shipments', 'Telemetry'],
  dhanvantari: ['Inventory', 'Incoming', 'Scan-in', 'Expiry', 'Dispensing', 'Complaints', 'Nidana'],
};

const statusItems: Record<Role, QueueItem[]> = {
  vayu: [
    { id: 'V-204', title: 'Jaipur Institute', meta: '12 SKUs • 4h queued', value: '₹2.8L', status: 'Pending', color: '#EAB308' },
    { id: 'V-198', title: 'Bhopal Referral', meta: '9 SKUs • 2h queued', value: '₹1.9L', status: 'Approved', color: '#22C55E' },
    { id: 'V-153', title: 'Nagpur Supply', meta: '5 SKUs • temperature alert', value: '₹1.1L', status: 'Review', color: '#F97316' },
  ],
  dhanvantari: [
    { id: 'D-902', title: 'Syringe packs', meta: 'Immediate reorder', value: '12 left', status: 'Critical', color: '#EF4444' },
    { id: 'D-860', title: 'Paracetamol 500', meta: '12 days to expiry', value: '84 packs', status: 'Expiry', color: '#F59E0B' },
    { id: 'D-772', title: 'IV Fluids', meta: 'Received this morning', value: '67 packs', status: 'In stock', color: '#22C55E' },
  ],
};

const activityFeed: Record<Role, string[]> = {
  vayu: [
    'Batch L-408 approved for dispatch',
    'Cold-chain alert cleared for Truck 11',
    'New complaint logged from Jaipur depot',
  ],
  dhanvantari: [
    'Receipt batch F-204 scanned at intake',
    'Three stock-out risks flagged in ICU',
    'Expiry review scheduled for 17 packs',
  ],
};

function RoleCard({ config, onSelect }: { config: RoleConfig; onSelect: (role: Role) => void }) {
  return (
    <Pressable
      onPress={() => onSelect(config.id)}
      style={({ pressed }) => [
        styles.roleCard,
        {
          borderColor: config.accent,
          backgroundColor: pressed ? config.accentSoft : '#FFFFFF',
          shadowColor: config.accent,
        },
      ]}
    >
      <View style={[styles.rolePill, { backgroundColor: config.accentSoft, borderColor: config.accent }]}>
        <Text style={[styles.rolePillText, { color: config.accent }]}>{config.title}</Text>
      </View>
      <Text style={styles.roleTitle}>{config.title}</Text>
      <Text style={styles.roleSubtitle}>{config.subtitle}</Text>
      <Text style={styles.roleDescription}>{config.description}</Text>

      <View style={styles.statRow}>
        {config.stats.map((stat) => (
          <View key={stat.label} style={styles.statBox}>
            <Text style={styles.statLabel}>{stat.label}</Text>
            <Text style={styles.statValue}>{stat.value}</Text>
            <Text style={styles.statDetail}>{stat.detail}</Text>
          </View>
        ))}
      </View>
    </Pressable>
  );
}

function DashboardHeader({ config, onBack }: { config: RoleConfig; onBack: () => void }) {
  return (
    <View style={[styles.header, { backgroundColor: config.accentSoft }]}>
      <Pressable onPress={onBack} style={styles.backButton}>
        <Text style={[styles.backButtonText, { color: config.accent }]}>← Back</Text>
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

function DashboardMainScreen({ role, onBack, onNavigate }: { role: Role; onBack: () => void; onNavigate: (screen: DashboardScreen) => void }) {
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
            {quickActions[role].map((action) => {
              const handlePress = () => {
                const nav: Record<string, DashboardScreen> = {
                  // Vayu
                  'Orders': 'orders',
                  'Batches': 'batches',
                  'Shipments': 'shipments',
                  'Telemetry': 'telemetry',
                  // Dhanvantari
                  'Inventory': 'inventory',
                  'Incoming': 'incoming',
                  'Scan-in': 'scanin',
                  'Expiry': 'expiry',
                  'Dispensing': 'pos',
                  'Complaints': 'complaints',
                  'Nidana': 'assistant',
                };
                const screen = nav[action];
                if (screen) onNavigate(screen);
              };
              return (
                <Pressable key={action} onPress={handlePress} style={[styles.quickAction, { borderColor: config.accent }]}>
                  <Text style={[styles.quickActionText, { color: config.accent }]}>{action}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F7FA" />
      <DashboardHeader config={config} onBack={onBack} />

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

export default function RoleSelectionScreen() {
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [currentScreen, setCurrentScreen] = useState<DashboardScreen>('main');

  if (selectedRole) {
    const goMain = () => setCurrentScreen('main');

    // Vayu screens
    if (selectedRole === 'vayu' && currentScreen === 'orders')
      return <VayuOrdersScreen onBack={goMain} />;
    if (selectedRole === 'vayu' && currentScreen === 'batches')
      return <VayuBatchesScreen onBack={goMain} />;
    if (selectedRole === 'vayu' && currentScreen === 'shipments')
      return <VayuShipmentsScreen onBack={goMain} />;
    if (selectedRole === 'vayu' && currentScreen === 'telemetry')
      return <VayuTelemetryScreen onBack={goMain} />;

    // Dhanvantari screens
    if (selectedRole === 'dhanvantari' && currentScreen === 'inventory')
      return <DhanvantariInventoryScreen onBack={goMain} />;
    if (selectedRole === 'dhanvantari' && currentScreen === 'expiry')
      return <DhanvantariExpiryScreen onBack={goMain} />;
    if (selectedRole === 'dhanvantari' && currentScreen === 'incoming')
      return <DhanvantariIncomingScreen onBack={goMain} onNavigateScanIn={() => setCurrentScreen('scanin')} />;
    if (selectedRole === 'dhanvantari' && currentScreen === 'scanin')
      return <DhanvantariScanInScreen onBack={goMain} />;
    if (selectedRole === 'dhanvantari' && currentScreen === 'complaints')
      return <DhanvantariComplaintsScreen onBack={goMain} />;
    if (selectedRole === 'dhanvantari' && currentScreen === 'pos')
      return <DhanvantariPosScreen onBack={goMain} />;
    if (selectedRole === 'dhanvantari' && currentScreen === 'assistant')
      return <DhanvantariAssistantScreen onBack={goMain} />;

    // Dashboard
    return (
      <DashboardMainScreen
        role={selectedRole}
        onBack={() => { setSelectedRole(null); setCurrentScreen('main'); }}
        onNavigate={setCurrentScreen}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F7FA" />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.eyebrow}>MedTrack</Text>
        <Text style={styles.title}>Choose your operational role</Text>
        <Text style={styles.subtitle}>
          Start in the Dhanvantari or Vayu workflow, then continue into the mobile dashboard for that team.
        </Text>

        <View style={styles.cardStack}>
          {(Object.values(roleConfig) as RoleConfig[]).map((config) => (
            <RoleCard key={config.id} config={config} onSelect={setSelectedRole} />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  container: {
    paddingHorizontal: 20,
    paddingTop: 32,
    paddingBottom: 48,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
    color: '#55677A',
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.8,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#445266',
    lineHeight: 22,
    marginBottom: 24,
  },
  cardStack: {
    gap: 18,
  },
  roleCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 18,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 5,
  },
  rolePill: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 14,
  },
  rolePillText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.3,
    textTransform: 'uppercase',
  },
  roleTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.5,
  },
  roleSubtitle: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '600',
    color: '#475467',
  },
  roleDescription: {
    marginTop: 12,
    fontSize: 14,
    lineHeight: 20,
    color: '#55677A',
  },
  statRow: {
    marginTop: 18,
    gap: 10,
  },
  statBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: '#64748B',
    textTransform: 'uppercase',
  },
  statValue: {
    marginTop: 8,
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.5,
  },
  statDetail: {
    marginTop: 4,
    fontSize: 12,
    color: '#64748B',
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
