import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useOnboardingStore } from '../../stores/onboardingStore';

export default function OnboardingStep1Welcome() {
  const { t } = useTranslation();
  const nextStep = useOnboardingStore((s) => s.nextStep);
  const features = [
    { icon: '📸', text: t('onboarding.welcomeFeatureScanner') },
    { icon: '📊', text: t('onboarding.welcomeFeatureMacros') },
    { icon: '💧', text: t('onboarding.welcomeFeatureWater') },
    { icon: '🏆', text: t('onboarding.welcomeFeatureCommunity') },
  ];

  return (
    <LinearGradient
      colors={['#FF9A6C', '#A8EDBC', '#7EC8E3']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <View style={styles.card}>
        {/* Logo placeholder — ide jön a 3D claymorphism ikon */}
        <View style={styles.logoPlaceholder}>
          <Text style={styles.logoEmoji}>🥗</Text>
        </View>

        <Text style={styles.title}>{t('onboarding.welcomeTitle')}</Text>

        <Text style={styles.subtitle}>
          {t('onboarding.welcomeSubtitle')}
        </Text>

        <View style={styles.features}>
          {features.map((f) => (
            <View key={f.text} style={styles.featureRow}>
              <Text style={styles.featureIcon}>{f.icon}</Text>
              <Text style={styles.featureText}>{f.text}</Text>
            </View>
          ))}
        </View>
      </View>

      <Pressable style={styles.button} onPress={nextStep}>
        <Text style={styles.buttonText}>{t('onboarding.letsStartArrow')}</Text>
      </Pressable>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 28,
    padding: 28,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 8,
  },
  logoPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,154,108,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  logoEmoji: { fontSize: 52 },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1A1A2E',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#555',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  features: { width: '100%', gap: 12 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  featureIcon: { fontSize: 22, width: 32 },
  featureText: { fontSize: 14, color: '#444', fontWeight: '500' },
  button: {
    marginTop: 28,
    backgroundColor: '#fff',
    borderRadius: 50,
    paddingVertical: 16,
    paddingHorizontal: 48,
    shadowColor: '#FF9A6C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  buttonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FF6B35',
  },
});
