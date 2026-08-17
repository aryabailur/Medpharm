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

type IncomingShipment = {
  id: string;
  supplier: string;
  orderValue: string;
  items: number;
  eta: string;
  status: 'IN_TRANSIT' | 'AT_DOCK' | 'DELIVERED' | 'DELAYED';
  temperature?: number;
  anomaly: boolean;
};

const mockShipments: IncomingShipment[] = [
  {
    id: 'SHP-4012',
    supplier: 'Vayu Pharma Ltd',
    orderValue: '₹12.5L',
    items: 45,
    eta: '2026-08-19 14:30',
    status: 'IN_TRANSIT',
    temperature: 8.2,
    anomaly: false,
  },
  {
    id: 'SHP-4001',
    supplier: 'Sterling Pharma',
    orderValue: '₹8.3L',
    items: 28,
    eta: '2026-08-19 16:00',
    status: 'AT_DOCK',
    temperature: 9.1,
    anomaly: false,
  },
  {
    id: 'SHP-3998',
    supplier: 'Aurobindo Pharma',
    orderValue: '₹5.6L',
    items: 18,
    eta: '2026-08-19 18:00',
    status: 'IN_TRANSIT',
    temperature: 25.5,
    anomaly: true,
  },
  {
    id: 'SHP-3985',
    supplier: 'Cipla Ltd',
    orderValue: '₹18.2L',
    items: 62,
    eta: '2026-08-21 10:00',
    status: 'DELAYED',
    temperature: 7.8,
    anomaly: false,
  },
  {
    id: 'SHP-3972',
    supplier: 'Lupin Ltd',
    orderValue: '₹9.4L',
    items: 34,
    eta: '2026-08-18 11:00',
    status: 'DELIVERED',
    temperature: 8.0,
    anomaly: false,
  },
];

const statusColors: Record<IncomingShipment['status'], string> = {
  IN_TRANSIT: '#0EA5E9',
  AT_DOCK: '#F59E0B',
  DELIVERED: '#22C55E',
  DELAYED: '#EF4444',
};

const statusLabels: Record<IncomingShipment['status'], string> = {
  IN_TRANSIT: 'In Transit',
  AT_DOCK: 'At Dock',
  DELIVERED: 'Delivered',
  DELAYED: 'Delayed',
};

type ShipmentRow = IncomingShipment;

function ShipmentRow({ shipment, onPress }: { shipment: ShipmentRow; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.shipmentRow, pressed && { backgroundColor: '#FFF9F3' }]}>
      <View style={styles.shipmentLeftColumn}>
        <Text style={styles.shipmentId}>{shipment.id}</Text>
        <Text style={styles.supplierName}>{shipment.supplier}</Text>
        <Text style={styles.orderValue}>{shipment.orderValue}</Text>
      </View>

      <View style={styles.shipmentMiddleColumn}>
        <Text style={styles.columnLabel}>Items</Text>
        <Text style={styles.columnValue}>{shipment.items}</Text>
      </View>

      <View style={styles.shipmentTempColumn}>
        <Text style={styles.columnLabel}>Temp</Text>
        <Text style={[styles.tempValue, shipment.anomaly && { color: '#EF4444' }]}>
          {shipment.temperature}°C
        </Text>
        {shipment.anomaly && <Text style={styles.anomalyWarning}>⚠ Alert</Text>}
      </View>

      <View style={styles.statusColumn}>
        <View style={[styles.statusBadge, { backgroundColor: statusColors[shipment.status] }]}>
          <Text style={styles.statusText}>{statusLabels[shipment.status]}</Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function DhanvantariIncomingScreen({ onBack }: { onBack: () => void }) {
  const [filterStatus, setFilterStatus] = useState<IncomingShipment['status'] | 'ALL'>('ALL');

  const filteredShipments = useMemo(() => {
    return mockShipments.filter((s) => {
      if (filterStatus === 'ALL') return true;
      return s.status === filterStatus;
    });
  }, [filterStatus]);

  const statusTabs = ['ALL', 'IN_TRANSIT', 'AT_DOCK', 'DELIVERED', 'DELAYED'] as const;
  const anomalyCount = mockShipments.filter((s) => s.anomaly).length;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF4E5" />

      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </Pressable>
        <View>
          <Text style={styles.headerTitle}>Incoming Shipments</Text>
          <Text style={styles.headerSubtitle}>Dhanvantari • Institution</Text>
        </View>
      </View>

      {anomalyCount > 0 && (
        <View style={styles.alertBanner}>
          <Text style={styles.alertBannerText}>⚠ {anomalyCount} temperature alert(s) detected</Text>
        </View>
      )}

      <View style={styles.filterBar}>
        {statusTabs.map((status) => (
          <Pressable
            key={status}
            onPress={() => setFilterStatus(status)}
            style={[styles.filterTab, filterStatus === status && styles.filterTabActive]}
          >
            <Text style={[styles.filterTabText, filterStatus === status && styles.filterTabTextActive]}>
              {status === 'ALL' ? 'ALL' : statusLabels[status]}
            </Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={filteredShipments}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ShipmentRow shipment={item} onPress={() => {}} />}
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
  alertBanner: {
    backgroundColor: '#FEF3C7',
    borderBottomWidth: 1,
    borderBottomColor: '#EEDCB4',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  alertBannerText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400E',
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
  shipmentRow: {
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
  shipmentLeftColumn: {
    flex: 1,
    justifyContent: 'center',
  },
  shipmentMiddleColumn: {
    alignItems: 'center',
    minWidth: 60,
    justifyContent: 'center',
  },
  shipmentTempColumn: {
    alignItems: 'center',
    minWidth: 70,
    justifyContent: 'center',
  },
  statusColumn: {
    justifyContent: 'center',
    minWidth: 90,
  },
  shipmentId: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.1,
    color: '#64748B',
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  supplierName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.2,
  },
  orderValue: {
    fontSize: 11,
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
    textAlign: 'center',
  },
  tempValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#22C55E',
    textAlign: 'center',
  },
  anomalyWarning: {
    fontSize: 8,
    fontWeight: '700',
    color: '#EF4444',
    marginTop: 2,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    textAlign: 'center',
  },
});
