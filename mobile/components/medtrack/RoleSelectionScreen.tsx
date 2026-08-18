import React from 'react';
import { Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Role, RoleConfig, roleConfig } from './roleConfig';

function RoleCard({ config, onSelect }: { config: RoleConfig; onSelect: (role: Role) => void }) {
  return (
    <Pressable
      onPress={() => onSelect(config.id)}
      style={({ pressed }) => [
        styles.roleCard,
        {
          borderColor: config.accent,
          backgroundColor: pressed ? config.accentSoft : '#FFFFFF',
          shadowColor: config.accent,
        },
      ]}
    >
      <View style={[styles.rolePill, { backgroundColor: config.accentSoft, borderColor: config.accent }]}>
        <Text style={[styles.rolePillText, { color: config.accent }]}>{config.title}</Text>
      </View>
      <Text style={styles.roleTitle}>{config.title}</Text>
      <Text style={styles.roleSubtitle}>{config.subtitle}</Text>
      <Text style={styles.roleDescription}>{config.description}</Text>

      <View style={styles.statRow}>
        {config.stats.map((stat) => (
          <View key={stat.label} style={styles.statBox}>
            <Text style={styles.statLabel}>{stat.label}</Text>
            <Text style={styles.statValue}>{stat.value}</Text>
            <Text style={styles.statDetail}>{stat.detail}</Text>
          </View>
        ))}
      </View>
    </Pressable>
  );
}

export default function RoleSelectionScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F7FA" />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.eyebrow}>MedTrack</Text>
        <Text style={styles.title}>Choose your operational role</Text>
        <Text style={styles.subtitle}>
          Start in the Dhanvantari or Vayu workflow, then continue into the mobile dashboard for that team.
        </Text>

        <View style={styles.cardStack}>
          {(Object.values(roleConfig) as RoleConfig[]).map((config) => (
            <RoleCard key={config.id} config={config} onSelect={(role) => router.push(`/${role}`)} />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  container: {
    paddingHorizontal: 20,
    paddingTop: 32,
    paddingBottom: 48,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
    color: '#55677A',
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.8,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#445266',
    lineHeight: 22,
    marginBottom: 24,
  },
  cardStack: {
    gap: 18,
  },
  roleCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 18,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 5,
  },
  rolePill: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 14,
  },
  rolePillText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.3,
    textTransform: 'uppercase',
  },
  roleTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.5,
  },
  roleSubtitle: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '600',
    color: '#475467',
  },
  roleDescription: {
    marginTop: 12,
    fontSize: 14,
    lineHeight: 20,
    color: '#55677A',
  },
  statRow: {
    marginTop: 18,
    gap: 10,
  },
  statBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: '#64748B',
    textTransform: 'uppercase',
  },
  statValue: {
    marginTop: 8,
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.5,
  },
  statDetail: {
    marginTop: 4,
    fontSize: 12,
    color: '#64748B',
  },
});
