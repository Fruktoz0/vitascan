import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Modal, ScrollView,
  Pressable, TextInput, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { MaterialIcons, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { Food, foodApi, logApi } from '../../services/api';
import { GlassCardSimple } from '../ui/GlassCard';
import { GhostButton } from '../ui/Button';
import { Colors, Spacing, Typography } from '../../design/tokens';

const MEAL_TYPES = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'] as const;

interface Props {
  food: Food | null;
  visible: boolean;
  onClose: () => void;
  onLogAdded?: () => void;
  logSource?: 'SCAN' | 'SEARCH' | 'MANUAL';
  initialMealType?: (typeof MEAL_TYPES)[number];
}

// ─── Tápérték sor ─────────────────────────────────────────────────────────────
function NutrRow({ label, value, unit, color }: { label: string; value: number; unit: string; color: string }) {
  return (
    <View style={nutrStyles.row}>
      <View style={[nutrStyles.dot, { backgroundColor: color }]} />
      <Text style={nutrStyles.label}>{label}</Text>
      <Text style={[nutrStyles.value, { color }]}>{value}{unit}</Text>
    </View>
  );
}
const nutrStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { flex: 1, ...Typography.body, color: Colors.text.secondary },
  value: { fontSize: 15, fontWeight: '800' },
});

function MacroBar({
  label,
  grams,
  percent,
  color,
  rotation = 0,
}: { label: string; grams: number; percent: number; color: string; rotation?: number }) {
  return (
    <View style={styles.macroRow}>
      <View style={styles.macroLabelRow}>
        <Text style={styles.macroLabel}>{label} ({grams}g)</Text>
        <Text style={styles.macroPct}>{Math.round(percent)}%</Text>
      </View>
      <View style={styles.macroTrack}>
        <View style={[
          styles.macroFill, 
          { 
            width: `${Math.max(4, Math.min(100, percent))}%`, 
            backgroundColor: color,
            transform: [{ rotate: `${rotation}deg` }],
          }
        ]}>
          <View style={styles.macroFillShadow} />
        </View>
      </View>
    </View>
  );
}

// ─── Szavazó gombok ───────────────────────────────────────────────────────────
function VoteButtons({ food, onVoted }: { food: Food; onVoted: (score: number, myVote: 1 | -1 | null) => void }) {
  const { t } = useTranslation();
  const [myVote, setMyVote] = useState<1 | -1 | null>(food.myVote ?? null);
  const [score, setScore] = useState<number>(food.score ?? 0);
  const [loading, setLoading] = useState(false);

  const handleVote = async (value: 1 | -1) => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await foodApi.vote(food.id, value);
      await Haptics.selectionAsync();
      const newMyVote = res.action === 'removed' ? null : value;
      setScore(res.score);
      setMyVote(newMyVote);
      onVoted(res.score, newMyVote);

      if (res.earnedExpertBadge) {
        Alert.alert(`🏆 ${t('food.expertBadgeTitle')}`, t('food.expertBadgeBody'));
      }
    } catch {
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
        {score > 5 && (
          <MaterialIcons name="verified" size={28} color="#00E676" />
        )}
      </View>

      <View style={voteStyles.voteContainer}>
        {/* Le szavazat */}
        <Pressable style={voteStyles.btnWrapper} onPress={() => handleVote(-1)} disabled={loading}>
          <View style={voteStyles.btnShadow} />
          <View style={[voteStyles.btnInner, voteStyles.btnDownInner]}>
            <MaterialIcons name="thumb-down-off-alt" size={16} color="#D32F2F" />
            <Text style={voteStyles.btnTextDown}>
              {t('food.inaccurate').toUpperCase()}
            </Text>
          </View>
        </Pressable>

        {/* Score */}
        <View style={voteStyles.scoreWrapper}>
          {loading ? (
            <ActivityIndicator size="small" color={Colors.dashboard.stroke} />
          ) : (
            <Text style={voteStyles.scoreNum}>
              {score > 0 ? '+' : ''}{score}
            </Text>
          )}
        </View>

        {/* Fel szavazat */}
        <Pressable style={voteStyles.btnWrapper} onPress={() => handleVote(1)} disabled={loading}>
          <View style={voteStyles.btnShadow} />
          <View style={[voteStyles.btnInner, voteStyles.btnUpInner]}>
            <MaterialIcons name="thumb-up-off-alt" size={16} color="#388E3C" />
            <Text style={voteStyles.btnTextUp}>
              {t('food.accurate').toUpperCase()}
            </Text>
          </View>
        </Pressable>
      </View>

      {/* Státusz info */}
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

// ─── Fő modal ─────────────────────────────────────────────────────────────────
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

  // food prop változásakor frissítjük
  React.useEffect(() => { setCurrentFood(food); }, [food]);
  React.useEffect(() => {
    if (visible) setMealType(initialMealType);
  }, [visible, initialMealType]);

  if (!currentFood) return null;
  const displayName = (i18n.language === 'en' ? currentFood.nameEn : currentFood.nameHu) ?? currentFood.displayName ?? currentFood.name;

  const g = parseFloat(amount) || 0;
  const calc = {
    kcal: Math.round(currentFood.kcal / 100 * g),
    protein: Math.round(currentFood.protein / 100 * g * 10) / 10,
    carbs: Math.round(currentFood.carbs / 100 * g * 10) / 10,
    fat: Math.round(currentFood.fat / 100 * g * 10) / 10,
  };

  const handleAddLog = async () => {
    if (!g || g <= 0) { Alert.alert(t('food.enterAmount')); return; }
    setAdding(true);
    try {
      await logApi.create({
        foodId: currentFood.id,
        foodName: displayName,
        kcal: calc.kcal,
        protein: calc.protein,
        carbs: calc.carbs,
        fat: calc.fat,
        fiber: currentFood.fiber != null ? Math.round(currentFood.fiber / 100 * g * 10) / 10 : undefined,
        sugar: currentFood.sugar != null ? Math.round(currentFood.sugar / 100 * g * 10) / 10 : undefined,
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
        
        {/* TopAppBar */}
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
          {/* Product Header Card */}
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
                  <Text style={styles.portionText}>100g adag</Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.body}>
            {/* Quantity Section */}
            <GlassCardSimple padding={20} radius={24} style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Ionicons name="scale-outline" size={24} color={Colors.dashboard.stroke} />
                <Text style={styles.sectionTitle}>{t('food.amount')}</Text>
                <View style={styles.amountInputWrapper}>
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
              </View>
            </GlassCardSimple>

            {/* Energy Card */}
            <GlassCardSimple padding={16} radius={16} style={styles.sectionCard}>
              <View style={styles.energyRow}>
                <View style={styles.energyLeft}>
                  <MaterialCommunityIcons name="lightning-bolt" size={20} color={Colors.dashboard.nutritionIcon} />
                  <Text style={styles.energyLabel}>ENERGIA TARTALOM</Text>
                </View>
                <Text style={styles.energyValue}>100g / {currentFood.kcal} kcal</Text>
              </View>
            </GlassCardSimple>

            {/* Benefit Card */}
            <GlassCardSimple 
              backgroundColor={Colors.dashboard.secondaryContainer} 
              padding={20} 
              radius={24}
              style={styles.sectionCard}
            >
              <View style={styles.benefitDecor}>
                <MaterialCommunityIcons name="brain" size={100} color={Colors.dashboard.stroke} style={{ opacity: 0.1 }} />
              </View>
              <View style={styles.benefitContent}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.benefitTitle}>Kiváló rostforrás</Text>
                  <Text style={styles.benefitText}>
                    Gazdag C-vitaminban és pektinben, amely támogatja az emésztést.
                  </Text>
                </View>
                <View style={styles.heartBtnWrapper}>
                  <View style={styles.heartBtnShadow} />
                  <View style={styles.heartBtnInner}>
                    <MaterialCommunityIcons name="heart" size={20} color={Colors.dashboard.stroke} />
                  </View>
                </View>
              </View>
            </GlassCardSimple>

            {/* Macro Breakdown */}
            <GlassCardSimple padding={20} radius={24} style={styles.sectionCard}>
              <View style={styles.sectionHeaderSmall}>
                <Ionicons name="pie-chart-outline" size={24} color={Colors.dashboard.stroke} />
                <Text style={styles.sectionTitle}>Makrotápanyagok</Text>
              </View>
              
              {(() => {
                const total = Math.max(0.1, currentFood.carbs + currentFood.protein + currentFood.fat);
                const carbsPct = (currentFood.carbs / total) * 100;
                const proteinPct = (currentFood.protein / total) * 100;
                const fatPct = (currentFood.fat / total) * 100;
                return (
                  <View style={{ gap: 16, marginTop: 12 }}>
                    <MacroBar label={t('food.carbsPer100g').split(' ')[0]} grams={currentFood.carbs} percent={carbsPct} color={Colors.dashboard.carbsFill} rotation={-0.5} />
                    <MacroBar label={t('food.proteinPer100g').split(' ')[0]} grams={currentFood.protein} percent={proteinPct} color={Colors.dashboard.proteinFill} rotation={0.5} />
                    <MacroBar label={t('food.fatPer100g').split(' ')[0]} grams={currentFood.fat} percent={fatPct} color={Colors.dashboard.fatFill} rotation={-0.5} />
                  </View>
                );
              })()}

              {(currentFood.fiber != null || currentFood.sugar != null) && (
                <View style={styles.extraNutri}>
                  {currentFood.fiber != null && (
                    <NutrRow label={t('food.fiberPer100g')} value={currentFood.fiber} unit="g" color={Colors.macro.fiber} />
                  )}
                  {currentFood.sugar != null && (
                    <NutrRow label={t('food.sugarPer100g')} value={currentFood.sugar} unit="g" color={Colors.macro.sugar} />
                  )}
                </View>
              )}
            </GlassCardSimple>

            {/* Étkezés típusa */}
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
                          {m === 'BREAKFAST' && t('food.breakfast')}
                          {m === 'LUNCH' && t('food.lunch')}
                          {m === 'DINNER' && t('food.dinner')}
                          {m === 'SNACK' && t('food.snack')}
                        </Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            </GlassCardSimple>

            {/* Szavazás (csak DB ételekre) */}
            {currentFood.id && (
              <GlassCardSimple padding={20} radius={24}>
                <VoteButtons
                  food={currentFood}
                  onVoted={(score, myVote) => setCurrentFood((f) => f ? { ...f, score, myVote } : f)}
                />
              </GlassCardSimple>
            )}

            <View style={{ height: 120 }} />
          </View>
        </ScrollView>

        {/* Fixed Bottom Button */}
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
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sectionHeaderSmall: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 24, fontWeight: '700', color: Colors.dashboard.stroke, flex: 1 },
  amountInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dashboard.surfaceContainerLow,
    borderWidth: 0.8,
    borderColor: Colors.dashboard.stroke,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 4,
  },
  amountInput: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.dashboard.stroke,
    width: 60,
    textAlign: 'right',
  },
  amountUnitText: { fontSize: 24, fontWeight: '700', color: Colors.dashboard.onSurfaceVariant },
  energyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  energyLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  energyLabel: { fontSize: 14, fontWeight: '700', color: Colors.dashboard.onSurfaceVariant, letterSpacing: 1 },
  energyValue: { fontSize: 20, fontWeight: '700', color: Colors.dashboard.stroke },
  benefitDecor: { position: 'absolute', right: -20, bottom: -20 },
  benefitContent: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  benefitTitle: { fontSize: 24, fontWeight: '700', color: Colors.dashboard.stroke, marginBottom: 4 },
  benefitText: { fontSize: 16, color: Colors.dashboard.stroke, opacity: 0.9, lineHeight: 22 },
  heartBtnWrapper: { width: 48, height: 48 },
  heartBtnShadow: {
    position: 'absolute', top: 2, left: 2, right: -2, bottom: -2,
    backgroundColor: Colors.dashboard.shadowHard, borderRadius: 24,
  },
  heartBtnInner: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#fff',
    borderWidth: 0.8,
    borderColor: Colors.dashboard.stroke,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  macroRow: { gap: 8 },
  macroLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  macroLabel: { fontSize: 14, fontWeight: '700', color: Colors.dashboard.stroke },
  macroPct: { fontSize: 14, fontWeight: '700', color: Colors.dashboard.onSurfaceVariant },
  macroTrack: { 
    height: 16, 
    backgroundColor: Colors.dashboard.surfaceContainerHighest, 
    borderRadius: 999, 
    borderWidth: 0.8, 
    borderColor: Colors.dashboard.stroke,
    overflow: 'visible',
  },
  macroFill: { 
    height: '100%', 
    borderRadius: 999, 
    borderWidth: 0.8, 
    borderColor: Colors.dashboard.stroke,
    position: 'relative',
  },
  macroFillShadow: {
    position: 'absolute',
    top: 2,
    left: 2,
    right: -2,
    bottom: -2,
    backgroundColor: Colors.dashboard.shadowHard,
    borderRadius: 999,
    zIndex: -1,
  },
  extraNutri: { marginTop: Spacing.sm, gap: 0 },
  sectionTitleSmall: { fontSize: 14, fontWeight: '700', color: Colors.dashboard.onSurfaceVariant, marginBottom: 12 },
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
