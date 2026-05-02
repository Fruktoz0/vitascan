import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet,
  RefreshControl, ActivityIndicator, Image, PanResponder
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';

import i18n from '../../src/i18n';
import { GlassCardSimple } from '../../src/components/ui/GlassCard';
import KcalRing from '../../src/components/ui/KcalRing';
import { MacroChip } from '../../src/components/ui/MacroBar';
import WaterProgressBar from '../../src/components/ui/WaterProgressBar';
import { Colors, Radius, Spacing, Typography } from '../../src/design/tokens';
import { statsApi, waterApi, weightApi } from '../../src/services/api';
import { useAuthStore } from '../../src/stores/authStore';
import { useDateStore } from '../../src/stores/dateStore';

// Kisebb, leegyszerűsített Meal sor, hogy pont olyan legyen, mint a HTML-ben
function MealRow({ label, kcal, onAdd }: { label: string, kcal: number, onAdd: () => void }) {
  return (
    <View style={styles.mealRow}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={styles.mealRowLabel}>{label}:</Text>
        <Text style={styles.mealRowKcal}>{kcal} kcal</Text>
      </View>
      <Pressable style={styles.mealRowAddBtn} onPress={onAdd}>
        <MaterialIcons name="add" size={16} color={Colors.dashboard.stroke} />
      </Pressable>
    </View>
  );
}

export default function HomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { selectedDate, changeDateBy, resetDate } = useDateStore();
  const [data, setData] = useState<any>(null);
  const [water, setWater] = useState<any>(null);
  const [weight, setWeight] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const getHeaderDateText = () => {
    const today = new Date();
    const current = new Date(selectedDate);
    today.setHours(0, 0, 0, 0);
    current.setHours(0, 0, 0, 0);
    const diffTime = current.getTime() - today.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return t('date.today', 'Ma');
    if (diffDays === 1) return t('date.tomorrow', 'Holnap');
    if (diffDays === -1) return t('date.yesterday', 'Tegnap');
    
    return current.toLocaleDateString(i18n.language === 'hu' ? 'hu-HU' : 'en-US', { month: 'short', day: 'numeric' });
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const dateStr = selectedDate.toISOString().split('T')[0];
      const [summary, waterData, weightData] = await Promise.all([
        statsApi.day(dateStr),
        waterApi.getByDate(dateStr),
        weightApi.getByDate(dateStr),
      ]);
      setData(summary);
      setWater(waterData);
      setWeight(weightData);
    } catch {}
    setLoading(false);
  }, [selectedDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const handleAddWater = async (ml: number) => {
    try {
      await waterApi.add(ml);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setWater(await waterApi.getByDate(selectedDate.toISOString().split('T')[0]));
    } catch {}
  };

  const handleAdjustWeight = async (delta: number) => {
    try {
      const dateStr = selectedDate.toISOString().split('T')[0];
      const baseWeight = typeof weight?.weightKg === 'number' ? weight.weightKg : 72.5;
      const nextWeight = Math.max(20, Math.min(500, Math.round((baseWeight + delta) * 10) / 10));
      setWeight(await weightApi.setForDate(dateStr, nextWeight));
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
  };

  const panResponder = React.useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        return Math.abs(gestureState.dx) > 30 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
      },
      onPanResponderRelease: (evt, gestureState) => {
        if (gestureState.dx > 50) {
          changeDateBy(-1);
        } else if (gestureState.dx < -50) {
          changeDateBy(1);
        }
      },
    })
  ).current;

  if (loading && !data) {
    return (
      <View style={styles.screen}>
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color={Colors.dashboard.stroke} />
        </View>
      </View>
    );
  }

  const totals = data?.totals ?? { kcal: 1420, protein: 85, carbs: 120, fat: 45 };
  const goals = data?.goals ?? { dailyKcalGoal: 2200 };
  
  // HTML mockup adatai ha nincsenek igaziak
  const breakfastKcal = data?.byMealType?.BREAKFAST?.reduce((acc: number, l: any) => acc + l.kcal, 0) ?? 420;
  const lunchKcal = data?.byMealType?.LUNCH?.reduce((acc: number, l: any) => acc + l.kcal, 0) ?? 650;
  const dinnerKcal = data?.byMealType?.DINNER?.reduce((acc: number, l: any) => acc + l.kcal, 0) ?? 380;
  const weightValue = typeof weight?.weightKg === 'number' ? weight.weightKg.toFixed(1) : '--';
  const lastMeasuredText = weight?.lastMeasuredAt
    ? t('homeScreen.weightLastMeasuredToday', 'Utolsó mérés: ma')
    : t('homeScreen.weightNoMeasurement', 'Nincs mérés');

  return (
    <View style={styles.screen} {...panResponder.panHandlers}>
      {/* Background Grid Pattern (egyszerű fallback kód) */}
      <View style={styles.gridOverlay} pointerEvents="none" />

      {/* Pastel Blobs */}
      <View style={[styles.blob, styles.blobMint]} pointerEvents="none" />
      <View style={[styles.blob, styles.blobPeach]} pointerEvents="none" />
      <View style={[styles.blob, styles.blobLavender]} pointerEvents="none" />

      {/* TopAppBar */}
      <SafeAreaView style={{ backgroundColor: 'rgba(252, 249, 248, 0.9)' }}>
        <View style={styles.topAppBar}>
          <View style={styles.appBarSide}>
            <View style={styles.avatarWrapper}>
               <Image 
                  source={{ uri: 'https://i.pravatar.cc/150?img=32' }} 
                  style={styles.avatarImg} 
               />
            </View>
          </View>
          
          <View style={styles.appBarCenter}>
            <Text style={styles.appName}>{getHeaderDateText()}</Text>
          </View>
          
          <View style={[styles.appBarSide, { alignItems: 'flex-end' }]}>
            <Pressable style={styles.calendarBtn} onPress={() => router.push('/(tabs)/date-picker')}>
               <View style={styles.calendarBtnShadow} />
               <View style={styles.calendarBtnInner}>
                 <MaterialIcons name="calendar-today" size={20} color={Colors.dashboard.stroke} />
               </View>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.dashboard.stroke} />}
      >
        {/* Card 1: Daily Calorie Progress */}
        <GlassCardSimple
          backgroundColor={Colors.dashboard.card}
          customRadius={{
            borderTopLeftRadius: 24,
            borderTopRightRadius: 16,
            borderBottomRightRadius: 32,
            borderBottomLeftRadius: 16,
          }}
          padding={24}
        >
          <View style={styles.kcalRow}>
            <View style={styles.kcalInfo}>
              <Text style={styles.kcalLabel}>CALORIES</Text>
              <View>
                <Text style={styles.kcalValue}>{Math.round(totals.kcal).toLocaleString('en-US')}</Text>
                <Text style={styles.kcalSub}>/ {Math.round(goals.dailyKcalGoal).toLocaleString('en-US')} kcal</Text>
              </View>
            </View>
            <View style={styles.kcalRingWrapper}>
              <KcalRing consumed={totals.kcal} goal={goals.dailyKcalGoal} size={100} strokeWidth={8} />
            </View>
          </View>
        </GlassCardSimple>

        {/* Macro Cards Row */}
        <View style={styles.macroRow}>
          <MacroChip type="protein" value={totals.protein} goal={140} />
          <MacroChip type="carbs" value={totals.carbs} goal={250} />
          <MacroChip type="fat" value={totals.fat} goal={65} />
        </View>

        {/* Nutrition Card */}
        <GlassCardSimple
          backgroundColor={Colors.dashboard.card}
          customRadius={{
            borderTopLeftRadius: 32,
            borderTopRightRadius: 16,
            borderBottomRightRadius: 24,
            borderBottomLeftRadius: 32,
          }}
          padding={20}
        >
          <View style={styles.nutritionHeader}>
            <MaterialIcons name="restaurant" size={20} color={Colors.dashboard.nutritionIcon} />
            <Text style={styles.nutritionTitle}>{t('homeScreen.todayMeals')}</Text>
          </View>
          
          <View style={styles.mealList}>
            <MealRow label={t('food.breakfast')} kcal={breakfastKcal} onAdd={() => router.push('/(tabs)/scanner')} />
            <View style={styles.mealDivider} />
            <MealRow label={t('food.lunch')} kcal={lunchKcal} onAdd={() => router.push('/(tabs)/scanner')} />
            <View style={styles.mealDivider} />
            <MealRow label={t('food.dinner')} kcal={dinnerKcal} onAdd={() => router.push('/(tabs)/scanner')} />
          </View>
        </GlassCardSimple>

        {/* Add Food Button (stitch HTML minta szerint) */}
        <Pressable
          onPress={() => router.push('/(tabs)/scanner')}
          style={({ pressed }) => [styles.addFoodWrapper, pressed && styles.addFoodPressed]}
        >
          <View style={styles.addFoodShadow} />
          <View style={styles.addFoodButton}>
            <MaterialIcons name="add-circle" size={24} color={Colors.dashboard.stroke} />
            <Text style={styles.addFoodLabel}>{t('homeScreen.addFoodCta')}</Text>
          </View>
        </Pressable>

        {/* Weight Tracking Card */}
        <View style={styles.weightCardWrapper}>
          <View style={styles.weightCardShadow} />
          <View style={styles.weightCard}>
            <View style={styles.weightTopRow}>
              <View style={styles.weightTitleRow}>
                <View style={styles.weightIconWrap}>
                  <MaterialCommunityIcons name="weight" size={16} color={Colors.dashboard.stroke} />
                </View>
                <View>
                  <Text style={styles.weightTitle}>Súly</Text>
                  <Text style={styles.weightSub}>{lastMeasuredText}</Text>
                </View>
              </View>
              <Text>
                <Text style={styles.weightValueNum}>{weightValue}</Text>
                <Text style={styles.weightValueUnit}> kg</Text>
              </Text>
            </View>

            <View style={styles.weightActions}>
              <Pressable style={styles.weightAdjustBtn} onPress={() => handleAdjustWeight(-0.1)}>
                <Text style={styles.weightAdjustText}>−</Text>
              </Pressable>
              <Pressable style={styles.weightAdjustBtn} onPress={() => handleAdjustWeight(0.1)}>
                <Text style={styles.weightAdjustText}>+</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* Water Tracking Card */}
        <WaterProgressBar 
          totalMl={water?.totalMl ?? 1200} 
          goalMl={water?.goalMl ?? 2500} 
          onAdd={handleAddWater} 
        />

        <View style={{ height: 140 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.dashboard.page,
  },
  gridOverlay: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.05,
    // Itt ideálisan az SVG bg jönne be. 
  },
  blob: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: Colors.dashboard.stroke,
    shadowColor: Colors.dashboard.stroke,
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 0,
  },
  blobMint: {
    width: 350,
    height: 350,
    top: -50,
    left: -150,
    backgroundColor: 'rgba(232,245,233,0.6)', // blobMint alpha
    borderTopLeftRadius: 140,
    borderTopRightRadius: 210,
    borderBottomRightRadius: 245,
    borderBottomLeftRadius: 105,
  },
  blobPeach: {
    width: 250,
    height: 250,
    bottom: '10%',
    left: -50,
    backgroundColor: 'rgba(255,218,214,0.6)',
    borderTopLeftRadius: 125,
    borderTopRightRadius: 100,
    borderBottomRightRadius: 150,
    borderBottomLeftRadius: 125,
  },
  blobLavender: {
    width: 300,
    height: 300,
    top: '30%',
    right: -100,
    backgroundColor: 'rgba(234,222,204,0.6)',
    borderTopLeftRadius: 180,
    borderTopRightRadius: 120,
    borderBottomRightRadius: 90,
    borderBottomLeftRadius: 210,
  },
  
  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  
  topAppBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 8,
  },
  appBarSide: {
    zIndex: 2,
  },
  appBarCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  avatarWrapper: {
    width: 40,
    height: 40,
    borderWidth: 1.5,
    borderColor: Colors.dashboard.stroke,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 24,
    borderBottomRightRadius: 20,
    borderBottomLeftRadius: 20,
    overflow: 'hidden',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  appName: {
    fontSize: 24,
    fontWeight: '900',
    color: Colors.dashboard.stroke,
    letterSpacing: -0.5,
  },
  calendarBtn: {
    width: 40,
    height: 40,
  },
  calendarBtnShadow: {
    position: 'absolute', top: 2, left: 2, right: -2, bottom: -2,
    backgroundColor: Colors.dashboard.shadowHard, borderRadius: 20,
  },
  calendarBtnInner: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: Colors.dashboard.stroke,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarIcon: {
    fontSize: 18,
  },

  scroll: { padding: Spacing.xl, gap: Spacing.lg, paddingTop: Spacing.lg },

  kcalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  kcalInfo: {
    flex: 1,
    justifyContent: 'space-between',
    height: 100,
  },
  kcalLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.dashboard.tabInactive,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  kcalValue: {
    fontSize: 48,
    fontWeight: '800',
    color: Colors.dashboard.stroke,
    lineHeight: 52,
    letterSpacing: -1,
  },
  kcalSub: {
    fontSize: 16,
    color: Colors.dashboard.tabInactive,
    marginTop: 4,
  },
  kcalRingWrapper: {
    width: 100,
    height: 100,
  },

  macroRow: { flexDirection: 'row', gap: 12 },

  nutritionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  nutritionIcon: {
    fontSize: 20,
  },
  nutritionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.dashboard.stroke,
  },
  mealList: {
    gap: 12,
  },
  mealRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  mealRowLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.dashboard.stroke,
  },
  mealRowKcal: {
    fontSize: 14,
    color: Colors.dashboard.tabInactive,
    marginLeft: 6,
  },
  mealRowAddBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.dashboard.stroke,
    backgroundColor: Colors.dashboard.blobMint, // primary-container
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealDivider: {
    height: 1.5,
    backgroundColor: Colors.dashboard.stroke,
    opacity: 0.1,
  },
  addFoodWrapper: {
    paddingBottom: 4,
    paddingRight: 4,
  },
  addFoodShadow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.dashboard.shadowHard,
    top: 4,
    left: 4,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 16,
    borderBottomRightRadius: 32,
    borderBottomLeftRadius: 16,
  },
  addFoodButton: {
    backgroundColor: Colors.dashboard.blobMint,
    borderWidth: 2,
    borderColor: Colors.dashboard.stroke,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 16,
    borderBottomRightRadius: 32,
    borderBottomLeftRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 24,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  addFoodPressed: {
    transform: [{ translateX: 4 }, { translateY: 4 }],
  },
  addFoodLabel: {
    color: Colors.dashboard.stroke,
    fontSize: 20,
    fontWeight: '700',
  },
  weightCardWrapper: {
    position: 'relative',
    paddingRight: 4,
    paddingBottom: 4,
  },
  weightCardShadow: {
    ...StyleSheet.absoluteFillObject,
    top: 4,
    left: 4,
    backgroundColor: Colors.dashboard.shadowHard,
    borderRadius: 24,
  },
  weightCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: Colors.dashboard.stroke,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    gap: 12,
  },
  weightTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  weightTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    flexShrink: 1,
    paddingRight: 8,
  },
  weightIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E6D5C3',
    borderWidth: 1.5,
    borderColor: Colors.dashboard.stroke,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weightTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.dashboard.stroke,
    lineHeight: 18,
  },
  weightSub: {
    fontSize: 11,
    fontWeight: '500',
    color: '#555555',
    lineHeight: 14,
    marginTop: 2,
  },
  weightValueNum: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.dashboard.stroke,
  },
  weightValueUnit: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.dashboard.stroke,
  },
  weightActions: {
    flexDirection: 'row',
    gap: 10,
  },
  weightAdjustBtn: {
    flex: 1,
    height: 40,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: Colors.dashboard.stroke,
    backgroundColor: '#FCE4C4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  weightAdjustText: {
    fontSize: 22,
    fontWeight: '500',
    color: Colors.dashboard.stroke,
    lineHeight: 24,
  },
});
