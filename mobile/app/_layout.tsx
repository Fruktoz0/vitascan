import { Stack } from 'expo-router';
import { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { useAuthStore } from '../src/stores/authStore';
import '../src/i18n';
import { initializeLanguage } from '../src/i18n';

SplashScreen.preventAutoHideAsync().catch(() => {
  // Ignoráljuk a hibát, ha a SplashScreen nem létezik (pl. web, vagy fast refresh)
});

export default function RootLayout() {
  const { restoreSession, isLoading } = useAuthStore();

  useEffect(() => {
    Promise.all([restoreSession(), initializeLanguage()]).finally(() => {
      SplashScreen.hideAsync().catch(() => {
        // Ignoráljuk a hibát, ha a SplashScreen nem létezik (pl. web, vagy fast refresh)
      });
    });
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
