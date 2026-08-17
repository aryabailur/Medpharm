import React, { useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type TelemetryMetric = {
  id: string;
  name: string;
  value: number | string;
  unit: string;
  status: 'normal' | 'warning' | 'critical';
};

type TelemetryCategory = {
  title: string;
  metrics: TelemetryMetric[];
};

const telemetryData: TelemetryCategory[] = [
  {
    title: 'Cold Chain Monitoring',
    metrics: [
      { id: 'cc-1', name: 'Avg Temperature', value: 8.2, unit: '°C', status: 'normal' },
      { id: 'cc-2', name: 'Temperature Range', value: '7.1 - 9.5', unit: '°C', status: 'normal' },
      { id: 'cc-3', name: 'Humidity Level', value: 55, unit: '%', status: 'normal' },
      { id: 'cc-4', name: 'Temperature Breaches', value: 2, unit: 'events', status: 'warning' },
    ],
  },
  {
    title: 'Shipment Analytics',
    metrics: [
      { id: 'sa-1', name: 'On-Time Delivery', value: 94, unit: '%', status: 'normal' },
      { id: 'sa-2', name: 'Avg Transit Time', value: 2.3, unit: 'days', status: 'normal' },
      { id: 'sa-3', name: 'Damage Rate', value: 0.8, unit: '%', status: 'normal' },
      { id: 'sa-4', name: 'Returned Shipments', value: 3, unit: 'units', status: 'normal' },
    ],
  },
  {
    title: 'Order Performance',
    metrics: [
      { id: 'op-1', name: 'Orders Fulfilled', value: 1248, unit: 'total', status: 'normal' },
      { id: 'op-2', name: 'Fulfillment Rate', value: 98.2, unit: '%', status: 'normal' },
      { id: 'op-3', name: 'Avg Order Value', value: 15.8, unit: '₹L', status: 'normal' },
      { id: 'op-4', name: 'Peak Hours', value: '10-12 AM', unit: 'IST', status: 'normal' },
    ],
  },
  {
    title: 'Network Health',
    metrics: [
      { id: 'nh-1', name: 'Connected Devices', value: 127, unit: 'active', status: 'normal' },
      { id: 'nh-2', name: 'Avg Signal Strength', value: 92, unit: '%', status: 'normal' },
      { id: 'nh-3', name: 'Data Sync Status', value: 'Real-time', unit: 'active', status: 'normal' },
      { id: 'nh-4', name: 'System Uptime', value: 99.8, unit: '%', status: 'normal' },
    ],
  },
];

function MetricCard({ metric }: { metric: TelemetryMetric }) {
  const statusColor =
    metric.status === 'critical' ? '#EF4444' : metric.status === 'warning' ? '#F59E0B' : '#22C55E';

  return (
    <View style={[styles.metricCard, { borderLeftColor: statusColor, borderLeftWidth: 4 }]}>
      <Text style={styles.metricName}>{metric.name}</Text>
      <View style={styles.metricValueRow}>
        <Text style={[styles.metricValue, { color: statusColor }]}>{metric.value}</Text>
        <Text style={styles.metricUnit}>{metric.unit}</Text>
      </View>
      <View style={[styles.statusIndicator, { backgroundColor: statusColor }]} />
    </View>
  );
}

function CategorySection({ category }: { category: TelemetryCategory }) {
  return (
    <View style={styles.categorySection}>
      <Text style={styles.categoryTitle}>{category.title}</Text>
      <View style={styles.metricsGrid}>
        {category.metrics.map((metric) => (
          <MetricCard key={metric.id} metric={metric} />
        ))}
      </View>
    </View>
  );
}

export default function VayuTelemetryScreen({ onBack }: { onBack: () => void }) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#EAF2FF" />

      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </Pressable>
        <View>
          <Text style={styles.headerTitle}>Telemetry & Analytics</Text>
          <Text style={styles.headerSubtitle}>Vayu • Manufacturer</Text>
        </View>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.liveIndicator}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>Live data (updated every 30s)</Text>
        </View>

        {telemetryData.map((category, idx) => (
          <CategorySection key={idx} category={category} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  header: {
    backgroundColor: '#EAF2FF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#D8E1EC',
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F6FEB',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475467',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 4,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    paddingHorizontal: 12,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22C55E',
  },
  liveText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#22C55E',
  },
  categorySection: {
    marginBottom: 20,
  },
  categoryTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 10,
    marginHorizontal: 4,
    letterSpacing: -0.3,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricCard: {
    flex: 1,
    minWidth: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  metricName: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475467',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  metricValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    marginBottom: 8,
  },
  metricValue: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  metricUnit: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
  },
  statusIndicator: {
    height: 2,
    width: 24,
    borderRadius: 1,
  },
});
