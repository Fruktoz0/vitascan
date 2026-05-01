import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  Pressable, ActivityIndicator, Image,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { statsApi } from '../../src/services/api';
import { BentoCard } from '../../src/components/ui/BentoCard';
import { Colors, Spacing } from '../../src/design/tokens';

// ─── MealItem ────────────────────────────────────────────────────────────────
function MealItem({ name, meta, kcal, isLast }: { name: string; meta: string; kcal: number; isLast?: boolean }) {
  return (
    <View style={[styles.mealItem, !isLast && styles.mealItemBorder]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.mealItemName}>{name}</Text>
        <Text style={styles.mealItemMeta}>{meta}</Text>
      </View>
      <Text style={styles.mealItemKcal}>{kcal}</Text>
    </View>
  );
}

// ─── MealSection ─────────────────────────────────────────────────────────────
interface MealSectionProps {
  type: string;
  title: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  iconBg: string;
  kcal: number | string;
  items: any[];
  onAdd: () => void;
  onEdit: () => void;
}

function MealSection({ title, icon, iconBg, kcal, items, onAdd, onEdit }: MealSectionProps) {
  const { t } = useTranslation();
  
  return (
    <BentoCard>
      <View style={styles.mealHeader}>
        <View style={styles.mealTitleRow}>
          <View style={[styles.iconCircle, { backgroundColor: iconBg }]}>
            <MaterialIcons name={icon} size={28} color={Colors.dashboard.stroke} />
          </View>
          <Text style={styles.mealTitle}>{title}</Text>
        </View>
        <View style={[styles.kcalBadge, kcal === '--' && styles.kcalBadgeEmpty]}>
          <Text style={styles.kcalBadgeValue}>{kcal}</Text>
          <Text style={styles.kcalBadgeUnit}>kcal</Text>
        </View>
      </View>

      {items.length > 0 ? (
        <View style={styles.itemList}>
          {items.map((item, index) => (
            <MealItem 
              key={item.id || index}
              name={item.food?.displayName || item.food?.name || 'Food'}
              meta={`${item.amount}${item.unit || 'g'}`}
              kcal={item.kcal}
              isLast={index === items.length - 1}
            />
          ))}
        </View>
      ) : (
        <View style={styles.emptyState}>
          <MaterialIcons name="restaurant" size={36} color={Colors.dashboard.tabInactive} style={{ opacity: 0.5, marginBottom: 8 }} />
          <Text style={styles.emptyText}>{t('homeScreen.noEntries')}</Text>
        </View>
      )}

      <View style={styles.actionRow}>
        <Pressable style={styles.addBtn} onPress={onAdd}>
          <View style={styles.btnShadow} />
          <View style={styles.addBtnInner}>
            <MaterialIcons name="add" size={18} color={Colors.dashboard.stroke} />
            <Text style={styles.btnLabel}>{t('homeScreen.addFoodCta').replace(/^\+\s*/, '')}</Text>
          </View>
        </Pressable>
        <Pressable style={styles.editBtn} onPress={onEdit}>
          <View style={styles.btnShadow} />
          <View style={styles.editBtnInner}>
            <MaterialIcons name="edit" size={18} color={Colors.dashboard.stroke} />
          </View>
        </Pressable>
      </View>
    </BentoCard>
  );
}

// ─── DiaryScreen ─────────────────────────────────────────────────────────────
export default function FoodLibraryScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const summary = await statsApi.today();
      setData(summary);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  if (loading) {
    return (
      <View style={styles.loadingCenter}>
        <ActivityIndicator color={Colors.dashboard.stroke} size="large" />
      </View>
    );
  }

  const totals = data?.totals ?? { kcal: 1450 };
  const goals = data?.goals ?? { dailyKcalGoal: 2200 };
  const meals = data?.byMealType ?? {};

  return (
    <View style={styles.screen}>
      <View style={styles.doodleBg} pointerEvents="none" />
      
      {/* TopAppBar */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Image 
            source={{ uri: 'https://lh3.googleusercontent.com/aida-public/AB6AXuA-RQSQZ_v_tjuVpZrkLGpd0X7YTVa0peodbsQ-eYoFYSx152sgWxKtbgECEVbVug7pm-wQbjw08JnGq7fjD6Y_goSotSkftF-NdlBRCoUxs4O9F_jADgDiqSf8zEtGwImak_n9wzfHUlDsbZzEEtNRraM9fBzv9EvUc8vz2VbJEUvRChQdF97LtrVcOlG81dgRYhP_zpGZtt5e71L_bR4KiPXGyFBRPCzZHJLJSqRPkGHe9IraxiARfQNfyf8nPZFA7_bKex1rt9Y' }} 
            style={styles.avatar}
          />
          <Text style={styles.headerTitle}>Vitascan</Text>
        </View>
        <Pressable style={styles.calendarBtn}>
          <View style={styles.calendarBtnShadow} />
          <View style={styles.calendarBtnInner}>
            <MaterialIcons name="calendar-today" size={20} color={Colors.dashboard.stroke} />
          </View>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Daily Summary */}
        <View style={styles.summaryRow}>
          <View>
            <Text style={styles.todayTitle}>Today</Text>
            <Text style={styles.todaySubtitle}>
              {Math.round(totals.kcal).toLocaleString()} / {Math.round(goals.dailyKcalGoal).toLocaleString()} kcal
            </Text>
          </View>
          <View style={styles.fireCircle}>
            <View style={styles.fireCircleShadow} />
            <View style={styles.fireCircleInner}>
              <MaterialIcons name="local-fire-department" size={24} color={Colors.dashboard.stroke} />
            </View>
          </View>
        </View>

        {/* Meal Sections */}
        <MealSection 
          type="BREAKFAST"
          title={t('food.breakfast')}
          icon="bakery-dining"
          iconBg={Colors.dashboard.tertiaryFixed}
          kcal={meals.BREAKFAST?.reduce((acc: number, l: any) => acc + l.kcal, 0) || 0}
          items={meals.BREAKFAST || []}
          onAdd={() => router.push('/food-search')}
          onEdit={() => {}}
        />

        <MealSection 
          type="LUNCH"
          title={t('food.lunch')}
          icon="lunch-dining"
          iconBg={Colors.dashboard.errorContainer}
          kcal={meals.LUNCH?.reduce((acc: number, l: any) => acc + l.kcal, 0) || 0}
          items={meals.LUNCH || []}
          onAdd={() => router.push('/food-search')}
          onEdit={() => {}}
        />

        <MealSection 
          type="DINNER"
          title={t('food.dinner')}
          icon="ramen-dining"
          iconBg={Colors.dashboard.surfaceContainerHigh}
          kcal={meals.DINNER?.reduce((acc: number, l: any) => acc + l.kcal, 0) || '--'}
          items={meals.DINNER || []}
          onAdd={() => router.push('/food-search')}
          onEdit={() => {}}
        />

        <MealSection 
          type="SNACK"
          title={t('food.snack')}
          icon="icecream"
          iconBg={Colors.dashboard.secondaryContainer}
          kcal={meals.SNACK?.reduce((acc: number, l: any) => acc + l.kcal, 0) || 0}
          items={meals.SNACK || []}
          onAdd={() => router.push('/food-search')}
          onEdit={() => {}}
        />

        <View style={{ height: 120 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.dashboard.page },
  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  doodleBg: { ...StyleSheet.absoluteFillObject, opacity: 0.05 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: Colors.dashboard.page,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 0.8, borderColor: Colors.dashboard.stroke },
  headerTitle: { fontSize: 24, fontWeight: '900', color: Colors.dashboard.stroke },
  calendarBtn: { width: 40, height: 40 },
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
  scroll: { paddingHorizontal: 24, paddingTop: 16 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 },
  todayTitle: { fontSize: 48, fontWeight: '800', color: Colors.dashboard.stroke },
  todaySubtitle: { fontSize: 16, color: Colors.dashboard.tabInactive, marginTop: 4 },
  fireCircle: { width: 48, height: 48 },
  fireCircleShadow: {
    position: 'absolute', top: 2, left: 2, right: -2, bottom: -2,
    backgroundColor: Colors.dashboard.shadowHard, borderRadius: 24,
  },
  fireCircleInner: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.dashboard.secondaryContainer,
    borderWidth: 0.8,
    borderColor: Colors.dashboard.stroke,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  mealTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconCircle: { width: 40, height: 40, borderRadius: 20, borderWidth: 0.8, borderColor: Colors.dashboard.stroke, alignItems: 'center', justifyContent: 'center', 
    shadowColor: Colors.dashboard.shadowHard, shadowOffset: { width: 2, height: 2 }, shadowOpacity: 1, shadowRadius: 0,
  },
  mealTitle: { fontSize: 24, fontWeight: '700', color: Colors.dashboard.stroke },
  kcalBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.dashboard.primaryFixed,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, borderWidth: 0.8, borderColor: Colors.dashboard.stroke,
    shadowColor: Colors.dashboard.shadowHard, shadowOffset: { width: 2, height: 2 }, shadowOpacity: 1, shadowRadius: 0,
  },
  kcalBadgeEmpty: { backgroundColor: Colors.dashboard.surfaceContainerHigh, borderStyle: 'dashed' },
  kcalBadgeValue: { fontSize: 14, fontWeight: '700', color: Colors.dashboard.stroke },
  kcalBadgeUnit: { fontSize: 10, fontWeight: '700', color: Colors.dashboard.stroke },
  itemList: { marginBottom: 16 },
  mealItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  mealItemBorder: { borderBottomWidth: 0.8, borderBottomColor: Colors.dashboard.outlineVariant, borderStyle: 'dashed' },
  mealItemName: { fontSize: 16, fontWeight: '500', color: Colors.dashboard.stroke },
  mealItemMeta: { fontSize: 12, fontWeight: '700', color: Colors.dashboard.tabInactive },
  mealItemKcal: { fontSize: 14, fontWeight: '700', color: Colors.dashboard.stroke },
  emptyState: { paddingVertical: 24, alignItems: 'center', opacity: 0.7 },
  emptyText: { fontSize: 16, color: Colors.dashboard.tabInactive },
  actionRow: { flexDirection: 'row', gap: 12 },
  addBtn: { flex: 3, height: 52 },
  editBtn: { flex: 1, height: 52 },
  btnShadow: {
    position: 'absolute', top: 2, left: 2, right: -2, bottom: -2,
    backgroundColor: Colors.dashboard.shadowHard, borderRadius: 999,
  },
  addBtnInner: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.dashboard.surfaceContainerLow,
    borderWidth: 0.8, borderColor: Colors.dashboard.stroke,
    borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  editBtnInner: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#fff',
    borderWidth: 0.8, borderColor: Colors.dashboard.stroke,
    borderRadius: 999, alignItems: 'center', justifyContent: 'center',
  },
  btnLabel: { fontSize: 14, fontWeight: '700', color: Colors.dashboard.stroke },
});
