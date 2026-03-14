import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import AnimatedMeshBackground from '../../src/components/ui/AnimatedMeshBackground';
import { GlassCardSimple } from '../../src/components/ui/GlassCard';
import KcalRing from '../../src/components/ui/KcalRing';
import { MacroChip } from '../../src/components/ui/MacroBar';
import WaterProgressBar from '../../src/components/ui/WaterProgressBar';
import MealCard from '../../src/components/ui/MealCard';
import { PrimaryButton } from '../../src/components/ui/Button';
import { Colors, Gradients, Radius, Shadows, Spacing, Typography } from '../../src/design/tokens';
import { statsApi, waterApi, logApi } from '../../src/services/api';
import { useAuthStore } from '../../src/stores/authStore';

export default function HomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [data, setData] = useState<any>(null);
  const [water, setWater] = useState<any>(null);
  const [streak, setStreak] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [summary, waterData, streakData] = await Promise.all([
        statsApi.today(),
        waterApi.getToday(),
        statsApi.streak(),
      ]);
      setData(summary);
      setWater(waterData);
      setStreak(streakData);
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

  const handleAddWater = async (ml: number) => {
    try {
      await waterApi.add(ml);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const prev = water?.totalMl ?? 0;
      const goal = water?.goalMl ?? 2000;
      if (prev + ml >= goal && prev < goal) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      setWater(await waterApi.getToday());
    } catch {}
  };

  const handleDeleteLog = async (id: string) => {
    try {
      await logApi.delete(id);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await fetchData();
    } catch {}
  };

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return t('goodMorning');
    if (h < 18) return t('goodAfternoon');
    return t('goodEvening');
  };

  if (loading) {
    return (
      <AnimatedMeshBackground colors={Gradients.meshMain}>
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      </AnimatedMeshBackground>
    );
  }

  const totals = data?.totals ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const goals = data?.goals ?? { dailyKcalGoal: 2000 };
  const byMealType: Record<string, any[]> = data?.byMealType ?? {};
  const mealOrder = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK', 'OTHER'];
  const sortedMeals = mealOrder.filter((m) => byMealType[m]?.length > 0);

  return (
    <AnimatedMeshBackground colors={Gradients.meshHome} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
        >
          {/* Fejléc */}
          <View style={styles.header}>
            <View>
              <Text style={styles.greeting}>{greeting()}, {user?.username?.split('_')[0]} 👋</Text>
              <Text style={styles.dateText}>
                {new Date().toLocaleDateString('hu-HU', { weekday: 'long', month: 'long', day: 'numeric' })}
              </Text>
            </View>
            <View style={styles.headerRight}>
              {(streak?.streak ?? 0) > 0 && (
                <View style={styles.streakPill}>
                  <Text style={styles.streakText}>🔥 {streak.streak}</Text>
                </View>
              )}
              <Pressable style={styles.avatarBtn} onPress={() => router.push('/(tabs)/data-vault')}>
                <Text style={styles.avatarText}>{user?.username?.[0]?.toUpperCase() ?? '?'}</Text>
              </Pressable>
            </View>
          </View>

          {/* Kalória kártya */}
          <GlassCardSimple
            backgroundColor="rgba(255,107,53,0.82)"
            borderColor="rgba(255,255,255,0.35)"
            style={[styles.kcalCard, Shadows.primary]}
          >
            <Text style={styles.kcalCardLabel}>Napi kalória</Text>
            <View style={styles.kcalRingRow}>
              <KcalRing consumed={totals.kcal} goal={goals.dailyKcalGoal} size={170} strokeWidth={14} />
              <View style={styles.kcalStats}>
                {[
                  { num: goals.dailyKcalGoal, label: 'Cél' },
                  { num: Math.round(totals.kcal), label: 'Elfogyasztva' },
                  { num: Math.abs(Math.round(goals.dailyKcalGoal - totals.kcal)), label: totals.kcal > goals.dailyKcalGoal ? 'Felett' : 'Maradt' },
                ].map((item, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && <View style={styles.kcalDivider} />}
                    <View style={styles.kcalStatItem}>
                      <Text style={styles.kcalStatNum}>{item.num}</Text>
                      <Text style={styles.kcalStatLabel}>{item.label}</Text>
                    </View>
                  </React.Fragment>
                ))}
              </View>
            </View>
          </GlassCardSimple>

          {/* Makró chipek */}
          <View style={styles.macroRow}>
            <MacroChip type="protein" value={totals.protein} />
            <MacroChip type="carbs" value={totals.carbs} />
            <MacroChip type="fat" value={totals.fat} />
          </View>

          {/* Víz */}
          {water && (
            <WaterProgressBar totalMl={water.totalMl} goalMl={water.goalMl} onAdd={handleAddWater} />
          )}

          {/* Hozzáadás gomb */}
          <PrimaryButton label="+ Étel hozzáadása" onPress={() => router.push('/(tabs)/scanner')} size="lg" icon="📸" />

          {/* Mai étkezések */}
          {sortedMeals.length > 0 ? (
            <View style={styles.mealsSection}>
              <Text style={styles.mealsTitle}>Mai étkezések</Text>
              {sortedMeals.map((mealType) => (
                <MealCard key={mealType} mealType={mealType} logs={byMealType[mealType]} onDeleteLog={handleDeleteLog} />
              ))}
            </View>
          ) : (
            <GlassCardSimple style={styles.emptyCard}>
              <Text style={styles.emptyEmoji}>🍽️</Text>
              <Text style={styles.emptyTitle}>Még nincs mai bejegyzés</Text>
              <Text style={styles.emptyDesc}>Szkennelj egy vonalkódot, vagy keress az étel-könyvtárban!</Text>
            </GlassCardSimple>
          )}

          <View style={{ height: 110 }} />
        </ScrollView>
      </SafeAreaView>
    </AnimatedMeshBackground>
  );
}

const styles = StyleSheet.create({
  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: Spacing.xl, gap: Spacing.md },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  greeting: { ...Typography.title, color: Colors.text.white },
  dateText: { ...Typography.caption, color: Colors.text.whiteAlpha, marginTop: 2, textTransform: 'capitalize' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  streakPill: {
    backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: Radius.full,
    paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)',
  },
  streakText: { ...Typography.label, color: '#fff' },
  avatarBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.3)',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)', alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 18, fontWeight: '900', color: '#fff' },
  kcalCard: { padding: 20 },
  kcalCardLabel: { ...Typography.label, color: 'rgba(255,255,255,0.8)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 },
  kcalRingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kcalStats: { flex: 1, marginLeft: 16, gap: 12 },
  kcalStatItem: { alignItems: 'center' },
  kcalStatNum: { fontSize: 22, fontWeight: '900', color: '#fff' },
  kcalStatLabel: { ...Typography.caption, color: 'rgba(255,255,255,0.7)', marginTop: 1 },
  kcalDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.2)', width: '100%' },
  macroRow: { flexDirection: 'row', gap: Spacing.sm },
  mealsSection: { gap: Spacing.sm },
  mealsTitle: { ...Typography.subtitle, color: Colors.text.primary },
  emptyCard: { alignItems: 'center', gap: 8, paddingVertical: 32 },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { ...Typography.subtitle, color: Colors.text.primary },
  emptyDesc: { ...Typography.body, color: Colors.text.muted, textAlign: 'center' },
});
