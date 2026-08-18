import React, { useCallback, useRef, useState } from 'react';
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
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  getVayuBatch,
  getVayuShipment,
  resolveVayuQr,
  type ResolvedVayuBatch,
  type VayuBatchDetail,
  type VayuShipmentDetail,
} from '../../lib/api';

function fmtDT(ts: string | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function VayuScanScreen({ onBack }: { onBack: () => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(true);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolved, setResolved] = useState<ResolvedVayuBatch | null>(null);
  const [batch, setBatch] = useState<VayuBatchDetail | null>(null);
  const [shipment, setShipment] = useState<VayuShipmentDetail | null>(null);
  const lastScan = useRef<string>('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleBarcode = useCallback(async ({ data }: { data: string }) => {
    if (data === lastScan.current || resolving) return;
    lastScan.current = data;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { lastScan.current = ''; }, 3000);

    setScanning(false);
    setResolving(true);
    setError(null);
    setResolved(null);
    setBatch(null);
    setShipment(null);

    try {
      const res = await resolveVayuQr(data);
      setResolved(res);

      const full = await getVayuBatch(res.batchId);
      setBatch(full);

      const latest = full.shipmentBatch[full.shipmentBatch.length - 1];
      if (latest) {
        try {
          const ship = await getVayuShipment(latest.shipmentId);
          setShipment(ship);
        } catch {
          // shipment detail is optional context
        }
      }
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg.includes('404') ? `No batch found for: ${data}` : msg);
      setScanning(true);
    } finally {
      setResolving(false);
    }
  }, [resolving]);

  const rescan = () => {
    setResolved(null);
    setBatch(null);
    setShipment(null);
    setError(null);
    setScanning(true);
  };

  if (!permission) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><ActivityIndicator color="#1F6FEB" /></View>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="dark-content" backgroundColor="#EAF2FF" />
        <View style={styles.header}>
          <Pressable onPress={onBack} style={styles.backBtn}>
            <Text style={styles.backText}>← Back</Text>
          </Pressable>
          <Text style={styles.title}>Trace batch</Text>
        </View>
        <View style={styles.center}>
          <Text style={styles.permText}>Camera access is required to scan batch QR codes.</Text>
          <Pressable onPress={requestPermission} style={styles.permBtn}>
            <Text style={styles.permBtnText}>Grant Camera Access</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const openExcursion = shipment?.excursions.find((e) => !e.endedAt) ?? shipment?.excursions[0] ?? null;
  const qcColor = resolved?.qcStatus === 'FAIL' ? '#EF4444' : resolved?.qcStatus === 'PASS' ? '#22C55E' : '#94A3B8';

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#111827" />

      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
        <View>
          <Text style={styles.title}>Trace batch</Text>
          <Text style={styles.subtitle}>Point camera at batch QR label</Text>
        </View>
      </View>

      {scanning && (
        <View style={styles.cameraContainer}>
          <CameraView
            style={styles.camera}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'code39', 'ean13', 'ean8'] }}
            onBarcodeScanned={handleBarcode}
          />
          <View style={styles.scanOverlay}>
            <View style={styles.scanFrame} />
            <Text style={styles.scanHint}>Align QR or barcode within frame</Text>
          </View>
        </View>
      )}

      {resolving && (
        <View style={styles.center}>
          <ActivityIndicator color="#1F6FEB" size="large" />
          <Text style={styles.loadingText}>Tracing batch…</Text>
        </View>
      )}

      {error && (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={rescan} style={styles.retryBtn}>
            <Text style={styles.retryText}>Scan again</Text>
          </Pressable>
        </View>
      )}

      {resolved && !resolving && (
        <ScrollView contentContainerStyle={styles.resultContainer}>
          {openExcursion && (
            <View style={styles.excursionBanner}>
              <Text style={styles.excursionTitle}>⚠ Cold-chain excursion · {openExcursion.severity}</Text>
              <Text style={styles.excursionSub}>
                {openExcursion.maxTempC != null ? `Peak ${openExcursion.maxTempC.toFixed(1)} °C. ` : ''}
                {openExcursion.durationMin != null ? `${openExcursion.durationMin} min above band.` : ''}
              </Text>
            </View>
          )}

          <View style={styles.drugCard}>
            <Text style={styles.drugName}>{resolved.drug.name}</Text>
            {resolved.drug.genericName && <Text style={styles.drugGeneric}>{resolved.drug.genericName}</Text>}
            <View style={styles.infoGrid}>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Lot</Text>
                <Text style={styles.infoValue} numberOfLines={1}>{resolved.lotNumber}</Text>
              </View>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Quantity</Text>
                <Text style={styles.infoValue}>{resolved.quantity}</Text>
              </View>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Status</Text>
                <Text style={styles.infoValue}>{resolved.status.replace(/_/g, ' ')}</Text>
              </View>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>QC</Text>
                <Text style={[styles.infoValue, { color: qcColor }]}>{resolved.qcStatus ?? 'Pending'}</Text>
              </View>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Manufactured</Text>
                <Text style={styles.infoValue}>{fmtDT(resolved.mfgDate)}</Text>
              </View>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Expiry</Text>
                <Text style={styles.infoValue}>{fmtDT(resolved.expiryDate)}</Text>
              </View>
            </View>
          </View>

          {shipment && (
            <View style={styles.shipmentCard}>
              <Text style={styles.sectionTitle}>Shipment</Text>
              <View style={styles.infoGrid}>
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Shipment ID</Text>
                  <Text style={styles.infoValue} numberOfLines={1}>{shipment.id.slice(0, 14)}</Text>
                </View>
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Status</Text>
                  <Text style={styles.infoValue}>{shipment.status.replace(/_/g, ' ')}</Text>
                </View>
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Destination</Text>
                  <Text style={styles.infoValue} numberOfLines={1}>{shipment.institution?.name ?? '—'}</Text>
                </View>
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Last temp</Text>
                  <Text style={styles.infoValue}>{shipment.lastTempC != null ? `${shipment.lastTempC.toFixed(1)} °C` : '—'}</Text>
                </View>
              </View>
            </View>
          )}

          <Pressable onPress={rescan} style={styles.rescanBtn}>
            <Text style={styles.rescanText}>Scan a different batch</Text>
          </Pressable>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F172A' },
  header: { backgroundColor: '#1E293B', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#334155' },
  backBtn: { alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 8, marginBottom: 8 },
  backText: { fontSize: 14, fontWeight: '700', color: '#1F6FEB' },
  title: { fontSize: 24, fontWeight: '800', color: '#F8FAFC', letterSpacing: -0.5 },
  subtitle: { fontSize: 12, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 },
  cameraContainer: { position: 'relative', height: 300 },
  camera: { flex: 1 },
  scanOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  scanFrame: { width: 220, height: 160, borderWidth: 2, borderColor: '#1F6FEB', borderRadius: 12 },
  scanHint: { color: '#F8FAFC', fontSize: 12, marginTop: 12, opacity: 0.8 },
  resultContainer: { padding: 16, gap: 14 },
  excursionBanner: { backgroundColor: '#FEE2E2', borderRadius: 12, padding: 14, borderLeftWidth: 3, borderLeftColor: '#EF4444' },
  excursionTitle: { fontSize: 15, fontWeight: '800', color: '#DC2626', marginBottom: 4 },
  excursionSub: { fontSize: 13, color: '#DC2626', lineHeight: 20 },
  drugCard: { backgroundColor: '#1E293B', borderRadius: 14, padding: 16 },
  drugName: { fontSize: 18, fontWeight: '800', color: '#F8FAFC', marginBottom: 4 },
  drugGeneric: { fontSize: 13, color: '#94A3B8', marginBottom: 14 },
  shipmentCard: { backgroundColor: '#1E293B', borderRadius: 14, padding: 16 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  infoItem: { width: '47%' },
  infoLabel: { fontSize: 10, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.8 },
  infoValue: { fontSize: 14, fontWeight: '700', color: '#F8FAFC', marginTop: 3, fontFamily: 'monospace' },
  rescanBtn: { alignItems: 'center', paddingVertical: 8 },
  rescanText: { color: '#64748B', fontSize: 13, textDecorationLine: 'underline' },
  errorCard: { margin: 16, backgroundColor: '#FEE2E2', borderRadius: 14, padding: 16, gap: 12 },
  errorText: { color: '#DC2626', fontSize: 13, lineHeight: 20 },
  retryBtn: { backgroundColor: '#DC2626', borderRadius: 10, padding: 12, alignItems: 'center' },
  retryText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  loadingText: { color: '#94A3B8', fontSize: 14 },
  permText: { color: '#94A3B8', fontSize: 14, textAlign: 'center', lineHeight: 22 },
  permBtn: { backgroundColor: '#1F6FEB', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  permBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
