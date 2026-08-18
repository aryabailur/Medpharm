import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { getExpiring, type InventoryRow } from '../../lib/api';

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
}

function ExpiryCard({ row }: { row: InventoryRow }) {
  const days = row.daysToExpiry ?? 999;
  const color = days <= 0 ? '#EF4444' : days <= 30 ? '#EF4444' : days <= 60 ? '#F59E0B' : '#1F6FEB';
  const value = row.qtyOnHand * (row.drug.unitPrice ?? 0);

  return (
    <View style={[styles.card, { borderLeftColor: color, borderLeftWidth: 3 }]}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.drugName} numberOfLines={1}>{row.drug.name}</Text>
          <Text style={styles.generic}>{row.drug.genericName ?? '—'}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: color }]}>
          <Text style={styles.badgeText}>{days <= 0 ? 'EXPIRED' : `${days}d`}</Text>
        </View>
      </View>
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Qty on hand</Text>
          <Text style={styles.statValue}>{row.qtyOnHand.toLocaleString('en-IN')}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Expiry</Text>
          <Text style={[styles.statValue, { color }]}>{fmtDate(row.expiryDate)}</Text>
        </View>
        {value > 0 && (
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Value at risk</Text>
            <Text style={[styles.statValue, { color: '#EF4444' }]}>
              ₹{Math.round(value).toLocaleString('en-IN')}
            </Text>
          </View>
        )}
        {row.drug.coldChain && (
          <View style={[styles.badge, { backgroundColor: '#E0F2FE', alignSelf: 'flex-end' }]}>
            <Text style={[styles.badgeText, { color: '#0EA5E9' }]}>2–8 °C</Text>
          </View>
        )}
      </View>
    </View>
  );
}

export default function DhanvantariExpiryScreen({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<InventoryRow[]>([]);
  const [valueAtRisk, setValueAtRisk] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await getExpiring(90);
      setItems(res.items);
      setValueAtRisk(res.valueAtRisk);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const critical = items.filter(r => (r.daysToExpiry ?? 999) <= 30).length;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF4E5" />
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Expiring Stock</Text>
            <Text style={styles.subtitle}>Within 90 days · {items.length} items</Text>
          </View>
          {valueAtRisk > 0 && (
            <View style={styles.valueBadge}>
              <Text style={styles.valueLabel}>Value at risk</Text>
              <Text style={styles.valueAmount}>₹{Math.round(valueAtRisk / 1000)}K</Text>
            </View>
          )}
        </View>
      </View>

      {critical > 0 && (
        <View style={styles.criticalBanner}>
          <Text style={styles.criticalText}>⚠ {critical} item{critical > 1 ? 's' : ''} expire within 30 days</Text>
        </View>
      )}

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#D97706" size="large" /></View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>⚠ {error}</Text>
          <Pressable onPress={load} style={styles.retryBtn}><Text style={styles.retryText}>Retry</Text></Pressable>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}><Text style={styles.emptyText}>Nothing expiring within 90 days.</Text></View>
      ) : (
        <FlatList data={items} keyExtractor={r => r.id}
          renderItem={({ item }) => <ExpiryCard row={item} />}
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
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { fontSize: 24, fontWeight: '800', color: '#111827', letterSpacing: -0.5 },
  subtitle: { fontSize: 12, fontWeight: '700', color: '#475467', textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 },
  valueBadge: { backgroundColor: '#FEE2E2', borderRadius: 10, padding: 8, alignItems: 'flex-end' },
  valueLabel: { fontSize: 9, fontWeight: '700', color: '#DC2626', textTransform: 'uppercase', letterSpacing: 0.8 },
  valueAmount: { fontSize: 16, fontWeight: '800', color: '#DC2626', marginTop: 2 },
  criticalBanner: { backgroundColor: '#FEE2E2', padding: 12, marginHorizontal: 12, marginTop: 8, borderRadius: 10, borderLeftWidth: 3, borderLeftColor: '#EF4444' },
  criticalText: { color: '#DC2626', fontWeight: '700', fontSize: 13 },
  list: { padding: 8 },
  card: { backgroundColor: '#fff', borderRadius: 14, marginHorizontal: 8, marginVertical: 6, padding: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  drugName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  generic: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, marginLeft: 8 },
  badgeText: { fontSize: 9, fontWeight: '700', color: '#fff', textTransform: 'uppercase', letterSpacing: 0.8 },
  statsRow: { flexDirection: 'row', gap: 16, flexWrap: 'wrap' },
  stat: {},
  statLabel: { fontSize: 10, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.8 },
  statValue: { fontSize: 16, fontWeight: '700', color: '#111827', marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  errorText: { fontSize: 13, color: '#EF4444', textAlign: 'center' },
  emptyText: { fontSize: 14, color: '#94A3B8' },
  retryBtn: { backgroundColor: '#D97706', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  retryText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
