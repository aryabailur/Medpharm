import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { getVayuShipments, getTelemetry, type VayuShipment, type TelemetryPoint } from '../../lib/api';

const STATUS_COLORS: Record<string, string> = {
  normal: '#22C55E',
  warning: '#F59E0B',
  critical: '#EF4444',
};

function tempStatus(t: number): 'normal' | 'warning' | 'critical' {
  if (t < 0 || t > 15) return 'critical';
  if (t < 2 || t > 8) return 'warning';
  return 'normal';
}

function MiniSparkline({ points }: { points: TelemetryPoint[] }) {
  if (points.length < 2) return null;
  const temps = points.map(p => p.tempC);
  const min = Math.min(...temps);
  const max = Math.max(...temps);
  const range = max - min || 1;
  const W = 240, H = 60;

  return (
    <View style={[styles.sparklineContainer, { width: W, height: H }]}>
      {/* Band 2–8°C */}
      <View style={[styles.band, {
        bottom: ((2 - min) / range) * H,
        height: (6 / range) * H,
      }]} />
      {points.map((p, i) => {
        if (i === 0) return null;
        const x1 = ((i - 1) / (points.length - 1)) * W;
        const x2 = (i / (points.length - 1)) * W;
        const y1 = H - ((points[i - 1].tempC - min) / range) * H;
        const y2 = H - ((p.tempC - min) / range) * H;
        const status = tempStatus(p.tempC);
        return (
          <View key={i} style={{
            position: 'absolute',
            left: x1,
            top: Math.min(y1, y2),
            width: x2 - x1,
            height: Math.max(2, Math.abs(y2 - y1)),
            backgroundColor: STATUS_COLORS[status],
            opacity: 0.8,
          }} />
        );
      })}
    </View>
  );
}

export default function VayuTelemetryScreen({ onBack }: { onBack: () => void }) {
  const [shipments, setShipments] = useState<VayuShipment[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [points, setPoints] = useState<TelemetryPoint[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingPoints, setLoadingPoints] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadShipments = useCallback(async () => {
    setLoadingList(true); setError(null);
    try {
      const res = await getVayuShipments('?take=20');
      const active = res.items.filter(s => !['DELIVERED', 'PENDING'].includes(s.status));
      setShipments(active.length > 0 ? active : res.items.slice(0, 10));
      if (active.length > 0 && !selectedId) setSelectedId(active[0].id);
    } catch (e) { setError((e as Error).message); }
    finally { setLoadingList(false); }
  }, [selectedId]);

  const loadPoints = useCallback(async (id: string) => {
    setLoadingPoints(true);
    try {
      const res = await getTelemetry(id);
      setPoints(res.points);
    } catch { setPoints([]); }
    finally { setLoadingPoints(false); }
  }, []);

  useEffect(() => { loadShipments(); }, []);
  useEffect(() => { if (selectedId) loadPoints(selectedId); }, [selectedId]);

  const selected = shipments.find(s => s.id === selectedId) ?? null;
  const lastTemp = points.length > 0 ? points[points.length - 1].tempC : selected?.lastTempC ?? null;
  const lastStatus = lastTemp != null ? tempStatus(lastTemp) : 'normal';
  const breaches = points.filter(p => p.tempC < 2 || p.tempC > 8).length;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#EAF2FF" />
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>Telemetry</Text>
        <Text style={styles.subtitle}>Vayu · Cold-chain monitoring</Text>
      </View>

      {loadingList ? (
        <View style={styles.center}><ActivityIndicator color="#1F6FEB" size="large" /></View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>⚠ {error}</Text>
          <Pressable onPress={loadShipments} style={styles.retryBtn}><Text style={styles.retryText}>Retry</Text></Pressable>
        </View>
      ) : (
        <View style={styles.body}>
          {/* Shipment picker */}
          <ScrollView style={styles.sidebar} contentContainerStyle={styles.sidebarContent}>
            <Text style={styles.sidebarLabel}>Select shipment</Text>
            {shipments.map(s => {
              const active = s.id === selectedId;
              const tempC = s.lastTempC;
              const warn = tempC != null && (tempC < 2 || tempC > 8);
              return (
                <Pressable key={s.id} onPress={() => setSelectedId(s.id)}
                  style={[styles.shipItem, active && styles.shipItemActive]}>
                  <Text style={styles.shipId} numberOfLines={1}>{s.id.slice(0, 12)}</Text>
                  {tempC != null && (
                    <Text style={[styles.shipTemp, warn && { color: '#EF4444' }]}>
                      {warn ? '⚠ ' : ''}{tempC.toFixed(1)}°
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Detail */}
          <ScrollView style={styles.detail} contentContainerStyle={styles.detailContent}>
            {!selected ? (
              <View style={styles.center}><Text style={styles.hint}>Select a shipment</Text></View>
            ) : (
              <>
                <View style={styles.kpiRow}>
                  <View style={styles.kpi}>
                    <Text style={styles.kpiLabel}>Last temp</Text>
                    <Text style={[styles.kpiValue, { color: STATUS_COLORS[lastStatus] }]}>
                      {lastTemp != null ? `${lastTemp.toFixed(1)} °C` : '—'}
                    </Text>
                  </View>
                  <View style={styles.kpi}>
                    <Text style={styles.kpiLabel}>Breaches</Text>
                    <Text style={[styles.kpiValue, { color: breaches > 0 ? '#EF4444' : '#22C55E' }]}>
                      {loadingPoints ? '…' : breaches}
                    </Text>
                  </View>
                  <View style={styles.kpi}>
                    <Text style={styles.kpiLabel}>Status</Text>
                    <Text style={[styles.kpiValue, { color: STATUS_COLORS[lastStatus] }]}>
                      {lastStatus.toUpperCase()}
                    </Text>
                  </View>
                </View>

                <View style={styles.sparkCard}>
                  <Text style={styles.sparkLabel}>Temperature trace</Text>
                  {loadingPoints ? (
                    <ActivityIndicator color="#1F6FEB" style={{ marginVertical: 20 }} />
                  ) : points.length > 0 ? (
                    <>
                      <MiniSparkline points={points} />
                      <View style={styles.legendRow}>
                        <View style={styles.legendDot} />
                        <Text style={styles.legendText}>Acceptable band 2–8 °C</Text>
                      </View>
                    </>
                  ) : (
                    <Text style={styles.hint}>No telemetry points recorded yet.</Text>
                  )}
                </View>

                {points.length > 0 && (
                  <View style={styles.logCard}>
                    <Text style={styles.logTitle}>Recent readings</Text>
                    {points.slice(-8).reverse().map((p, i) => {
                      const status = tempStatus(p.tempC);
                      return (
                        <View key={i} style={styles.logRow}>
                          <Text style={styles.logTime}>
                            {new Date(p.ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                          </Text>
                          <Text style={[styles.logTemp, { color: STATUS_COLORS[status] }]}>
                            {p.tempC.toFixed(1)} °C
                          </Text>
                          <Text style={styles.logCoord}>
                            {p.lat.toFixed(2)}, {p.lng.toFixed(2)}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                )}
              </>
            )}
          </ScrollView>
        </View>
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
  body: { flex: 1, flexDirection: 'row' },
  sidebar: { width: 130, borderRightWidth: 1, borderRightColor: '#E2E8F0', backgroundColor: '#fff' },
  sidebarContent: { padding: 8, gap: 4 },
  sidebarLabel: { fontSize: 9, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },
  shipItem: { padding: 10, borderRadius: 8 },
  shipItemActive: { backgroundColor: '#EAF2FF' },
  shipId: { fontSize: 11, fontWeight: '700', color: '#374151', fontFamily: 'monospace' },
  shipTemp: { fontSize: 12, fontWeight: '700', color: '#0EA5E9', marginTop: 3 },
  detail: { flex: 1 },
  detailContent: { padding: 14, gap: 14 },
  kpiRow: { flexDirection: 'row', gap: 8 },
  kpi: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  kpiLabel: { fontSize: 9, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.8 },
  kpiValue: { fontSize: 20, fontWeight: '800', marginTop: 4, letterSpacing: -0.5 },
  sparkCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#E2E8F0', gap: 10 },
  sparkLabel: { fontSize: 11, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.8 },
  sparklineContainer: { position: 'relative', overflow: 'hidden' },
  band: { position: 'absolute', left: 0, right: 0, backgroundColor: '#DCFCE7', opacity: 0.4 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, backgroundColor: '#DCFCE7', borderWidth: 1, borderColor: '#86EFAC', borderRadius: 2 },
  legendText: { fontSize: 11, color: '#94A3B8' },
  logCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  logTitle: { fontSize: 11, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  logRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#F8FAFC' },
  logTime: { fontSize: 11, color: '#94A3B8', fontFamily: 'monospace', width: 50 },
  logTemp: { fontSize: 13, fontWeight: '700' },
  logCoord: { fontSize: 10, color: '#CBD5E1', fontFamily: 'monospace' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  hint: { fontSize: 13, color: '#94A3B8', textAlign: 'center' },
  errorText: { fontSize: 13, color: '#EF4444', textAlign: 'center' },
  retryBtn: { backgroundColor: '#1F6FEB', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  retryText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
