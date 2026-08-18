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
import { getIncoming, type IncomingShipment } from '../../lib/api';
import { useRouter } from 'expo-router';

const STATUS_COLORS: Record<string, string> = {
  PENDING: '#94A3B8',
  DISPATCHED: '#0EA5E9',
  IN_TRANSIT: '#1F6FEB',
  OUT_FOR_DELIVERY: '#8B5CF6',
  DELIVERED: '#22C55E',
};

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function ShipmentCard({ s, onScanIn }: { s: IncomingShipment; onScanIn: () => void }) {
  const statusColor = STATUS_COLORS[s.status] ?? '#94A3B8';
  const pct = Math.round((s.progressPct ?? 0) * 100);
  const inTransit = !['DELIVERED', 'PENDING'].includes(s.status);

  return (
    <View style={[styles.card, s.anomalyFlag && styles.cardExcursion]}>
      {s.anomalyFlag && (
        <View style={styles.excursionBanner}>
          <Text style={styles.excursionText}>⚠ Cold-chain excursion — inspect before accepting</Text>
        </View>
      )}
      <View style={styles.cardHeader}>
        <Text style={styles.shipId} numberOfLines={1}>{s.id.slice(0, 16)}</Text>
        <View style={[styles.badge, { backgroundColor: s.anomalyFlag ? '#EF4444' : statusColor }]}>
          <Text style={styles.badgeText}>{s.anomalyFlag ? 'EXCURSION' : s.status}</Text>
        </View>
      </View>
      {s.supplyOrderId && <Text style={styles.orderId}>Order {s.supplyOrderId.slice(0, 12)}</Text>}

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${pct}%` as any, backgroundColor: s.anomalyFlag ? '#EF4444' : statusColor }]} />
      </View>

      <View style={styles.metaRow}>
        <Text style={styles.meta}>{s.coldChain ? '❄ Cold chain' : 'Ambient'}</Text>
        {s.lastTempC != null && (
          <Text style={[styles.temp, s.anomalyFlag && { color: '#EF4444' }]}>
            {s.lastTempC.toFixed(1)} °C
          </Text>
        )}
        <Text style={styles.eta}>{s.status === 'DELIVERED' ? 'Delivered' : `ETA ${fmtDate(s.etaAt)}`}</Text>
      </View>

      {inTransit && s.status === 'OUT_FOR_DELIVERY' && (
        <Pressable onPress={onScanIn} style={styles.scanBtn}>
          <Text style={styles.scanText}>📷  Scan-in at dock</Text>
        </Pressable>
      )}
    </View>
  );
}

export default function DhanvantariIncomingScreen({ onBack, onNavigateScanIn }: {
  onBack: () => void;
  onNavigateScanIn?: () => void;
}) {
  const [items, setItems] = useState<IncomingShipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await getIncoming();
      setItems(res.items);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const excursions = items.filter(s => s.anomalyFlag).length;
  const active = items.filter(s => s.status !== 'DELIVERED').length;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF4E5" />
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Incoming</Text>
            <Text style={styles.subtitle}>{active} active shipment{active !== 1 ? 's' : ''}</Text>
          </View>
          {excursions > 0 && (
            <View style={styles.alertBadge}>
              <Text style={styles.alertText}>⚠ {excursions} excursion</Text>
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
        <View style={styles.center}><Text style={styles.emptyText}>No incoming shipments.</Text></View>
      ) : (
        <FlatList data={items} keyExtractor={s => s.id}
          renderItem={({ item }) => (
            <ShipmentCard s={item} onScanIn={() => onNavigateScanIn?.()} />
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
  list: { padding: 8 },
  card: { backgroundColor: '#fff', borderRadius: 14, marginHorizontal: 8, marginVertical: 6, padding: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  cardExcursion: { borderColor: '#FCA5A5', borderLeftWidth: 3, borderLeftColor: '#EF4444' },
  excursionBanner: { backgroundColor: '#FEE2E2', borderRadius: 8, padding: 8, marginBottom: 10 },
  excursionText: { color: '#DC2626', fontWeight: '700', fontSize: 12 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  shipId: { fontSize: 13, fontWeight: '700', color: '#111827', fontFamily: 'monospace', flex: 1 },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, marginLeft: 8 },
  badgeText: { fontSize: 9, fontWeight: '700', color: '#fff', textTransform: 'uppercase', letterSpacing: 0.8 },
  orderId: { fontSize: 11, color: '#94A3B8', fontFamily: 'monospace', marginBottom: 8 },
  progressTrack: { height: 5, backgroundColor: '#E2E8F0', borderRadius: 3, overflow: 'hidden', marginVertical: 8 },
  progressFill: { height: 5, borderRadius: 3 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  meta: { fontSize: 12, color: '#6B7280' },
  temp: { fontSize: 13, fontWeight: '700', color: '#0EA5E9' },
  eta: { fontSize: 12, color: '#6B7280' },
  scanBtn: { backgroundColor: '#111827', borderRadius: 10, padding: 11, alignItems: 'center', marginTop: 10 },
  scanText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  errorText: { fontSize: 13, color: '#EF4444', textAlign: 'center' },
  emptyText: { fontSize: 14, color: '#94A3B8' },
  retryBtn: { backgroundColor: '#D97706', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  retryText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
