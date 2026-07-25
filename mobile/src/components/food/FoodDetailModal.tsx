import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Modal, ScrollView,
  Pressable, TextInput, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import * as Haptics from '../../services/haptics';
import { MaterialIcons, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { Food, FoodStatus, foodApi, logApi } from '../../services/api';
import { GlassCardSimple } from '../ui/GlassCard';
import { Colors, Spacing } from '../../design/tokens';

const MEAL_TYPES = ['BREAKFAST', 'TIZORAI', 'LUNCH', 'UZSONNA', 'DINNER', 'SNACK'] as const;

interface Props {
  food: Food | null;
  visible: boolean;
  onClose: () => void;
  onLogAdded?: () => void;
  logSource?: 'SCAN' | 'SEARCH' | 'MANUAL';
  initialMealType?: (typeof MEAL_TYPES)[number];
}

function MacroBar({
  label,
  grams,
  percent,
  color,
  rotation = 0,
  sugarNote,
}: {
  label: string;
  grams: number;
  percent: number;
  color: string;
  rotation?: number;
  sugarNote?: string;
}) {
  return (
    <View style={styles.macroRow}>
      <View style={styles.macroLabelRow}>
        <Text style={styles.macroLabel}>{label} ({grams}g)</Text>
        <Text style={styles.macroPct}>{Math.round(percent)}%</Text>
      </View>
      <View style={styles.macroTrack}>
        <View
          style={[
            styles.macroFill,
            {
              width: `${Math.max(4, Math.min(100, percent))}%`,
              backgroundColor: color,
              transform: [{ rotate: `${rotation}deg` }],
            },
          ]}
        />
      </View>
      {sugarNote ? <Text style={styles.sugarNote}>{sugarNote}</Text> : null}
    </View>
  );
}

function VoteButtons({
  food,
  onVoted,
}: {
  food: Food;
  onVoted: (score: number, myVote: 1 | -1 | null, status?: FoodStatus) => void;
}) {
  const { t } = useTranslation();
  const [myVote, setMyVote] = useState<1 | -1 | null>(food.myVote ?? null);
  const [score, setScore] = useState<number>(food.score ?? 0);
  const [status, setStatus] = useState<FoodStatus>(food.status ?? 'UNVERIFIED');
  const [loading, setLoading] = useState(false);
  const [hydrating, setHydrating] = useState(true);

  React.useEffect(() => {
    let cancelled = false;
    setHydrating(true);
    setMyVote(food.myVote ?? null);
    setScore(food.score ?? 0);
    setStatus(food.status ?? 'UNVERIFIED');

    (async () => {
      if (!food.id || String(food.id).startsWith('off_')) {
        if (!cancelled) setHydrating(false);
        return;
      }
      try {
        const fresh = await foodApi.getById(food.id);
        if (cancelled) return;
        setScore(fresh.score ?? 0);
        setMyVote(fresh.myVote ?? null);
        setStatus(fresh.status ?? 'UNVERIFIED');
        onVoted(fresh.score ?? 0, fresh.myVote ?? null, fresh.status);
      } catch {
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [food.id]);

  const handleVote = async (value: 1 | -1) => {
    if (loading || hydrating) return;
    setLoading(true);
    const prev = { score, myVote, status };
    if (myVote === value) {
      setMyVote(null);
      setScore((s) => s - value);
    } else if (myVote == null) {
      setMyVote(value);
      setScore((s) => s + value);
    } else {
      setMyVote(value);
      setScore((s) => s - myVote + value);
    }

    try {
      const res = await foodApi.vote(food.id, value);
      await Haptics.selectionAsync();
      const fresh = await foodApi.getById(food.id);
      setScore(fresh.score ?? 0);
      setMyVote(fresh.myVote ?? null);
      setStatus(fresh.status ?? 'UNVERIFIED');
      onVoted(fresh.score ?? 0, fresh.myVote ?? null, fresh.status);

      if (res.earnedExpertBadge) {
        Alert.alert(`🏆 ${t('food.expertBadgeTitle')}`, t('food.expertBadgeBody'));
      }
    } catch {
      setScore(prev.score);
      setMyVote(prev.myVote);
      setStatus(prev.status);
      Alert.alert(t('food.errorTitle'), t('food.voteError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={voteStyles.container}>
      <View style={voteStyles.headerRow}>
        <View style={voteStyles.headerLeft}>
          <MaterialIcons name="people-outline" size={24} color={Colors.dashboard.stroke} />
          <Text style={voteStyles.title}>{t('food.communityRating')}</Text>
        </View>
        {status === 'VERIFIED' && (
          <MaterialIcons name="verified" size={28} color="#00E676" />
        )}
      </View>

      <View style={voteStyles.voteContainer}>
        <Pressable style={voteStyles.btnWrapper} onPress={() => handleVote(-1)} disabled={loading || hydrating}>
          <View style={voteStyles.btnShadow} />
          <View style={[voteStyles.btnInner, voteStyles.btnDownInner]}>
            <MaterialIcons name="thumb-down-off-alt" size={16} color="#D32F2F" />
            <Text style={voteStyles.btnTextDown}>{t('food.inaccurate').toUpperCase()}</Text>
          </View>
        </Pressable>

        <View style={voteStyles.scoreWrapper}>
          {loading || hydrating ? (
            <ActivityIndicator size="small" color={Colors.dashboard.stroke} />
          ) : (
            <Text style={voteStyles.scoreNum}>
              {score > 0 ? '+' : ''}
              {score}
            </Text>
          )}
        </View>

        <Pressable style={voteStyles.btnWrapper} onPress={() => handleVote(1)} disabled={loading || hydrating}>
          <View style={voteStyles.btnShadow} />
          <View style={[voteStyles.btnInner, voteStyles.btnUpInner]}>
            <MaterialIcons name="thumb-up-off-alt" size={16} color="#388E3C" />
            <Text style={voteStyles.btnTextUp}>{t('food.accurate').toUpperCase()}</Text>
          </View>
        </Pressable>
      </View>

      <Text style={voteStyles.footerText}>{t('food.verificationNote')}</Text>
    </View>
  );
}

const voteStyles = StyleSheet.create({
  container: { gap: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 20, fontWeight: '800', color: Colors.dashboard.stroke },
  voteContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.dashboard.surfaceContainerLow,
    borderWidth: 0.8,
    borderColor: Colors.dashboard.stroke,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  btnWrapper: { flex: 1, position: 'relative', height: 42 },
  btnShadow: {
    position: 'absolute', top: 2, left: 2, right: -2, bottom: -2,
    backgroundColor: Colors.dashboard.shadowHard, borderRadius: 999,
  },
  btnInner: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 0.8, borderColor: Colors.dashboard.stroke, borderRadius: 999,
    alignItems: 'center', justifyContent: 'center', gap: 6,
    flexDirection: 'row',
  },
  btnDownInner: { backgroundColor: '#FADBD8' },
  btnUpInner: { backgroundColor: '#E8F5E9' },
  btnTextDown: { fontSize: 13, fontWeight: '700', color: '#C0392B' },
  btnTextUp: { fontSize: 13, fontWeight: '700', color: '#27AE60' },
  scoreWrapper: { width: 60, alignItems: 'center', justifyContent: 'center' },
  scoreNum: { fontSize: 24, fontWeight: '900', color: Colors.dashboard.stroke },
  footerText: { textAlign: 'center', fontStyle: 'italic', fontSize: 12, color: Colors.text.muted, marginTop: 4 },
});

export default function FoodDetailModal({
  food,
  visible,
  onClose,
  onLogAdded,
  logSource = 'SEARCH',
  initialMealType = 'SNACK',
}: Props) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState('100');
  const [mealType, setMealType] = useState<(typeof MEAL_TYPES)[number]>('SNACK');
  const [adding, setAdding] = useState(false);
  const [currentFood, setCurrentFood] = useState<Food | null>(null);

  React.useEffect(() => { setCurrentFood(food); }, [food]);
  React.useEffect(() => {
    if (visible && food) {
      setMealType(initialMealType);
      const serving = food.servingSize != null && food.servingSize > 0 ? food.servingSize : 100;
      setAmount(String(Math.round(serving)));
    }
  }, [visible, initialMealType, food]);

  if (!currentFood) return null;
  const displayName = (i18n.language === 'en' ? currentFood.nameEn : currentFood.nameHu) ?? currentFood.displayName ?? currentFood.name;

  const servingSize = currentFood.servingSize != null && currentFood.servingSize > 0 ? currentFood.servingSize : 100;
  const servingUnit = currentFood.servingUnit?.trim() || 'g';
  const portionLabel = `${Math.round(servingSize)}${servingUnit} / ${t('food.serving')}`;

  const g = parseFloat(amount) || 0;
  const calc = {
    kcal: Math.round(currentFood.kcal / 100 * g),
    protein: Math.round(currentFood.protein / 100 * g * 10) / 10,
    carbs: Math.round(currentFood.carbs / 100 * g * 10) / 10,
    fat: Math.round(currentFood.fat / 100 * g * 10) / 10,
    fiber: currentFood.fiber != null ? Math.round(currentFood.fiber / 100 * g * 10) / 10 : undefined,
    sugar: currentFood.sugar != null ? Math.round(currentFood.sugar / 100 * g * 10) / 10 : undefined,
  };

  const totalMacro = Math.max(0.1, currentFood.carbs + currentFood.protein + currentFood.fat);
  const carbsPct = (currentFood.carbs / totalMacro) * 100;
  const proteinPct = (currentFood.protein / totalMacro) * 100;
  const fatPct = (currentFood.fat / totalMacro) * 100;

  const mealLabel = (m: (typeof MEAL_TYPES)[number]) => {
    if (m === 'BREAKFAST') return t('food.breakfast');
    if (m === 'TIZORAI') return t('food.tizorai');
    if (m === 'LUNCH') return t('food.lunch');
    if (m === 'UZSONNA') return t('food.uzsonna');
    if (m === 'DINNER') return t('food.dinner');
    return t('food.snack');
  };

  const adjustAmount = (delta: number) => {
    const next = Math.max(0, Math.round((parseFloat(amount) || 0) + delta));
    setAmount(String(next));
  };

  const handleAddLog = async () => {
    if (!g || g <= 0) { Alert.alert(t('food.enterAmount')); return; }
    setAdding(true);
    try {
      const isUuid =
        typeof currentFood.id === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          currentFood.id,
        );
      await logApi.create({
        ...(isUuid ? { foodId: currentFood.id } : {}),
        foodName: displayName,
        kcal: calc.kcal,
        protein: calc.protein,
        carbs: calc.carbs,
        fat: calc.fat,
        fiber: calc.fiber,
        sugar: calc.sugar,
        amount: g,
        mealType,
        source: logSource,
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onLogAdded?.();
      onClose();
    } catch (e: any) {
      Alert.alert(t('food.errorTitle'), e.message);
    } finally {
      setAdding(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={styles.doodleBg} pointerEvents="none" />

        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={onClose}>
            <View style={styles.backBtnShadow} />
            <View style={styles.backBtnInner}>
              <MaterialIcons name="arrow-back" size={24} color={Colors.dashboard.stroke} />
            </View>
          </Pressable>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>{t('food.productDetailsTitle')}</Text>
          </View>
        </View>

        <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.productCardWrapper}>
            <View style={styles.productCardShadow} />
            <View style={styles.productCardInner}>
              <View style={styles.productCardDecorLeft}>
                <MaterialCommunityIcons name="food-apple" size={80} color={Colors.dashboard.stroke} style={{ opacity: 0.1 }} />
              </View>
              <View style={styles.productCardDecorRight}>
                <MaterialCommunityIcons name="leaf" size={32} color={Colors.dashboard.nutritionIcon} style={{ opacity: 0.3 }} />
              </View>

              <Text style={styles.foodName}>{displayName}</Text>

              <View style={styles.portionBadgeWrapper}>
                <View style={styles.portionBadgeShadow} />
                <View style={styles.portionBadgeInner}>
                  <Text style={styles.portionText}>{portionLabel}</Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.body}>
            <GlassCardSimple padding={20} radius={24} style={styles.sectionCard}>
              <View style={styles.amountStepper}>
                <Pressable style={styles.amountStepBtn} onPress={() => adjustAmount(-10)}>
                  <View style={styles.amountStepShadow} />
                  <View style={styles.amountStepInner}>
                    <MaterialIcons name="remove" size={22} color={Colors.dashboard.stroke} />
                  </View>
                </Pressable>
                <View style={styles.amountCenter}>
                  <TextInput
                    style={styles.amountInput}
                    value={amount}
                    onChangeText={setAmount}
                    keyboardType="decimal-pad"
                    placeholder="100"
                    selectTextOnFocus
                  />
                  <Text style={styles.amountUnitText}>g</Text>
                </View>
                <Pressable style={styles.amountStepBtn} onPress={() => adjustAmount(10)}>
                  <View style={styles.amountStepShadow} />
                  <View style={styles.amountStepInner}>
                    <MaterialIcons name="add" size={22} color={Colors.dashboard.stroke} />
                  </View>
                </Pressable>
              </View>
            </GlassCardSimple>

            <GlassCardSimple padding={20} radius={24} style={styles.sectionCard}>
              <View style={styles.sectionHeaderSmall}>
                <Ionicons name="pie-chart-outline" size={24} color={Colors.dashboard.stroke} />
                <Text style={styles.sectionTitle}>Makrotápanyagok</Text>
              </View>

              <View style={styles.macroEnergyRow}>
                <View style={styles.energyLeft}>
                  <MaterialCommunityIcons name="lightning-bolt" size={20} color={Colors.dashboard.nutritionIcon} />
                  <Text style={styles.energyLabel}>{t('food.energy', { defaultValue: 'Energia' }).toUpperCase()}</Text>
                </View>
                <Text style={styles.energyValue}>{calc.kcal} kcal</Text>
              </View>

              <View style={{ gap: 16, marginTop: 4 }}>
                <MacroBar
                  label={t('food.protein', { defaultValue: 'Fehérje' })}
                  grams={currentFood.protein}
                  percent={proteinPct}
                  color={Colors.dashboard.proteinFill}
                  rotation={0.5}
                />
                <MacroBar
                  label={t('food.carbs', { defaultValue: 'Szénhidrát' })}
                  grams={currentFood.carbs}
                  percent={carbsPct}
                  color={Colors.dashboard.carbsFill}
                  rotation={-0.5}
                  sugarNote={
                    currentFood.sugar != null
                      ? `${t('food.ofWhichSugar', { defaultValue: 'ebből cukor' })}: ${currentFood.sugar}g / 100g`
                      : undefined
                  }
                />
                <MacroBar
                  label={t('food.fat', { defaultValue: 'Zsír' })}
                  grams={currentFood.fat}
                  percent={fatPct}
                  color={Colors.dashboard.fatFill}
                  rotation={-0.5}
                />
              </View>

              {currentFood.fiber != null && (
                <View style={styles.extraNutri}>
                  <View style={styles.nutrRow}>
                    <View style={[styles.nutrDot, { backgroundColor: Colors.macro.fiber }]} />
                    <Text style={styles.nutrLabel}>{t('food.fiberPer100g')}</Text>
                    <Text style={[styles.nutrValue, { color: Colors.macro.fiber }]}>{currentFood.fiber}g</Text>
                  </View>
                </View>
              )}
            </GlassCardSimple>

            <GlassCardSimple padding={20} radius={24} style={styles.sectionCard}>
              <View style={styles.sectionHeaderSmall}>
                <Ionicons name="restaurant-outline" size={24} color={Colors.dashboard.stroke} />
                <Text style={styles.sectionTitle}>{t('food.mealType')}</Text>
              </View>
              <View style={styles.mealRow}>
                {MEAL_TYPES.map((m) => {
                  const isActive = mealType === m;
                  return (
                    <View key={m} style={styles.mealBtnWrapper}>
                      {isActive && <View style={styles.mealBtnShadowActive} />}
                      <Pressable
                        style={[styles.mealBtnInner, isActive && styles.mealBtnInnerActive]}
                        onPress={() => setMealType(m)}
                      >
                        <Text style={[styles.mealBtnText, isActive && styles.mealBtnTextActive]}>
                          {mealLabel(m)}
                        </Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            </GlassCardSimple>

            {currentFood.id && !String(currentFood.id).startsWith('off_') && (
              <GlassCardSimple padding={20} radius={24}>
                <VoteButtons
                  food={currentFood}
                  onVoted={(score, myVote, status) =>
                    setCurrentFood((f) => (f ? { ...f, score, myVote, ...(status ? { status } : {}) } : f))
                  }
                />
              </GlassCardSimple>
            )}

            <View style={{ height: 120 }} />
          </View>
        </ScrollView>

        <KeyboardAvoidingView
          style={styles.keyboardAvoidingFooter}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0}
          pointerEvents="box-none"
        >
          <View style={styles.footer}>
            <Pressable style={styles.addBtn} onPress={handleAddLog} disabled={adding}>
              <View style={styles.addBtnShadow} />
              <View style={styles.addBtnInner}>
                <MaterialIcons name="add-circle" size={24} color="#fff" />
                <Text style={styles.addBtnLabel}>
                  {adding ? 'Folyamatban...' : t('food.addToLog')}
                </Text>
              </View>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.dashboard.page },
  doodleBg: { ...StyleSheet.absoluteFillObject, opacity: 0.05 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 16,
    zIndex: 50,
  },
  backBtn: { width: 40, height: 40 },
  backBtnShadow: {
    position: 'absolute', top: 2, left: 2, right: -2, bottom: -2,
    backgroundColor: Colors.dashboard.shadowHard, borderRadius: 20,
  },
  backBtnInner: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#fff',
    borderWidth: 0.8,
    borderColor: Colors.dashboard.stroke,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleContainer: { flex: 1, alignItems: 'center', marginRight: 40 },
  headerTitle: { fontSize: 24, fontWeight: '900', color: Colors.dashboard.stroke },
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingTop: 16 },
  productCardWrapper: { marginBottom: 32, transform: [{ rotate: '-2deg' }] },
  productCardShadow: {
    position: 'absolute', top: 4, left: 4, right: -4, bottom: -4,
    backgroundColor: Colors.dashboard.shadowHard, borderRadius: 32,
  },
  productCardInner: {
    backgroundColor: '#fff',
    borderWidth: 0.8,
    borderColor: Colors.dashboard.stroke,
    borderRadius: 32,
    padding: 32,
    alignItems: 'center',
    overflow: 'hidden',
  },
  productCardDecorLeft: { position: 'absolute', left: -16, top: -16 },
  productCardDecorRight: { position: 'absolute', right: 16, top: 16 },
  foodName: {
    fontSize: 48,
    fontWeight: '900',
    color: Colors.dashboard.stroke,
    textAlign: 'center',
    textShadowColor: Colors.dashboard.shadowHard,
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 0,
    marginBottom: 12,
  },
  portionBadgeWrapper: { transform: [{ rotate: '3deg' }] },
  portionBadgeShadow: {
    position: 'absolute', top: 2, left: 2, right: -2, bottom: -2,
    backgroundColor: Colors.dashboard.shadowHard, borderRadius: 999,
  },
  portionBadgeInner: {
    backgroundColor: Colors.dashboard.page,
    borderWidth: 0.8,
    borderColor: Colors.dashboard.stroke,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  portionText: { fontSize: 16, fontWeight: '500', color: Colors.dashboard.onSurfaceVariant },
  body: { gap: 16 },
  sectionCard: { marginBottom: 4 },
  sectionHeaderSmall: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 24, fontWeight: '700', color: Colors.dashboard.stroke, flex: 1 },
  amountStepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  amountStepBtn: { width: 48, height: 48 },
  amountStepShadow: {
    position: 'absolute', top: 2, left: 2, right: -2, bottom: -2,
    backgroundColor: Colors.dashboard.shadowHard, borderRadius: 24,
  },
  amountStepInner: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#fff',
    borderWidth: 0.8,
    borderColor: Colors.dashboard.stroke,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  amountCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.dashboard.surfaceContainerLow,
    borderWidth: 0.8,
    borderColor: Colors.dashboard.stroke,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 4,
    minHeight: 48,
  },
  amountInput: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.dashboard.stroke,
    width: 72,
    textAlign: 'center',
  },
  amountUnitText: { fontSize: 24, fontWeight: '700', color: Colors.dashboard.onSurfaceVariant },
  macroEnergyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 0.8,
    borderBottomColor: 'rgba(28,27,27,0.12)',
  },
  energyLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  energyLabel: { fontSize: 14, fontWeight: '700', color: Colors.dashboard.onSurfaceVariant, letterSpacing: 1 },
  energyValue: { fontSize: 20, fontWeight: '700', color: Colors.dashboard.stroke },
  macroRow: { gap: 8 },
  macroLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  macroLabel: { fontSize: 14, fontWeight: '700', color: Colors.dashboard.stroke },
  macroPct: { fontSize: 14, fontWeight: '700', color: Colors.dashboard.onSurfaceVariant },
  macroTrack: {
    height: 16,
    backgroundColor: Colors.dashboard.surfaceContainerHighest,
    borderRadius: 999,
    overflow: 'hidden',
  },
  macroFill: {
    height: '100%',
    borderRadius: 999,
  },
  sugarNote: { fontSize: 12, fontWeight: '600', color: Colors.text.muted, paddingLeft: 2 },
  extraNutri: { marginTop: Spacing.sm },
  nutrRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, gap: 8 },
  nutrDot: { width: 8, height: 8, borderRadius: 4 },
  nutrLabel: { flex: 1, fontSize: 15, color: Colors.text.secondary },
  nutrValue: { fontSize: 15, fontWeight: '800' },
  mealRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingTop: 8 },
  mealBtnWrapper: { position: 'relative', marginBottom: 4 },
  mealBtnShadowActive: {
    position: 'absolute', top: 3, left: 3, right: -3, bottom: -3,
    backgroundColor: Colors.dashboard.shadowHard, borderRadius: 999,
  },
  mealBtnInner: {
    backgroundColor: Colors.dashboard.surfaceContainerLow,
    borderWidth: 0.8, borderColor: Colors.dashboard.stroke, borderRadius: 999,
    paddingVertical: 10, paddingHorizontal: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  mealBtnInnerActive: { backgroundColor: Colors.dashboard.softGreen },
  mealBtnText: { fontSize: 14, color: Colors.dashboard.stroke, fontWeight: '500' },
  mealBtnTextActive: { color: Colors.dashboard.nutritionIcon, fontWeight: '600' },
  keyboardAvoidingFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  footer: {
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    backgroundColor: 'transparent',
  },
  addBtn: { height: 56, width: '100%' },
  addBtnShadow: {
    position: 'absolute', top: 4, left: 4, right: -4, bottom: -4,
    backgroundColor: Colors.dashboard.shadowHard, borderRadius: 999,
  },
  addBtnInner: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.dashboard.nutritionIcon,
    borderWidth: 0.8,
    borderColor: Colors.dashboard.stroke,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  addBtnLabel: { color: '#fff', fontSize: 24, fontWeight: '700' },
});
