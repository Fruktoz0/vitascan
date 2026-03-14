import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useOnboardingStore, ActivityLevel } from '../../stores/onboardingStore';
import OnboardingProgressBar from '../../components/onboarding/OnboardingProgressBar';

const LEVELS: { value: ActivityLevel; label: string; desc: string; icon: string }[] = [
  { value: 'SEDENTARY', label: 'Ülő életmód', desc: 'Irodai munka, alig mozgás', icon: '🪑' },
  { value: 'LIGHT', label: 'Könnyű aktivitás', desc: 'Heti 1-3x könnyű mozgás', icon: '🚶' },
  { value: 'MODERATE', label: 'Közepes aktivitás', desc: 'Heti 3-5x mérsékelt edzés', icon: '🏃' },
  { value: 'ACTIVE', label: 'Aktív', desc: 'Heti 6-7x intenzív edzés', icon: '💪' },
  { value: 'VERY_ACTIVE', label: 'Nagyon aktív', desc: 'Fizikai munka + napi sport', icon: '🏋️' },
];

export default function OnboardingStep4Activity() {
  const store = useOnboardingStore();

  return (
    <LinearGradient colors={['#FF9A6C', '#A8EDBC', '#7EC8E3']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <OnboardingProgressBar step={4} total={7} />
        <View style={styles.card}>
          <Text style={styles.title}>Mozgásszinted</Text>
          <Text style={styles.subtitle}>Az aktivitási szorzó befolyásolja a TDEE-t.</Text>

          <View style={styles.options}>
            {LEVELS.map((l) => (
              <Pressable
                key={l.value}
                style={[styles.option, store.activityLevel === l.value && styles.optionActive]}
                onPress={() => store.setActivityLevel(l.value)}
              >
                <Text style={styles.icon}>{l.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.label, store.activityLevel === l.value && styles.labelActive]}>
                    {l.label}
                  </Text>
                  <Text style={styles.desc}>{l.desc}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.buttonRow}>
          <Pressable style={styles.skipBtn} onPress={store.nextStep}>
            <Text style={styles.skipText}>Kihagyom</Text>
          </Pressable>
          <Pressable
            style={[styles.nextBtn, !store.activityLevel && styles.nextBtnDisabled]}
            onPress={store.nextStep}
            disabled={!store.activityLevel}
          >
            <Text style={styles.nextText}>Tovább →</Text>
          </Pressable>
        </View>
        <Pressable onPress={store.prevStep} style={styles.backBtn}>
          <Text style={styles.backText}>← Vissza</Text>
        </Pressable>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 24, alignItems: 'center' },
  card: {
    backgroundColor: 'rgba(255,255,255,0.88)', borderRadius: 28, padding: 24, width: '100%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 6,
  },
  title: { fontSize: 24, fontWeight: '800', color: '#1A1A2E', marginBottom: 6 },
  subtitle: { fontSize: 14, color: '#777', marginBottom: 20 },
  options: { gap: 10 },
  option: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8F8F8',
    borderRadius: 14, padding: 14, gap: 12, borderWidth: 2, borderColor: 'transparent',
  },
  optionActive: { borderColor: '#A8EDBC', backgroundColor: '#F0FFF6' },
  icon: { fontSize: 26 },
  label: { fontSize: 15, fontWeight: '600', color: '#1A1A2E' },
  labelActive: { color: '#2D8A55' },
  desc: { fontSize: 12, color: '#888', marginTop: 2 },
  buttonRow: { flexDirection: 'row', gap: 12, marginTop: 20, width: '100%' },
  skipBtn: { flex: 1, backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: 50, paddingVertical: 14, alignItems: 'center' },
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
