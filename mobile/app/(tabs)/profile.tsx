import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  Alert, ActivityIndicator, RefreshControl, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import i18n, { setAppLanguage } from '../../src/i18n';

import { useAuthStore } from '../../src/stores/authStore';
import { profileApi, premiumApi } from '../../src/services/api';
import { GlassCardSimple } from '../../src/components/ui/GlassCard';
import { PrimaryButton, GhostButton } from '../../src/components/ui/Button';
import { ReputationCard } from '../../src/components/badge/ExpertBadge';
import { PremiumUpsellModal, PremiumBadge } from '../../src/components/premium/PremiumGate';
import AnimatedMeshBackground from '../../src/components/ui/AnimatedMeshBackground';
import { Colors, Gradients, Radius, Spacing, Typography } from '../../src/design/tokens';

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
  const { t } = useTranslation();
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
      t('profile.logoutTitle'),
      t('profile.logoutConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('profile.logout'),
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
  const goalLabels: Record<string, string> = {
    LOSE: i18n.language === 'en' ? '📉 Weight loss' : '📉 Fogyás',
    MAINTAIN: i18n.language === 'en' ? '⚖️ Maintain' : '⚖️ Szinten tartás',
    GAIN: i18n.language === 'en' ? '📈 Gain mass' : '📈 Tömegnövelés',
  };
  const activityLabels: Record<string, string> = {
    SEDENTARY: i18n.language === 'en' ? '🪑 Sedentary' : '🪑 Ülőmunka',
    LIGHT: i18n.language === 'en' ? '🚶 Light activity' : '🚶 Könnyű aktivitás',
    MODERATE: i18n.language === 'en' ? '🏃 Moderate activity' : '🏃 Közepes aktivitás',
    ACTIVE: i18n.language === 'en' ? '💪 Active' : '💪 Aktív',
    VERY_ACTIVE: i18n.language === 'en' ? '🔥 Very active' : '🔥 Nagyon aktív',
  };

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
                <Text style={styles.premiumPillText}>⭐ {t('premium.vitascanPremium')}</Text>
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
            <Text style={styles.sectionTitle}>{t('profile.title')}</Text>
            {p ? (
              <>
                <InfoRow label={t('profile.weight')}  value={p.weightKg  ? `${p.weightKg} kg`   : t('profile.notProvided')} />
                <InfoRow label={t('profile.height')}  value={p.heightCm  ? `${p.heightCm} cm`   : t('profile.notProvided')} />
                <InfoRow label={t('profile.goal')}       value={p.goal      ? goalLabels[p.goal]  ?? p.goal : t('profile.notProvided')} />
                <InfoRow label={t('profile.activity')} value={p.activityLevel ? activityLabels[p.activityLevel] ?? p.activityLevel : t('profile.notProvided')} />
                <InfoRow label={t('profile.dailyKcal')} value={p.dailyKcalGoal ? `${Math.round(p.dailyKcalGoal)} kcal` : '—'} />
                <InfoRow label={t('profile.dailyWater')}   value={p.dailyWaterGoalMl ? `${p.dailyWaterGoalMl} ml` : '—'} />
              </>
            ) : (
              <Text style={styles.noProfile}>{t('profile.noProfile')}</Text>
            )}
          </GlassCardSimple>

          <GlassCardSimple>
            <Text style={styles.sectionTitle}>{t('language.switchLabel')}</Text>
            <View style={styles.languageRow}>
              <Pressable
                style={[styles.languageChip, i18n.language === 'hu' && styles.languageChipActive]}
                onPress={() => setAppLanguage('hu')}
              >
                <Text style={[styles.languageChipText, i18n.language === 'hu' && styles.languageChipTextActive]}>
                  {t('language.hungarian')}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.languageChip, i18n.language === 'en' && styles.languageChipActive]}
                onPress={() => setAppLanguage('en')}
              >
                <Text style={[styles.languageChipText, i18n.language === 'en' && styles.languageChipTextActive]}>
                  {t('language.english')}
                </Text>
              </Pressable>
            </View>
          </GlassCardSimple>

          {/* Premium státusz */}
          {!isPremium && (
            <GlassCardSimple
              backgroundColor="rgba(255,215,0,0.1)"
              borderColor="rgba(255,215,0,0.3)"
            >
              <Text style={styles.sectionTitle}>🔓 {t('profile.premiumFeatures')}</Text>
              <Text style={styles.premiumDesc}>
                {t('profile.premiumDesc')}
              </Text>
              <PrimaryButton
                label={`⭐ ${t('profile.upgrade')}`}
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
                <Text style={styles.sectionTitle}>{t('profile.premiumSub')}</Text>
                <PremiumBadge />
              </View>
              <InfoRow label={t('profile.status')}        value={`✅ ${t('profile.active')}`} />
              <InfoRow label={t('profile.unlimitedDailyLogs')}     value={t('profile.unlimitedValue')} />
              <InfoRow label={t('profile.unlimitedScans')}   value={t('profile.unlimitedValue')} />
              <InfoRow label={t('profile.excelExport')}   value={`✅ ${t('profile.available')}`} />
            </GlassCardSimple>
          )}

          {/* Admin panel link */}
          {user?.role === 'ADMIN' && (
            <GlassCardSimple backgroundColor="rgba(26,26,46,0.08)">
              <Text style={styles.sectionTitle}>🛡️ {t('profile.admin')}</Text>
              <PrimaryButton
                label={t('profile.openAdmin')}
                onPress={() => router.push('/admin')}
                style={{ marginTop: Spacing.sm }}
              />
            </GlassCardSimple>
          )}

          {/* Kijelentkezés */}
          <GhostButton
            label={t('profile.logout')}
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
  languageRow: { flexDirection: 'row', gap: Spacing.sm },
  languageChip: {
    flex: 1, alignItems: 'center', paddingVertical: 10,
    borderRadius: Radius.full, backgroundColor: '#F5F5F5', borderWidth: 1, borderColor: '#E8E8E8',
  },
  languageChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primarySoft },
  languageChipText: { ...Typography.body, color: Colors.text.secondary, fontWeight: '600' },
  languageChipTextActive: { color: Colors.primary, fontWeight: '800' },
});
