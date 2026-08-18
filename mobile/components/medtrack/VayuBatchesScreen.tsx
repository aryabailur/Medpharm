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
import { getVayuBatches, type VayuBatch } from '../../lib/api';

const STATUS_COLORS: Record<string, string> = {
  MANUFACTURED: '#94A3B8',
  PENDING_QC: '#EAB308',
  PASSED_QC: '#22C55E',
  FAILED_QC: '#EF4444',
  RELEASED: '#0EA5E9',
  SHIPPED: '#8B5CF6',
};

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
}

function BatchCard({ batch }: { batch: VayuBatch }) {
  const qc = batch.qcRecords[0];
  const statusColor = STATUS_COLORS[batch.status] ?? '#94A3B8';
  const expiryDays = Math.floor((new Date(batch.expiryDate).getTime() - Date.now()) / 86400000);
  const expiryWarn = expiryDays < 90;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.drugName} numberOfLines={1}>{batch.drug.name}</Text>
        <View style={[styles.badge, { backgroundColor: statusColor }]}>
          <Text style={styles.badgeText}>{batch.status.replace('_', ' ')}</Text>
        </View>
      </View>
      <Text style={styles.lotNumber}>{batch.lotNumber}</Text>
      <View style={styles.grid}>
        <View style={styles.gridItem}>
          <Text style={styles.gridLabel}>Quantity</Text>
          <Text style={styles.gridValue}>{batch.quantity.toLocaleString('en-IN')}</Text>
        </View>
        <View style={styles.gridItem}>
          <Text style={styles.gridLabel}>QC Result</Text>
          <Text style={[styles.gridValue, { color: qc?.result === 'FAIL' ? '#EF4444' : '#22C55E' }]}>
            {qc?.result ?? 'Pending'}
          </Text>
        </View>
        <View style={styles.gridItem}>
          <Text style={styles.gridLabel}>Expiry</Text>
          <Text style={[styles.gridValue, expiryWarn && { color: '#EAB308' }]}>
            {fmtDate(batch.expiryDate)}
          </Text>
        </View>
        <View style={styles.gridItem}>
          <Text style={styles.gridLabel}>Cold chain</Text>
          <Text style={[styles.gridValue, { color: batch.drug.coldChain ? '#0EA5E9' : '#94A3B8' }]}>
            {batch.drug.coldChain ? '2–8 °C' : 'Ambient'}
          </Text>
        </View>
      </View>
    </View>
  );
}

export default function VayuBatchesScreen({ onBack }: { onBack: () => void }) {
  const [batches, setBatches] = useState<VayuBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('ALL');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await getVayuBatches('?take=100');
      setBatches(res.items);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const statuses = useMemo(() => ['ALL', ...new Set(batches.map(b => b.status))], [batches]);

  const filtered = useMemo(() =>
    batches.filter(b => {
      const matchSearch = b.drug.name.toLowerCase().includes(search.toLowerCase()) ||
        b.lotNumber.toLowerCase().includes(search.toLowerCase());
      const matchFilter = filter === 'ALL' || b.status === filter;
      return matchSearch && matchFilter;
    }), [batches, search, filter]);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#EAF2FF" />
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>Batch Catalogue</Text>
        <Text style={styles.subtitle}>Vayu · {batches.length} batches</Text>
      </View>

      <TextInput style={styles.search} placeholder="Search drug or lot number…" placeholderTextColor="#94A3B8"
        value={search} onChangeText={setSearch} />

      <View style={styles.filterBar}>
        {statuses.map(s => (
          <Pressable key={s} onPress={() => setFilter(s)}
            style={[styles.filterTab, filter === s && styles.filterTabActive]}>
            <Text style={[styles.filterText, filter === s && styles.filterTextActive]}>
              {s.replace('_', ' ')}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#1F6FEB" size="large" /></View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>⚠ {error}</Text>
          <Pressable onPress={load} style={styles.retryBtn}><Text style={styles.retryText}>Retry</Text></Pressable>
        </View>
      ) : (
        <FlatList data={filtered} keyExtractor={b => b.id}
          renderItem={({ item }) => <BatchCard batch={item} />}
          contentContainerStyle={styles.list} refreshing={loading} onRefresh={load} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F7FA' },
  header: { backgroundColor: '#EAF2FF', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#D8E1EC' },
  backBtn: { alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 8, marginBottom: 8 },
  backText: { fontSize: 14, fontWeight: '700', color: '#1F6FEB' },
  title: { fontSize: 24, fontWeight: '800', color: '#111827', letterSpacing: -0.5 },
  subtitle: { fontSize: 12, fontWeight: '700', color: '#475467', textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 },
  search: { margin: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#D8E1EC', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#111827' },
  filterBar: { flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingBottom: 10, flexWrap: 'wrap' },
  filterTab: { borderWidth: 1, borderColor: '#D8E1EC', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#fff' },
  filterTabActive: { backgroundColor: '#EAF2FF', borderColor: '#1F6FEB' },
  filterText: { fontSize: 10, fontWeight: '700', color: '#526274', textTransform: 'uppercase', letterSpacing: 0.8 },
  filterTextActive: { color: '#1F6FEB' },
  list: { padding: 8 },
  card: { backgroundColor: '#fff', borderRadius: 14, marginHorizontal: 8, marginVertical: 6, padding: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  drugName: { fontSize: 15, fontWeight: '700', color: '#111827', flex: 1 },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, marginLeft: 8 },
  badgeText: { fontSize: 9, fontWeight: '700', color: '#fff', textTransform: 'uppercase', letterSpacing: 0.8 },
  lotNumber: { fontSize: 12, color: '#6B7280', fontFamily: 'monospace', marginBottom: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gridItem: { width: '48%' },
  gridLabel: { fontSize: 10, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 },
  gridValue: { fontSize: 14, fontWeight: '700', color: '#111827' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  errorText: { fontSize: 13, color: '#EF4444', textAlign: 'center' },
  retryBtn: { backgroundColor: '#1F6FEB', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  retryText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
