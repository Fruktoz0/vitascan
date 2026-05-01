// Step 3 - Cél beállítás
import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useOnboardingStore, Goal } from '../../stores/onboardingStore';
import OnboardingProgressBar from '../../components/onboarding/OnboardingProgressBar';

export default function OnboardingStep3Goal() {
  const { t } = useTranslation();
  const store = useOnboardingStore();
  const goals: { value: Goal; label: string; desc: string; icon: string; color: string }[] = [
    { value: 'LOSE', label: t('onboarding.goalLose'), desc: t('onboarding.goalLoseDesc'), icon: '📉', color: '#FF6B6B' },
    { value: 'MAINTAIN', label: t('onboarding.goalMaintain'), desc: t('onboarding.goalMaintainDesc'), icon: '⚖️', color: '#4ECDC4' },
    { value: 'GAIN', label: t('onboarding.goalGain'), desc: t('onboarding.goalGainDesc'), icon: '📈', color: '#45B7D1' },
  ];

  return (
    <LinearGradient colors={['#FF9A6C', '#A8EDBC', '#7EC8E3']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.container}>
      <View style={styles.inner}>
        <OnboardingProgressBar step={3} total={7} />
        <View style={styles.card}>
          <Text style={styles.title}>{t('onboarding.goalQuestion')}</Text>
          <Text style={styles.subtitle}>{t('onboarding.goalSubtitle')}</Text>

          <View style={styles.options}>
            {goals.map((g) => (
              <Pressable
                key={g.value}
                style={[styles.option, store.goal === g.value && { borderColor: g.color, borderWidth: 2.5 }]}
                onPress={() => store.setGoal(g.value)}
              >
                <Text style={styles.optionIcon}>{g.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.optionLabel}>{g.label}</Text>
                  <Text style={styles.optionDesc}>{g.desc}</Text>
                </View>
                {store.goal === g.value && (
                  <View style={[styles.check, { backgroundColor: g.color }]}>
                    <Text style={{ color: '#fff', fontSize: 12 }}>✓</Text>
                  </View>
                )}
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.buttonRow}>
          <Pressable style={styles.skipBtn} onPress={store.nextStep}>
            <Text style={styles.skipText}>{t('onboarding.skip')}</Text>
          </Pressable>
          <Pressable
            style={[styles.nextBtn, !store.goal && styles.nextBtnDisabled]}
            onPress={store.nextStep}
            disabled={!store.goal}
          >
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

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center' },
  card: {
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderRadius: 28,
    padding: 24,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 6,
  },
  title: { fontSize: 24, fontWeight: '800', color: '#1A1A2E', marginBottom: 6 },
  subtitle: { fontSize: 14, color: '#777', marginBottom: 20 },
  options: { gap: 12 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F8F8',
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionIcon: { fontSize: 28 },
  optionLabel: { fontSize: 16, fontWeight: '700', color: '#1A1A2E' },
  optionDesc: { fontSize: 12, color: '#888', marginTop: 2 },
  check: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  buttonRow: { flexDirection: 'row', gap: 12, marginTop: 20, width: '100%' },
  skipBtn: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: 50, paddingVertical: 14, alignItems: 'center',
  },
  skipText: { fontSize: 15, color: '#888', fontWeight: '600' },
  nextBtn: {
    flex: 2, backgroundColor: '#fff', borderRadius: 50, paddingVertical: 14, alignItems: 'center',
    shadowColor: '#FF9A6C', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 5,
  },
  nextBtnDisabled: { opacity: 0.5 },
  nextText: { fontSize: 16, fontWeight: '700', color: '#FF6B35' },
  backBtn: { marginTop: 12, padding: 8 },
  backText: { color: 'rgba(255,255,255,0.8)', fontSize: 14 },
});
