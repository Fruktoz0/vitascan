import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, ActivityIndicator, Alert
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useOnboardingStore } from '../../stores/onboardingStore';
import { useAuthStore } from '../../stores/authStore';
import { onboardingApi } from '../../services/api';
import OnboardingProgressBar from '../../components/onboarding/OnboardingProgressBar';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

export default function OnboardingStep7Finish() {
  const { t } = useTranslation();
  const router = useRouter();
  const store = useOnboardingStore();
  const setOnboardingCompleted = useAuthStore((s) => s.setOnboardingCompleted);
  const [loading, setLoading] = useState(false);
  const activityLabels: Record<string, string> = {
    SEDENTARY: t('onboarding.activitySedentary'),
    LIGHT: t('onboarding.activityLight'),
    MODERATE: t('onboarding.activityModerate'),
    ACTIVE: t('onboarding.activityActive'),
    VERY_ACTIVE: t('onboarding.activityVeryActive'),
  };
  const goalLabels: Record<string, string> = {
    LOSE: t('onboarding.goalLose'),
    MAINTAIN: t('onboarding.goalMaintain'),
    GAIN: t('onboarding.goalGain'),
  };

  const handleFinish = async () => {
    setLoading(true);
    try {
      await onboardingApi.complete({
        birthYear: store.birthYear ?? undefined,
        heightCm: store.heightCm ?? undefined,
        weightKg: store.weightKg ?? undefined,
        gender: store.gender ?? undefined,
        goal: store.goal ?? undefined,
        activityLevel: store.activityLevel ?? undefined,
        dailyKcalGoal: store.dailyKcalGoal ?? undefined,
        acceptedTerms: true,
      });

      // Sikeres haptic visszajelzés
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // 1. Jelzzük az AuthStore-nak, hogy kész az onboarding
      setOnboardingCompleted(true);

      // 2. Azonnali navigáció a főoldalra, hogy ne látszódjon a reset hatása
      router.replace('/(tabs)/home');

      // 3. Rövid késleltetéssel töröljük az ideiglenes adatokat a store-ból
      setTimeout(() => {
        store.reset();
      }, 500);

    } catch (err: any) {
      Alert.alert(t('food.errorTitle'), err.message ?? t('onboarding.saveFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient
      colors={['#FF9A6C', '#A8EDBC', '#7EC8E3']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <View style={styles.inner}>
        <OnboardingProgressBar step={7} total={7} />

        <View style={styles.card}>
          <Text style={styles.confetti}>🎉</Text>
          <Text style={styles.title}>{t('onboarding.readyTitle')}</Text>
          <Text style={styles.subtitle}>
            {t('onboarding.readySubtitle')}
          </Text>

          {/* Összefoglaló */}
          <View style={styles.summary}>
            <SummaryRow
              icon="🎯"
              label={t('onboarding.dailyKcalGoal')}
              value={store.dailyKcalGoal ? `${store.dailyKcalGoal} kcal` : t('onboarding.defaultKcalValue')}
            />
            <SummaryRow
              icon="💧"
              label={t('onboarding.waterGoal')}
              value={store.dailyWaterGoalMl ? `${store.dailyWaterGoalMl} ml` : t('onboarding.defaultWaterValue')}
            />
            <SummaryRow
              icon="🏃"
              label={t('onboarding.activity')}
              value={store.activityLevel ? activityLabels[store.activityLevel] : t('profile.notProvided')}
            />
            <SummaryRow
              icon="📊"
              label={t('onboarding.goal')}
              value={store.goal ? goalLabels[store.goal] : t('profile.notProvided')}
            />
          </View>
        </View>

        <Pressable
          style={[styles.startBtn, loading && styles.startBtnDisabled]}
          onPress={handleFinish}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FF6B35" />
          ) : (
            <Text style={styles.startText}>🚀 {t('onboarding.letsStart')}</Text>
          )}
        </Pressable>

        <Pressable onPress={store.prevStep} style={styles.backBtn}>
          <Text style={styles.backText}>{t('onboarding.back')}</Text>
        </Pressable>
      </View>
    </LinearGradient>
  );
}

function SummaryRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={summaryStyles.row}>
      <Text style={summaryStyles.icon}>{icon}</Text>
      <Text style={summaryStyles.label}>{label}</Text>
      <Text style={summaryStyles.value}>{value}</Text>
    </View>
  );
}

const summaryStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 10 },
  icon: { fontSize: 20, width: 28 },
  label: { flex: 1, fontSize: 13, color: '#666' },
  value: { fontSize: 13, fontWeight: '700', color: '#1A1A2E' },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center' },
  card: {
    backgroundColor: 'rgba(255,255,255,0.88)', borderRadius: 28, padding: 28,
    width: '100%', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 6,
  },
  confetti: { fontSize: 72, marginBottom: 12 },
  title: { fontSize: 28, fontWeight: '900', color: '#1A1A2E', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 22, marginBottom: 20 },
  summary: { width: '100%', backgroundColor: '#F8F8F8', borderRadius: 16, padding: 16 },
  startBtn: {
    marginTop: 24, backgroundColor: '#fff', borderRadius: 50,
    paddingVertical: 18, paddingHorizontal: 56, width: '100%', alignItems: 'center',
    shadowColor: '#FF9A6C', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 16, elevation: 8,
  },
  startBtnDisabled: { opacity: 0.7 },
  startText: { fontSize: 18, fontWeight: '800', color: '#FF6B35' },
  backBtn: { marginTop: 12, padding: 8 },
  backText: { color: 'rgba(255,255,255,0.8)', fontSize: 14 },
});