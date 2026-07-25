import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useAuthStore } from '../src/stores/authStore';
import { useProfileStore } from '../src/stores/profileStore';
import '../src/i18n';
import { initializeLanguage } from '../src/i18n';

SplashScreen.preventAutoHideAsync().catch(() => {
  // Ignoráljuk a hibát, ha a SplashScreen nem létezik (pl. web, vagy fast refresh)
});

export default function RootLayout() {
  const { restoreSession, isLoading, isAuthenticated } = useAuthStore();
  const loadProfile = useProfileStore((s) => s.load);

  useEffect(() => {
    Promise.all([restoreSession(), initializeLanguage()]).finally(() => {
      SplashScreen.hideAsync().catch(() => {
        // Ignoráljuk a hibát, ha a SplashScreen nem létezik (pl. web, vagy fast refresh)
      });
    });
  }, []);

  useEffect(() => {
    if (isAuthenticated) loadProfile();
  }, [isAuthenticated, loadProfile]);

  // PWA Service Worker — csak weben; régi cache törlése, hogy a tab-bar fix érvényesüljön
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.update())))
        .then(() => navigator.serviceWorker.register('/sw.js'))
        .then((registration) => registration.update())
        .catch(() => {});
    }
  }, []);

  if (isLoading) return null;

  return (
    <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="personal-data" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="notifications" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="auth" />
      <Stack.Screen name="onboarding/index" />
      <Stack.Screen name="admin/index" />
    </Stack>
  );
}
