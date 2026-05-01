// Step 6 - Kamera engedély
import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Camera } from 'expo-camera';
import { useTranslation } from 'react-i18next';
import { useOnboardingStore } from '../../stores/onboardingStore';
import OnboardingProgressBar from '../../components/onboarding/OnboardingProgressBar';

export function OnboardingStep6Permission() {
  const { t } = useTranslation();
  const store = useOnboardingStore();
  const [granted, setGranted] = useState(false);

  const requestPermission = async () => {
    const { status } = await Camera.requestCameraPermissionsAsync();
    if (status === 'granted') {
      setGranted(true);
    } else {
      Alert.alert(
        t('onboarding.cameraPermissionTitle'),
        t('onboarding.cameraPermissionDesc'),
        [{ text: t('onboarding.gotIt'), onPress: store.nextStep }]
      );
    }
  };

  return (
    <LinearGradient colors={['#FF9A6C', '#A8EDBC', '#7EC8E3']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.container}>
      <View style={styles.inner}>
        <OnboardingProgressBar step={6} total={7} />
        <View style={styles.card}>
          <Text style={styles.emoji}>📷</Text>
          <Text style={styles.title}>{t('onboarding.cameraAccessTitle')}</Text>
          <Text style={styles.desc}>
            {t('onboarding.cameraAccessBody')}
          </Text>

          {granted ? (
            <View style={styles.successBox}>
              <Text style={styles.successText}>✅ {t('onboarding.cameraEnabled')}</Text>
            </View>
          ) : (
            <Pressable style={styles.permBtn} onPress={requestPermission}>
              <Text style={styles.permText}>📸 {t('onboarding.enableCamera')}</Text>
            </Pressable>
          )}
        </View>

        <Pressable
          style={[styles.nextBtn, !granted && styles.nextBtnSecondary]}
          onPress={store.nextStep}
        >
          <Text style={[styles.nextText, !granted && styles.nextTextSecondary]}>
            {granted ? t('onboarding.next') : t('onboarding.skipCameraLater')}
          </Text>
        </Pressable>

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
    backgroundColor: 'rgba(255,255,255,0.88)', borderRadius: 28, padding: 28, width: '100%',
    alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1, shadowRadius: 20, elevation: 6,
  },
  emoji: { fontSize: 64, marginBottom: 16 },
  title: { fontSize: 24, fontWeight: '800', color: '#1A1A2E', marginBottom: 12, textAlign: 'center' },
  desc: { fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  permBtn: {
    backgroundColor: '#FF6B35', borderRadius: 50, paddingVertical: 14, paddingHorizontal: 28,
  },
  permText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  successBox: { backgroundColor: '#F0FFF4', borderRadius: 14, padding: 14 },
  successText: { fontSize: 15, color: '#2D8A55', fontWeight: '700' },
  nextBtn: {
    marginTop: 20, backgroundColor: '#fff', borderRadius: 50, paddingVertical: 16,
    paddingHorizontal: 48, width: '100%', alignItems: 'center',
    shadowColor: '#FF9A6C', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 5,
  },
  nextBtnSecondary: { backgroundColor: 'rgba(255,255,255,0.5)', shadowOpacity: 0 },
  nextText: { fontSize: 16, fontWeight: '700', color: '#FF6B35' },
  nextTextSecondary: { color: 'rgba(255,255,255,0.9)' },
  backBtn: { marginTop: 12, padding: 8 },
  backText: { color: 'rgba(255,255,255,0.8)', fontSize: 14 },
});

export default OnboardingStep6Permission;
