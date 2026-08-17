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

type Batch = {
  id: string;
  productName: string;
  batchNo: string;
  quantity: number;
  status: 'PENDING_QC' | 'PASSED_QC' | 'FAILED_QC' | 'APPROVED';
  qcDate: string;
  passRate: number;
};

const mockBatches: Batch[] = [
  { id: 'B-1201', productName: 'Paracetamol 500mg', batchNo: 'PAR-2024-045', quantity: 5000, status: 'PENDING_QC', qcDate: '2026-08-18', passRate: 0 },
  { id: 'B-1199', productName: 'Amoxicillin 500mg', batchNo: 'AMX-2024-032', quantity: 2000, status: 'PASSED_QC', qcDate: '2026-08-17', passRate: 98 },
  { id: 'B-1188', productName: 'IV Fluids 500ml', batchNo: 'IVF-2024-008', quantity: 1000, status: 'APPROVED', qcDate: '2026-08-15', passRate: 100 },
  { id: 'B-1175', productName: 'Syringes 5ml', batchNo: 'SYR-2024-156', quantity: 50000, status: 'PASSED_QC', qcDate: '2026-08-14', passRate: 99 },
  { id: 'B-1164', productName: 'Bandage rolls', batchNo: 'BND-2024-089', quantity: 3000, status: 'FAILED_QC', qcDate: '2026-08-12', passRate: 85 },
];

const statusColors: Record<Batch['status'], string> = {
  PENDING_QC: '#EAB308',
  PASSED_QC: '#22C55E',
  FAILED_QC: '#EF4444',
  APPROVED: '#0EA5E9',
};

const statusLabels: Record<Batch['status'], string> = {
  PENDING_QC: 'Pending QC',
  PASSED_QC: 'Passed QC',
  FAILED_QC: 'Failed QC',
  APPROVED: 'Approved',
};

type BatchRow = Batch;

function BatchRow({ batch, onPress }: { batch: BatchRow; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.batchRow, pressed && { backgroundColor: '#F8FAFC' }]}>
      <View style={styles.batchLeftColumn}>
        <Text style={styles.batchId}>{batch.id}</Text>
        <Text style={styles.productName}>{batch.productName}</Text>
        <Text style={styles.batchNo}>Batch {batch.batchNo}</Text>
      </View>

      <View style={styles.batchMiddleColumn}>
        <Text style={styles.columnLabel}>Quantity</Text>
        <Text style={styles.columnValue}>{batch.quantity.toLocaleString()}</Text>
      </View>

      <View style={styles.batchRightColumn}>
        <Text style={styles.columnLabel}>Pass rate</Text>
        <Text style={[styles.columnValue, { color: batch.passRate > 95 ? '#22C55E' : '#F59E0B' }]}>
          {batch.passRate > 0 ? `${batch.passRate}%` : '—'}
        </Text>
      </View>

      <View style={styles.statusColumn}>
        <View style={[styles.statusBadge, { backgroundColor: statusColors[batch.status] }]}>
          <Text style={styles.statusText}>{statusLabels[batch.status]}</Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function VayuBatchesScreen({ onBack }: { onBack: () => void }) {
  const [searchText, setSearchText] = useState('');
  const [filterStatus, setFilterStatus] = useState<Batch['status'] | 'ALL'>('ALL');

  const filteredBatches = useMemo(() => {
    return mockBatches.filter((batch) => {
      const matchesSearch =
        batch.id.toLowerCase().includes(searchText.toLowerCase()) ||
        batch.productName.toLowerCase().includes(searchText.toLowerCase()) ||
        batch.batchNo.toLowerCase().includes(searchText.toLowerCase());
      const matchesStatus = filterStatus === 'ALL' || batch.status === filterStatus;
      return matchesSearch && matchesStatus;
    });
  }, [searchText, filterStatus]);

  const statusTabs = ['ALL', 'PENDING_QC', 'PASSED_QC', 'FAILED_QC', 'APPROVED'] as const;
  const pendingCount = mockBatches.filter((b) => b.status === 'PENDING_QC').length;
  const passedCount = mockBatches.filter((b) => b.status === 'PASSED_QC').length;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#EAF2FF" />

      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </Pressable>
        <View>
          <Text style={styles.headerTitle}>Batches & QC</Text>
          <Text style={styles.headerSubtitle}>Vayu • Manufacturer</Text>
        </View>
      </View>

      <View style={styles.qcBand}>
        <View style={[styles.qcCard, { backgroundColor: '#FEF3C7' }]}>
          <Text style={styles.qcLabel}>Awaiting QC</Text>
          <Text style={[styles.qcValue, { color: '#EAB308' }]}>{pendingCount}</Text>
        </View>
        <View style={[styles.qcCard, { backgroundColor: '#DCFCE7' }]}>
          <Text style={styles.qcLabel}>Passed QC</Text>
          <Text style={[styles.qcValue, { color: '#22C55E' }]}>{passedCount}</Text>
        </View>
      </View>

      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by batch ID or product…"
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
        data={filteredBatches}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <BatchRow batch={item} onPress={() => {}} />}
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
  qcBand: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F5F7FA',
  },
  qcCard: {
    flex: 1,
    borderRadius: 14,
    padding: 14,
  },
  qcLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: '#475467',
    textTransform: 'uppercase',
  },
  qcValue: {
    fontSize: 28,
    fontWeight: '800',
    marginTop: 8,
    letterSpacing: -0.5,
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
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: '#FFFFFF',
  },
  filterTabActive: {
    backgroundColor: '#EAF2FF',
    borderColor: '#1F6FEB',
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
    color: '#1F6FEB',
  },
  listContent: {
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  batchRow: {
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
  batchLeftColumn: {
    flex: 1,
    justifyContent: 'center',
  },
  batchMiddleColumn: {
    alignItems: 'center',
    minWidth: 70,
    justifyContent: 'center',
  },
  batchRightColumn: {
    alignItems: 'center',
    minWidth: 70,
    justifyContent: 'center',
  },
  statusColumn: {
    justifyContent: 'center',
    minWidth: 90,
  },
  batchId: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.1,
    color: '#64748B',
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  productName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.2,
  },
  batchNo: {
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
