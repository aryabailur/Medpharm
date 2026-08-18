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
import { getVayuShipments, type VayuShipment } from '../../lib/api';

const STATUS_COLORS: Record<string, string> = {
  PENDING: '#94A3B8',
  PACKED: '#EAB308',
  DISPATCHED: '#0EA5E9',
  IN_TRANSIT: '#1F6FEB',
  OUT_FOR_DELIVERY: '#8B5CF6',
  DELIVERED: '#22C55E',
};

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${Math.min(100, pct)}%` as any, backgroundColor: color }]} />
    </View>
  );
}

function ShipmentCard({ shipment }: { shipment: VayuShipment }) {
  const statusColor = STATUS_COLORS[shipment.status] ?? '#94A3B8';
  const pct = Math.round((shipment.progressPct ?? 0) * 100);
  const tempWarn = shipment.lastTempC != null && (shipment.lastTempC > 8 || shipment.lastTempC < 2);

  return (
    <View style={[styles.card, tempWarn && styles.cardWarn]}>
      <View style={styles.cardHeader}>
        <Text style={styles.shipId} numberOfLines={1}>{shipment.id.slice(0, 16)}</Text>
        <View style={[styles.badge, { backgroundColor: statusColor }]}>
          <Text style={styles.badgeText}>{shipment.status.replace('_', ' ')}</Text>
        </View>
      </View>
      <Text style={styles.institution} numberOfLines={1}>
        {shipment.institution?.name ?? 'Unknown institution'}
      </Text>
      <View style={styles.row}>
        <ProgressBar pct={pct} color={tempWarn ? '#EF4444' : statusColor} />
        <Text style={styles.pctText}>{pct}%</Text>
      </View>
      <View style={styles.metaRow}>
        {shipment.lastTempC != null && (
          <Text style={[styles.temp, tempWarn && { color: '#EF4444' }]}>
            {tempWarn ? '⚠ ' : ''}{shipment.lastTempC.toFixed(1)} °C
          </Text>
        )}
        <Text style={styles.eta}>ETA {fmtDate(shipment.etaAt)}</Text>
      </View>
    </View>
  );
}

export default function VayuShipmentsScreen({ onBack }: { onBack: () => void }) {
  const [shipments, setShipments] = useState<VayuShipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await getVayuShipments('?take=50');
      setShipments(res.items);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const inFlight = shipments.filter(s => !['DELIVERED', 'PENDING'].includes(s.status)).length;
  const alerts = shipments.filter(s => s.lastTempC != null && (s.lastTempC > 8 || s.lastTempC < 2)).length;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#EAF2FF" />
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Shipments</Text>
            <Text style={styles.subtitle}>Vayu · {inFlight} in flight</Text>
          </View>
          {alerts > 0 && (
            <View style={styles.alertBadge}>
              <Text style={styles.alertText}>⚠ {alerts} temp alert{alerts > 1 ? 's' : ''}</Text>
            </View>
          )}
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#1F6FEB" size="large" /></View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>⚠ {error}</Text>
          <Pressable onPress={load} style={styles.retryBtn}><Text style={styles.retryText}>Retry</Text></Pressable>
        </View>
      ) : (
        <FlatList data={shipments} keyExtractor={s => s.id}
          renderItem={({ item }) => <ShipmentCard shipment={item} />}
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
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '800', color: '#111827', letterSpacing: -0.5 },
  subtitle: { fontSize: 12, fontWeight: '700', color: '#475467', textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 },
  alertBadge: { backgroundColor: '#EF4444', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  alertText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  list: { padding: 8 },
  card: { backgroundColor: '#fff', borderRadius: 14, marginHorizontal: 8, marginVertical: 6, padding: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  cardWarn: { borderColor: '#FCA5A5', borderLeftWidth: 3, borderLeftColor: '#EF4444' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  shipId: { fontSize: 13, fontWeight: '700', color: '#111827', fontFamily: 'monospace', flex: 1 },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, marginLeft: 8 },
  badgeText: { fontSize: 9, fontWeight: '700', color: '#fff', textTransform: 'uppercase', letterSpacing: 0.8 },
  institution: { fontSize: 14, color: '#374151', marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  progressTrack: { flex: 1, height: 6, backgroundColor: '#E2E8F0', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },
  pctText: { fontSize: 11, color: '#94A3B8', width: 32, textAlign: 'right' },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between' },
  temp: { fontSize: 13, fontWeight: '700', color: '#0EA5E9' },
  eta: { fontSize: 12, color: '#6B7280' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  errorText: { fontSize: 13, color: '#EF4444', textAlign: 'center' },
  retryBtn: { backgroundColor: '#1F6FEB', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  retryText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
