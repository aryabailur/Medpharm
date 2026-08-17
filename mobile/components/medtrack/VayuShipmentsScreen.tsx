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

type Shipment = {
  id: string;
  institution: string;
  orderValue: string;
  items: number;
  eta: string;
  status: 'PENDING' | 'PACKED' | 'IN_TRANSIT' | 'OUT_FOR_DELIVERY' | 'DELIVERED';
  progress: number;
  carrier: string;
};

const mockShipments: Shipment[] = [
  {
    id: 'SHP-8412',
    institution: 'Apollo Hospitals, Delhi',
    orderValue: '₹18.5L',
    items: 52,
    eta: '2026-08-19 10:30',
    status: 'IN_TRANSIT',
    progress: 65,
    carrier: 'SafeChain Logistics',
  },
  {
    id: 'SHP-8401',
    institution: 'Max Healthcare, Mumbai',
    orderValue: '₹12.2L',
    items: 38,
    eta: '2026-08-19 14:00',
    status: 'PACKED',
    progress: 35,
    carrier: 'MediCold Express',
  },
  {
    id: 'SHP-8388',
    institution: 'Fortis Hospital, Bangalore',
    orderValue: '₹22.8L',
    items: 67,
    eta: '2026-08-20 16:00',
    status: 'IN_TRANSIT',
    progress: 55,
    carrier: 'SafeChain Logistics',
  },
  {
    id: 'SHP-8375',
    institution: 'AIIMS, New Delhi',
    orderValue: '₹35.1L',
    items: 89,
    eta: '2026-08-21 11:00',
    status: 'OUT_FOR_DELIVERY',
    progress: 90,
    carrier: 'Federal Express',
  },
  {
    id: 'SHP-8362',
    institution: 'Manipal Hospital, Pune',
    orderValue: '₹16.4L',
    items: 45,
    eta: '2026-08-18 17:00',
    status: 'DELIVERED',
    progress: 100,
    carrier: 'SafeChain Logistics',
  },
];

const statusColors: Record<Shipment['status'], string> = {
  PENDING: '#64748B',
  PACKED: '#F59E0B',
  IN_TRANSIT: '#0EA5E9',
  OUT_FOR_DELIVERY: '#8B5CF6',
  DELIVERED: '#22C55E',
};

const statusLabels: Record<Shipment['status'], string> = {
  PENDING: 'Pending',
  PACKED: 'Packed',
  IN_TRANSIT: 'In Transit',
  OUT_FOR_DELIVERY: 'Out for Delivery',
  DELIVERED: 'Delivered',
};

type ShipmentRow = Shipment;

function ShipmentRow({ shipment, onPress }: { shipment: ShipmentRow; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.shipmentRow, pressed && { backgroundColor: '#F0F4FF' }]}>
      <View style={styles.shipmentLeftColumn}>
        <Text style={styles.shipmentId}>{shipment.id}</Text>
        <Text style={styles.institutionName}>{shipment.institution}</Text>
        <Text style={styles.carrierInfo}>{shipment.carrier}</Text>
      </View>

      <View style={styles.shipmentMiddleColumn}>
        <Text style={styles.columnLabel}>Items</Text>
        <Text style={styles.columnValue}>{shipment.items}</Text>
      </View>

      <View style={styles.progressColumn}>
        <Text style={styles.columnLabel}>Progress</Text>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${shipment.progress}%`, backgroundColor: statusColors[shipment.status] }]} />
        </View>
        <Text style={styles.progressText}>{shipment.progress}%</Text>
      </View>

      <View style={styles.statusColumn}>
        <View style={[styles.statusBadge, { backgroundColor: statusColors[shipment.status] }]}>
          <Text style={styles.statusText}>{statusLabels[shipment.status]}</Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function VayuShipmentsScreen({ onBack }: { onBack: () => void }) {
  const [filterStatus, setFilterStatus] = useState<Shipment['status'] | 'ALL'>('ALL');

  const filteredShipments = useMemo(() => {
    return mockShipments.filter((s) => {
      if (filterStatus === 'ALL') return true;
      return s.status === filterStatus;
    });
  }, [filterStatus]);

  const statusTabs = ['ALL', 'PENDING', 'PACKED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'] as const;
  const inTransitCount = mockShipments.filter((s) => s.status === 'IN_TRANSIT' || s.status === 'OUT_FOR_DELIVERY').length;
  const deliveredCount = mockShipments.filter((s) => s.status === 'DELIVERED').length;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#EAF2FF" />

      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </Pressable>
        <View>
          <Text style={styles.headerTitle}>Shipments & Tracking</Text>
          <Text style={styles.headerSubtitle}>Vayu • Manufacturer</Text>
        </View>
      </View>

      <View style={styles.shipmentBand}>
        <View style={[styles.shipmentCard, { backgroundColor: '#BFDBFE' }]}>
          <Text style={styles.bandLabel}>In Transit</Text>
          <Text style={[styles.bandValue, { color: '#0EA5E9' }]}>{inTransitCount}</Text>
        </View>
        <View style={[styles.shipmentCard, { backgroundColor: '#DCFCE7' }]}>
          <Text style={styles.bandLabel}>Delivered</Text>
          <Text style={[styles.bandValue, { color: '#22C55E' }]}>{deliveredCount}</Text>
        </View>
      </View>

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
    backgroundColor: '#EAF2FF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#D8E1EC',
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
    color: '#1F6FEB',
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
  shipmentBand: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F5F7FA',
  },
  shipmentCard: {
    flex: 1,
    borderRadius: 14,
    padding: 14,
  },
  bandLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: '#475467',
    textTransform: 'uppercase',
  },
  bandValue: {
    fontSize: 28,
    fontWeight: '800',
    marginTop: 8,
    letterSpacing: -0.5,
  },
  filterBar: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#F5F7FA',
    flexWrap: 'wrap',
  },
  filterTab: {
    flex: 1,
    minWidth: 65,
    borderWidth: 1,
    borderColor: '#D8E1EC',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: '#FFFFFF',
  },
  filterTabActive: {
    backgroundColor: '#EAF2FF',
    borderColor: '#1F6FEB',
  },
  filterTabText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#526274',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    textAlign: 'center',
  },
  filterTabTextActive: {
    color: '#1F6FEB',
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
  progressColumn: {
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
  institutionName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.2,
  },
  carrierInfo: {
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
    textAlign: 'center',
  },
  progressBar: {
    height: 6,
    backgroundColor: '#E2E8F0',
    borderRadius: 3,
    width: 60,
    overflow: 'hidden',
    marginVertical: 4,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#475467',
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusText: {
    fontSize: 8,
    fontWeight: '700',
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    textAlign: 'center',
  },
});
