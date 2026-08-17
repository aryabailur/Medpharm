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

type Order = {
  id: string;
  institution: string;
  lines: number;
  value: string;
  age: string;
  status: 'PENDING' | 'APPROVED' | 'PARTIAL' | 'REJECTED';
  ageHours: number;
};

const mockOrders: Order[] = [
  { id: 'O-2841', institution: 'Jaipur Institute', lines: 12, value: '₹2.8L', age: '4h', status: 'PENDING', ageHours: 4 },
  { id: 'O-2829', institution: 'Bhopal Referral', lines: 9, value: '₹1.9L', age: '2h', status: 'PENDING', ageHours: 2 },
  { id: 'O-2801', institution: 'Nagpur Supply', lines: 5, value: '₹1.1L', age: '16h', status: 'APPROVED', ageHours: 16 },
  { id: 'O-2799', institution: 'Delhi Central', lines: 18, value: '₹3.2L', age: '24h', status: 'PARTIAL', ageHours: 24 },
  { id: 'O-2788', institution: 'Mumbai Metro', lines: 3, value: '₹0.6L', age: '48h', status: 'REJECTED', ageHours: 48 },
];

const statusColors: Record<Order['status'], string> = {
  PENDING: '#EAB308',
  APPROVED: '#22C55E',
  PARTIAL: '#F97316',
  REJECTED: '#EF4444',
};

type OrderRow = Order;

function OrderRow({ order, onPress }: { order: OrderRow; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.orderRow, pressed && { backgroundColor: '#F8FAFC' }]}>
      <View style={styles.orderCell}>
        <Text style={styles.cellLabel}>Order ID</Text>
        <Text style={styles.cellValue}>{order.id}</Text>
      </View>
      <View style={styles.orderCell}>
        <Text style={styles.cellLabel}>Institution</Text>
        <Text style={styles.cellValue}>{order.institution}</Text>
        <Text style={styles.cellSubtext}>{order.lines} lines</Text>
      </View>
      <View style={styles.orderCell}>
        <Text style={styles.cellLabel}>Value</Text>
        <Text style={styles.cellValue}>{order.value}</Text>
      </View>
      <View style={styles.orderCell}>
        <Text style={styles.cellLabel}>Age</Text>
        <Text style={styles.cellValue}>{order.age}</Text>
      </View>
      <View style={styles.orderCell}>
        <Text style={styles.cellLabel}>Status</Text>
        <View style={[styles.statusBadge, { backgroundColor: statusColors[order.status] }]}>
          <Text style={styles.statusText}>{order.status}</Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function VayuOrdersScreen({ onBack }: { onBack: () => void }) {
  const [searchText, setSearchText] = useState('');
  const [filterStatus, setFilterStatus] = useState<Order['status'] | 'ALL'>('ALL');

  const filteredOrders = useMemo(() => {
    return mockOrders.filter((order) => {
      const matchesSearch =
        order.id.toLowerCase().includes(searchText.toLowerCase()) ||
        order.institution.toLowerCase().includes(searchText.toLowerCase());
      const matchesStatus = filterStatus === 'ALL' || order.status === filterStatus;
      return matchesSearch && matchesStatus;
    });
  }, [searchText, filterStatus]);

  const statusTabs = ['ALL', 'PENDING', 'APPROVED', 'PARTIAL', 'REJECTED'] as const;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#EAF2FF" />

      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </Pressable>
        <View>
          <Text style={styles.headerTitle}>Approval Queue</Text>
          <Text style={styles.headerSubtitle}>Vayu • Manufacturer</Text>
        </View>
      </View>

      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by order ID or institution…"
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
              {status}
            </Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={filteredOrders}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <OrderRow order={item} onPress={() => {}} />}
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
  searchBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
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
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: '#F5F7FA',
  },
  filterTab: {
    borderWidth: 1,
    borderColor: '#D8E1EC',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#FFFFFF',
  },
  filterTabActive: {
    backgroundColor: '#EAF2FF',
    borderColor: '#1F6FEB',
  },
  filterTabText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#526274',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  filterTabTextActive: {
    color: '#1F6FEB',
  },
  listContent: {
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  orderRow: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    marginHorizontal: 8,
    marginVertical: 6,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  orderCell: {
    marginBottom: 10,
  },
  cellLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: '#64748B',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  cellValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.3,
  },
  cellSubtext: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 4,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
});
