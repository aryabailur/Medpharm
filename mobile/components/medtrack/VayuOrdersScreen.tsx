import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { getVayuOrders, type VayuOrder } from '../../lib/api';

type StatusFilter = 'ALL' | 'PENDING' | 'APPROVED' | 'PARTIAL' | 'REJECTED';

const STATUS_COLORS: Record<string, string> = {
  PENDING: '#EAB308',
  APPROVED: '#22C55E',
  PARTIAL: '#F97316',
  REJECTED: '#EF4444',
};

function fmtAge(placedAt: string): string {
  const diff = Date.now() - new Date(placedAt).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return `${Math.floor(diff / 60000)}m`;
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function OrderCard({ order, onPress }: { order: VayuOrder; onPress: () => void }) {
  const status = order.status;
  const statusColor = STATUS_COLORS[status] ?? '#94A3B8';
  const age = fmtAge(order.placedAt);
  const isOld = Date.now() - new Date(order.placedAt).getTime() > 4 * 3600000;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && { backgroundColor: '#F8FAFC' }]}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.orderId} numberOfLines={1}>
          {order.supplyOrderId.slice(0, 16)}
        </Text>
        <View style={[styles.badge, { backgroundColor: statusColor }]}>
          <Text style={styles.badgeText}>{status}</Text>
        </View>
      </View>
      <Text style={styles.institution} numberOfLines={1}>
        {order.institution?.name ?? 'Unknown institution'}
      </Text>
      <View style={styles.cardFooter}>
        <Text style={styles.meta}>{order.lines.length} line{order.lines.length !== 1 ? 's' : ''}</Text>
        <Text style={[styles.age, isOld && status === 'PENDING' && { color: '#EF4444' }]}>
          {age} ago{isOld && status === 'PENDING' ? ' ⚠' : ''}
        </Text>
      </View>
    </Pressable>
  );
}

export default function VayuOrdersScreen({ onBack }: { onBack: () => void }) {
  const [orders, setOrders] = useState<VayuOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('ALL');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getVayuOrders('?take=100');
      setOrders(res.items);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      const matchSearch =
        o.supplyOrderId.toLowerCase().includes(search.toLowerCase()) ||
        (o.institution?.name ?? '').toLowerCase().includes(search.toLowerCase());
      const matchFilter = filter === 'ALL' || o.status === filter;
      return matchSearch && matchFilter;
    });
  }, [orders, search, filter]);

  const pending = orders.filter((o) => o.status === 'PENDING').length;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#EAF2FF" />

      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Approval Queue</Text>
            <Text style={styles.subtitle}>Vayu · Manufacturer</Text>
          </View>
          {pending > 0 && (
            <View style={styles.pendingBadge}>
              <Text style={styles.pendingText}>{pending} pending</Text>
            </View>
          )}
        </View>
      </View>

      <TextInput
        style={styles.search}
        placeholder="Search order ID or institution…"
        placeholderTextColor="#94A3B8"
        value={search}
        onChangeText={setSearch}
      />

      <View style={styles.filterBar}>
        {(['ALL', 'PENDING', 'APPROVED', 'PARTIAL', 'REJECTED'] as StatusFilter[]).map((s) => (
          <Pressable
            key={s}
            onPress={() => setFilter(s)}
            style={[styles.filterTab, filter === s && styles.filterTabActive]}
          >
            <Text style={[styles.filterText, filter === s && styles.filterTextActive]}>{s}</Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#1F6FEB" size="large" />
          <Text style={styles.loadingText}>Loading orders…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>⚠ {error}</Text>
          <Pressable onPress={load} style={styles.retryBtn}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No orders match this filter.</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <OrderCard order={item} onPress={() => {}} />}
          contentContainerStyle={styles.list}
          refreshing={loading}
          onRefresh={load}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F7FA' },
  header: { backgroundColor: '#EAF2FF', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#D8E1EC' },
  backBtn: { alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 8, marginBottom: 8 },
  backText: { fontSize: 14, fontWeight: '700', color: '#1F6FEB' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '800', color: '#111827', letterSpacing: -0.5 },
  subtitle: { fontSize: 12, fontWeight: '700', color: '#475467', textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 },
  pendingBadge: { backgroundColor: '#EAB308', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  pendingText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  search: { margin: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#D8E1EC', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#111827' },
  filterBar: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 10, flexWrap: 'wrap' },
  filterTab: { borderWidth: 1, borderColor: '#D8E1EC', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#fff' },
  filterTabActive: { backgroundColor: '#EAF2FF', borderColor: '#1F6FEB' },
  filterText: { fontSize: 10, fontWeight: '700', color: '#526274', textTransform: 'uppercase', letterSpacing: 0.8 },
  filterTextActive: { color: '#1F6FEB' },
  list: { padding: 8 },
  card: { backgroundColor: '#fff', borderRadius: 14, marginHorizontal: 8, marginVertical: 6, padding: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  orderId: { fontSize: 13, fontWeight: '700', color: '#111827', fontFamily: 'monospace', flex: 1 },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, marginLeft: 8 },
  badgeText: { fontSize: 9, fontWeight: '700', color: '#fff', textTransform: 'uppercase', letterSpacing: 0.8 },
  institution: { fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 8 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between' },
  meta: { fontSize: 12, color: '#6B7280' },
  age: { fontSize: 12, color: '#6B7280', fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  loadingText: { fontSize: 14, color: '#94A3B8', marginTop: 8 },
  errorText: { fontSize: 13, color: '#EF4444', textAlign: 'center' },
  retryBtn: { backgroundColor: '#1F6FEB', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  retryText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  emptyText: { fontSize: 14, color: '#94A3B8' },
});
