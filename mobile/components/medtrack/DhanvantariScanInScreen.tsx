import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { confirmReceipt, fileComplaint, resolveQr, type ResolvedBatch } from '../../lib/api';

export default function DhanvantariScanInScreen({ onBack }: { onBack: () => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(true);
  const [resolving, setResolving] = useState(false);
  const [batch, setBatch] = useState<ResolvedBatch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [qtyReceived, setQtyReceived] = useState('');
  const [committing, setCommitting] = useState(false);
  const [committed, setCommitted] = useState(false);
  const [complaintId, setComplaintId] = useState<string | null>(null);
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
    setBatch(null);
    setCommitted(false);
    setComplaintId(null);

    try {
      const res = await resolveQr(data);
      setBatch(res);
      setQtyReceived(String(res.qtyExpected ?? 0));
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg.includes('404') ? `No batch found for: ${data}` : msg);
      setScanning(true);
    } finally {
      setResolving(false);
    }
  }, [resolving]);

  const handleCommit = async (accepted: boolean) => {
    if (!batch || committing) return;
    setCommitting(true);
    try {
      const qty = parseInt(qtyReceived, 10) || 0;
      await confirmReceipt({
        shipmentId: batch.shipmentId ?? '',
        scannedBy: 'mobile-dock',
        batches: [{
          batchId: batch.batchId,
          qtyExpected: batch.qtyExpected ?? undefined,
          qtyReceived: accepted ? qty : 0,
          accepted,
        }],
      });

      let cid: string | null = null;
      const qty2 = parseInt(qtyReceived, 10) || 0;
      const short = (batch.qtyExpected ?? 0) - qty2;
      const needsComplaint = !accepted || short > 0 || batch.anomalyFlag;
      if (needsComplaint) {
        const res = await fileComplaint({
          batchId: batch.batchId,
          shipmentId: batch.shipmentId ?? undefined,
          institutionId: 'self',
          category: !accepted ? 'QUALITY' : batch.anomalyFlag ? 'TEMP_DAMAGE' : 'QTY_MISMATCH',
          description: !accepted
            ? 'Full shipment quarantined on receipt.'
            : batch.anomalyFlag
            ? 'Cold-chain excursion attached to shipment.'
            : `${short} units short of manifest.`,
        });
        cid = res.complaintId;
      }
      setComplaintId(cid);
      setCommitted(true);
    } catch (e) {
      Alert.alert('Error', (e as Error).message);
    } finally {
      setCommitting(false);
    }
  };

  // Permission not yet determined
  if (!permission) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><ActivityIndicator color="#D97706" /></View>
      </SafeAreaView>
    );
  }

  // Permission denied
  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFF4E5" />
        <View style={styles.header}>
          <Pressable onPress={onBack} style={styles.backBtn}>
            <Text style={styles.backText}>← Back</Text>
          </Pressable>
          <Text style={styles.title}>Scan-in</Text>
        </View>
        <View style={styles.center}>
          <Text style={styles.permText}>Camera access is required to scan QR codes.</Text>
          <Pressable onPress={requestPermission} style={styles.permBtn}>
            <Text style={styles.permBtnText}>Grant Camera Access</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#111827" />

      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
        <View>
          <Text style={styles.title}>Scan-in</Text>
          <Text style={styles.subtitle}>Point camera at batch QR label</Text>
        </View>
      </View>

      {/* Camera */}
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
          <ActivityIndicator color="#D97706" size="large" />
          <Text style={styles.loadingText}>Resolving batch…</Text>
        </View>
      )}

      {error && (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => { setError(null); setScanning(true); }} style={styles.retryBtn}>
            <Text style={styles.retryText}>Scan again</Text>
          </Pressable>
        </View>
      )}

      {/* Batch result */}
      {batch && !resolving && (
        <ScrollView contentContainerStyle={styles.resultContainer}>
          {batch.anomalyFlag && (
            <View style={styles.excursionBanner}>
              <Text style={styles.excursionTitle}>⚠ Cold-chain excursion</Text>
              <Text style={styles.excursionSub}>
                This shipment has a recorded temperature breach.
                {batch.lastTempC != null ? ` Last reading: ${batch.lastTempC.toFixed(1)} °C` : ''}
              </Text>
            </View>
          )}

          {committed ? (
            <View style={styles.successCard}>
              <Text style={styles.successTitle}>✓ Committed</Text>
              <Text style={styles.successSub}>
                {parseInt(qtyReceived, 10)} units received for batch {batch.batchId.slice(0, 12)}.
                {complaintId ? `\nComplaint ${complaintId.slice(0, 12)} filed automatically.` : '\nNo complaint required.'}
              </Text>
              <Pressable onPress={() => { setBatch(null); setScanning(true); setCommitted(false); }} style={styles.scanAgainBtn}>
                <Text style={styles.scanAgainText}>Scan next batch</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {/* Drug info */}
              <View style={styles.drugCard}>
                <Text style={styles.drugName}>{batch.drug?.name ?? 'Unknown drug'}</Text>
                {batch.drug?.genericName && <Text style={styles.drugGeneric}>{batch.drug.genericName}</Text>}
                <View style={styles.infoGrid}>
                  <View style={styles.infoItem}>
                    <Text style={styles.infoLabel}>Batch ID</Text>
                    <Text style={styles.infoValue} numberOfLines={1}>{batch.batchId.slice(0, 16)}</Text>
                  </View>
                  <View style={styles.infoItem}>
                    <Text style={styles.infoLabel}>Qty expected</Text>
                    <Text style={styles.infoValue}>{batch.qtyExpected ?? '—'}</Text>
                  </View>
                  <View style={styles.infoItem}>
                    <Text style={styles.infoLabel}>Cold chain</Text>
                    <Text style={[styles.infoValue, { color: batch.coldChain ? '#0EA5E9' : '#6B7280' }]}>
                      {batch.coldChain ? '2–8 °C' : 'Ambient'}
                    </Text>
                  </View>
                  {batch.shipmentId && (
                    <View style={styles.infoItem}>
                      <Text style={styles.infoLabel}>Shipment</Text>
                      <Text style={styles.infoValue} numberOfLines={1}>{batch.shipmentId.slice(0, 14)}</Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Qty adjuster */}
              <View style={styles.qtyCard}>
                <Text style={styles.qtyLabel}>Quantity counted</Text>
                <TextInput
                  style={styles.qtyInput}
                  value={qtyReceived}
                  onChangeText={setQtyReceived}
                  keyboardType="numeric"
                  placeholder="0"
                />
                {batch.qtyExpected != null && parseInt(qtyReceived, 10) < batch.qtyExpected && (
                  <Text style={styles.shortText}>
                    ⚠ {batch.qtyExpected - parseInt(qtyReceived, 10)} units short of manifest
                  </Text>
                )}
              </View>

              {/* Actions */}
              <View style={styles.actions}>
                <Pressable
                  onPress={() => handleCommit(true)}
                  disabled={committing}
                  style={[styles.acceptBtn, committing && { opacity: 0.6 }]}
                >
                  <Text style={styles.acceptText}>
                    {committing ? 'Committing…' : `Accept ${qtyReceived} units${
                      (batch.anomalyFlag || (batch.qtyExpected != null && parseInt(qtyReceived, 10) < batch.qtyExpected))
                        ? ' & file complaint' : ''
                    }`}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => handleCommit(false)}
                  disabled={committing}
                  style={[styles.quarantineBtn, committing && { opacity: 0.6 }]}
                >
                  <Text style={styles.quarantineText}>Quarantine all</Text>
                </Pressable>
              </View>

              <Pressable onPress={() => { setBatch(null); setScanning(true); }} style={styles.rescanBtn}>
                <Text style={styles.rescanText}>Scan a different batch</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F172A' },
  header: { backgroundColor: '#1E293B', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#334155' },
  backBtn: { alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 8, marginBottom: 8 },
  backText: { fontSize: 14, fontWeight: '700', color: '#D97706' },
  title: { fontSize: 24, fontWeight: '800', color: '#F8FAFC', letterSpacing: -0.5 },
  subtitle: { fontSize: 12, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 },
  cameraContainer: { position: 'relative', height: 300 },
  camera: { flex: 1 },
  scanOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  scanFrame: { width: 220, height: 160, borderWidth: 2, borderColor: '#D97706', borderRadius: 12 },
  scanHint: { color: '#F8FAFC', fontSize: 12, marginTop: 12, opacity: 0.8 },
  resultContainer: { padding: 16, gap: 14 },
  excursionBanner: { backgroundColor: '#FEE2E2', borderRadius: 12, padding: 14, borderLeftWidth: 3, borderLeftColor: '#EF4444' },
  excursionTitle: { fontSize: 15, fontWeight: '800', color: '#DC2626', marginBottom: 4 },
  excursionSub: { fontSize: 13, color: '#DC2626', lineHeight: 20 },
  drugCard: { backgroundColor: '#1E293B', borderRadius: 14, padding: 16 },
  drugName: { fontSize: 18, fontWeight: '800', color: '#F8FAFC', marginBottom: 4 },
  drugGeneric: { fontSize: 13, color: '#94A3B8', marginBottom: 14 },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  infoItem: { width: '47%' },
  infoLabel: { fontSize: 10, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.8 },
  infoValue: { fontSize: 14, fontWeight: '700', color: '#F8FAFC', marginTop: 3, fontFamily: 'monospace' },
  qtyCard: { backgroundColor: '#1E293B', borderRadius: 14, padding: 16 },
  qtyLabel: { fontSize: 12, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  qtyInput: { backgroundColor: '#0F172A', borderRadius: 10, borderWidth: 1, borderColor: '#334155', padding: 14, fontSize: 28, fontWeight: '800', color: '#F8FAFC', textAlign: 'center' },
  shortText: { color: '#F59E0B', fontSize: 12, fontWeight: '600', marginTop: 8, textAlign: 'center' },
  actions: { gap: 10 },
  acceptBtn: { backgroundColor: '#D97706', borderRadius: 14, padding: 16, alignItems: 'center' },
  acceptText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  quarantineBtn: { backgroundColor: '#1E293B', borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#475569' },
  quarantineText: { color: '#F8FAFC', fontWeight: '700', fontSize: 14 },
  rescanBtn: { alignItems: 'center', paddingVertical: 8 },
  rescanText: { color: '#64748B', fontSize: 13, textDecorationLine: 'underline' },
  successCard: { backgroundColor: '#064E3B', borderRadius: 14, padding: 20, alignItems: 'center', gap: 10 },
  successTitle: { fontSize: 22, fontWeight: '800', color: '#34D399' },
  successSub: { fontSize: 13, color: '#A7F3D0', textAlign: 'center', lineHeight: 20 },
  scanAgainBtn: { backgroundColor: '#065F46', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12, marginTop: 6 },
  scanAgainText: { color: '#34D399', fontWeight: '700', fontSize: 14 },
  errorCard: { margin: 16, backgroundColor: '#FEE2E2', borderRadius: 14, padding: 16, gap: 12 },
  errorText: { color: '#DC2626', fontSize: 13, lineHeight: 20 },
  retryBtn: { backgroundColor: '#DC2626', borderRadius: 10, padding: 12, alignItems: 'center' },
  retryText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  loadingText: { color: '#94A3B8', fontSize: 14 },
  permText: { color: '#94A3B8', fontSize: 14, textAlign: 'center', lineHeight: 22 },
  permBtn: { backgroundColor: '#D97706', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  permBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
