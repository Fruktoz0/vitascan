import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  TextInput, FlatList, Alert, ActivityIndicator,
  RefreshControl, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

import { adminApi } from '../../services/api';
import { GlassCardSimple } from '../../components/ui/GlassCard';
import { PrimaryButton, GhostButton } from '../../components/ui/Button';
import { ExpertBadge, getReputationLevel } from '../../components/badge/ExpertBadge';
import { Colors, Gradients, Radius, Spacing, Typography } from '../../design/tokens';

// ─── Típusok ──────────────────────────────────────────────────────────────────

type AdminTab = 'dashboard' | 'foods' | 'users';
type FoodStatus = 'UNVERIFIED' | 'VERIFIED' | 'BANNED';

// ─── Stat doboz ───────────────────────────────────────────────────────────────

function StatBox({ label, value, emoji, color, sub }: {
  label: string; value: number | string; emoji: string; color: string; sub?: string;
}) {
  return (
    <View style={[statStyles.box, { borderLeftColor: color }]}>
      <Text style={statStyles.emoji}>{emoji}</Text>
      <Text style={[statStyles.value, { color }]}>{value}</Text>
      <Text style={statStyles.label}>{label}</Text>
      {sub && <Text style={statStyles.sub}>{sub}</Text>}
    </View>
  );
}
const statStyles = StyleSheet.create({
  box: {
    flex: 1, backgroundColor: '#fff', borderRadius: Radius.lg,
    padding: Spacing.md, alignItems: 'center', gap: 3,
    borderLeftWidth: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  emoji: { fontSize: 22 },
  value: { fontSize: 22, fontWeight: '900' },
  label: { ...Typography.caption, color: Colors.text.muted, textAlign: 'center' },
  sub: { fontSize: 9, color: Colors.text.muted },
});

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: FoodStatus }) {
  const cfg = {
    VERIFIED:   { bg: '#F0FFF4', text: '#2ECC71', label: '✅ Ellenőrzött' },
    UNVERIFIED: { bg: '#FFF8EC', text: '#F5A623', label: '⏳ Függőben' },
    BANNED:     { bg: '#FFF0F0', text: '#E74C3C', label: '🚫 Tiltott' },
  }[status];
  return (
    <View style={[sbStyles.badge, { backgroundColor: cfg.bg }]}>
      <Text style={[sbStyles.text, { color: cfg.text }]}>{cfg.label}</Text>
    </View>
  );
}
const sbStyles = StyleSheet.create({
  badge: { borderRadius: Radius.full, paddingVertical: 3, paddingHorizontal: 8 },
  text: { fontSize: 11, fontWeight: '800' },
});

// ─── Tab bar ──────────────────────────────────────────────────────────────────

const TABS: { id: AdminTab; label: string; emoji: string }[] = [
  { id: 'dashboard', label: 'Dashboard',    emoji: '📊' },
  { id: 'foods',     label: 'Ételek',       emoji: '🍽️' },
  { id: 'users',     label: 'Felhasználók', emoji: '👥' },
];

// ─── Dashboard tab ────────────────────────────────────────────────────────────

function DashboardTab() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetch = useCallback(async () => {
    try {
      const d = await adminApi.getDashboard();
      setData(d);
    } catch {} finally {
      setLoading(false); setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetch(); }, []);

  if (loading) return <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />;

  const s = data?.stats;

  return (
    <ScrollView
      contentContainerStyle={styles.tabContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetch(); }} tintColor={Colors.primary} />}
    >
      <Text style={styles.sectionTitle}>Áttekintés</Text>
      <View style={styles.statRow}>
        <StatBox emoji="👥" label="Felhasználók" value={s?.totalUsers ?? 0} color="#4A90D9"
          sub={`+${s?.newUsersToday ?? 0} ma`} />
        <StatBox emoji="⭐" label="Premium" value={s?.premiumUsers ?? 0} color="#FFD700" />
      </View>
      <View style={styles.statRow}>
        <StatBox emoji="🍽️" label="Ételek" value={s?.totalFoods ?? 0} color="#2ECC71" />
        <StatBox emoji="⏳" label="Függőben" value={s?.pendingFoods ?? 0} color="#F5A623" />
        <StatBox emoji="🚫" label="Tiltott" value={s?.bannedFoods ?? 0} color="#E74C3C" />
      </View>
      <View style={styles.statRow}>
        <StatBox emoji="📝" label="Összes napló" value={s?.totalLogs ?? 0} color="#9B59B6" />
        <StatBox emoji="📅" label="Ma naplózott" value={s?.logsToday ?? 0} color={Colors.primary}
          sub="bejegyzés" />
      </View>

      {data?.topContributors?.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>🏆 Top közreműködők</Text>
          <GlassCardSimple padding={0}>
            {data.topContributors.map((u: any, i: number) => {
              const level = getReputationLevel(u.reputation);
              return (
                <View key={u.id} style={[styles.contribRow, i < data.topContributors.length - 1 && styles.rowDivider]}>
                  <View style={styles.rankCircle}>
                    <Text style={styles.rankNum}>{i + 1}</Text>
                  </View>
                  <Text style={styles.contribEmoji}>{level.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.contribName}>{u.username}</Text>
                    {u.role === 'ADMIN' && <Text style={styles.adminTag}>ADMIN</Text>}
                  </View>
                  <Text style={styles.repScore}>{u.reputation} pont</Text>
                </View>
              );
            })}
          </GlassCardSimple>
        </>
      )}
    </ScrollView>
  );
}

// ─── Ételek tab ───────────────────────────────────────────────────────────────

function FoodsTab() {
  const [foods, setFoods] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('UNVERIFIED');
  const [query, setQuery] = useState('');
  const debounce = useRef<ReturnType<typeof setTimeout>>();

  const fetchFoods = useCallback(async (q = query, f = filter) => {
    setLoading(true);
    try {
      const res = await adminApi.getFoods({ status: f as any, q: q || undefined, limit: 40 });
      setFoods(res.foods);
      setTotal(res.total);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchFoods(); }, [filter]);

  const handleSearch = (t: string) => {
    setQuery(t);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => fetchFoods(t), 400);
  };

  const handleSetStatus = async (food: any, status: FoodStatus) => {
    Alert.alert(
      `Státusz: ${status}`,
      `"${food.name}" → ${status}?`,
      [
        { text: 'Mégse', style: 'cancel' },
        {
          text: 'Alkalmaz',
          onPress: async () => {
            try {
              await adminApi.setFoodStatus(food.id, status);
              await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              fetchFoods();
            } catch (e: any) { Alert.alert('Hiba', e.message); }
          },
        },
      ]
    );
  };

  const handleDelete = (food: any) => {
    Alert.alert(
      '⚠️ Végleges törlés',
      `"${food.name}" véglegesen törölve lesz. Ez nem visszavonható!`,
      [
        { text: 'Mégse', style: 'cancel' },
        {
          text: 'Törlés', style: 'destructive',
          onPress: async () => {
            try {
              await adminApi.deleteFood(food.id);
              await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              fetchFoods();
            } catch (e: any) { Alert.alert('Hiba', e.message); }
          },
        },
      ]
    );
  };

  const FILTERS = ['UNVERIFIED', 'VERIFIED', 'BANNED'] as const;

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.filterBar}>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={handleSearch}
            placeholder="Keresés..."
            placeholderTextColor={Colors.text.muted}
            clearButtonMode="while-editing"
          />
        </View>
        <View style={styles.chipRow}>
          {FILTERS.map((f) => (
            <Pressable key={f} style={[styles.chip, filter === f && styles.chipActive]}
              onPress={() => setFilter(f)}>
              <Text style={[styles.chipText, filter === f && styles.chipTextActive]}>
                {f === 'UNVERIFIED' ? '⏳' : f === 'VERIFIED' ? '✅' : '🚫'} {f}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.totalLabel}>{total} találat</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={foods}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: Spacing.md, gap: Spacing.sm, paddingBottom: 100 }}
          renderItem={({ item }) => (
            <View style={styles.foodCard}>
              <View style={styles.foodCardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.foodName} numberOfLines={1}>{item.name}</Text>
                  {item.brand && <Text style={styles.foodMeta}>{item.brand}</Text>}
                  <Text style={styles.foodMeta}>
                    👤 {item.creator?.username ?? '?'} · Pont: {item.score ?? 0} · {item._count?.votes ?? 0} szavazat
                  </Text>
                </View>
                <StatusBadge status={item.status} />
              </View>

              <View style={styles.foodActions}>
                {item.status !== 'VERIFIED' && (
                  <Pressable style={[styles.actionBtn, styles.actionVerify]}
                    onPress={() => handleSetStatus(item, 'VERIFIED')}>
                    <Text style={styles.actionText}>✅ Jóváhagy</Text>
                  </Pressable>
                )}
                {item.status !== 'BANNED' && (
                  <Pressable style={[styles.actionBtn, styles.actionBan]}
                    onPress={() => handleSetStatus(item, 'BANNED')}>
                    <Text style={styles.actionText}>🚫 Tilt</Text>
                  </Pressable>
                )}
                {item.status === 'BANNED' && (
                  <Pressable style={[styles.actionBtn, styles.actionUnban]}
                    onPress={() => handleSetStatus(item, 'UNVERIFIED')}>
                    <Text style={styles.actionText}>↩️ Visszaállít</Text>
                  </Pressable>
                )}
                <Pressable style={[styles.actionBtn, styles.actionDelete]}
                  onPress={() => handleDelete(item)}>
                  <Text style={styles.actionText}>🗑️ Töröl</Text>
                </Pressable>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

// ─── Felhasználók tab ─────────────────────────────────────────────────────────

function UsersTab() {
  const [users, setUsers] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [repModalVisible, setRepModalVisible] = useState(false);
  const [repDelta, setRepDelta] = useState('');
  const [repReason, setRepReason] = useState('');
  const debounce = useRef<ReturnType<typeof setTimeout>>();

  const fetchUsers = useCallback(async (q = query) => {
    setLoading(true);
    try {
      const res = await adminApi.getUsers({ q: q || undefined, limit: 40 });
      setUsers(res.users);
      setTotal(res.total);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchUsers(); }, []);

  const handleSearch = (t: string) => {
    setQuery(t);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => fetchUsers(t), 400);
  };

  const handleRoleToggle = (user: any) => {
    const newRole = user.role === 'ADMIN' ? 'USER' : 'ADMIN';
    Alert.alert(
      'Szerepkör változtatás',
      `${user.username} → ${newRole}`,
      [
        { text: 'Mégse', style: 'cancel' },
        {
          text: 'Alkalmaz',
          onPress: async () => {
            try {
              await adminApi.setUserRole(user.id, newRole);
              await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              fetchUsers();
            } catch (e: any) { Alert.alert('Hiba', e.message); }
          },
        },
      ]
    );
  };

  const handleTierToggle = (user: any) => {
    const newTier = user.profile?.tier === 'PREMIUM' ? 'FREE' : 'PREMIUM';
    Alert.alert(
      'Tier változtatás',
      `${user.username} → ${newTier}`,
      [
        { text: 'Mégse', style: 'cancel' },
        {
          text: 'Alkalmaz',
          onPress: async () => {
            try {
              await adminApi.setUserTier(user.id, newTier);
              await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              fetchUsers();
            } catch (e: any) { Alert.alert('Hiba', e.message); }
          },
        },
      ]
    );
  };

  const handleAdjustRep = async () => {
    if (!selectedUser) return;
    const delta = parseInt(repDelta);
    if (isNaN(delta) || delta === 0) { Alert.alert('Add meg a pontszámot!'); return; }
    try {
      await adminApi.adjustReputation(selectedUser.id, delta, repReason || undefined);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setRepModalVisible(false);
      setRepDelta('');
      setRepReason('');
      fetchUsers();
    } catch (e: any) { Alert.alert('Hiba', e.message); }
  };

  const handleSoftDelete = (user: any) => {
    Alert.alert(
      '⚠️ Fiók soft törlés (GDPR)',
      `${user.username} fiókja soft-törölve lesz (30 nap türelmi idő).`,
      [
        { text: 'Mégse', style: 'cancel' },
        {
          text: 'Törlés', style: 'destructive',
          onPress: async () => {
            try {
              await adminApi.softDeleteUser(user.id);
              fetchUsers();
            } catch (e: any) { Alert.alert('Hiba', e.message); }
          },
        },
      ]
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.filterBar}>
        <TextInput
          style={[styles.searchInput, { marginBottom: 0 }]}
          value={query}
          onChangeText={handleSearch}
          placeholder="Keresés névre, email-re..."
          placeholderTextColor={Colors.text.muted}
          clearButtonMode="while-editing"
        />
        <Text style={styles.totalLabel}>{total} felhasználó</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={users}
          keyExtractor={(u) => u.id}
          contentContainerStyle={{ padding: Spacing.md, gap: Spacing.sm, paddingBottom: 100 }}
          renderItem={({ item }) => {
            const level = getReputationLevel(item.reputation);
            const isDeleted = !!item.deletedAt;
            return (
              <View style={[styles.userCard, isDeleted && styles.userCardDeleted]}>
                <View style={styles.userHeader}>
                  <View style={[styles.userAvatar, item.role === 'ADMIN' && styles.userAvatarAdmin]}>
                    <Text style={styles.userAvatarText}>
                      {item.username?.[0]?.toUpperCase() ?? '?'}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.userNameRow}>
                      <Text style={styles.userName}>{item.username}</Text>
                      {item.role === 'ADMIN' && (
                        <View style={styles.adminBadge}><Text style={styles.adminBadgeText}>ADMIN</Text></View>
                      )}
                      {item.profile?.tier === 'PREMIUM' && (
                        <View style={styles.premiumBadge}><Text style={styles.premiumBadgeText}>⭐ PRO</Text></View>
                      )}
                      {isDeleted && (
                        <View style={styles.deletedBadge}><Text style={styles.deletedBadgeText}>TÖRÖLT</Text></View>
                      )}
                    </View>
                    <Text style={styles.userEmail} numberOfLines={1}>{item.email}</Text>
                    <Text style={styles.userStats}>
                      {level.emoji} {item.reputation} pont · {item._count?.createdFoods ?? 0} étel · {item._count?.logs ?? 0} napló
                    </Text>
                  </View>
                </View>

                {!isDeleted && (
                  <View style={styles.userActions}>
                    <Pressable
                      style={[styles.userActionBtn, item.role === 'ADMIN' && styles.userActionBtnActive]}
                      onPress={() => handleRoleToggle(item)}
                    >
                      <Text style={styles.userActionText}>
                        {item.role === 'ADMIN' ? '👤 User' : '🛡️ Admin'}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.userActionBtn, item.profile?.tier === 'PREMIUM' && styles.userActionBtnPremium]}
                      onPress={() => handleTierToggle(item)}
                    >
                      <Text style={styles.userActionText}>
                        {item.profile?.tier === 'PREMIUM' ? '🔓 Free' : '⭐ Premium'}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={styles.userActionBtn}
                      onPress={() => { setSelectedUser(item); setRepModalVisible(true); }}
                    >
                      <Text style={styles.userActionText}>🏆 Rep</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.userActionBtn, styles.userActionBtnDanger]}
                      onPress={() => handleSoftDelete(item)}
                    >
                      <Text style={styles.userActionText}>🗑️</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          }}
        />
      )}

      <Modal visible={repModalVisible} animationType="slide" presentationStyle="formSheet" onRequestClose={() => setRepModalVisible(false)}>
        <View style={styles.repModal}>
          <Text style={styles.repModalTitle}>
            🏆 Reputáció: {selectedUser?.username}
          </Text>
          <Text style={styles.repModalSub}>Jelenlegi: {selectedUser?.reputation ?? 0} pont</Text>

          <Text style={styles.repModalLabel}>Módosítás (pl. +5 vagy -3)</Text>
          <TextInput
            style={styles.repInput}
            value={repDelta}
            onChangeText={setRepDelta}
            placeholder="+5"
            keyboardType="numbers-and-punctuation"
            placeholderTextColor={Colors.text.muted}
          />

          <Text style={styles.repModalLabel}>Indoklás (opcionális)</Text>
          <TextInput
            style={[styles.repInput, { height: 70 }]}
            value={repReason}
            onChangeText={setRepReason}
            placeholder="pl. minőségi étel beküldés"
            multiline
            placeholderTextColor={Colors.text.muted}
          />

          <View style={{ gap: Spacing.sm, marginTop: Spacing.md }}>
            <PrimaryButton label="Alkalmaz" onPress={handleAdjustRep} />
            <GhostButton label="Mégse" onPress={() => setRepModalVisible(false)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Fő admin panel ───────────────────────────────────────────────────────────

export default function AdminPanelScreen() {
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');

  return (
    <View style={{ flex: 1, backgroundColor: '#FAFAFA' }}>
      <SafeAreaView style={{ flex: 1 }}>
        <LinearGradient
          colors={['#1A1A2E', '#2D2D4E']}
          style={styles.header}
        >
          <View style={styles.headerContent}>
            <Text style={styles.headerEmoji}>🛡️</Text>
            <View>
              <Text style={styles.headerTitle}>Admin Panel</Text>
              <Text style={styles.headerSub}>VitaScan moderáció</Text>
            </View>
          </View>

          <View style={styles.tabBar}>
            {TABS.map((tab) => (
              <Pressable
                key={tab.id}
                style={[styles.tabBtn, activeTab === tab.id && styles.tabBtnActive]}
                onPress={() => setActiveTab(tab.id)}
              >
                <Text style={styles.tabEmoji}>{tab.emoji}</Text>
                <Text style={[styles.tabLabel, activeTab === tab.id && styles.tabLabelActive]}>
                  {tab.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </LinearGradient>

        <View style={{ flex: 1 }}>
          {activeTab === 'dashboard' && <DashboardTab />}
          {activeTab === 'foods'     && <FoodsTab />}
          {activeTab === 'users'     && <UsersTab />}
        </View>
      </SafeAreaView>
    </View>
  );
}

// ─── Stílusok ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: { paddingBottom: 0 },
  headerContent: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.xl, paddingBottom: Spacing.md },
  headerEmoji: { fontSize: 36 },
  headerTitle: { fontSize: 22, fontWeight: '900', color: '#fff' },
  headerSub: { ...Typography.caption, color: 'rgba(255,255,255,0.6)' },
  tabBar: { flexDirection: 'row', paddingHorizontal: Spacing.lg },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: Spacing.md, gap: 2, opacity: 0.6 },
  tabBtnActive: { opacity: 1, borderBottomWidth: 2, borderBottomColor: Colors.primary },
  tabEmoji: { fontSize: 18 },
  tabLabel: { ...Typography.caption, color: 'rgba(255,255,255,0.7)', fontWeight: '700' },
  tabLabelActive: { color: '#fff' },

  tabContent: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: 100 },
  sectionTitle: { ...Typography.subtitle, color: Colors.text.primary },
  statRow: { flexDirection: 'row', gap: Spacing.sm },

  contribRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  rankCircle: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.primarySoft, alignItems: 'center', justifyContent: 'center',
  },
  rankNum: { ...Typography.label, color: Colors.primary },
  contribEmoji: { fontSize: 22 },
  contribName: { ...Typography.bodyMedium, color: Colors.text.primary },
  adminTag: { ...Typography.caption, color: Colors.primary, fontWeight: '800' },
  repScore: { fontSize: 14, fontWeight: '800', color: Colors.primary },

  filterBar: { backgroundColor: '#fff', padding: Spacing.md, gap: Spacing.sm, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  searchRow: {},
  searchInput: {
    backgroundColor: '#F5F5F5', borderRadius: Radius.lg,
    padding: Spacing.md, fontSize: 14, color: Colors.text.primary,
    borderWidth: 1, borderColor: '#E8E8E8', marginBottom: Spacing.sm,
  },
  chipRow: { flexDirection: 'row', gap: Spacing.xs },
  chip: { paddingVertical: 5, paddingHorizontal: 10, backgroundColor: '#F5F5F5', borderRadius: Radius.full, borderWidth: 1.5, borderColor: 'transparent' },
  chipActive: { borderColor: Colors.primary, backgroundColor: Colors.primarySoft },
  chipText: { ...Typography.caption, color: Colors.text.muted, fontWeight: '600' },
  chipTextActive: { color: Colors.primary, fontWeight: '800' },
  totalLabel: { ...Typography.caption, color: Colors.text.muted },

  foodCard: {
    backgroundColor: '#fff', borderRadius: Radius.lg, padding: Spacing.md,
    gap: Spacing.sm,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  foodCardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  foodName: { ...Typography.bodyMedium, color: Colors.text.primary },
  foodMeta: { ...Typography.caption, color: Colors.text.muted, marginTop: 2 },
  foodActions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  actionBtn: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: Radius.full, borderWidth: 1.5 },
  actionVerify: { backgroundColor: '#F0FFF4', borderColor: '#2ECC71' },
  actionBan:    { backgroundColor: '#FFF0F0', borderColor: '#E74C3C' },
  actionUnban:  { backgroundColor: '#FFF8EC', borderColor: '#F5A623' },
  actionDelete: { backgroundColor: '#FFF0F0', borderColor: '#E74C3C' },
  actionText:   { fontSize: 12, fontWeight: '700', color: Colors.text.secondary },

  userCard: {
    backgroundColor: '#fff', borderRadius: Radius.lg, padding: Spacing.md,
    gap: Spacing.sm,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  userCardDeleted: { opacity: 0.5, backgroundColor: '#F5F5F5' },
  userHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  userAvatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  userAvatarAdmin: { backgroundColor: '#1A1A2E' },
  userAvatarText: { fontSize: 18, fontWeight: '900', color: '#fff' },
  userNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  userName: { ...Typography.bodyMedium, color: Colors.text.primary },
  userEmail: { ...Typography.caption, color: Colors.text.muted },
  userStats: { ...Typography.caption, color: Colors.text.secondary, marginTop: 2 },
  adminBadge: { backgroundColor: '#1A1A2E', borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2 },
  adminBadgeText: { color: '#fff', fontSize: 9, fontWeight: '900' },
  premiumBadge: { backgroundColor: '#FFF3D4', borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2 },
  premiumBadgeText: { color: '#B7800A', fontSize: 9, fontWeight: '900' },
  deletedBadge: { backgroundColor: '#FFF0F0', borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2 },
  deletedBadgeText: { color: '#E74C3C', fontSize: 9, fontWeight: '900' },
  userActions: { flexDirection: 'row', gap: Spacing.xs },
  userActionBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 7,
    backgroundColor: '#F5F5F5', borderRadius: Radius.md, borderWidth: 1.5, borderColor: 'transparent',
  },
  userActionBtnActive:  { backgroundColor: '#EBF4FF', borderColor: '#4A90D9' },
  userActionBtnPremium: { backgroundColor: '#FFF3D4', borderColor: '#FFD700' },
  userActionBtnDanger:  { backgroundColor: '#FFF0F0', borderColor: '#FFCCCC' },
  userActionText: { fontSize: 12, fontWeight: '700', color: Colors.text.secondary },

  repModal: { flex: 1, padding: Spacing['2xl'], paddingTop: Spacing['3xl'] },
  repModalTitle: { ...Typography.title, color: Colors.text.primary, marginBottom: 4 },
  repModalSub: { ...Typography.body, color: Colors.text.muted, marginBottom: Spacing.lg },
  repModalLabel: { ...Typography.label, color: Colors.text.secondary, marginBottom: Spacing.xs },
  repInput: {
    backgroundColor: '#F5F5F5', borderRadius: Radius.md,
    padding: Spacing.md, fontSize: 16, color: Colors.text.primary,
    borderWidth: 1.5, borderColor: '#E8E8E8', marginBottom: Spacing.md,
  },
});
