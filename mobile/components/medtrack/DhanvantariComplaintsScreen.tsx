import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { getComplaints, type LocalComplaint } from '../../lib/api';

const STATUS_COLORS: Record<string, string> = {
  PENDING_SYNC: '#94A3B8',
  OPEN: '#EAB308',
  INVESTIGATING: '#1F6FEB',
  RESOLVED: '#22C55E',
};

const CATEGORY_COLORS: Record<string, string> = {
  QUALITY: '#8B5CF6',
  TEMP_DAMAGE: '#EF4444',
  QTY_MISMATCH: '#F59E0B',
  PACKAGING: '#0EA5E9',
  LABELLING: '#6B7280',
  OTHER: '#94A3B8',
};

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
}

export default function DhanvantariComplaintsScreen({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<LocalComplaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await getComplaints();
      setItems(res.items);
      if (res.items.length > 0) setSelectedId(res.items[0].id);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const selected = items.find(c => c.id === selectedId) ?? null;
  const open = items.filter(c => c.remoteStatus !== 'RESOLVED').length;
  const withRca = items.filter(c => c.rcaSummary != null).length;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF4E5" />

      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Complaints</Text>
            <Text style={styles.subtitle}>{items.length} total · {open} open</Text>
          </View>
          {withRca > 0 && (
            <View style={styles.rcaBadge}>
              <Text style={styles.rcaText}>{withRca} RCA received</Text>
            </View>
          )}
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#D97706" size="large" /></View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>⚠ {error}</Text>
          <Pressable onPress={load} style={styles.retryBtn}><Text style={styles.retryText}>Retry</Text></Pressable>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}><Text style={styles.emptyText}>No complaints filed yet.</Text></View>
      ) : (
        <View style={styles.split}>
          {/* List */}
          <FlatList
            style={styles.list}
            data={items}
            keyExtractor={c => c.id}
            renderItem={({ item: c }) => {
              const active = c.id === selectedId;
              const catColor = CATEGORY_COLORS[c.category] ?? '#94A3B8';
              const statusColor = STATUS_COLORS[c.remoteStatus ?? 'PENDING_SYNC'] ?? '#94A3B8';
              return (
                <Pressable
                  onPress={() => setSelectedId(c.id)}
                  style={[styles.listItem, active && styles.listItemActive]}
                >
                  <View style={styles.listItemHeader}>
                    <View style={[styles.catBadge, { backgroundColor: catColor }]}>
                      <Text style={styles.catText}>{c.category}</Text>
                    </View>
                    <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                  </View>
                  <Text style={styles.batchRef} numberOfLines={1}>
                    Batch {c.batchId ? c.batchId.slice(0, 10) : '—'}
                  </Text>
                  <Text style={styles.dateText}>{fmtDate(c.filedAt)}</Text>
                </Pressable>
              );
            }}
            refreshing={loading}
            onRefresh={load}
          />

          {/* Detail */}
          {selected && (
            <ScrollView style={styles.detail} contentContainerStyle={styles.detailContent}>
              <Text style={styles.detailTitle}>Detail</Text>
              <View style={styles.row}>
                <View style={[styles.catBadge, { backgroundColor: CATEGORY_COLORS[selected.category] ?? '#94A3B8' }]}>
                  <Text style={styles.catText}>{selected.category}</Text>
                </View>
                <View style={[styles.catBadge, { backgroundColor: STATUS_COLORS[selected.remoteStatus ?? 'PENDING_SYNC'] ?? '#94A3B8' }]}>
                  <Text style={styles.catText}>{selected.remoteStatus ?? 'PENDING'}</Text>
                </View>
              </View>

              <View style={styles.infoGroup}>
                <Text style={styles.infoLabel}>Batch</Text>
                <Text style={styles.infoValue}>{selected.batchId ?? '—'}</Text>
              </View>
              <View style={styles.infoGroup}>
                <Text style={styles.infoLabel}>Shipment</Text>
                <Text style={styles.infoValue}>{selected.shipmentId ?? '—'}</Text>
              </View>
              <View style={styles.infoGroup}>
                <Text style={styles.infoLabel}>Filed</Text>
                <Text style={styles.infoValue}>{fmtDate(selected.filedAt)}</Text>
              </View>
              {selected.description && (
                <View style={styles.infoGroup}>
                  <Text style={styles.infoLabel}>Description</Text>
                  <Text style={styles.descText}>{selected.description}</Text>
                </View>
              )}

              {selected.rcaSummary ? (
                <View style={styles.rcaCard}>
                  <Text style={styles.rcaTitle}>Supplier root cause</Text>
                  <Text style={styles.rcaBody}>{selected.rcaSummary}</Text>
                  <Text style={styles.rcaHint}>Pushed from the supplier over the signed contract.</Text>
                </View>
              ) : (
                <View style={styles.rcaPending}>
                  <Text style={styles.rcaPendingText}>Root-cause analysis pending from supplier</Text>
                </View>
              )}
            </ScrollView>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { backgroundColor: '#FFF4E5', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F5D9A0' },
  backBtn: { alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 8, marginBottom: 8 },
  backText: { fontSize: 14, fontWeight: '700', color: '#D97706' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '800', color: '#111827', letterSpacing: -0.5 },
  subtitle: { fontSize: 12, color: '#475467', textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 },
  rcaBadge: { backgroundColor: '#1F6FEB', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  rcaText: { color: '#fff', fontWeight: '700', fontSize: 11 },
  split: { flex: 1, flexDirection: 'row' },
  list: { width: 180, borderRightWidth: 1, borderRightColor: '#E2E8F0' },
  listItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  listItemActive: { backgroundColor: '#FFF4E5' },
  listItemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  catBadge: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3 },
  catText: { fontSize: 8, fontWeight: '700', color: '#fff', textTransform: 'uppercase', letterSpacing: 0.6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  batchRef: { fontSize: 11, fontWeight: '600', color: '#374151', fontFamily: 'monospace' },
  dateText: { fontSize: 10, color: '#94A3B8', marginTop: 2 },
  detail: { flex: 1 },
  detailContent: { padding: 16, gap: 12 },
  detailTitle: { fontSize: 13, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  infoGroup: { gap: 2 },
  infoLabel: { fontSize: 10, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.8 },
  infoValue: { fontSize: 13, fontWeight: '600', color: '#111827', fontFamily: 'monospace' },
  descText: { fontSize: 13, color: '#374151', lineHeight: 20 },
  rcaCard: { backgroundColor: '#F0F9FF', borderRadius: 12, padding: 14, borderLeftWidth: 3, borderLeftColor: '#0EA5E9', gap: 6 },
  rcaTitle: { fontSize: 12, fontWeight: '700', color: '#0369A1', textTransform: 'uppercase', letterSpacing: 0.8 },
  rcaBody: { fontSize: 13, color: '#0C4A6E', lineHeight: 20 },
  rcaHint: { fontSize: 11, color: '#7DD3FC', marginTop: 4 },
  rcaPending: { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  rcaPendingText: { color: '#94A3B8', fontSize: 13, textAlign: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  errorText: { fontSize: 13, color: '#EF4444', textAlign: 'center' },
  emptyText: { fontSize: 14, color: '#94A3B8' },
  retryBtn: { backgroundColor: '#D97706', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  retryText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
