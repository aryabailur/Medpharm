import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type Drug = {
  id: string;
  name: string;
  unitPrice: number;
  onHand: number;
  reorderPoint: number;
  daysToExpiry: number;
};

const mockDrugs: Drug[] = [
  { id: 'D-001', name: 'Paracetamol 500mg', unitPrice: 12, onHand: 450, reorderPoint: 200, daysToExpiry: 85 },
  { id: 'D-002', name: 'Syringe 5ml', unitPrice: 8, onHand: 12, reorderPoint: 100, daysToExpiry: 365 },
  { id: 'D-003', name: 'IV Fluids 500ml', unitPrice: 45, onHand: 67, reorderPoint: 50, daysToExpiry: 12 },
  { id: 'D-004', name: 'Amoxicillin 500mg', unitPrice: 18, onHand: 0, reorderPoint: 150, daysToExpiry: 120 },
  { id: 'D-005', name: 'Aspirin 100mg', unitPrice: 6, onHand: 280, reorderPoint: 100, daysToExpiry: 45 },
  { id: 'D-006', name: 'Bandages box', unitPrice: 25, onHand: 15, reorderPoint: 30, daysToExpiry: 365 },
];

function getStockStatus(drug: Drug): 'critical' | 'low' | 'expiring' | 'ok' {
  if (drug.onHand === 0) return 'critical';
  if (drug.daysToExpiry < 30) return 'expiring';
  if (drug.onHand < drug.reorderPoint) return 'low';
  return 'ok';
}

const statusColors: Record<ReturnType<typeof getStockStatus>, string> = {
  critical: '#EF4444',
  low: '#F59E0B',
  expiring: '#1F6FEB',
  ok: '#22C55E',
};

const statusLabels: Record<ReturnType<typeof getStockStatus>, string> = {
  critical: 'Out of Stock',
  low: 'Low Stock',
  expiring: 'Expiring Soon',
  ok: 'In Stock',
};

type InventoryRow = Drug;

function InventoryRow({ drug, onPress }: { drug: InventoryRow; onPress: () => void }) {
  const status = getStockStatus(drug);
  const stockValue = drug.onHand * drug.unitPrice;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.inventoryRow, pressed && { backgroundColor: '#FFF9F3' }]}>
      <View style={styles.drugInfo}>
        <Text style={styles.drugId}>{drug.id}</Text>
        <Text style={styles.drugName}>{drug.name}</Text>
        <Text style={styles.drugSubtext}>₹{stockValue.toLocaleString()} on hand</Text>
      </View>

      <View style={styles.stockColumn}>
        <Text style={styles.columnLabel}>Stock</Text>
        <Text style={styles.columnValue}>{drug.onHand}</Text>
        <Text style={styles.columnSubtext}>vs {drug.reorderPoint} reorder</Text>
      </View>

      <View style={styles.expiryColumn}>
        <Text style={styles.columnLabel}>Expiry</Text>
        <Text style={styles.columnValue}>{drug.daysToExpiry}d</Text>
        <Text style={styles.columnSubtext}>until expiry</Text>
      </View>

      <View style={styles.statusColumn}>
        <View style={[styles.statusBadge, { backgroundColor: statusColors[status] }]}>
          <Text style={styles.statusText}>{statusLabels[status]}</Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function DhanvantariInventoryScreen({ onBack }: { onBack: () => void }) {
  const [searchText, setSearchText] = useState('');
  const [filterStatus, setFilterStatus] = useState<'ALL' | ReturnType<typeof getStockStatus>>('ALL');

  const filteredDrugs = useMemo(() => {
    return mockDrugs.filter((drug) => {
      const matchesSearch =
        drug.id.toLowerCase().includes(searchText.toLowerCase()) ||
        drug.name.toLowerCase().includes(searchText.toLowerCase());
      const matchesStatus = filterStatus === 'ALL' || getStockStatus(drug) === filterStatus;
      return matchesSearch && matchesStatus;
    });
  }, [searchText, filterStatus]);

  const statusTabs = ['ALL', 'critical', 'low', 'expiring', 'ok'] as const;

  const totalValue = mockDrugs.reduce((sum, d) => sum + d.onHand * d.unitPrice, 0);
  const lowCount = mockDrugs.filter((d) => getStockStatus(d) === 'low').length;
  const expiringCount = mockDrugs.filter((d) => getStockStatus(d) === 'expiring').length;
  const criticalCount = mockDrugs.filter((d) => getStockStatus(d) === 'critical').length;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF4E5" />

      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </Pressable>
        <View>
          <Text style={styles.headerTitle}>Store Inventory</Text>
          <Text style={styles.headerSubtitle}>Dhanvantari • Institution</Text>
        </View>
      </View>

      <View style={styles.kpiBand}>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Stock value</Text>
          <Text style={styles.kpiValue}>₹{(totalValue / 100000).toFixed(1)}L</Text>
          <Text style={styles.kpiSubtext}>{mockDrugs.length} items</Text>
        </View>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Below reorder</Text>
          <Text style={[styles.kpiValue, { color: '#F59E0B' }]}>{lowCount}</Text>
          <Text style={styles.kpiSubtext}>need restock</Text>
        </View>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Expiring soon</Text>
          <Text style={[styles.kpiValue, { color: '#1F6FEB' }]}>{expiringCount}</Text>
          <Text style={styles.kpiSubtext}>within 90d</Text>
        </View>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Out of stock</Text>
          <Text style={[styles.kpiValue, { color: '#EF4444' }]}>{criticalCount}</Text>
          <Text style={styles.kpiSubtext}>urgent</Text>
        </View>
      </View>

      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by drug ID or name…"
          placeholderTextColor="#A0AEC0"
          value={searchText}
          onChangeText={setSearchText}
        />
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
        data={filteredDrugs}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <InventoryRow drug={item} onPress={() => {}} />}
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
  kpiBand: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 12,
    backgroundColor: '#F5F7FA',
  },
  kpiCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
  },
  kpiLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: '#64748B',
    textTransform: 'uppercase',
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#D97706',
    marginTop: 8,
    letterSpacing: -0.3,
  },
  kpiSubtext: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 3,
  },
  searchBar: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
    backgroundColor: '#F5F7FA',
  },
  searchInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D8E1EC',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
  },
  filterBar: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#F5F7FA',
  },
  filterTab: {
    borderWidth: 1,
    borderColor: '#D8E1EC',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
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
  },
  filterTabTextActive: {
    color: '#D97706',
  },
  listContent: {
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  inventoryRow: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    marginHorizontal: 8,
    marginVertical: 6,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    gap: 12,
  },
  drugInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  drugId: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: '#64748B',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  drugName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.2,
  },
  drugSubtext: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 3,
  },
  stockColumn: {
    alignItems: 'center',
    minWidth: 60,
  },
  expiryColumn: {
    alignItems: 'center',
    minWidth: 60,
  },
  statusColumn: {
    justifyContent: 'center',
    minWidth: 100,
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
    letterSpacing: -0.3,
  },
  columnSubtext: {
    fontSize: 9,
    color: '#64748B',
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
  },
});
