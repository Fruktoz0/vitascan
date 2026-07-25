import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  Pressable, ActivityIndicator, PanResponder, Platform, Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import i18n from '../../src/i18n';

import { Food, statsApi, analysisApi, ApiError, type DailyAnalysisResult } from '../../src/services/api';
import { BentoCard } from '../../src/components/ui/BentoCard';
import AddFoodManualModal from '../../src/components/food/AddFoodManualModal';
import FoodDetailModal from '../../src/components/food/FoodDetailModal';
import EditLogModal, { type DailyLogItem } from '../../src/components/food/EditLogModal';
import { Colors, Spacing } from '../../src/design/tokens';
import { useDateStore } from '../../src/stores/dateStore';
import { ResponsiveLayout, webPointer } from '../../src/components/layout/ResponsiveLayout';
import { useResponsive } from '../../src/hooks/useResponsive';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useProfileStore } from '../../src/stores/profileStore';
import { useAuthStore } from '../../src/stores/authStore';
import { UserAvatar } from '../../src/components/ui/AvatarPicker';

// ─── MealItem ────────────────────────────────────────────────────────────────
function fmtMacro(n: number) {
  return Math.round(n * 10) / 10;
}

function MealItem({
  name,
  amount,
  kcal,
  protein,
  carbs,
  fat,
  isLast,
  onPress,
}: {
  name: string;
  amount: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  isLast?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      style={[styles.mealItem, !isLast && styles.mealItemBorder, webPointer]}
      onPress={onPress}
    >
      <View style={styles.mealItemLeft}>
        <Text style={styles.mealItemName} numberOfLines={1}>{name}</Text>
        <Text style={styles.mealItemMeta}>{Math.round(amount)}g</Text>
      </View>
      <View style={styles.mealItemRight}>
        <Text style={styles.mealItemKcal}>{Math.round(kcal)} kcal</Text>
        <Text style={styles.mealItemMacros}>
          F {fmtMacro(protein)} · Sz {fmtMacro(carbs)} · Zs {fmtMacro(fat)}
        </Text>
      </View>
    </Pressable>
  );
}

// ─── MealSection ─────────────────────────────────────────────────────────────
interface MealSectionProps {
  type: string;
  title: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  iconBg: string;
  items: any[];
  onAdd: () => void;
  onEdit: () => void;
  onEditLog: (log: DailyLogItem) => void;
}

function MealSection({ title, icon, iconBg, items, onAdd, onEdit, onEditLog }: MealSectionProps) {
  const { t } = useTranslation();
  const { isDesktop } = useResponsive();
  const mealTotals = items.reduce(
    (acc, l) => ({
      kcal: acc.kcal + (l.kcal ?? 0),
      protein: acc.protein + (l.protein ?? 0),
      carbs: acc.carbs + (l.carbs ?? 0),
      fat: acc.fat + (l.fat ?? 0),
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
  const empty = items.length === 0;

  return (
    <View style={[styles.mealSectionWrap, isDesktop && styles.mealSectionDesktop]}>
    <BentoCard>
      <View style={styles.mealHeader}>
        <View style={styles.mealTitleRow}>
          <View style={[styles.iconCircle, { backgroundColor: iconBg }]}>
            <MaterialIcons name={icon} size={28} color={Colors.dashboard.stroke} />
          </View>
          <View style={styles.mealTitleBlock}>
            <Text style={styles.mealTitle}>{title}</Text>
            <Text style={styles.mealSummaryMacros}>
              F {fmtMacro(mealTotals.protein)}g · Sz {fmtMacro(mealTotals.carbs)}g · Zs {fmtMacro(mealTotals.fat)}g
            </Text>
          </View>
        </View>
        <View style={[styles.kcalBadge, empty && styles.kcalBadgeEmpty]}>
          <Text style={styles.kcalBadgeValue}>{Math.round(mealTotals.kcal)}</Text>
          <Text style={styles.kcalBadgeUnit}>kcal</Text>
        </View>
      </View>

      {items.length > 0 ? (
        <View style={styles.itemList}>
          {items.map((item, index) => (
            <MealItem
              key={item.id || index}
              name={item.foodName || item.food?.displayName || item.food?.name || 'Étel'}
              amount={item.amount ?? 100}
              kcal={item.kcal ?? 0}
              protein={item.protein ?? 0}
              carbs={item.carbs ?? 0}
              fat={item.fat ?? 0}
              isLast={index === items.length - 1}
              onPress={() => onEditLog(item)}
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
        <Pressable style={[styles.addBtn, webPointer]} onPress={onAdd}>
          <View style={styles.btnShadow} />
          <View style={styles.addBtnInner}>
            <MaterialIcons name="add" size={18} color={Colors.dashboard.stroke} />
            <Text style={styles.btnLabel}>{t('homeScreen.addFoodCta').replace(/^\+\s*/, '')}</Text>
          </View>
        </Pressable>
        <Pressable style={[styles.editBtn, webPointer]} onPress={onEdit}>
          <View style={styles.btnShadow} />
          <View style={styles.editBtnInner}>
            <MaterialIcons name="edit" size={18} color={Colors.dashboard.stroke} />
          </View>
        </Pressable>
      </View>
    </BentoCard>
    </View>
  );
}

// ─── DiaryScreen ─────────────────────────────────────────────────────────────
export default function FoodLibraryScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { isDesktop, columns } = useResponsive();
  const insets = useSafeAreaInsets();
  const { selectedDate, changeDateBy } = useDateStore();
  const avatarKey = useProfileStore((s) => s.avatarKey);
  const user = useAuthStore((s) => s.user);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [manualVisible, setManualVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [selectedFood, setSelectedFood] = useState<Food | null>(null);
  const [selectedLog, setSelectedLog] = useState<DailyLogItem | null>(null);
  const [selectedMealType, setSelectedMealType] = useState<'BREAKFAST' | 'TIZORAI' | 'LUNCH' | 'UZSONNA' | 'DINNER' | 'SNACK'>('SNACK');
  const [analysis, setAnalysis] = useState<DailyAnalysisResult | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);

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
    try {
      const dateStr = selectedDate.toISOString().split('T')[0];
      const [summary, analysisRes] = await Promise.all([
        statsApi.day(dateStr),
        analysisApi.get(dateStr).catch(() => null),
      ]);
      setData(summary);
      setAnalysis(analysisRes);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  const isFocused = useIsFocused();

  useEffect(() => {
    if (!isFocused) return;
    void fetchData();
  }, [isFocused, fetchData]);

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
      <View style={styles.loadingCenter}>
        <ActivityIndicator color={Colors.dashboard.stroke} size="large" />
      </View>
    );
  }

  const totals = data?.totals ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const goals = data?.goals ?? { dailyKcalGoal: 2200 };
  const meals = data?.byMealType ?? {};
  const dateStr = selectedDate.toISOString().split('T')[0];
  const hasLogs =
    (data?.logs?.length ?? 0) > 0 ||
    Object.values(meals).some((arr: any) => Array.isArray(arr) && arr.length > 0);
  const remaining = analysis?.remaining ?? 2;
  const canGenerate = hasLogs && remaining > 0 && !analysisLoading;

  const openAddFlow = (mealType: 'BREAKFAST' | 'TIZORAI' | 'LUNCH' | 'UZSONNA' | 'DINNER' | 'SNACK') => {
    setSelectedMealType(mealType);
    setManualVisible(true);
  };

  const handleGenerate = async () => {
    if (!hasLogs) {
      Alert.alert(t('foodLibraryScreen.noFoodForAnalysis', 'Nincs rögzített étel erre a napra.'));
      return;
    }
    if (remaining <= 0) {
      Alert.alert(t('foodLibraryScreen.analysisLimit', 'Ma már 2 elemzést kértél.'));
      return;
    }
    setAnalysisLoading(true);
    try {
      const locale = i18n.language?.startsWith('en') ? 'en' : 'hu';
      setAnalysis(await analysisApi.generate(dateStr, locale));
    } catch (e: any) {
      Alert.alert(
        t('foodLibraryScreen.dailyAnalysis', 'Napi elemzés'),
        e instanceof ApiError
          ? e.message
          : e?.message || t('foodLibraryScreen.analysisError', 'Az elemzés sikertelen.'),
      );
    } finally {
      setAnalysisLoading(false);
    }
  };

  return (
    <ResponsiveLayout>
    <View style={styles.screen} {...panResponder.panHandlers}>
      <View style={styles.doodleBg} pointerEvents="none" />
      
      {/* TopAppBar */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) + 8 }]}>
        <View style={styles.headerSide}>
          <UserAvatar
            avatarKey={avatarKey ?? user?.username}
            size={40}
            style={styles.avatar}
          />
        </View>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{getHeaderDateText()}</Text>
        </View>

        <View style={[styles.headerSide, { alignItems: 'flex-end' }]}>
          <Pressable style={[styles.calendarBtn, webPointer]} onPress={() => router.push('/(tabs)/date-picker')}>
            <View style={styles.calendarBtnShadow} />
            <View style={styles.calendarBtnInner}>
              <MaterialIcons name="calendar-today" size={20} color={Colors.dashboard.stroke} />
            </View>
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Daily Summary */}
        <View style={styles.summaryRow}>
          <View>
            <Text style={styles.todayTitle}>{getHeaderDateText()}</Text>
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
        <View style={isDesktop ? [styles.mealsGrid, columns >= 3 && styles.mealsGrid3] : undefined}>
        <MealSection 
          type="BREAKFAST"
          title={t('food.breakfast')}
          icon="bakery-dining"
          iconBg={Colors.dashboard.tertiaryFixed}
          items={meals.BREAKFAST || []}
          onAdd={() => openAddFlow('BREAKFAST')}
          onEdit={() => router.push('/(tabs)/scanner')}
          onEditLog={setSelectedLog}
        />

        <MealSection 
          type="TIZORAI"
          title={t('food.tizorai')}
          icon="egg-alt"
          iconBg={Colors.dashboard.primaryFixed}
          items={meals.TIZORAI || []}
          onAdd={() => openAddFlow('TIZORAI')}
          onEdit={() => router.push('/(tabs)/scanner')}
          onEditLog={setSelectedLog}
        />

        <MealSection 
          type="LUNCH"
          title={t('food.lunch')}
          icon="lunch-dining"
          iconBg={Colors.dashboard.errorContainer}
          items={meals.LUNCH || []}
          onAdd={() => openAddFlow('LUNCH')}
          onEdit={() => router.push('/(tabs)/scanner')}
          onEditLog={setSelectedLog}
        />

        <MealSection 
          type="UZSONNA"
          title={t('food.uzsonna')}
          icon="icecream"
          iconBg={Colors.dashboard.secondaryContainer}
          items={meals.UZSONNA || []}
          onAdd={() => openAddFlow('UZSONNA')}
          onEdit={() => router.push('/(tabs)/scanner')}
          onEditLog={setSelectedLog}
        />

        <MealSection 
          type="DINNER"
          title={t('food.dinner')}
          icon="ramen-dining"
          iconBg={Colors.dashboard.surfaceContainerHigh}
          items={meals.DINNER || []}
          onAdd={() => openAddFlow('DINNER')}
          onEdit={() => router.push('/(tabs)/scanner')}
          onEditLog={setSelectedLog}
        />

        <MealSection 
          type="SNACK"
          title={t('food.snack')}
          icon="icecream"
          iconBg={Colors.dashboard.blobPeach}
          items={meals.SNACK || []}
          onAdd={() => openAddFlow('SNACK')}
          onEdit={() => router.push('/(tabs)/scanner')}
          onEditLog={setSelectedLog}
        />
        </View>

        <BentoCard>
          <View style={styles.mealHeader}>
            <View style={styles.mealTitleRow}>
              <View style={[styles.iconCircle, { backgroundColor: Colors.dashboard.softBlue }]}>
                <MaterialIcons name="pie-chart" size={24} color={Colors.dashboard.stroke} />
              </View>
              <View style={styles.mealTitleBlock}>
                <Text style={styles.mealTitle}>{t('foodLibraryScreen.dailyAnalysis', 'Napi elemzés')}</Text>
                <Text style={styles.mealSummaryMacros}>
                  {t('foodLibraryScreen.analysisRemaining', '{{count}} / 2 generálás maradt', {
                    count: remaining,
                  })}
                </Text>
              </View>
            </View>
          </View>

          {analysis?.content ? (
            <Text style={styles.analysisContent}>{analysis.content}</Text>
          ) : (
            <Text style={styles.analysisEmpty}>
              {t(
                'foodLibraryScreen.analysisEmpty',
                'Indíts elemzést, hogy az AI értékelje az aznapi étkezésedet.',
              )}
            </Text>
          )}

          <Pressable
            style={[styles.analysisBtn, webPointer, !canGenerate && styles.analysisBtnDisabled]}
            onPress={handleGenerate}
            disabled={!canGenerate}
          >
            <View style={styles.btnShadow} />
            <View style={styles.analysisBtnInner}>
              {analysisLoading ? (
                <ActivityIndicator color={Colors.dashboard.stroke} />
              ) : (
                <Text style={styles.analysisBtnLabel}>
                  {t('foodLibraryScreen.startAnalysis', 'Elemzés indítása')}
                </Text>
              )}
            </View>
          </Pressable>
        </BentoCard>

        <View style={{ height: Platform.OS === 'web' ? 72 : 120 }} />
      </ScrollView>

      <AddFoodManualModal
        visible={manualVisible}
        onClose={() => setManualVisible(false)}
        onCreated={(food) => {
          setManualVisible(false);
          setSelectedFood(food);
          setDetailVisible(true);
        }}
      />

      <FoodDetailModal
        food={selectedFood}
        visible={detailVisible}
        onClose={() => setDetailVisible(false)}
        onLogAdded={() => {
          setDetailVisible(false);
          fetchData();
        }}
        initialMealType={selectedMealType}
        logSource="MANUAL"
      />
      <EditLogModal
        log={selectedLog}
        visible={!!selectedLog}
        onClose={() => setSelectedLog(null)}
        onSaved={fetchData}
      />
    </View>
    </ResponsiveLayout>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.dashboard.page },
  mealsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  mealsGrid3: {},
  mealSectionWrap: {
    width: '100%',
  },
  mealSectionDesktop: {
    flexGrow: 1,
    flexBasis: '48%',
    minWidth: 280,
    maxWidth: '100%',
  },
  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  doodleBg: { ...StyleSheet.absoluteFillObject, opacity: 0.05 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 16,
    backgroundColor: Colors.dashboard.page,
  },
  headerSide: {
    flex: 1,
    zIndex: 2,
  },
  headerCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
    top: 22,
  },
  avatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: Colors.dashboard.stroke },
  headerTitle: { fontSize: 24, fontWeight: '900', color: Colors.dashboard.stroke, letterSpacing: -0.5 },
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
  mealTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, paddingRight: 8 },
  mealTitleBlock: { flex: 1, minWidth: 0, gap: 2 },
  iconCircle: { width: 40, height: 40, borderRadius: 20, borderWidth: 0.8, borderColor: Colors.dashboard.stroke, alignItems: 'center', justifyContent: 'center', 
    shadowColor: Colors.dashboard.shadowHard, shadowOffset: { width: 2, height: 2 }, shadowOpacity: 1, shadowRadius: 0,
  },
  mealTitle: { fontSize: 22, fontWeight: '700', color: Colors.dashboard.stroke },
  mealSummaryMacros: { fontSize: 11, fontWeight: '600', color: Colors.dashboard.tabInactive },
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
  mealItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, gap: 10 },
  mealItemBorder: { borderBottomWidth: 0.8, borderBottomColor: Colors.dashboard.outlineVariant, borderStyle: 'dashed' },
  mealItemLeft: { flex: 1, gap: 2, minWidth: 0 },
  mealItemRight: { alignItems: 'flex-end', gap: 2 },
  mealItemName: { fontSize: 15, fontWeight: '700', color: Colors.dashboard.stroke },
  mealItemMeta: { fontSize: 12, fontWeight: '600', color: Colors.dashboard.tabInactive },
  mealItemKcal: { fontSize: 14, fontWeight: '800', color: Colors.dashboard.stroke },
  mealItemMacros: { fontSize: 10, fontWeight: '600', color: Colors.dashboard.tabInactive },
  emptyState: { paddingVertical: 24, alignItems: 'center', opacity: 0.7 },
  emptyText: { fontSize: 16, color: Colors.dashboard.tabInactive },
  actionRow: { flexDirection: 'row', gap: 12 },
  analysisContent: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.dashboard.stroke,
    lineHeight: 20,
    marginBottom: 14,
  },
  analysisEmpty: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.dashboard.tabInactive,
    lineHeight: 18,
    marginBottom: 14,
  },
  analysisBtn: { height: 52, width: '100%' },
  analysisBtnDisabled: { opacity: 0.55 },
  analysisBtnInner: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.dashboard.softGreen,
    borderWidth: 1.5,
    borderColor: Colors.dashboard.stroke,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  analysisBtnLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.dashboard.stroke,
  },
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
