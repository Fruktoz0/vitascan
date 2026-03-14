import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  Alert, ActivityIndicator, RefreshControl, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { useAuthStore } from '../../src/stores/authStore';
import { profileApi, premiumApi } from '../../src/services/api';
import { GlassCardSimple } from '../../src/components/ui/GlassCard';
import { PrimaryButton, GhostButton } from '../../src/components/ui/Button';
import { ReputationCard } from '../../src/components/badge/ExpertBadge';
import { PremiumUpsellModal, PremiumBadge } from '../../src/components/premium/PremiumGate';
import AnimatedMeshBackground from '../../src/components/ui/AnimatedMeshBackground';
import { Colors, Gradients, Radius, Spacing, Typography } from '../../src/design/tokens';

const GOAL_LABELS: Record<string, string> = {
  LOSE: '📉 Fogyás',
  MAINTAIN: '⚖️ Szinten tartás',
  GAIN: '📈 Tömegnövelés',
};

const ACTIVITY_LABELS: Record<string, string> = {
  SEDENTARY:   '🪑 Ülőmunka',
  LIGHT:       '🚶 Könnyű aktivitás',
  MODERATE:    '🏃 Közepes aktivitás',
  ACTIVE:      '💪 Aktív',
  VERY_ACTIVE: '🔥 Nagyon aktív',
};

// ─── Info sor ─────────────────────────────────────────────────────────────────
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [profile, setProfile] = useState<any>(null);
  const [premium, setPremium] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [upsellVisible, setUpsellVisible] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [p, pr] = await Promise.all([
        profileApi.getMe(),
        premiumApi.getStatus(),
      ]);
      setProfile(p);
      setPremium(pr);
    } catch {}
  }, []);

  useEffect(() => {
    fetchData().finally(() => setLoading(false));
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const handleLogout = () => {
    Alert.alert(
      'Kijelentkezés',
      'Biztosan ki szeretnél jelentkezni?',
      [
        { text: 'Mégse', style: 'cancel' },
        {
          text: 'Kijelentkezés',
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/auth/login');
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <AnimatedMeshBackground colors={Gradients.meshMain}>
        <View style={styles.loadingCenter}>
          <ActivityIndicator color="#fff" size="large" />
        </View>
      </AnimatedMeshBackground>
    );
  }

  const isPremium = premium?.tier === 'PREMIUM';
  const p = profile?.profile;

  return (
    <AnimatedMeshBackground colors={Gradients.meshMain}>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
        >
          {/* Fejléc */}
          <View style={styles.header}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>
                {user?.username?.[0]?.toUpperCase() ?? '?'}
              </Text>
            </View>
            <Text style={styles.username}>{user?.username}</Text>
            <Text style={styles.email}>{user?.email}</Text>
            {isPremium && (
              <View style={styles.premiumPill}>
                <Text style={styles.premiumPillText}>⭐ Premium</Text>
              </View>
            )}
          </View>

          {/* Reputáció */}
          {profile && (
            <ReputationCard
              reputation={profile.reputation ?? 0}
              username={profile.username ?? ''}
            />
          )}

          {/* Profil adatok */}
          <GlassCardSimple>
            <Text style={styles.sectionTitle}>Profil adatok</Text>
            {p ? (
              <>
                <InfoRow label="Testsúly"  value={p.weightKg  ? `${p.weightKg} kg`   : 'Nincs megadva'} />
                <InfoRow label="Magasság"  value={p.heightCm  ? `${p.heightCm} cm`   : 'Nincs megadva'} />
                <InfoRow label="Cél"       value={p.goal      ? GOAL_LABELS[p.goal]  ?? p.goal : 'Nincs megadva'} />
                <InfoRow label="Aktivitás" value={p.activityLevel ? ACTIVITY_LABELS[p.activityLevel] ?? p.activityLevel : 'Nincs megadva'} />
                <InfoRow label="Napi kcal cél" value={p.dailyKcalGoal ? `${Math.round(p.dailyKcalGoal)} kcal` : '—'} />
                <InfoRow label="Napi vízcél"   value={p.dailyWaterGoalMl ? `${p.dailyWaterGoalMl} ml` : '—'} />
              </>
            ) : (
              <Text style={styles.noProfile}>Nincs profil beállítva. Futtasd újra az onboardingot!</Text>
            )}
          </GlassCardSimple>

          {/* Premium státusz */}
          {!isPremium && (
            <GlassCardSimple
              backgroundColor="rgba(255,215,0,0.1)"
              borderColor="rgba(255,215,0,0.3)"
            >
              <Text style={styles.sectionTitle}>🔓 Premium funkciók</Text>
              <Text style={styles.premiumDesc}>
                Korlátlan naplózás, Excel export, havi statisztikák és sok más!
              </Text>
              <PrimaryButton
                label="⭐ Váltás Premiumra"
                onPress={() => setUpsellVisible(true)}
                style={{ marginTop: Spacing.md }}
              />
            </GlassCardSimple>
          )}

          {isPremium && (
            <GlassCardSimple
              backgroundColor="rgba(46,204,113,0.08)"
              borderColor="rgba(46,204,113,0.25)"
            >
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Premium előfizetés</Text>
                <PremiumBadge />
              </View>
              <InfoRow label="Státusz"        value="✅ Aktív" />
              <InfoRow label="Napi logok"     value="Korlátlan" />
              <InfoRow label="Szkennelések"   value="Korlátlan" />
              <InfoRow label="Excel export"   value="✅ Elérhető" />
            </GlassCardSimple>
          )}

          {/* Admin panel link */}
          {user?.role === 'ADMIN' && (
            <GlassCardSimple backgroundColor="rgba(26,26,46,0.08)">
              <Text style={styles.sectionTitle}>🛡️ Admin</Text>
              <PrimaryButton
                label="Admin panel megnyitása"
                onPress={() => router.push('/admin')}
                style={{ marginTop: Spacing.sm }}
              />
            </GlassCardSimple>
          )}

          {/* Kijelentkezés */}
          <GhostButton
            label="Kijelentkezés"
            onPress={handleLogout}
            style={{ marginTop: Spacing.sm }}
          />

          <View style={{ height: 110 }} />
        </ScrollView>
      </SafeAreaView>

      <PremiumUpsellModal
        visible={upsellVisible}
        feature="export"
        onClose={() => setUpsellVisible(false)}
      />
    </AnimatedMeshBackground>
  );
}

const styles = StyleSheet.create({
  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: Spacing.xl, gap: Spacing.md },
  header: { alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.lg },
  avatarCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 32, fontWeight: '900', color: '#fff' },
  username: { fontSize: 22, fontWeight: '800', color: '#fff' },
  email: { ...Typography.body, color: 'rgba(255,255,255,0.75)' },
  premiumPill: {
    backgroundColor: 'rgba(255,215,0,0.25)', borderRadius: Radius.full,
    paddingHorizontal: 12, paddingVertical: 4,
    borderWidth: 1, borderColor: 'rgba(255,215,0,0.5)',
  },
  premiumPillText: { color: '#FFD700', fontWeight: '800', fontSize: 13 },
  sectionTitle: { ...Typography.subtitle, color: Colors.text.primary, marginBottom: Spacing.md },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  infoLabel: { ...Typography.body, color: Colors.text.secondary },
  infoValue: { ...Typography.bodyMedium, color: Colors.text.primary },
  noProfile: { ...Typography.body, color: Colors.text.muted, textAlign: 'center', paddingVertical: Spacing.md },
  premiumDesc: { ...Typography.body, color: Colors.text.secondary, lineHeight: 22, marginBottom: Spacing.sm },
});
