import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView,
  Alert, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Link, useRouter } from 'expo-router';
import AnimatedMeshBackground from '../../src/components/ui/AnimatedMeshBackground';
import { GlassCardSimple } from '../../src/components/ui/GlassCard';
import { PrimaryButton } from '../../src/components/ui/Button';
import { Colors, Gradients, Radius, Spacing, Typography } from '../../src/design/tokens';
import { useAuthStore } from '../../src/stores/authStore';
import { ApiError } from '../../src/services/api';

function GlassInput({
  label, value, onChange, placeholder, secure = false, keyboardType = 'default',
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder: string; secure?: boolean; keyboardType?: any;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={inputStyles.wrap}>
      <Text style={inputStyles.label}>{label}</Text>
      <TextInput
        style={[inputStyles.input, focused && inputStyles.focused]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={Colors.text.muted}
        secureTextEntry={secure}
        autoCapitalize="none"
        keyboardType={keyboardType}
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
    borderRadius: Radius.md, padding: Spacing.md,
    fontSize: 15, color: Colors.text.primary,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.5)',
  },
  focused: { borderColor: Colors.primary, backgroundColor: 'rgba(255,255,255,0.92)' },
});

export default function RegisterScreen() {
  const router = useRouter();
  const register = useAuthStore((s) => s.register);

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);

  const shakeX = useRef(new Animated.Value(0)).current;
  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeX, { toValue: 8, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: -8, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 5, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: -5, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 0, duration: 55, useNativeDriver: true }),
    ]).start();
  };

  const handleRegister = async () => {
    if (!username.trim() || !email.trim() || !password) {
      shake(); Alert.alert('Hiányzó adatok', 'Kérjük töltsd ki az összes mezőt.'); return;
    }
    if (password !== password2) {
      shake(); Alert.alert('Jelszó hiba', 'A két jelszó nem egyezik meg.'); return;
    }
    if (password.length < 8) {
      shake(); Alert.alert('Gyenge jelszó', 'A jelszó legalább 8 karakter legyen.'); return;
    }
    if (!accepted) {
      shake(); Alert.alert('GDPR', 'Az adatkezelési tájékoztató elfogadása kötelező.'); return;
    }
    setLoading(true);
    try {
      await register(username.trim(), email.trim().toLowerCase(), password);
      router.replace('/');
    } catch (err) {
      shake();
      const msg = err instanceof ApiError ? err.message : 'Ismeretlen hiba.';
      Alert.alert('Sikertelen regisztráció', msg);
    } finally {
      setLoading(false);
    }
  };

  // Jelszó erősség jelző
  const pwStrength = (() => {
    if (!password) return null;
    if (password.length < 6) return { label: 'Gyenge', color: '#E74C3C', pct: 0.25 };
    if (password.length < 10) return { label: 'Közepes', color: '#F5A623', pct: 0.6 };
    return { label: 'Erős', color: '#2ECC71', pct: 1 };
  })();

  return (
    <AnimatedMeshBackground
      colors={[...Gradients.meshMain].reverse()}
      style={{ flex: 1 }}
    >
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
              <Text style={styles.tagline}>Csatlakozz a közösséghez!</Text>
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
                <Text style={styles.cardTitle}>Regisztráció</Text>

                <View style={styles.fields}>
                  <GlassInput
                    label="Felhasználónév"
                    value={username}
                    onChange={setUsername}
                    placeholder="pl. kovacs_peter"
                  />
                  <GlassInput
                    label="Email cím"
                    value={email}
                    onChange={setEmail}
                    placeholder="pelda@email.com"
                    keyboardType="email-address"
                  />
                  <View>
                    <GlassInput
                      label="Jelszó (min. 8 karakter)"
                      value={password}
                      onChange={setPassword}
                      placeholder="••••••••"
                      secure
                    />
                    {/* Jelszó erősség sáv */}
                    {pwStrength && (
                      <View style={styles.pwStrengthWrap}>
                        <View style={styles.pwTrack}>
                          <View style={[styles.pwFill, { width: `${pwStrength.pct * 100}%`, backgroundColor: pwStrength.color }]} />
                        </View>
                        <Text style={[styles.pwLabel, { color: pwStrength.color }]}>{pwStrength.label}</Text>
                      </View>
                    )}
                  </View>
                  <GlassInput
                    label="Jelszó megerősítése"
                    value={password2}
                    onChange={setPassword2}
                    placeholder="••••••••"
                    secure
                  />
                  {password2 !== '' && password !== password2 && (
                    <Text style={styles.mismatch}>⚠️ A jelszavak nem egyeznek</Text>
                  )}
                </View>

                {/* GDPR checkbox */}
                <Pressable style={styles.checkRow} onPress={() => setAccepted(!accepted)}>
                  <LinearGradient
                    colors={accepted ? (Gradients.cardOrange as any) : ['#E8E8E8', '#E8E8E8']}
                    style={styles.checkbox}
                  >
                    {accepted && <Text style={styles.checkmark}>✓</Text>}
                  </LinearGradient>
                  <Text style={styles.checkText}>
                    Elfogadom az{' '}
                    <Text style={styles.checkLink}>adatkezelési tájékoztatót</Text>
                    {' '}(GDPR)
                  </Text>
                </Pressable>

                <PrimaryButton
                  label="Regisztráció →"
                  onPress={handleRegister}
                  loading={loading}
                  disabled={!accepted}
                  style={styles.btn}
                />
              </GlassCardSimple>
            </Animated.View>

            {/* Login link */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>Már van fiókod? </Text>
              <Link href="/auth/login" asChild>
                <Pressable hitSlop={8}>
                  <Text style={styles.footerLink}>Bejelentkezés →</Text>
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
    width: 80, height: 80, borderRadius: 40,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)',
    shadowColor: '#FF6B35', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3, shadowRadius: 16, elevation: 8,
  },
  logoEmoji: { fontSize: 42 },
  appName: { fontSize: 32, fontWeight: '900', color: '#fff', letterSpacing: -1 },
  tagline: { ...Typography.body, color: 'rgba(255,255,255,0.8)' },
  card: {
    shadowColor: 'rgba(31,38,135,0.2)',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 1, shadowRadius: 40, elevation: 12,
  },
  cardTitle: { ...Typography.subtitle, color: Colors.text.primary, marginBottom: Spacing.lg },
  fields: { gap: Spacing.md, marginBottom: Spacing.lg },
  pwStrengthWrap: {
    flexDirection: 'row', alignItems: 'center',
    gap: Spacing.sm, marginTop: 6,
  },
  pwTrack: { flex: 1, height: 4, backgroundColor: '#EEE', borderRadius: 2, overflow: 'hidden' },
  pwFill: { height: '100%', borderRadius: 2 },
  pwLabel: { ...Typography.caption, fontWeight: '700', width: 48 },
  mismatch: { ...Typography.caption, color: Colors.status.banned, marginTop: 2 },
  checkRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    gap: Spacing.sm, marginBottom: Spacing.lg,
  },
  checkbox: {
    width: 24, height: 24, borderRadius: 7,
    alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  checkmark: { color: '#fff', fontSize: 13, fontWeight: '900' },
  checkText: { flex: 1, ...Typography.caption, color: Colors.text.secondary, lineHeight: 20 },
  checkLink: { color: Colors.primary, fontWeight: '700' },
  btn: {},
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  footerText: { ...Typography.body, color: 'rgba(255,255,255,0.85)' },
  footerLink: { ...Typography.bodyMedium, color: '#fff', textDecorationLine: 'underline' },
});
