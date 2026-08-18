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
import { getInventory, reorder, type InventoryRow } from '../../lib/api';

type StockStatus = 'critical' | 'low' | 'expiring' | 'ok';

const STATUS_COLORS: Record<StockStatus, string> = {
  critical: '#EF4444',
  low: '#F59E0B',
  expiring: '#1F6FEB',
  ok: '#22C55E',
};
const STATUS_LABELS: Record<StockStatus, string> = {
  critical: 'Out of stock',
  low: 'Low stock',
  expiring: 'Expiring',
  ok: 'In stock',
};

function getStatus(row: InventoryRow): StockStatus {
  if (row.qtyOnHand === 0) return 'critical';
  if (row.daysToExpiry != null && row.daysToExpiry <= 30) return 'expiring';
  if (row.lowStock) return 'low';
  return 'ok';
}

function InventoryCard({ row, onReorder }: { row: InventoryRow; onReorder: () => void }) {
  const status = getStatus(row);
  const color = STATUS_COLORS[status];
  const pct = row.reorderPoint > 0 ? Math.min(100, (row.qtyOnHand / row.reorderPoint) * 100) : 100;

  return (
    <View style={[styles.card, status !== 'ok' && { borderLeftWidth: 3, borderLeftColor: color }]}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.drugName} numberOfLines={1}>{row.drug.name}</Text>
          <Text style={styles.generic} numberOfLines={1}>{row.drug.genericName ?? row.drug.nlemCode ?? '—'}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: color }]}>
          <Text style={styles.badgeText}>{STATUS_LABELS[status]}</Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>On hand</Text>
          <Text style={[styles.statValue, { color }]}>{row.qtyOnHand.toLocaleString('en-IN')}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Reorder pt</Text>
          <Text style={styles.statValue}>{row.reorderPoint.toLocaleString('en-IN')}</Text>
        </View>
        {row.daysToExpiry != null && (
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Expires in</Text>
            <Text style={[styles.statValue, row.daysToExpiry <= 30 && { color: '#EF4444' }]}>
              {row.daysToExpiry}d
            </Text>
          </View>
        )}
        {row.drug.coldChain && (
          <View style={[styles.badge, { backgroundColor: '#E0F2FE', alignSelf: 'flex-end' }]}>
            <Text style={[styles.badgeText, { color: '#0EA5E9' }]}>2–8 °C</Text>
          </View>
        )}
      </View>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${pct}%` as any, backgroundColor: color }]} />
      </View>

      {status !== 'ok' && (
        <Pressable onPress={onReorder} style={styles.reorderBtn}>
          <Text style={styles.reorderText}>One-tap reorder</Text>
        </Pressable>
      )}
    </View>
  );
}

export default function DhanvantariInventoryScreen({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [reordering, setReordering] = useState<string | null>(null);
  const [reorderMsg, setReorderMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await getInventory('?take=200');
      setItems(res.items);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let list = items;
    if (filter === 'low') list = list.filter(r => r.lowStock);
    else if (filter === 'critical') list = list.filter(r => r.qtyOnHand === 0);
    else if (filter === 'expiring') list = list.filter(r => r.daysToExpiry != null && r.daysToExpiry <= 90);
    else if (filter === 'cold') list = list.filter(r => r.drug.coldChain);
    if (search) list = list.filter(r =>
      r.drug.name.toLowerCase().includes(search.toLowerCase()) ||
      (r.drug.genericName ?? '').toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [items, filter, search]);

  const handleReorder = async (row: InventoryRow) => {
    setReordering(row.id);
    try {
      const res = await reorder({ inventoryId: row.id, institutionId: '', drugRef: row.drugId });
      setReorderMsg(`✓ Ordered ${res.qtyRequested} units of ${res.drug}`);
      setTimeout(() => setReorderMsg(null), 3000);
    } catch (e) { setReorderMsg(`⚠ ${(e as Error).message}`); }
    finally { setReordering(null); }
  };

  const lowCount = items.filter(r => r.lowStock || r.qtyOnHand === 0).length;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF4E5" />
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Inventory</Text>
            <Text style={styles.subtitle}>Dhanvantari · {items.length} SKUs</Text>
          </View>
          {lowCount > 0 && (
            <View style={styles.alertBadge}>
              <Text style={styles.alertText}>{lowCount} need reorder</Text>
            </View>
          )}
        </View>
      </View>

      {reorderMsg && (
        <View style={styles.toast}><Text style={styles.toastText}>{reorderMsg}</Text></View>
      )}

      <TextInput style={styles.search} placeholder="Search drug name…" placeholderTextColor="#94A3B8"
        value={search} onChangeText={setSearch} />

      <View style={styles.filterBar}>
        {[['ALL', 'All'], ['low', 'Low'], ['critical', 'Out'], ['expiring', 'Expiring'], ['cold', 'Cold chain']].map(([v, l]) => (
          <Pressable key={v} onPress={() => setFilter(v)}
            style={[styles.filterTab, filter === v && styles.filterTabActive]}>
            <Text style={[styles.filterText, filter === v && styles.filterTextActive]}>{l}</Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#D97706" size="large" /></View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>⚠ {error}</Text>
          <Pressable onPress={load} style={styles.retryBtn}><Text style={styles.retryText}>Retry</Text></Pressable>
        </View>
      ) : (
        <FlatList data={filtered} keyExtractor={r => r.id}
          renderItem={({ item }) => (
            <InventoryCard row={item} onReorder={() => handleReorder(item)} />
          )}
          contentContainerStyle={styles.list} refreshing={loading} onRefresh={load} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F7FA' },
  header: { backgroundColor: '#FFF4E5', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F5D9A0' },
  backBtn: { alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 8, marginBottom: 8 },
  backText: { fontSize: 14, fontWeight: '700', color: '#D97706' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '800', color: '#111827', letterSpacing: -0.5 },
  subtitle: { fontSize: 12, fontWeight: '700', color: '#475467', textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 },
  alertBadge: { backgroundColor: '#EF4444', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  alertText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  toast: { backgroundColor: '#111827', marginHorizontal: 12, marginTop: 8, borderRadius: 10, padding: 12 },
  toastText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  search: { margin: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#D8E1EC', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#111827' },
  filterBar: { flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingBottom: 10, flexWrap: 'wrap' },
  filterTab: { borderWidth: 1, borderColor: '#D8E1EC', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#fff' },
  filterTabActive: { backgroundColor: '#FFF4E5', borderColor: '#D97706' },
  filterText: { fontSize: 10, fontWeight: '700', color: '#526274', textTransform: 'uppercase', letterSpacing: 0.8 },
  filterTextActive: { color: '#D97706' },
  list: { padding: 8 },
  card: { backgroundColor: '#fff', borderRadius: 14, marginHorizontal: 8, marginVertical: 6, padding: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  drugName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  generic: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, marginLeft: 8, alignSelf: 'flex-start' },
  badgeText: { fontSize: 9, fontWeight: '700', color: '#fff', textTransform: 'uppercase', letterSpacing: 0.8 },
  statsRow: { flexDirection: 'row', gap: 16, marginBottom: 10, flexWrap: 'wrap' },
  stat: {},
  statLabel: { fontSize: 10, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.8 },
  statValue: { fontSize: 16, fontWeight: '700', color: '#111827', marginTop: 2 },
  progressTrack: { height: 4, backgroundColor: '#E2E8F0', borderRadius: 2, overflow: 'hidden', marginBottom: 10 },
  progressFill: { height: 4, borderRadius: 2 },
  reorderBtn: { backgroundColor: '#111827', borderRadius: 10, padding: 10, alignItems: 'center' },
  reorderText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  errorText: { fontSize: 13, color: '#EF4444', textAlign: 'center' },
  retryBtn: { backgroundColor: '#D97706', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  retryText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
