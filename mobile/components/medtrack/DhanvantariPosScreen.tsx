import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { dispense, getInventory, getDispenses, type InventoryRow, type Dispense } from '../../lib/api';

function fmtTime(d: string) {
  return new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export default function DhanvantariPosScreen({ onBack }: { onBack: () => void }) {
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [dispenses, setDispenses] = useState<Dispense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedDrug, setSelectedDrug] = useState<InventoryRow | null>(null);
  const [qty, setQty] = useState('1');
  const [patientRef, setPatientRef] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [inv, disp] = await Promise.all([
        getInventory('?take=200'),
        getDispenses('?take=30'),
      ]);
      setInventory(inv.items);
      setDispenses(disp.items);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() =>
    inventory.filter(r =>
      r.drug.name.toLowerCase().includes(search.toLowerCase()) ||
      (r.drug.genericName ?? '').toLowerCase().includes(search.toLowerCase())
    ), [inventory, search]);

  const handleDispense = async () => {
    if (!selectedDrug || submitting) return;
    const qtyNum = parseInt(qty, 10);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      Alert.alert('Invalid qty', 'Please enter a valid quantity.');
      return;
    }
    if (qtyNum > selectedDrug.qtyOnHand) {
      Alert.alert('Insufficient stock', `Only ${selectedDrug.qtyOnHand} units available.`);
      return;
    }
    setSubmitting(true);
    try {
      const res = await dispense({
        drugId: selectedDrug.drugId,
        qty: qtyNum,
        batchRef: selectedDrug.batchRef ?? undefined,
        dispensedBy: 'mobile-pos',
        patientRef: patientRef || undefined,
      });
      const msg = `✓ Dispensed ${qtyNum} × ${selectedDrug.drug.name}${res.lowStock ? '\n⚠ Now below reorder point — consider restocking.' : ''}`;
      setSuccessMsg(msg);
      setSelectedDrug(null);
      setQty('1');
      setPatientRef('');
      await load();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (e) {
      Alert.alert('Dispense failed', (e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF4E5" />

      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>Dispensing</Text>
        <Text style={styles.subtitle}>POS · Counter dispense</Text>
      </View>

      {successMsg && (
        <View style={styles.toast}><Text style={styles.toastText}>{successMsg}</Text></View>
      )}

      <View style={styles.body}>
        {/* Left: Drug picker */}
        <View style={styles.pickerCol}>
          <TextInput
            style={styles.search}
            placeholder="Search drug…"
            placeholderTextColor="#94A3B8"
            value={search}
            onChangeText={setSearch}
          />
          {loading ? (
            <View style={styles.center}><ActivityIndicator color="#D97706" /></View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={r => r.id}
              renderItem={({ item: r }) => {
                const active = selectedDrug?.id === r.id;
                const out = r.qtyOnHand === 0;
                return (
                  <Pressable
                    onPress={() => { if (!out) setSelectedDrug(r); }}
                    style={[styles.drugItem, active && styles.drugItemActive, out && styles.drugItemOut]}
                  >
                    <Text style={[styles.drugName, out && { color: '#94A3B8' }]} numberOfLines={1}>
                      {r.drug.name}
                    </Text>
                    <Text style={[styles.drugQty, out && { color: '#EF4444' }]}>
                      {out ? 'OUT' : r.qtyOnHand}
                    </Text>
                  </Pressable>
                );
              }}
              contentContainerStyle={{ gap: 0 }}
            />
          )}
        </View>

        {/* Right: Dispense form */}
        <View style={styles.formCol}>
          {!selectedDrug ? (
            <View style={styles.center}>
              <Text style={styles.selectHint}>Select a drug{'\n'}from the list</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.form}>
              <Text style={styles.formDrug}>{selectedDrug.drug.name}</Text>
              <Text style={styles.formGeneric}>{selectedDrug.drug.genericName ?? '—'}</Text>

              <View style={styles.stockRow}>
                <View style={styles.stockItem}>
                  <Text style={styles.stockLabel}>On hand</Text>
                  <Text style={[styles.stockValue, selectedDrug.lowStock && { color: '#EF4444' }]}>
                    {selectedDrug.qtyOnHand}
                  </Text>
                </View>
                <View style={styles.stockItem}>
                  <Text style={styles.stockLabel}>Reorder pt</Text>
                  <Text style={styles.stockValue}>{selectedDrug.reorderPoint}</Text>
                </View>
                {selectedDrug.drug.unitPrice != null && (
                  <View style={styles.stockItem}>
                    <Text style={styles.stockLabel}>Unit price</Text>
                    <Text style={styles.stockValue}>₹{selectedDrug.drug.unitPrice}</Text>
                  </View>
                )}
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Quantity</Text>
                <View style={styles.qtyRow}>
                  <Pressable onPress={() => setQty(q => String(Math.max(1, parseInt(q, 10) - 1)))} style={styles.qtyBtn}>
                    <Text style={styles.qtyBtnText}>−</Text>
                  </Pressable>
                  <TextInput
                    style={styles.qtyInput}
                    value={qty}
                    onChangeText={setQty}
                    keyboardType="numeric"
                    textAlign="center"
                  />
                  <Pressable onPress={() => setQty(q => String(parseInt(q, 10) + 1))} style={styles.qtyBtn}>
                    <Text style={styles.qtyBtnText}>+</Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Patient ref (optional)</Text>
                <TextInput
                  style={styles.textInput}
                  value={patientRef}
                  onChangeText={setPatientRef}
                  placeholder="OPD-001 / IPD-204…"
                  placeholderTextColor="#94A3B8"
                  autoCapitalize="characters"
                />
              </View>

              {selectedDrug.drug.unitPrice != null && parseInt(qty, 10) > 0 && (
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Total</Text>
                  <Text style={styles.totalValue}>
                    ₹{(selectedDrug.drug.unitPrice * (parseInt(qty, 10) || 0)).toLocaleString('en-IN')}
                  </Text>
                </View>
              )}

              <Pressable
                onPress={handleDispense}
                disabled={submitting}
                style={[styles.dispenseBtn, submitting && { opacity: 0.6 }]}
              >
                <Text style={styles.dispenseBtnText}>
                  {submitting ? 'Dispensing…' : 'Issue drug'}
                </Text>
              </Pressable>
            </ScrollView>
          )}
        </View>
      </View>

      {/* Recent dispenses */}
      {dispenses.length > 0 && (
        <View style={styles.recentSection}>
          <Text style={styles.recentTitle}>Recent</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recentScroll}>
            {dispenses.slice(0, 10).map(d => (
              <View key={d.id} style={styles.recentCard}>
                <Text style={styles.recentDrug} numberOfLines={1}>{d.drug?.name ?? d.drugId.slice(0, 8)}</Text>
                <Text style={styles.recentQty}>×{d.qty}</Text>
                <Text style={styles.recentTime}>{fmtTime(d.dispensedAt)}</Text>
              </View>
            ))}
          </ScrollView>
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
  title: { fontSize: 24, fontWeight: '800', color: '#111827', letterSpacing: -0.5 },
  subtitle: { fontSize: 12, color: '#475467', textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 },
  toast: { backgroundColor: '#065F46', marginHorizontal: 12, marginTop: 8, borderRadius: 10, padding: 12 },
  toastText: { color: '#34D399', fontWeight: '700', fontSize: 13 },
  body: { flex: 1, flexDirection: 'row' },
  pickerCol: { width: 180, borderRightWidth: 1, borderRightColor: '#E2E8F0', backgroundColor: '#fff' },
  search: { borderBottomWidth: 1, borderBottomColor: '#E2E8F0', paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: '#111827' },
  drugItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#F8FAFC', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  drugItemActive: { backgroundColor: '#FFF4E5' },
  drugItemOut: { opacity: 0.5 },
  drugName: { fontSize: 12, fontWeight: '600', color: '#111827', flex: 1 },
  drugQty: { fontSize: 12, fontWeight: '700', color: '#22C55E', marginLeft: 6 },
  formCol: { flex: 1 },
  form: { padding: 16, gap: 14 },
  formDrug: { fontSize: 18, fontWeight: '800', color: '#111827', letterSpacing: -0.3 },
  formGeneric: { fontSize: 13, color: '#6B7280' },
  stockRow: { flexDirection: 'row', gap: 16 },
  stockItem: {},
  stockLabel: { fontSize: 10, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.8 },
  stockValue: { fontSize: 18, fontWeight: '800', color: '#111827', marginTop: 2 },
  field: { gap: 6 },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.8 },
  qtyRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  qtyBtn: { backgroundColor: '#E2E8F0', borderRadius: 10, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  qtyBtnText: { fontSize: 20, fontWeight: '700', color: '#374151' },
  qtyInput: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, padding: 10, fontSize: 22, fontWeight: '800', color: '#111827', width: 70 },
  textInput: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#F8FAFC', borderRadius: 10, padding: 12 },
  totalLabel: { fontSize: 13, fontWeight: '700', color: '#6B7280' },
  totalValue: { fontSize: 18, fontWeight: '800', color: '#111827' },
  dispenseBtn: { backgroundColor: '#D97706', borderRadius: 14, padding: 16, alignItems: 'center' },
  dispenseBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  recentSection: { borderTopWidth: 1, borderTopColor: '#E2E8F0', padding: 12, backgroundColor: '#fff', maxHeight: 100 },
  recentTitle: { fontSize: 10, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  recentScroll: { gap: 8 },
  recentCard: { backgroundColor: '#F8FAFC', borderRadius: 10, padding: 10, width: 110, borderWidth: 1, borderColor: '#E2E8F0' },
  recentDrug: { fontSize: 11, fontWeight: '700', color: '#111827' },
  recentQty: { fontSize: 13, fontWeight: '800', color: '#D97706' },
  recentTime: { fontSize: 10, color: '#94A3B8', marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  selectHint: { fontSize: 13, color: '#94A3B8', textAlign: 'center', lineHeight: 22 },
});
