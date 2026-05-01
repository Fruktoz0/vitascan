import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView,
  Alert, ActivityIndicator, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Link, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import AnimatedMeshBackground from '../../src/components/ui/AnimatedMeshBackground';
import { GlassCardSimple } from '../../src/components/ui/GlassCard';
import { PrimaryButton } from '../../src/components/ui/Button';
import { Colors, Gradients, Radius, Spacing, Typography } from '../../src/design/tokens';
import { useAuthStore } from '../../src/stores/authStore';
import { ApiError } from '../../src/services/api';

function GlassInput({
  label, value, onChange, placeholder,
  keyboardType = 'default', secure = false, autoComplete,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder: string; keyboardType?: any; secure?: boolean; autoComplete?: any;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={inputStyles.wrap}>
      <Text style={inputStyles.label}>{label}</Text>
      <TextInput
        style={[inputStyles.input, focused && inputStyles.inputFocused]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={Colors.text.muted}
        keyboardType={keyboardType}
        secureTextEntry={secure}
        autoCapitalize="none"
        autoComplete={autoComplete}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </View>
  );
}

const inputStyles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { ...Typography.label, color: Colors.text.secondary },
  input: {
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderRadius: Radius.md,
    padding: Spacing.md,
    fontSize: 16,
    color: Colors.text.primary,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  inputFocused: {
    borderColor: Colors.primary,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
});

export default function LoginScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const login = useAuthStore((s) => s.login);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Shake animáció hiba esetén
  const shakeX = useRef(new Animated.Value(0)).current;
  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeX, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 6, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: -6, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      shake();
      Alert.alert(t('auth.missingDataTitle'), t('auth.loginMissingData'));
      return;
    }
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
      router.replace('/');
    } catch (err) {
      shake();
      const msg = err instanceof ApiError ? err.message : t('unknownError');
      Alert.alert(t('auth.loginFailedTitle'), msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatedMeshBackground colors={Gradients.meshMain} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Logo */}
            <View style={styles.logoArea}>
              <LinearGradient
                colors={['rgba(255,255,255,0.4)', 'rgba(255,255,255,0.15)']}
                style={styles.logoBubble}
              >
                <Text style={styles.logoEmoji}>🥗</Text>
              </LinearGradient>
              <Text style={styles.appName}>VitaScan</Text>
              <Text style={styles.tagline}>{t('auth.welcomeBack')}</Text>
            </View>

            {/* Kártya */}
            <Animated.View style={{ transform: [{ translateX: shakeX }] }}>
              <GlassCardSimple
                backgroundColor={Colors.glass.whiteStrong}
                borderColor={Colors.glass.border}
                padding={Spacing['2xl']}
                radius={Radius['3xl']}
                style={styles.card}
              >
                <Text style={styles.cardTitle}>{t('auth.loginTitle')}</Text>

                <View style={styles.fields}>
                  <GlassInput
                    label={t('email')}
                    value={email}
                    onChange={setEmail}
                    placeholder={t('auth.emailPlaceholder')}
                    keyboardType="email-address"
                    autoComplete="email"
                  />
                  <GlassInput
                    label={t('password')}
                    value={password}
                    onChange={setPassword}
                    placeholder="••••••••"
                    secure
                    autoComplete="password"
                  />
                </View>

                <PrimaryButton
                  label={t('login')}
                  onPress={handleLogin}
                  loading={loading}
                  style={styles.btn}
                />
              </GlassCardSimple>
            </Animated.View>

            {/* Regisztráció link */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>{t('auth.noAccount')} </Text>
              <Link href="/auth/register" asChild>
                <Pressable hitSlop={8}>
                  <Text style={styles.footerLink}>{t('auth.registerLink')}</Text>
                </Pressable>
              </Link>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </AnimatedMeshBackground>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1, padding: Spacing.xl,
    justifyContent: 'center', gap: Spacing.xl,
  },
  logoArea: { alignItems: 'center', gap: Spacing.sm },
  logoBubble: {
    width: 88, height: 88, borderRadius: 44,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)',
    shadowColor: '#FF6B35', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3, shadowRadius: 20, elevation: 8,
  },
  logoEmoji: { fontSize: 48 },
  appName: { fontSize: 36, fontWeight: '900', color: '#fff', letterSpacing: -1 },
  tagline: { ...Typography.body, color: 'rgba(255,255,255,0.8)' },
  card: {
    shadowColor: 'rgba(31,38,135,0.2)',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 1, shadowRadius: 40, elevation: 12,
  },
  cardTitle: { ...Typography.subtitle, color: Colors.text.primary, marginBottom: Spacing.lg },
  fields: { gap: Spacing.md, marginBottom: Spacing.lg },
  btn: {},
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  footerText: { ...Typography.body, color: 'rgba(255,255,255,0.85)' },
  footerLink: { ...Typography.bodyMedium, color: '#fff', textDecorationLine: 'underline' },
});
