import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  Alert, ActivityIndicator, RefreshControl, Image, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from '../../src/services/haptics';
import { useTranslation } from 'react-i18next';
import { MaterialCommunityIcons, Ionicons, MaterialIcons } from '@expo/vector-icons';

import i18n, { setAppLanguage } from '../../src/i18n';
import { useAuthStore } from '../../src/stores/authStore';
import { profileApi, premiumApi, statsApi } from '../../src/services/api';
import { PremiumUpsellModal } from '../../src/components/premium/PremiumGate';
import { Colors, Spacing } from '../../src/design/tokens';
import { ResponsiveLayout, webPointer } from '../../src/components/layout/ResponsiveLayout';
import { useResponsive } from '../../src/hooks/useResponsive';

type StatItemProps = {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  bg: string;
};

function StatCard({ icon, label, value, bg }: StatItemProps) {
  return (
    <View style={styles.statCardStack}>
      <View style={styles.cardShadow22} />
      <View style={[styles.statCardInner, { backgroundColor: bg }]}>
        <View style={styles.statIconCircle}>{icon}</View>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
      </View>
    </View>
  );
}

type SettingsRowProps = {
  iconBg: string;
  icon: React.ReactNode;
  label: string;
  value?: string;
  onPress?: () => void;
  isLast?: boolean;
};

function SettingsRow({ iconBg, icon, label, value, onPress, isLast }: SettingsRowProps) {
  return (
    <View>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: 14,
          opacity: pressed ? 0.72 : 1,
          ...(webPointer ?? {}),
        })}
      >
        <View style={styles.settingsRowMain}>
          <View style={[styles.settingsRowIconWrap, { backgroundColor: iconBg }]}>{icon}</View>
          <Text style={styles.settingsRowLabel} numberOfLines={1} ellipsizeMode="tail">
            {label}
          </Text>
        </View>
        <View style={styles.settingsRowRight}>
          {value ? (
            <Text style={styles.settingsRowValue} numberOfLines={1}>
              {value}
            </Text>
          ) : null}
          {value ? null : <MaterialIcons name="chevron-right" size={18} color="#B0BEC5" />}
        </View>
      </Pressable>
    </View>
  );
}

export default function ProfileScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { isDesktop: _isDesktop } = useResponsive();
  const { user, logout } = useAuthStore();
  const [profile, setProfile] = useState<any>(null);
  const [premium, setPremium] = useState<any>(null);
  const [streak, setStreak] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [upsellVisible, setUpsellVisible] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [p, pr, s] = await Promise.all([
        profileApi.getMe().catch(() => null),
        premiumApi.getStatus().catch(() => null),
        statsApi.streak().catch(() => null),
      ]);
      setProfile(p);
      setPremium(pr);
      setStreak(s?.streak ?? null);
    } catch { }
  }, []);

  useEffect(() => {
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

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

  const cycleLanguage = async () => {
    await Haptics.selectionAsync();
    await setAppLanguage(i18n.language === 'hu' ? 'en' : 'hu');
  };

  if (loading) {
    return (
      <View style={styles.screen}>
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color={Colors.dashboard.stroke} />
        </View>
      </View>
    );
  }

  const isPremium = premium?.tier === 'PREMIUM';
  const reputation: number = profile?.reputation ?? 0;
  const xpCurrent = Math.max(0, reputation * 65);
  const xpNext = 1000;
  const xpClamped = Math.min(xpCurrent, xpNext);
  const xpPercent = Math.min(100, Math.max(4, (xpClamped / xpNext) * 100));
  const displayLevel = Math.max(1, Math.min(99, Math.floor(xpClamped / 200) + 1));

  const recipeCount = profile?.recipeCount ?? 142;
  const activeDays = streak ?? 0;
  const achievementsCount = (profile?.badges?.length ?? 0) + (reputation >= 10 ? 1 : 0) + (isPremium ? 1 : 0);
  const friendsCount = profile?.friendsCount ?? 24;

  const languageLabel = i18n.language === 'hu' ? t('profile.languageHu') : t('profile.languageEn');

  return (
    <ResponsiveLayout>
    <View style={styles.screen}>
      {/* Pastel blobs */}
      <View style={[styles.blob, styles.blobMint]} pointerEvents="none" />
      <View style={[styles.blob, styles.blobPeach]} pointerEvents="none" />
      <View style={[styles.blob, styles.blobLavender]} pointerEvents="none" />

      <SafeAreaView edges={['top']} style={{ backgroundColor: 'transparent' }}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('profile.screenTitle')}</Text>
        </View>
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.dashboard.stroke} />
        }
      >
        {/* ── Hero header card ──────────────────────────────── */}
        <View style={styles.cardStack}>
          <View style={styles.cardShadow26} />
          <View style={styles.heroInner}>
            {isPremium && (
              <View style={styles.premiumPill}>
                <Text style={styles.premiumPillText}>{t('profile.premiumBadge')}</Text>
              </View>
            )}
            <View style={styles.avatarLargeInner}>
              <Image
                source={{ uri: 'https://i.pravatar.cc/150?img=32' }}
                style={styles.avatarLargeImg}
              />
            </View>
            <Text style={styles.heroName} numberOfLines={1}>
              {user?.username ?? t('profile.title')}
            </Text>
            <Text style={styles.heroSubtitle}>{t('profile.levelTitle')}</Text>
          </View>
        </View>

        {/* ── Rank / Level progress card ─────────────────────── */}
        <View style={styles.cardStack}>
          <View style={styles.cardShadow26} />
          <View style={styles.levelInner}>
          <View style={styles.rankHeaderRow}>
            <View style={styles.rankTitles}>
              <Text style={styles.rankLabel}>{t('profile.rankLabel')}</Text>
              <Text style={styles.rankTitle}>{t('profile.levelTitle')}</Text>
            </View>
            <View style={styles.levelPill}>
              <Text style={styles.levelPillText}>{t('profile.rankLevelBadge', { n: displayLevel })}</Text>
            </View>
          </View>

          <View style={styles.xpBarRow}>
            <View style={styles.xpTrackWrap}>
              <View style={styles.xpTrack}>
                <View style={[styles.xpFill, { width: `${xpPercent}%` }]} />
              </View>
            </View>
            <View style={styles.xpStarCircle}>
              <MaterialCommunityIcons name="star" size={18} color="#E65100" />
            </View>
          </View>

          <Text style={styles.xpLabel}>
            {t('profile.levelXpTo', { current: xpClamped, next: xpNext })}
          </Text>
          </View>
        </View>

        {/* ── 2 × 2 stat grid ───────────────────────────────── */}
        <View style={styles.statGrid}>
          <View style={styles.statRow}>
            <StatCard
              icon={<MaterialCommunityIcons name="silverware-fork-knife" size={22} color={Colors.dashboard.stroke} />}
              label={t('profile.statRecipes')}
              value={recipeCount}
              bg="#D7EBD2"
            />
            <StatCard
              icon={<Ionicons name="water" size={22} color={Colors.dashboard.stroke} />}
              label={t('profile.statActiveDays')}
              value={activeDays}
              bg="#FCE2C8"
            />
          </View>
          <View style={styles.statRow}>
            <StatCard
              icon={<MaterialCommunityIcons name="trophy-variant" size={22} color={Colors.dashboard.stroke} />}
              label={t('profile.statAchievements')}
              value={achievementsCount}
              bg="#D8E6F2"
            />
            <StatCard
              icon={<Ionicons name="people" size={22} color={Colors.dashboard.stroke} />}
              label={t('profile.statFriends')}
              value={friendsCount}
              bg="#F4E5C2"
            />
          </View>
        </View>

        {/* ── Settings list ─────────────────────────────────── */}
        <View style={styles.settingsCardStack}>
          <View style={styles.cardShadow26} />
          <View style={styles.settingsInner}>
            <Text style={styles.settingsTitle}>{t('profile.settingsTitle')}</Text>

            <SettingsRow
              iconBg="#E8F5E9"
              icon={<MaterialCommunityIcons name="account-edit-outline" size={20} color="#2E7D32" />}
              label={t('profile.settingsPersonal')}
              onPress={() => router.push('/personal-data')}
            />
            <SettingsRow
              iconBg="#E3F2FD"
              icon={<Ionicons name="notifications-outline" size={20} color="#1565C0" />}
              label={t('profile.settingsNotifications')}
              onPress={() => router.push('/notifications')}
            />
            <SettingsRow
              iconBg="#FFF3E0"
              icon={<MaterialCommunityIcons name="target" size={20} color="#E65100" />}
              label={t('profile.settingsGoals')}
              onPress={() => router.push('/onboarding')}
            />
            <SettingsRow
              iconBg="#E8F5E9"
              icon={<MaterialCommunityIcons name="earth" size={20} color="#2E7D32" />}
              label={t('profile.settingsLanguage')}
              value={languageLabel}
              onPress={cycleLanguage}
            />
            <SettingsRow
              iconBg="#EFEBE9"
              icon={<MaterialCommunityIcons name="medal-outline" size={20} color="#5D4037" />}
              label={t('profile.settingsPremium')}
              onPress={() => setUpsellVisible(true)}
              isLast
            />
          </View>
        </View>

        {/* ── Admin (csak ADMIN-nak) ───────────────────────── */}
        {user?.role === 'ADMIN' && (
          <View style={styles.cardStack}>
            <View style={styles.cardShadow9} />
            <Pressable style={[styles.adminBtn, webPointer]} onPress={() => router.push('/admin/index')}>
              <MaterialIcons name="shield" size={18} color={Colors.dashboard.stroke} />
              <Text style={styles.adminBtnText}>{t('profile.openAdmin')}</Text>
            </Pressable>
          </View>
        )}

        {/* ── Logout ───────────────────────────────────────── */}
        <Pressable style={[styles.logoutBtn, webPointer]} onPress={handleLogout}>
          <MaterialIcons name="logout" size={18} color="#B83B3B" />
          <Text style={styles.logoutText}>{t('profile.logout')}</Text>
        </Pressable>

        <View style={{ height: Platform.OS === 'web' ? 72 : 110 }} />
      </ScrollView>

      <PremiumUpsellModal
        visible={upsellVisible}
        feature="export"
        onClose={() => setUpsellVisible(false)}
      />
    </View>
    </ResponsiveLayout>
  );
}

const STROKE = Colors.dashboard.stroke;
const CARD_BORDER = '#E6E6E6';

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.dashboard.page },
  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  blob: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: STROKE,
  },
  blobMint: {
    width: 260, height: 260,
    top: -80, right: -80,
    backgroundColor: 'rgba(232,245,233,0.7)',
    borderTopLeftRadius: 130,
    borderTopRightRadius: 110,
    borderBottomRightRadius: 90,
    borderBottomLeftRadius: 140,
  },
  blobPeach: {
    width: 220, height: 220,
    bottom: '18%', left: -80,
    backgroundColor: 'rgba(255,218,214,0.55)',
    borderTopLeftRadius: 110,
    borderTopRightRadius: 130,
    borderBottomRightRadius: 90,
    borderBottomLeftRadius: 110,
  },
  blobLavender: {
    width: 180, height: 180,
    top: '38%', right: -60,
    backgroundColor: 'rgba(234,222,204,0.45)',
    borderTopLeftRadius: 100,
    borderTopRightRadius: 70,
    borderBottomRightRadius: 110,
    borderBottomLeftRadius: 80,
  },

  header: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: STROKE,
    letterSpacing: -0.4,
  },

  scroll: {
    paddingHorizontal: Spacing.xl,
    paddingTop: 16,
    paddingBottom: 40,
    gap: 16,
  },

  /** Ugyanaz a „hard offset” árnyék, mint a beállítások kártyán */
  cardStack: {
    position: 'relative',
  },
  cardShadow26: {
    position: 'absolute',
    top: 3,
    left: 2,
    right: -2,
    bottom: -2,
    backgroundColor: Colors.dashboard.shadowHard,
    borderRadius: 26,
  },
  cardShadow22: {
    position: 'absolute',
    top: 3,
    left: 2,
    right: -2,
    bottom: -2,
    backgroundColor: Colors.dashboard.shadowHard,
    borderRadius: 22,
  },
  cardShadow9: {
    position: 'absolute',
    top: 3,
    left: 2,
    right: -2,
    bottom: -2,
    backgroundColor: Colors.dashboard.shadowHard,
    borderRadius: 9,
  },
  /** Stat csempék: teljes szélesség megosztása a 2×2 rácsban (mint flex:1 a soron) */
  statCardStack: {
    flex: 1,
    position: 'relative',
    minWidth: 0,
  },

  // ── Hero card ─────────────────────────────────────────
  heroInner: {
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    paddingTop: 22,
    paddingBottom: 22,
    paddingHorizontal: 18,
    alignItems: 'center',
    gap: 8,
    minHeight: 168,
    justifyContent: 'center',
  },
  premiumPill: {
    position: 'absolute',
    top: 12,
    right: 14,
    backgroundColor: '#1C1B1B',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    zIndex: 5,
  },
  premiumPillText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#FFD56B',
    letterSpacing: 0.5,
  },
  avatarLargeInner: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    marginBottom: 4,
  },
  avatarLargeImg: { width: '100%', height: '100%' },
  heroName: {
    fontSize: 19,
    fontWeight: '900',
    color: STROKE,
    letterSpacing: -0.3,
  },
  heroSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#666666',
    marginTop: -2,
  },

  // ── Rank / progress card ──────────────────────────────
  levelInner: {
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    gap: 14,
  },
  rankHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  rankTitles: { flex: 1 },
  rankLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9E9E9E',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  rankTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: STROKE,
    marginTop: 4,
    letterSpacing: -0.3,
  },
  levelPill: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  levelPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#2E7D32',
    letterSpacing: 0.2,
  },
  xpBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  xpTrackWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  xpTrack: {
    height: 12,
    backgroundColor: '#EDEDED',
    borderRadius: 999,
    overflow: 'hidden',
  },
  xpFill: {
    height: '100%',
    backgroundColor: '#5EAD65',
    borderRadius: 999,
  },
  xpStarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFDCC8',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  xpLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#757575',
    textAlign: 'center',
    alignSelf: 'center',
  },

  // ── Stat grid ─────────────────────────────────────────
  statGrid: { gap: 12 },
  statRow: { flexDirection: 'row', gap: 12 },
  statCardInner: {
    flex: 1,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    paddingHorizontal: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 108,
  },
  statIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '900',
    color: STROKE,
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: STROKE,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    textAlign: 'center',
  },

  // ── Settings ──────────────────────────────────────────
  settingsCardStack: {
    position: 'relative',
    marginTop: 8,
  },
  settingsInner: {
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    borderWidth: 1,
    borderColor: STROKE,
    paddingTop: 20,
    paddingBottom: 8,
    paddingHorizontal: 20,
  },
  settingsTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1A4B75',
    marginBottom: 15,
  },
  settingsRowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  settingsRowIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: STROKE,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  settingsRowLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: STROKE,
  },
  settingsRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
  },
  settingsRowValue: {
    fontSize: 13,
    fontWeight: '500',
    color: '#1A4B75',
    maxWidth: 100,
    alignContent: 'center',
  },

  adminBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 9,
    paddingVertical: 12,
    marginTop: 4,
  },
  adminBtnText: { fontSize: 14, fontWeight: '800', color: STROKE },

  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  logoutText: { fontSize: 14, fontWeight: '800', color: '#B83B3B' },
});
