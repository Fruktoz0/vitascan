import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput, ScrollView, KeyboardAvoidingView, Platform
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useOnboardingStore, Gender } from '../../stores/onboardingStore';
import OnboardingProgressBar from '../../components/onboarding/OnboardingProgressBar';

export default function OnboardingStep2Personal() {
  const { t } = useTranslation();
  const store = useOnboardingStore();
  const [error, setError] = useState<string | null>(null);
  const genders: { value: Gender; label: string; icon: string }[] = [
    { value: 'MALE', label: t('onboarding.genderMale'), icon: '♂️' },
    { value: 'FEMALE', label: t('onboarding.genderFemale'), icon: '♀️' },
    { value: 'OTHER', label: t('onboarding.genderOther'), icon: '⚧' },
  ];

  const handleNext = () => {
    // Ez a lépés opcionális — mindig tovább lehet lépni
    store.nextStep();
  };

  const handleSkip = () => {
    store.nextStep();
  };

  return (
    <LinearGradient colors={['#FF9A6C', '#A8EDBC', '#7EC8E3']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, width: '100%' }}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <OnboardingProgressBar step={2} total={7} />

          <View style={styles.card}>
            <Text style={styles.title}>{t('onboarding.personalTitle')}</Text>
            <Text style={styles.subtitle}>{t('onboarding.personalSubtitle')}</Text>

            {/* Nem választó */}
            <Text style={styles.label}>{t('onboarding.gender')}</Text>
            <View style={styles.genderRow}>
              {genders.map((g) => (
                <Pressable
                  key={g.value}
                  style={[styles.genderBtn, store.gender === g.value && styles.genderBtnActive]}
                  onPress={() => store.setGender(g.value)}
                >
                  <Text style={styles.genderIcon}>{g.icon}</Text>
                  <Text style={[styles.genderLabel, store.gender === g.value && styles.genderLabelActive]}>
                    {g.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Születési év */}
            <Text style={styles.label}>{t('onboarding.birthYear')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('onboarding.birthYearPlaceholder')}
              keyboardType="number-pad"
              maxLength={4}
              value={store.birthYear?.toString() ?? ''}
              onChangeText={(v) => {
                const n = parseInt(v);
                if (!isNaN(n)) store.setBirthYear(n);
              }}
            />

            {/* Magasság */}
            <Text style={styles.label}>{t('onboarding.heightCm')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('onboarding.heightPlaceholder')}
              keyboardType="decimal-pad"
              value={store.heightCm?.toString() ?? ''}
              onChangeText={(v) => {
                const n = parseFloat(v);
                if (!isNaN(n)) store.setHeightCm(n);
              }}
            />

            {/* Testsúly */}
            <Text style={styles.label}>{t('onboarding.weightKg')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('onboarding.weightPlaceholder')}
              keyboardType="decimal-pad"
              value={store.weightKg?.toString() ?? ''}
              onChangeText={(v) => {
                const n = parseFloat(v);
                if (!isNaN(n)) store.setWeightKg(n);
              }}
            />

            {error && <Text style={styles.error}>{error}</Text>}
          </View>

          <View style={styles.buttonRow}>
            <Pressable style={styles.skipBtn} onPress={handleSkip}>
              <Text style={styles.skipText}>{t('onboarding.skip')}</Text>
            </Pressable>
            <Pressable style={styles.nextBtn} onPress={handleNext}>
              <Text style={styles.nextText}>{t('onboarding.next')}</Text>
            </Pressable>
          </View>

          <Pressable onPress={store.prevStep} style={styles.backBtn}>
            <Text style={styles.backText}>{t('onboarding.back')}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 24, alignItems: 'center' },
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
  label: { fontSize: 14, fontWeight: '600', color: '#444', marginBottom: 8, marginTop: 16 },
  input: {
    backgroundColor: '#F5F5F5',
    borderRadius: 14,
    padding: 14,
    fontSize: 16,
    color: '#1A1A2E',
    borderWidth: 1.5,
    borderColor: '#E8E8E8',
  },
  genderRow: { flexDirection: 'row', gap: 10 },
  genderBtn: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  genderBtnActive: { borderColor: '#FF6B35', backgroundColor: '#FFF0EA' },
  genderIcon: { fontSize: 24, marginBottom: 4 },
  genderLabel: { fontSize: 13, color: '#666', fontWeight: '500' },
  genderLabelActive: { color: '#FF6B35', fontWeight: '700' },
  error: { color: '#E53E3E', fontSize: 13, marginTop: 12 },
  buttonRow: { flexDirection: 'row', gap: 12, marginTop: 20, width: '100%' },
  skipBtn: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderRadius: 50,
    paddingVertical: 14,
    alignItems: 'center',
  },
  skipText: { fontSize: 15, color: '#888', fontWeight: '600' },
  nextBtn: {
    flex: 2,
    backgroundColor: '#fff',
    borderRadius: 50,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: '#FF9A6C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  nextText: { fontSize: 16, fontWeight: '700', color: '#FF6B35' },
  backBtn: { marginTop: 12, padding: 8 },
  backText: { color: 'rgba(255,255,255,0.8)', fontSize: 14 },
});
