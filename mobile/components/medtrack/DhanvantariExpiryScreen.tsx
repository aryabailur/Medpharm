import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type ExpiryAlert = {
  id: string;
  name: string;
  batchNo: string;
  quantity: number;
  daysToExpiry: number;
  expiryDate: string;
  location: string;
};

const mockExpiryAlerts: ExpiryAlert[] = [
  {
    id: 'E-001',
    name: 'IV Fluids 500ml',
    batchNo: 'IVF-2024-001',
    quantity: 67,
    daysToExpiry: 12,
    expiryDate: '2026-08-30',
    location: 'Cold Storage B',
  },
  {
    id: 'E-002',
    name: 'Aspirin 100mg',
    batchNo: 'ASP-2024-045',
    quantity: 280,
    daysToExpiry: 45,
    expiryDate: '2026-10-02',
    location: 'Shelf 3-A',
  },
  {
    id: 'E-003',
    name: 'Antibiotic cream 50g',
    batchNo: 'ABX-2023-156',
    quantity: 12,
    daysToExpiry: 8,
    expiryDate: '2026-08-26',
    location: 'ICU Cabinet',
  },
  {
    id: 'E-004',
    name: 'Saline solution 1L',
    batchNo: 'SAL-2024-089',
    quantity: 45,
    daysToExpiry: 28,
    expiryDate: '2026-09-15',
    location: 'ER Storage',
  },
  {
    id: 'E-005',
    name: 'Dressing packs',
    batchNo: 'DRS-2024-202',
    quantity: 120,
    daysToExpiry: 3,
    expiryDate: '2026-08-21',
    location: 'OT Prep Room',
  },
];

function getSeverity(daysToExpiry: number): 'critical' | 'urgent' | 'warning' | 'caution' {
  if (daysToExpiry <= 3) return 'critical';
  if (daysToExpiry <= 7) return 'urgent';
  if (daysToExpiry <= 14) return 'warning';
  return 'caution';
}

const severityColors: Record<ReturnType<typeof getSeverity>, string> = {
  critical: '#EF4444',
  urgent: '#F97316',
  warning: '#EAB308',
  caution: '#1F6FEB',
};

const severityLabels: Record<ReturnType<typeof getSeverity>, string> = {
  critical: 'Expires very soon',
  urgent: 'Expires in 7 days',
  warning: 'Expires in 14 days',
  caution: 'Monitor',
};

type AlertRow = ExpiryAlert;

function AlertRow({ alert, onPress }: { alert: AlertRow; onPress: () => void }) {
  const severity = getSeverity(alert.daysToExpiry);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.alertRow, pressed && { backgroundColor: '#FFF9F3' }]}>
      <View style={styles.alertLeftColumn}>
        <Text style={styles.alertId}>{alert.id}</Text>
        <Text style={styles.alertName}>{alert.name}</Text>
        <Text style={styles.alertBatch}>Batch: {alert.batchNo}</Text>
      </View>

      <View style={styles.alertMiddleColumn}>
        <Text style={styles.columnLabel}>Quantity</Text>
        <Text style={styles.columnValue}>{alert.quantity}</Text>
      </View>

      <View style={styles.alertRightColumn}>
        <Text style={styles.columnLabel}>Expiry</Text>
        <Text style={styles.expiryValue}>{alert.daysToExpiry}d</Text>
        <View style={[styles.severityBadge, { backgroundColor: severityColors[severity] }]}>
          <Text style={styles.severityText}>{severityLabels[severity]}</Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function DhanvantariExpiryScreen({ onBack }: { onBack: () => void }) {
  const [filterSeverity, setFilterSeverity] = useState<'ALL' | ReturnType<typeof getSeverity>>('ALL');

  const filteredAlerts = useMemo(() => {
    return mockExpiryAlerts.filter((alert) => {
      if (filterSeverity === 'ALL') return true;
      return getSeverity(alert.daysToExpiry) === filterSeverity;
    });
  }, [filterSeverity]);

  const criticalCount = mockExpiryAlerts.filter((a) => getSeverity(a.daysToExpiry) === 'critical').length;
  const urgentCount = mockExpiryAlerts.filter((a) => getSeverity(a.daysToExpiry) === 'urgent').length;

  const severityTabs = ['ALL', 'critical', 'urgent', 'warning', 'caution'] as const;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF4E5" />

      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </Pressable>
        <View>
          <Text style={styles.headerTitle}>Expiry Alerts</Text>
          <Text style={styles.headerSubtitle}>Dhanvantari • Institution</Text>
        </View>
      </View>

      <View style={styles.alertBand}>
        <View style={[styles.alertBandCard, { borderLeftColor: '#EF4444' }]}>
          <Text style={styles.alertBandLabel}>Expiring now</Text>
          <Text style={[styles.alertBandValue, { color: '#EF4444' }]}>{criticalCount}</Text>
          <Text style={styles.alertBandSubtext}>take action today</Text>
        </View>
        <View style={[styles.alertBandCard, { borderLeftColor: '#F97316' }]}>
          <Text style={styles.alertBandLabel}>Next 7 days</Text>
          <Text style={[styles.alertBandValue, { color: '#F97316' }]}>{urgentCount}</Text>
          <Text style={styles.alertBandSubtext}>expedite consumption</Text>
        </View>
      </View>

      <View style={styles.filterBar}>
        {severityTabs.map((severity) => (
          <Pressable
            key={severity}
            onPress={() => setFilterSeverity(severity)}
            style={[styles.filterTab, filterSeverity === severity && styles.filterTabActive]}
          >
            <Text style={[styles.filterTabText, filterSeverity === severity && styles.filterTabTextActive]}>
              {severity === 'ALL' ? 'ALL' : severityLabels[severity]}
            </Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={filteredAlerts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <AlertRow alert={item} onPress={() => {}} />}
        contentContainerStyle={styles.listContent}
        scrollEnabled={true}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  header: {
    backgroundColor: '#FFF4E5',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#EEDCB4',
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#D97706',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475467',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 4,
  },
  alertBand: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F5F7FA',
  },
  alertBandCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderLeftWidth: 4,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  alertBandLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: '#64748B',
    textTransform: 'uppercase',
  },
  alertBandValue: {
    fontSize: 24,
    fontWeight: '800',
    marginTop: 8,
    letterSpacing: -0.5,
  },
  alertBandSubtext: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 4,
  },
  filterBar: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#F5F7FA',
  },
  filterTab: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D8E1EC',
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 8,
    backgroundColor: '#FFFFFF',
  },
  filterTabActive: {
    backgroundColor: '#FFF4E5',
    borderColor: '#D97706',
  },
  filterTabText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#526274',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    textAlign: 'center',
  },
  filterTabTextActive: {
    color: '#D97706',
  },
  listContent: {
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  alertRow: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    marginHorizontal: 8,
    marginVertical: 6,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    gap: 10,
  },
  alertLeftColumn: {
    flex: 1,
    justifyContent: 'center',
  },
  alertMiddleColumn: {
    alignItems: 'center',
    minWidth: 60,
    justifyContent: 'center',
  },
  alertRightColumn: {
    alignItems: 'center',
    minWidth: 80,
    justifyContent: 'center',
  },
  alertId: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.1,
    color: '#64748B',
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  alertName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.2,
  },
  alertBatch: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 3,
  },
  columnLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.1,
    color: '#64748B',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  columnValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  expiryValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#D97706',
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  severityBadge: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  severityText: {
    fontSize: 8,
    fontWeight: '700',
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    textAlign: 'center',
  },
});
