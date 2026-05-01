import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Modal, ScrollView,
  Pressable, TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { MaterialIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { Food, foodApi, logApi } from '../../services/api';
import { GlassCardSimple } from '../ui/GlassCard';
import { PrimaryButton, GhostButton } from '../ui/Button';
import { Colors, Gradients, Radius, Spacing, Typography } from '../../design/tokens';

const MEAL_TYPES = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK', 'OTHER'] as const;

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
}: { label: string; grams: number; percent: number; color: string }) {
  return (
    <View style={styles.macroRow}>
      <Text style={styles.macroLabel}>{label} ({grams}g)</Text>
      <View style={styles.macroTrack}>
        <View style={[styles.macroFill, { width: `${Math.max(4, Math.min(100, percent))}%`, backgroundColor: color }]} />
      </View>
      <Text style={styles.macroPct}>{Math.round(percent)}%</Text>
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
      <Text style={voteStyles.label}>{t('food.communityRating')}</Text>
      <View style={voteStyles.row}>
        {/* Le szavazat */}
        <Pressable
          style={[voteStyles.btn, myVote === -1 && voteStyles.btnDownActive]}
          onPress={() => handleVote(-1)}
          disabled={loading}
        >
          <Text style={voteStyles.btnEmoji}>👎</Text>
          <Text style={[voteStyles.btnText, myVote === -1 && voteStyles.btnTextDownActive]}>
            {t('food.inaccurate')}
          </Text>
        </Pressable>

        {/* Score */}
        <View style={[
          voteStyles.scoreBox,
          score > 0 && voteStyles.scoreBoxPos,
          score < 0 && voteStyles.scoreBoxNeg,
        ]}>
          {loading ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <>
              <Text style={[
                voteStyles.scoreNum,
                score > 0 && voteStyles.scoreNumPos,
                score < 0 && voteStyles.scoreNumNeg,
              ]}>
                {score > 0 ? '+' : ''}{score}
              </Text>
              <Text style={voteStyles.scoreLabel}>{t('food.points')}</Text>
            </>
          )}
        </View>

        {/* Fel szavazat */}
        <Pressable
          style={[voteStyles.btn, myVote === 1 && voteStyles.btnUpActive]}
          onPress={() => handleVote(1)}
          disabled={loading}
        >
          <Text style={voteStyles.btnEmoji}>👍</Text>
          <Text style={[voteStyles.btnText, myVote === 1 && voteStyles.btnTextUpActive]}>
            {t('food.accurate')}
          </Text>
        </Pressable>
      </View>

      {/* Státusz info */}
      <View style={voteStyles.statusRow}>
        {food.status === 'VERIFIED' && (
          <View style={voteStyles.verifiedBadge}>
            <Text style={voteStyles.verifiedText}>✅ {t('food.verifiedStatus')}</Text>
          </View>
        )}
        {food.status === 'UNVERIFIED' && (
          <Text style={voteStyles.unverifiedText}>
            💡 {t('food.votesToVerify', { count: 5 - (score > 0 ? score : 0) })}
          </Text>
        )}
      </View>
    </View>
  );
}

const voteStyles = StyleSheet.create({
  container: { gap: Spacing.sm },
  label: { ...Typography.label, color: Colors.text.secondary },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  btn: {
    flex: 1, alignItems: 'center', paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.04)', borderRadius: Radius.lg,
    gap: 3, borderWidth: 2, borderColor: 'transparent',
  },
  btnUpActive: { backgroundColor: 'rgba(46,204,113,0.1)', borderColor: '#2ECC71' },
  btnDownActive: { backgroundColor: 'rgba(231,76,60,0.1)', borderColor: '#E74C3C' },
  btnEmoji: { fontSize: 22 },
  btnText: { ...Typography.caption, color: Colors.text.muted },
  btnTextUpActive: { color: '#2ECC71', fontWeight: '700' },
  btnTextDownActive: { color: '#E74C3C', fontWeight: '700' },
  scoreBox: {
    width: 60, alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderRadius: Radius.lg, paddingVertical: 8,
  },
  scoreBoxPos: { backgroundColor: 'rgba(46,204,113,0.08)' },
  scoreBoxNeg: { backgroundColor: 'rgba(231,76,60,0.08)' },
  scoreNum: { fontSize: 20, fontWeight: '900', color: Colors.text.primary },
  scoreNumPos: { color: '#2ECC71' },
  scoreNumNeg: { color: '#E74C3C' },
  scoreLabel: { ...Typography.caption, color: Colors.text.muted },
  statusRow: { alignItems: 'center' },
  verifiedBadge: {
    backgroundColor: Colors.status.verifiedBg,
    borderRadius: Radius.full, paddingVertical: 4, paddingHorizontal: 12,
  },
  verifiedText: { ...Typography.caption, color: Colors.status.verified, fontWeight: '700' },
  unverifiedText: { ...Typography.caption, color: Colors.text.muted },
});

// ─── Fő modal ─────────────────────────────────────────────────────────────────
export default function FoodDetailModal({
  food,
  visible,
  onClose,
  onLogAdded,
  logSource = 'SEARCH',
  initialMealType = 'OTHER',
}: Props) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState('100');
  const [mealType, setMealType] = useState<(typeof MEAL_TYPES)[number]>('OTHER');
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
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.headerBand}>
          <View style={styles.headerTop}>
            <Pressable style={styles.iconBtn} onPress={onClose}>
              <Text style={styles.iconBtnText}>←</Text>
            </Pressable>
            <View style={styles.headerChip}>
              <MaterialIcons name="nutrition" size={16} color={Colors.dashboard.stroke} />
            </View>
            <View style={[styles.headerChip, { backgroundColor: Colors.dashboard.blobMint }]}>
              <MaterialIcons name="eco" size={16} color={Colors.dashboard.stroke} />
            </View>
          </View>
          <Text style={styles.productTitle}>Termekadatlap</Text>
          <Text style={styles.foodName} numberOfLines={2}>{displayName}</Text>
          <Text style={styles.portionText}>100g adag</Text>
        </View>

        <View style={styles.body}>
          <GlassCardSimple style={styles.energyCard}>
            <MaterialIcons name="bolt" size={18} color={Colors.dashboard.stroke} />
            <Text style={styles.energyLabel}>Energia tartalom</Text>
            <Text style={styles.energyValue}>100g / {currentFood.kcal} kcal</Text>
          </GlassCardSimple>

          <GlassCardSimple style={styles.benefitCard}>
            <MaterialIcons name="psychology" size={18} color={Colors.dashboard.stroke} />
            <View style={{ flex: 1 }}>
              <Text style={styles.benefitTitle}>Kivalo rostforras</Text>
              <Text style={styles.benefitText}>
                Gazdag C-vitaminban es pektinben, amely tamogatja az emesztest.
              </Text>
            </View>
            <MaterialIcons name="favorite" size={16} color={Colors.dashboard.stroke} />
          </GlassCardSimple>

          {/* 100g tápértékek */}
          <GlassCardSimple backgroundColor="rgba(255,107,53,0.05)" borderColor="rgba(255,107,53,0.15)">
            <Text style={styles.sectionTitle}>Makrotapanyagok</Text>
            {(() => {
              const total = Math.max(0.1, currentFood.carbs + currentFood.protein + currentFood.fat);
              const carbsPct = (currentFood.carbs / total) * 100;
              const proteinPct = (currentFood.protein / total) * 100;
              const fatPct = (currentFood.fat / total) * 100;
              return (
                <View style={{ gap: 10, marginBottom: 14 }}>
                  <MacroBar label="Szenhidrat" grams={currentFood.carbs} percent={carbsPct} color={Colors.macro.carbs} />
                  <MacroBar label="Feherje" grams={currentFood.protein} percent={proteinPct} color={Colors.macro.protein} />
                  <MacroBar label="Zsir" grams={currentFood.fat} percent={fatPct} color={Colors.macro.fat} />
                </View>
              );
            })()}
            <View style={styles.nutriGrid}>
              {[
                { label: t('food.caloriesPer100g'), value: currentFood.kcal, unit: ' kcal', color: Colors.primary },
                { label: t('food.proteinPer100g'), value: currentFood.protein, unit: 'g', color: Colors.macro.protein },
                { label: t('food.carbsPer100g'), value: currentFood.carbs, unit: 'g', color: Colors.macro.carbs },
                { label: t('food.fatPer100g'), value: currentFood.fat, unit: 'g', color: Colors.macro.fat },
              ].map((n) => (
                <View key={n.label} style={[styles.nutriCard, { borderTopColor: n.color }]}>
                  <Text style={[styles.nutriVal, { color: n.color }]}>{n.value}</Text>
                  <Text style={styles.nutriUnit}>{n.unit}</Text>
                  <Text style={styles.nutriLabel}>{n.label}</Text>
                </View>
              ))}
            </View>
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

          {/* Mennyiség + adag */}
          <GlassCardSimple>
            <Text style={styles.sectionTitle}>{t('food.amount')}</Text>
            <View style={styles.amountRow}>
              <TextInput
                style={styles.amountInput}
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                placeholder="100"
                placeholderTextColor={Colors.text.muted}
                selectTextOnFocus
              />
              <Text style={styles.amountUnit}>{t('food.grams')}</Text>
            </View>

            {/* Gyors preset gombok */}
            <View style={styles.presetRow}>
              {[50, 100, 150, 200].map((g) => (
                <Pressable key={g} style={[styles.presetBtn, amount === String(g) && styles.presetBtnActive]}
                  onPress={() => setAmount(String(g))}>
                  <Text style={[styles.presetText, amount === String(g) && styles.presetTextActive]}>{g}g</Text>
                </Pressable>
              ))}
              {currentFood.servingSize && (
                <Pressable style={[styles.presetBtn, styles.presetBtnServing,
                  amount === String(currentFood.servingSize) && styles.presetBtnActive]}
                  onPress={() => setAmount(String(currentFood.servingSize))}>
                  <Text style={[styles.presetText, amount === String(currentFood.servingSize) && styles.presetTextActive]}>
                    1 {t('food.serving')} ({currentFood.servingSize}g)
                  </Text>
                </Pressable>
              )}
            </View>

            {/* Számított értékek */}
            {g > 0 && (
              <LinearGradient colors={['rgba(255,107,53,0.08)', 'rgba(255,154,108,0.05)']}
                style={styles.calcBox}>
                <Text style={styles.calcTitle}>{g}g → {calc.kcal} kcal</Text>
                <Text style={styles.calcDetail}>
                  💪 {calc.protein}g  ·  🌾 {calc.carbs}g  ·  🥑 {calc.fat}g
                </Text>
              </LinearGradient>
            )}
          </GlassCardSimple>

          {/* Étkezés típusa */}
          <GlassCardSimple>
            <Text style={styles.sectionTitle}>{t('food.mealType')}</Text>
            <View style={styles.mealRow}>
              {MEAL_TYPES.map((m) => (
                <Pressable key={m}
                  style={[styles.mealBtn, mealType === m && styles.mealBtnActive]}
                  onPress={() => setMealType(m)}>
                  <Text style={[styles.mealBtnText, mealType === m && styles.mealBtnTextActive]}>
                    {m === 'BREAKFAST' && `🌅 ${t('food.breakfast')}`}
                    {m === 'LUNCH' && `☀️ ${t('food.lunch')}`}
                    {m === 'DINNER' && `🌙 ${t('food.dinner')}`}
                    {m === 'SNACK' && `🍎 ${t('food.snack')}`}
                    {m === 'OTHER' && `🍽️ ${t('food.other')}`}
                  </Text>
                </Pressable>
              ))}
            </View>
          </GlassCardSimple>

          {/* Szavazás (csak DB ételekre) */}
          {currentFood.id && (
            <GlassCardSimple>
              <VoteButtons
                food={currentFood}
                onVoted={(score, myVote) => setCurrentFood((f) => f ? { ...f, score, myVote } : f)}
              />
            </GlassCardSimple>
          )}

          {/* Hozzáadás gomb */}
          <Pressable style={styles.stitchAddBtn} onPress={handleAddLog} disabled={adding}>
            <MaterialIcons name="add-circle" size={22} color="#fff" />
            <Text style={styles.stitchAddBtnLabel}>{adding ? 'Hozzaadas...' : t('food.addToLog')}</Text>
          </Pressable>
          <GhostButton label={t('common.cancel')} onPress={onClose} />

          <View style={{ height: 40 }} />
        </View>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dashboard.page },
  headerBand: { padding: Spacing['2xl'], paddingTop: Spacing['3xl'], gap: 10 },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBtn: {
    width: 34, height: 34, borderRadius: 17, borderWidth: 1.2, borderColor: Colors.dashboard.stroke,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff',
  },
  iconBtnText: { fontSize: 16, color: Colors.dashboard.stroke, fontWeight: '800' },
  headerChip: {
    width: 34, height: 34, borderRadius: 17, borderWidth: 1.2, borderColor: Colors.dashboard.stroke,
    alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.dashboard.blobPeach,
  },
  productTitle: { fontSize: 14, fontWeight: '700', color: Colors.dashboard.tabInactive },
  foodName: { fontSize: 26, fontWeight: '900', color: Colors.dashboard.stroke, lineHeight: 30 },
  portionText: { ...Typography.body, color: Colors.dashboard.tabInactive },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: Spacing.sm },
  badge: {
    backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: Radius.full,
    paddingVertical: 3, paddingHorizontal: 10,
  },
  badgeOFF: { backgroundColor: 'rgba(74,144,217,0.3)' },
  badgeCreator: { backgroundColor: 'rgba(155,89,182,0.3)' },
  badgeText: { ...Typography.caption, color: '#fff', fontWeight: '700' },
  body: { padding: Spacing.xl, gap: Spacing.md },
  energyCard: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 20 },
  energyLabel: { fontSize: 14, fontWeight: '700', color: Colors.dashboard.stroke, flex: 1 },
  energyValue: { fontSize: 14, fontWeight: '800', color: Colors.dashboard.stroke },
  benefitCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 20 },
  benefitTitle: { fontSize: 15, fontWeight: '800', color: Colors.dashboard.stroke, marginBottom: 3 },
  benefitText: { fontSize: 12, color: Colors.dashboard.tabInactive, lineHeight: 17 },
  sectionTitle: { ...Typography.label, color: Colors.text.secondary, marginBottom: Spacing.sm },
  macroRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  macroLabel: { width: 120, fontSize: 12, color: Colors.dashboard.stroke, fontWeight: '600' },
  macroTrack: { flex: 1, height: 8, borderRadius: 999, backgroundColor: Colors.dashboard.kcalTrack, overflow: 'hidden' },
  macroFill: { height: 8, borderRadius: 999 },
  macroPct: { width: 36, textAlign: 'right', fontSize: 12, color: Colors.dashboard.tabInactive, fontWeight: '700' },
  nutriGrid: { flexDirection: 'row', gap: Spacing.sm },
  nutriCard: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.8)',
    borderRadius: Radius.md, padding: Spacing.sm,
    alignItems: 'center', borderTopWidth: 3,
  },
  nutriVal: { fontSize: 18, fontWeight: '900' },
  nutriUnit: { ...Typography.caption, color: Colors.text.muted, marginTop: -2 },
  nutriLabel: { ...Typography.caption, color: Colors.text.secondary, marginTop: 2 },
  extraNutri: { marginTop: Spacing.sm, gap: 0 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  amountInput: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.04)', borderRadius: Radius.md,
    padding: Spacing.md, fontSize: 28, fontWeight: '900', color: Colors.text.primary,
    borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.08)', textAlign: 'center',
  },
  amountUnit: { ...Typography.bodyMedium, color: Colors.text.muted },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginBottom: Spacing.sm },
  presetBtn: {
    paddingVertical: 6, paddingHorizontal: 12,
    backgroundColor: 'rgba(0,0,0,0.04)', borderRadius: Radius.full,
    borderWidth: 1.5, borderColor: 'transparent',
  },
  presetBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primarySoft },
  presetBtnServing: { backgroundColor: 'rgba(255,107,53,0.06)' },
  presetText: { ...Typography.caption, color: Colors.text.secondary, fontWeight: '600' },
  presetTextActive: { color: Colors.primary, fontWeight: '800' },
  calcBox: { borderRadius: Radius.md, padding: Spacing.md },
  calcTitle: { fontSize: 16, fontWeight: '800', color: Colors.primary },
  calcDetail: { ...Typography.body, color: Colors.text.secondary, marginTop: 4 },
  mealRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  mealBtn: {
    paddingVertical: 7, paddingHorizontal: 14,
    backgroundColor: 'rgba(0,0,0,0.04)', borderRadius: Radius.full,
    borderWidth: 2, borderColor: 'transparent',
  },
  mealBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primarySoft },
  mealBtnText: { ...Typography.caption, color: Colors.text.secondary, fontWeight: '600' },
  mealBtnTextActive: { color: Colors.primary, fontWeight: '800' },
  stitchAddBtn: {
    backgroundColor: Colors.dashboard.stroke,
    borderRadius: 999,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  stitchAddBtnLabel: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
});
