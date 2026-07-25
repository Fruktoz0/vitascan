import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Modal, ScrollView,
  Pressable, TextInput, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import * as Haptics from '../../services/haptics';
import { MaterialIcons, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { logApi } from '../../services/api';
import { GlassCardSimple } from '../ui/GlassCard';
import { Colors } from '../../design/tokens';

const MEAL_TYPES = ['BREAKFAST', 'TIZORAI', 'LUNCH', 'UZSONNA', 'DINNER', 'SNACK'] as const;
type MealType = (typeof MEAL_TYPES)[number];

export type DailyLogItem = {
  id: string;
  foodName: string;
  amount: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number | null;
  sugar?: number | null;
  mealType: MealType | string;
};

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

interface Props {
  log: DailyLogItem | null;
  visible: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export default function EditLogModal({ log, visible, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState('100');
  const [mealType, setMealType] = useState<MealType>('SNACK');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [base, setBase] = useState<DailyLogItem | null>(null);

  React.useEffect(() => {
    if (visible && log) {
      setBase(log);
      setAmount(String(Math.round(log.amount || 100)));
      setMealType((MEAL_TYPES.includes(log.mealType as MealType) ? log.mealType : 'SNACK') as MealType);
    }
  }, [visible, log]);

  if (!base) return null;

  const baseAmount = base.amount > 0 ? base.amount : 100;
  const g = parseFloat(amount) || 0;
  const ratio = g / baseAmount;
  const round1 = (n: number) => Math.round(n * 10) / 10;
  const calc = {
    kcal: Math.round(base.kcal * ratio),
    protein: round1(base.protein * ratio),
    carbs: round1(base.carbs * ratio),
    fat: round1(base.fat * ratio),
  };

  const per100 = {
    protein: (base.protein / baseAmount) * 100,
    carbs: (base.carbs / baseAmount) * 100,
    fat: (base.fat / baseAmount) * 100,
    sugar: base.sugar != null ? (base.sugar / baseAmount) * 100 : null,
  };
  const totalMacro = Math.max(0.1, per100.carbs + per100.protein + per100.fat);
  const carbsPct = (per100.carbs / totalMacro) * 100;
  const proteinPct = (per100.protein / totalMacro) * 100;
  const fatPct = (per100.fat / totalMacro) * 100;

  const mealLabel = (m: MealType) => {
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

  const handleSave = async () => {
    if (!g || g <= 0) {
      Alert.alert(t('food.enterAmount'));
      return;
    }
    setSaving(true);
    try {
      await logApi.update(base.id, { amount: g, mealType });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSaved?.();
      onClose();
    } catch (e: any) {
      Alert.alert(t('food.errorTitle'), e?.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      t('common.delete', 'Törlés'),
      t('food.confirmDeleteLog', 'Biztosan törölöd ezt a bejegyzést?'),
      [
        { text: t('common.cancel', 'Mégse'), style: 'cancel' },
        {
          text: t('common.delete', 'Törlés'),
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await logApi.delete(base.id);
              await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              onSaved?.();
              onClose();
            } catch (e: any) {
              Alert.alert(t('food.errorTitle'), e?.message);
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  const busy = saving || deleting;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={onClose}>
            <View style={styles.backBtnShadow} />
            <View style={styles.backBtnInner}>
              <MaterialIcons name="arrow-back" size={24} color={Colors.dashboard.stroke} />
            </View>
          </Pressable>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>{t('food.editLogTitle', 'Bejegyzés szerkesztése')}</Text>
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
              <Text style={styles.foodName}>{base.foodName}</Text>
              <View style={styles.portionBadgeWrapper}>
                <View style={styles.portionBadgeShadow} />
                <View style={styles.portionBadgeInner}>
                  <Text style={styles.portionText}>{Math.round(baseAmount)}g</Text>
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
              <MacroBar
                label={t('food.protein')}
                grams={round1(per100.protein)}
                percent={proteinPct}
                color={Colors.dashboard.proteinFill}
                rotation={0.5}
              />
              <MacroBar
                label={t('food.carbs')}
                grams={round1(per100.carbs)}
                percent={carbsPct}
                color={Colors.dashboard.carbsFill}
                rotation={-0.5}
                sugarNote={
                  per100.sugar != null
                    ? `${t('food.ofWhichSugar')}: ${round1(per100.sugar)}g / 100g`
                    : undefined
                }
              />
              <MacroBar
                label={t('food.fat')}
                grams={round1(per100.fat)}
                percent={fatPct}
                color={Colors.dashboard.fatFill}
                rotation={-0.5}
              />
            </GlassCardSimple>

            <GlassCardSimple padding={20} radius={24} style={styles.sectionCard}>
              <View style={styles.sectionHeaderSmall}>
                <MaterialIcons name="restaurant" size={24} color={Colors.dashboard.stroke} />
                <Text style={styles.sectionTitle}>{t('food.mealType')}</Text>
              </View>
              <View style={styles.mealChips}>
                {MEAL_TYPES.map((m) => {
                  const isActive = mealType === m;
                  return (
                    <View key={m} style={styles.mealBtnWrap}>
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

            <View style={{ height: 140 }} />
          </View>
        </ScrollView>

        <KeyboardAvoidingView
          style={styles.keyboardAvoidingFooter}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0}
          pointerEvents="box-none"
        >
          <View style={styles.footer}>
            <View style={styles.footerRow}>
              <Pressable style={styles.deleteBtn} onPress={handleDelete} disabled={busy}>
                <View style={styles.deleteBtnShadow} />
                <View style={styles.deleteBtnInner}>
                  {deleting ? (
                    <ActivityIndicator color="#B83B3B" />
                  ) : (
                    <Text style={styles.deleteBtnLabel}>{t('common.delete', 'Törlés')}</Text>
                  )}
                </View>
              </Pressable>
              <Pressable style={styles.saveBtn} onPress={handleSave} disabled={busy}>
                <View style={styles.addBtnShadow} />
                <View style={styles.addBtnInner}>
                  {saving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.addBtnLabel}>{t('common.save', 'Mentés')}</Text>
                  )}
                </View>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.dashboard.page },
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
  headerTitle: { fontSize: 20, fontWeight: '900', color: Colors.dashboard.stroke },
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
    fontSize: 36,
    fontWeight: '900',
    color: Colors.dashboard.stroke,
    textAlign: 'center',
    marginBottom: 12,
  },
  portionBadgeWrapper: { position: 'relative', paddingRight: 3, paddingBottom: 3 },
  portionBadgeShadow: {
    position: 'absolute', top: 2, left: 2, right: -2, bottom: -2,
    backgroundColor: Colors.dashboard.shadowHard, borderRadius: 999,
  },
  portionBadgeInner: {
    backgroundColor: Colors.dashboard.softGreen,
    borderWidth: 0.8,
    borderColor: Colors.dashboard.stroke,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  portionText: { fontSize: 13, fontWeight: '800', color: Colors.dashboard.stroke },
  body: { gap: 16 },
  sectionCard: { marginBottom: 4 },
  amountStepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  amountStepBtn: { width: 48, height: 48 },
  amountStepShadow: {
    position: 'absolute', top: 2, left: 2, right: -2, bottom: -2,
    backgroundColor: Colors.dashboard.shadowHard, borderRadius: 16,
  },
  amountStepInner: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#fff',
    borderWidth: 0.8,
    borderColor: Colors.dashboard.stroke,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  amountCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  amountInput: {
    fontSize: 32,
    fontWeight: '900',
    color: Colors.dashboard.stroke,
    textAlign: 'center',
    minWidth: 80,
  },
  amountUnitText: { fontSize: 18, fontWeight: '700', color: Colors.dashboard.tabInactive },
  sectionHeaderSmall: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: Colors.dashboard.stroke },
  macroEnergyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  energyLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  energyLabel: { fontSize: 12, fontWeight: '800', color: Colors.dashboard.tabInactive, letterSpacing: 0.5 },
  energyValue: { fontSize: 22, fontWeight: '900', color: Colors.dashboard.stroke },
  macroRow: { marginBottom: 14 },
  macroLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  macroLabel: { fontSize: 13, fontWeight: '700', color: Colors.dashboard.stroke },
  macroPct: { fontSize: 13, fontWeight: '700', color: Colors.dashboard.tabInactive },
  macroTrack: {
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.dashboard.surfaceContainerLow,
    overflow: 'hidden',
  },
  macroFill: { height: '100%', borderRadius: 6 },
  sugarNote: { marginTop: 4, fontSize: 11, color: Colors.dashboard.tabInactive },
  mealChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  mealBtnWrap: { position: 'relative', paddingRight: 2, paddingBottom: 2 },
  mealBtnShadowActive: {
    position: 'absolute', top: 2, left: 2, right: -2, bottom: -2,
    backgroundColor: Colors.dashboard.shadowHard, borderRadius: 999,
  },
  mealBtnInner: {
    backgroundColor: Colors.dashboard.surfaceContainerLow,
    borderWidth: 0.8, borderColor: Colors.dashboard.stroke, borderRadius: 999,
    paddingVertical: 10, paddingHorizontal: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  mealBtnInnerActive: { backgroundColor: Colors.dashboard.softGreen },
  mealBtnText: { fontSize: 13, color: Colors.dashboard.stroke, fontWeight: '500' },
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
  },
  footerRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  deleteBtn: { width: 110, height: 56 },
  deleteBtnShadow: {
    position: 'absolute', top: 4, left: 4, right: -4, bottom: -4,
    backgroundColor: Colors.dashboard.shadowHard, borderRadius: 999,
  },
  deleteBtnInner: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FADBD8',
    borderWidth: 0.8,
    borderColor: Colors.dashboard.stroke,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnLabel: { color: '#B83B3B', fontSize: 15, fontWeight: '800' },
  saveBtn: { flex: 1, height: 56 },
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
  addBtnLabel: { color: '#fff', fontSize: 20, fontWeight: '700' },
});
