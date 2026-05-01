import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useOnboardingStore } from '../../stores/onboardingStore';
import { onboardingApi } from '../../services/api';
import OnboardingProgressBar from '../../components/onboarding/OnboardingProgressBar';

export default function OnboardingStep5KcalGoal() {
  const { t } = useTranslation();
  const store = useOnboardingStore();
  const [loading, setLoading] = useState(false);
  const [breakdown, setBreakdown] = useState<{
    bmr: number; tdee: number; adjustment: number; goalLabel: string;
  } | null>(null);
  const [manualInput, setManualInput] = useState('');
  const [isManual, setIsManual] = useState(false);

  useEffect(() => {
    // Ha van elég adat, lehívjuk a kiszámított TDEE-t
    if (store.weightKg && store.heightCm && store.birthYear && store.gender && store.activityLevel && store.goal) {
      fetchTDEE();
    }
  }, []);

  const fetchTDEE = async () => {
    setLoading(true);
    try {
      const result = await onboardingApi.previewTdee({
        weightKg: store.weightKg!,
        heightCm: store.heightCm!,
        birthYear: store.birthYear!,
        gender: store.gender!,
        activityLevel: store.activityLevel!,
        goal: store.goal!,
      });
      store.setCalculatedGoals(result.dailyKcalGoal, result.dailyWaterGoalMl);
      setBreakdown(result.breakdown);
      setManualInput(result.dailyKcalGoal.toString());
    } catch {
      // Ha nincs net vagy hiányos adat, marad az alap
    } finally {
      setLoading(false);
    }
  };

  const handleApplyManual = () => {
    const val = parseInt(manualInput);
    if (!isNaN(val) && val >= 500 && val <= 10000) {
      store.setKcalGoal(val);
      setIsManual(true);
    }
  };

  return (
    <LinearGradient colors={['#FF9A6C', '#A8EDBC', '#7EC8E3']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.container}>
      <View style={styles.inner}>
        <OnboardingProgressBar step={5} total={7} />
        <View style={styles.card}>
          <Text style={styles.title}>{t('onboarding.kcalGoalTitle')}</Text>

          {loading ? (
            <ActivityIndicator size="large" color="#FF6B35" style={{ marginVertical: 20 }} />
          ) : store.dailyKcalGoal ? (
            <>
              {/* Fő szám */}
              <View style={styles.kcalDisplay}>
                <Text style={styles.kcalNumber}>{store.dailyKcalGoal}</Text>
                <Text style={styles.kcalUnit}>{t('onboarding.kcalPerDay')}</Text>
                {isManual && <Text style={styles.manualBadge}>✏️ {t('onboarding.custom')}</Text>}
              </View>

              {/* Breakdown */}
              {breakdown && (
                <View style={styles.breakdown}>
                  <Row label={t('onboarding.bmr')} value={`${breakdown.bmr} kcal`} />
                  <Row label={t('onboarding.tdee')} value={`${breakdown.tdee} kcal`} />
                  <Row
                    label={breakdown.goalLabel}
                    value={`${breakdown.adjustment > 0 ? '+' : ''}${breakdown.adjustment} kcal`}
                    highlight
                  />
                </View>
              )}

              {/* Manuális felülírás */}
              <Text style={styles.overrideLabel}>{t('onboarding.override')}</Text>
              <View style={styles.overrideRow}>
                <TextInput
                  style={styles.overrideInput}
                  value={manualInput}
                  onChangeText={setManualInput}
                  keyboardType="number-pad"
                  placeholder={t('kcal')}
                />
                <Pressable style={styles.applyBtn} onPress={handleApplyManual}>
                  <Text style={styles.applyText}>{t('onboarding.apply')}</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <View style={styles.noDataBox}>
              <Text style={styles.noDataText}>
                💡 {t('onboarding.defaultKcalInfo')}
              </Text>
              <TextInput
                style={styles.overrideInput}
                value={manualInput}
                onChangeText={setManualInput}
                keyboardType="number-pad"
                placeholder={t('onboarding.manualKcalPlaceholder')}
              />
              {manualInput ? (
                <Pressable style={[styles.applyBtn, { marginTop: 8 }]} onPress={handleApplyManual}>
                  <Text style={styles.applyText}>{t('onboarding.set')}</Text>
                </Pressable>
              ) : null}
            </View>
          )}
        </View>

        <View style={styles.buttonRow}>
          <Pressable style={styles.skipBtn} onPress={store.nextStep}>
            <Text style={styles.skipText}>{t('onboarding.skip')}</Text>
          </Pressable>
          <Pressable style={styles.nextBtn} onPress={store.nextStep}>
            <Text style={styles.nextText}>{t('onboarding.next')}</Text>
          </Pressable>
        </View>
        <Pressable onPress={store.prevStep} style={styles.backBtn}>
          <Text style={styles.backText}>{t('onboarding.back')}</Text>
        </Pressable>
      </View>
    </LinearGradient>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={rowStyles.row}>
      <Text style={rowStyles.label}>{label}</Text>
      <Text style={[rowStyles.value, highlight && rowStyles.highlight]}>{value}</Text>
    </View>
  );
}
const rowStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  label: { fontSize: 13, color: '#666' },
  value: { fontSize: 13, fontWeight: '600', color: '#333' },
  highlight: { color: '#FF6B35', fontWeight: '800' },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center' },
  card: {
    backgroundColor: 'rgba(255,255,255,0.88)', borderRadius: 28, padding: 24, width: '100%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 6,
  },
  title: { fontSize: 24, fontWeight: '800', color: '#1A1A2E', marginBottom: 16 },
  kcalDisplay: { alignItems: 'center', marginBottom: 20 },
  kcalNumber: { fontSize: 56, fontWeight: '900', color: '#FF6B35' },
  kcalUnit: { fontSize: 16, color: '#888', marginTop: -4 },
  manualBadge: { fontSize: 12, color: '#888', marginTop: 4 },
  breakdown: {
    backgroundColor: '#F8F8F8', borderRadius: 14, padding: 14, marginBottom: 16,
    borderLeftWidth: 3, borderLeftColor: '#FF6B35',
  },
  overrideLabel: { fontSize: 13, color: '#888', marginBottom: 8 },
  overrideRow: { flexDirection: 'row', gap: 8 },
  overrideInput: {
    flex: 1, backgroundColor: '#F5F5F5', borderRadius: 12, padding: 12,
    fontSize: 15, borderWidth: 1.5, borderColor: '#E8E8E8',
  },
  applyBtn: {
    backgroundColor: '#FF6B35', borderRadius: 12, paddingHorizontal: 16,
    justifyContent: 'center', alignItems: 'center',
  },
  applyText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  noDataBox: { backgroundColor: '#FFF8F0', borderRadius: 14, padding: 16, gap: 10 },
  noDataText: { fontSize: 14, color: '#666', lineHeight: 20 },
  buttonRow: { flexDirection: 'row', gap: 12, marginTop: 20, width: '100%' },
  skipBtn: { flex: 1, backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: 50, paddingVertical: 14, alignItems: 'center' },
  skipText: { fontSize: 15, color: '#888', fontWeight: '600' },
  nextBtn: {
    flex: 2, backgroundColor: '#fff', borderRadius: 50, paddingVertical: 14, alignItems: 'center',
    shadowColor: '#FF9A6C', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 5,
  },
  nextText: { fontSize: 16, fontWeight: '700', color: '#FF6B35' },
  backBtn: { marginTop: 12, padding: 8 },
  backText: { color: 'rgba(255,255,255,0.8)', fontSize: 14 },
});
