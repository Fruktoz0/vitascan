import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';

import { useAuthStore } from '../../src/stores/authStore';
import { statsApi, profileApi, premiumApi } from '../../src/services/api';
import { GlassCardSimple } from '../../src/components/ui/GlassCard';
import { PrimaryButton } from '../../src/components/ui/Button';
import {
  PremiumLockOverlay, PremiumUpsellModal,
  PremiumBadge, DailyLimitBar,
} from '../../src/components/premium/PremiumGate';
import ExportEngine, { setExportToken } from '../../src/components/export/ExportEngine';
import { ReputationCard, ReputationLevelsGuide } from '../../src/components/badge/ExpertBadge';
import { Colors, Gradients, Radius, Spacing, Typography } from '../../src/design/tokens';

// ─── Heti bar chart ───────────────────────────────────────────────────────────
function WeeklyBarChart({ days, goal }: { days: any[]; goal: number }) {
  return (
    <View style={chartStyles.container}>
      {days.map((day: any) => {
        const pct = Math.min((day.kcal ?? 0) / goal, 1);
        const isToday = day.date === new Date().toISOString().split('T')[0];
        return (
          <View key={day.date} style={chartStyles.dayCol}>
            <Text style={chartStyles.kcalLabel}>
              {day.kcal > 0 ? Math.round(day.kcal) : ''}
            </Text>
            <View style={chartStyles.barTrack}>
              <LinearGradient
                colors={isToday ? ['#FF6B35', '#FF9A6C'] : ['#A8EDBC', '#7EC8E3']}
                style={[chartStyles.barFill, { height: `${Math.max(pct * 100, 4)}%` }]}
              />
            </View>
            <Text style={[chartStyles.dayLabel, isToday && chartStyles.dayLabelToday]}>
              {new Date(day.date + 'T12:00:00').toLocaleDateString('hu-HU', { weekday: 'narrow' })}
            </Text>
            {isToday && <View style={chartStyles.todayDot} />}
          </View>
        );
      })}
    </View>
  );
}

const chartStyles = StyleSheet.create({
  container: { flexDirection: 'row', gap: 6, height: 120, alignItems: 'flex-end', paddingTop: 24 },
  dayCol: { flex: 1, alignItems: 'center', gap: 4 },
  kcalLabel: { fontSize: 8, color: Colors.text.muted, position: 'absolute', top: -16 },
  barTrack: { flex: 1, width: '100%', backgroundColor: 'rgba(0,0,0,0.06)', borderRadius: 6, overflow: 'hidden', justifyContent: 'flex-end' },
  barFill: { width: '100%', borderRadius: 6 },
  dayLabel: { fontSize: 10, color: Colors.text.muted, fontWeight: '600' },
  dayLabelToday: { color: Colors.primary, fontWeight: '900' },
  todayDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.primary },
});

// ─── Stat kártya ─────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, sub, color }: {
  icon: string; label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <View style={statStyles.card}>
      <Text style={statStyles.icon}>{icon}</Text>
      <Text style={[statStyles.value, color ? { color } : null]}>{value}</Text>
      <Text style={statStyles.label}>{label}</Text>
      {sub && <Text style={statStyles.sub}>{sub}</Text>}
    </View>
  );
}
const statStyles = StyleSheet.create({
  card: {
    flex: 1, alignItems: 'center', gap: 3,
    backgroundColor: '#fff', borderRadius: Radius.lg, padding: Spacing.md,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  icon: { fontSize: 22 },
  value: { fontSize: 20, fontWeight: '900', color: Colors.text.primary },
  label: { ...Typography.caption, color: Colors.text.muted },
  sub: { fontSize: 9, color: Colors.text.muted },
});

// ─── Főképernyő ───────────────────────────────────────────────────────────────
export default function DataVaultScreen() {
  const router = useRouter();
  const { user, logout } = useAuthStore();

  const [weekly, setWeekly] = useState<any>(null);
  const [streak, setStreak] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [tierStatus, setTierStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [upsellVisible, setUpsellVisible] = useState(false);
  const [exportVisible, setExportVisible] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [w, s, p, t] = await Promise.all([
        statsApi.weekly(),
        statsApi.streak(),
        profileApi.getMe(),
        premiumApi.getStatus(),
      ]);
      setWeekly(w);
      setStreak(s);
      setProfile(p);
      setTierStatus(t);
    } catch {} finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, []);

  const onRefresh = () => { setRefreshing(true); fetchAll(); };

  const isPremium = tierStatus?.tier === 'PREMIUM';

  const handleLogout = () =>
    Alert.alert('Kijelentkezés', 'Biztosan ki szeretnél jelentkezni?', [
      { text: 'Mégse', style: 'cancel' },
      { text: 'Kijelentkezés', style: 'destructive', onPress: logout },
    ]);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </SafeAreaView>
    );
  }

  const dailyKcalGoal = profile?.profile?.dailyKcalGoal ?? 2000;

  return (
    <View style={{ flex: 1, backgroundColor: '#FAFAFA' }}>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        >
          {/* ── Fejléc ──────────────────────────────────────────────────── */}
          <LinearGradient
            colors={isPremium ? ['#1A1A2E', '#2D2D4E', '#4A3F6B'] : Gradients.meshVault}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.header}
          >
            <View style={styles.profileRow}>
              <View style={[styles.avatarCircle, isPremium && styles.avatarCirclePremium]}>
                <Text style={styles.avatarText}>{user?.username?.[0]?.toUpperCase() ?? '?'}</Text>
                {isPremium && <View style={styles.avatarCrown}><Text style={{ fontSize: 10 }}>⭐</Text></View>}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.username}>{user?.username}</Text>
                <Text style={styles.email}>{user?.email}</Text>
                {isPremium
                  ? <View style={styles.premiumBadge}><Text style={styles.premiumBadgeText}>⭐ Premium tag</Text></View>
                  : <Pressable style={styles.freeBadge} onPress={() => setUpsellVisible(true)}>
                      <Text style={styles.freeBadgeText}>Ingyenes → Upgrade?</Text>
                    </Pressable>
                }
              </View>
              {/* Szakértő badge */}
              {(profile?.reputation ?? 0) >= 10 && (
                <View style={styles.expertBadge}>
                  <Text style={styles.expertText}>🏆</Text>
                  <Text style={styles.expertLabel}>Szakértő</Text>
                </View>
              )}
            </View>
          </LinearGradient>

          <View style={styles.body}>
            {/* ── Napi limitek (csak FREE-nek) ─────────────────────────── */}
            {!isPremium && tierStatus && (
              <GlassCardSimple backgroundColor="rgba(255,107,53,0.05)" borderColor="rgba(255,107,53,0.15)">
                <Text style={styles.sectionTitle}>Mai felhasználás</Text>
                <View style={{ gap: Spacing.sm }}>
                  <DailyLimitBar
                    type="logs"
                    used={tierStatus.limits.dailyLogs.used}
                    limit={tierStatus.limits.dailyLogs.limit ?? 10}
                    onUpgrade={() => setUpsellVisible(true)}
                  />
                  <DailyLimitBar
                    type="scans"
                    used={tierStatus.limits.dailyScans.used}
                    limit={tierStatus.limits.dailyScans.limit ?? 5}
                    onUpgrade={() => setUpsellVisible(true)}
                  />
                </View>
              </GlassCardSimple>
            )}

            {/* ── Reputáció kártya ─────────────────────────────────── */}
            <ReputationCard
              reputation={profile?.reputation ?? 0}
              username={user?.username ?? ''}
            />

            <GlassCardSimple>
              <ReputationLevelsGuide currentRep={profile?.reputation ?? 0} />
            </GlassCardSimple>

            {/* ── Admin panel link (csak ADMIN-nak) ────────────────── */}
            {user?.role === 'ADMIN' && (
              <Pressable onPress={() => router.push('/admin')}>
                <LinearGradient
                  colors={['#1A1A2E', '#2D2D4E']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={styles.adminCard}
                >
                  <Text style={styles.adminCardEmoji}>🛡️</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.adminCardTitle}>Admin Panel</Text>
                    <Text style={styles.adminCardSub}>Moderáció, felhasználók, badge-ek</Text>
                  </View>
                  <Text style={styles.adminCardArrow}>→</Text>
                </LinearGradient>
              </Pressable>
            )}

            {/* ── Sorozat ──────────────────────────────────────────────── */}
            {streak && (
              <LinearGradient
                colors={streak.streak > 0 ? ['#FF6B35', '#FF9A6C'] : ['#E8E8E8', '#F5F5F5']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={styles.streakCard}
              >
                <Text style={styles.streakEmoji}>🔥</Text>
                <View>
                  <Text style={styles.streakCount}>{streak.streak} napos sorozat</Text>
                  <Text style={styles.streakMsg}>{streak.message}</Text>
                </View>
              </LinearGradient>
            )}

            {/* ── Heti gyors összesítő ─────────────────────────────────── */}
            {weekly && (
              <View style={styles.statsRow}>
                <StatCard
                  icon="🔥" label="Átlag kcal"
                  value={String(weekly.averages?.kcal ?? 0)}
                  sub="/nap" color={Colors.primary}
                />
                <StatCard
                  icon="💪" label="Átlag fehérje"
                  value={`${weekly.averages?.protein ?? 0}g`}
                  color={Colors.macro.protein}
                />
                <StatCard
                  icon="💧" label="Naplózott nap"
                  value={String(weekly.days?.filter((d: any) => d.kcal > 0).length ?? 0)}
                  sub="/ 7"
                />
              </View>
            )}

            {/* ── Heti grafikon ─────────────────────────────────────────── */}
            {weekly && (
              <GlassCardSimple>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Heti kalória</Text>
                  {!isPremium && (
                    <Pressable onPress={() => setUpsellVisible(true)}>
                      <Text style={styles.seeMoreLink}>Több hét →</Text>
                    </Pressable>
                  )}
                </View>
                <WeeklyBarChart days={weekly.days ?? []} goal={dailyKcalGoal} />
                <View style={styles.chartLegend}>
                  <View style={[styles.legendDot, { backgroundColor: Colors.primary }]} />
                  <Text style={styles.legendText}>Ma</Text>
                  <View style={[styles.legendDot, { backgroundColor: '#A8EDBC', marginLeft: Spacing.sm }]} />
                  <Text style={styles.legendText}>Többi nap</Text>
                  <Text style={styles.legendGoal}>Cél: {dailyKcalGoal} kcal</Text>
                </View>
              </GlassCardSimple>
            )}

            {/* ── Havi statisztika (PREMIUM LOCK) ──────────────────────── */}
            <PremiumLockOverlay feature="monthly_stats" locked={!isPremium}>
              <GlassCardSimple>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Havi összesítő</Text>
                  {isPremium && <PremiumBadge />}
                </View>
                <View style={styles.mockMonthly}>
                  {['H', 'K', 'Sz', 'Cs', 'P', 'Sz', 'V'].map((d, i) => (
                    <View key={i} style={styles.mockBar}>
                      <View style={[styles.mockBarFill, { height: `${30 + Math.random() * 60}%` }]} />
                      <Text style={styles.mockLabel}>{d}</Text>
                    </View>
                  ))}
                </View>
              </GlassCardSimple>
            </PremiumLockOverlay>

            {/* ── Export (PREMIUM LOCK) ─────────────────────────────────── */}
            <PremiumLockOverlay feature="export" locked={!isPremium} compact={false}>
              <GlassCardSimple
                backgroundColor="rgba(46,204,113,0.06)"
                borderColor="rgba(46,204,113,0.2)"
              >
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>📤 Adatok exportálása</Text>
                  {isPremium && <PremiumBadge />}
                </View>
                <Text style={styles.exportDesc}>
                  Töltsd le az összes naplóbejegyzésedet Excel formátumban,
                  beleértve a vízfogyasztást és a makrókat is.
                </Text>
                <PrimaryButton
                  label="📥  Letöltés XLSX"
                  onPress={() => setExportVisible(true)}
                  size="md"
                />
              </GlassCardSimple>
            </PremiumLockOverlay>

            {/* ── Premium upsell kártya (csak FREE) ────────────────────── */}
            {!isPremium && (
              <Pressable onPress={() => setUpsellVisible(true)}>
                <LinearGradient
                  colors={['#1A1A2E', '#2D2D4E', '#4A3F6B']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={styles.upsellCard}
                >
                  <Text style={styles.upsellEmoji}>⭐</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.upsellTitle}>Válts Premiumra!</Text>
                    <Text style={styles.upsellSub}>
                      Korlátlan naplózás, export, havi statisztikák és több.
                    </Text>
                  </View>
                  <Text style={styles.upsellArrow}>→</Text>
                </LinearGradient>
              </Pressable>
            )}

            {/* ── Beállítások ───────────────────────────────────────────── */}
            <GlassCardSimple padding={0}>
              <Text style={[styles.sectionTitle, { padding: Spacing.lg, paddingBottom: Spacing.sm }]}>
                Beállítások
              </Text>
              {[
                { icon: '👤', label: 'Profil szerkesztése', onPress: () => {} },
                { icon: '🌍', label: 'Nyelv', onPress: () => {} },
                { icon: '🔔', label: 'Értesítések', onPress: () => {} },
                { icon: '🛡️', label: 'Adatkezelés (GDPR)', onPress: () => {} },
                {
                  icon: '⭐',
                  label: isPremium ? 'Premium kezelése' : 'Premium megvásárlása',
                  onPress: () => setUpsellVisible(true),
                  accent: !isPremium,
                },
              ].map((item, i, arr) => (
                <Pressable
                  key={item.label}
                  style={[styles.settingsRow, i < arr.length - 1 && styles.settingsDivider]}
                  onPress={item.onPress}
                >
                  <Text style={styles.settingsIcon}>{item.icon}</Text>
                  <Text style={[styles.settingsLabel, item.accent && { color: Colors.primary, fontWeight: '700' }]}>
                    {item.label}
                  </Text>
                  <Text style={styles.settingsArrow}>›</Text>
                </Pressable>
              ))}
            </GlassCardSimple>

            <Pressable style={styles.logoutBtn} onPress={handleLogout}>
              <Text style={styles.logoutText}>🚪 Kijelentkezés</Text>
            </Pressable>

            <Text style={styles.versionText}>VitaScan v1.0 · {isPremium ? '⭐ Premium' : 'Ingyenes'}</Text>
            <View style={{ height: 110 }} />
          </View>
        </ScrollView>
      </SafeAreaView>

      <PremiumUpsellModal
        visible={upsellVisible}
        onClose={() => setUpsellVisible(false)}
        onUpgrade={() => {
          setUpsellVisible(false);
          Alert.alert('Hamarosan', 'Stripe / RevenueCat integráció — Fázis 7b!');
        }}
      />

      <ExportEngine
        visible={exportVisible}
        onClose={() => setExportVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { padding: Spacing.xl, paddingTop: Spacing['2xl'] },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  avatarCircle: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', position: 'relative',
  },
  avatarCirclePremium: { backgroundColor: '#4A3F6B', borderWidth: 2, borderColor: '#FFD700' },
  avatarText: { fontSize: 26, fontWeight: '900', color: '#fff' },
  avatarCrown: {
    position: 'absolute', top: -6, right: -4,
    backgroundColor: '#FFD700', borderRadius: 10, width: 20, height: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  username: { fontSize: 18, fontWeight: '800', color: '#fff' },
  email: { ...Typography.caption, color: 'rgba(255,255,255,0.7)', marginTop: 1 },
  premiumBadge: {
    backgroundColor: 'rgba(255,215,0,0.25)', borderRadius: Radius.full,
    paddingVertical: 2, paddingHorizontal: 10, alignSelf: 'flex-start', marginTop: 5,
    borderWidth: 1, borderColor: 'rgba(255,215,0,0.5)',
  },
  premiumBadgeText: { color: '#FFD700', fontSize: 11, fontWeight: '800' },
  freeBadge: {
    backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: Radius.full,
    paddingVertical: 2, paddingHorizontal: 10, alignSelf: 'flex-start', marginTop: 5,
  },
  freeBadgeText: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '700' },
  expertBadge: { alignItems: 'center', gap: 2 },
  expertText: { fontSize: 24 },
  expertLabel: { fontSize: 9, color: 'rgba(255,255,255,0.7)', fontWeight: '700' },
  body: { padding: Spacing.lg, gap: Spacing.md },
  sectionTitle: { ...Typography.subtitle, color: Colors.text.primary },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  seeMoreLink: { ...Typography.caption, color: Colors.primary, fontWeight: '700' },
  streakCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg, borderRadius: Radius.xl, padding: Spacing.lg },
  streakEmoji: { fontSize: 40 },
  streakCount: { fontSize: 20, fontWeight: '900', color: '#fff' },
  streakMsg: { ...Typography.caption, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: Spacing.sm },
  chartLegend: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.sm, gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { ...Typography.caption, color: Colors.text.muted },
  legendGoal: { ...Typography.caption, color: Colors.text.muted, marginLeft: 'auto' },
  mockMonthly: { flexDirection: 'row', gap: 4, height: 80, alignItems: 'flex-end' },
  mockBar: { flex: 1, alignItems: 'center', gap: 3 },
  mockBarFill: { width: '100%', backgroundColor: 'rgba(0,0,0,0.08)', borderRadius: 4 },
  mockLabel: { fontSize: 8, color: Colors.text.muted },
  exportDesc: { ...Typography.body, color: Colors.text.secondary, lineHeight: 21, marginBottom: Spacing.md },
  upsellCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: Radius.xl, padding: Spacing.lg },
  upsellEmoji: { fontSize: 34 },
  upsellTitle: { fontSize: 16, fontWeight: '800', color: '#FFD700' },
  upsellSub: { ...Typography.caption, color: 'rgba(255,255,255,0.7)', marginTop: 2, lineHeight: 17 },
  upsellArrow: { color: '#FFD700', fontSize: 22, fontWeight: '900' },
  settingsRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: Spacing.lg, gap: Spacing.md },
  settingsDivider: { borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  settingsIcon: { fontSize: 18 },
  settingsLabel: { flex: 1, fontSize: 15, color: Colors.text.primary },
  settingsArrow: { fontSize: 20, color: '#CCC' },
  logoutBtn: { backgroundColor: 'rgba(231,76,60,0.08)', borderRadius: Radius.xl, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(231,76,60,0.2)' },
  logoutText: { color: '#E74C3C', fontSize: 15, fontWeight: '700' },
  versionText: { ...Typography.caption, color: Colors.text.muted, textAlign: 'center' },
  adminCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: Radius.xl, padding: Spacing.lg },
  adminCardEmoji: { fontSize: 28 },
  adminCardTitle: { fontSize: 15, fontWeight: '800', color: '#fff' },
  adminCardSub: { ...Typography.caption, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  adminCardArrow: { color: 'rgba(255,255,255,0.6)', fontSize: 20, fontWeight: '800' },
});
