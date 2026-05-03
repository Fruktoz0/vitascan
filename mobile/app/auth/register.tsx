import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView,
  Alert, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { MaterialIcons } from '@expo/vector-icons';
import { GlassCardSimple } from '../../src/components/ui/GlassCard';
import { PrimaryButton } from '../../src/components/ui/Button';
import { Colors, Radius, Spacing, Typography } from '../../src/design/tokens';
import { useAuthStore } from '../../src/stores/authStore';
import { ApiError } from '../../src/services/api';
import { CharacterIcon, SparkleIcon } from '../../src/components/ui/CharacterIcon';

function CustomInput({
  label, value, onChange, placeholder, icon, secure = false, keyboardType = 'default', isAlt = false,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder: string; icon: keyof typeof MaterialIcons.glyphMap; secure?: boolean; keyboardType?: any; isAlt?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  
  // Design reference uses alternating radii: wobbly-border vs wobbly-border-alt
  const radii = isAlt ? {
    borderTopLeftRadius: 15,
    borderTopRightRadius: 60,
    borderBottomRightRadius: 15,
    borderBottomLeftRadius: 40,
  } : {
    borderTopLeftRadius: 60,
    borderTopRightRadius: 15,
    borderBottomRightRadius: 40,
    borderBottomLeftRadius: 15,
  };

  return (
    <View style={inputStyles.wrap}>
      <Text style={inputStyles.label}>{label}</Text>
      <View style={[
        inputStyles.inputContainer, 
        radii,
        focused && { backgroundColor: Colors.dashboard.waterBg, borderColor: Colors.dashboard.stroke }
      ]}>
        <MaterialIcons 
          name={icon} 
          size={20} 
          color={Colors.dashboard.onSurfaceVariant} 
          style={inputStyles.icon} 
        />
        <TextInput
          style={inputStyles.input}
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
    </View>
  );
}

const inputStyles = StyleSheet.create({
  wrap: { gap: 8 },
  label: { 
    fontSize: 14, 
    fontWeight: '700', 
    color: Colors.dashboard.stroke,
    marginLeft: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dashboard.page,
    borderWidth: 1.5,
    borderColor: Colors.dashboard.stroke,
    paddingHorizontal: Spacing.lg,
    height: 56,
  },
  icon: {
    marginRight: Spacing.md,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: Colors.dashboard.stroke,
  },
});

export default function RegisterScreen() {
  const { t } = useTranslation();
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
      shake(); Alert.alert(t('auth.missingDataTitle'), t('auth.registerMissingData')); return;
    }
    if (password !== password2) {
      shake(); Alert.alert(t('auth.passwordErrorTitle'), t('auth.passwordMismatch')); return;
    }
    if (password.length < 8) {
      shake(); Alert.alert(t('auth.weakPasswordTitle'), t('auth.weakPasswordMessage')); return;
    }
    if (!accepted) {
      shake(); Alert.alert(t('auth.gdprTitle'), t('auth.gdprRequired')); return;
    }
    setLoading(true);
    try {
      await register(username.trim(), email.trim().toLowerCase(), password);
      router.replace('/');
    } catch (err) {
      shake();
      const msg = err instanceof ApiError ? err.message : t('unknownError');
      Alert.alert(t('auth.registerFailedTitle'), msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Decorative Floating Doodles */}
      <View style={[styles.bubble, styles.bubble1]} />
      <View style={[styles.bubble, styles.bubble2]} />
      <View style={[styles.bubble, styles.bubble3]} />

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
            {/* Header / Logo */}
            <View style={styles.header}>
              <View style={styles.titleContainer}>
                <Text style={styles.title}>Vitascan</Text>
                <SparkleIcon style={styles.sparkle} color={Colors.dashboard.stroke} />
              </View>
              <Text style={styles.subtitle}>{t('auth.joinCommunity')}</Text>
              
              <View style={styles.characterContainer}>
                <CharacterIcon style={styles.character} />
                <View style={styles.characterBubble} />
              </View>
            </View>

            {/* Registration Form Card */}
            <Animated.View style={{ transform: [{ translateX: shakeX }] }}>
              <GlassCardSimple
                backgroundColor={Colors.dashboard.card}
                borderColor={Colors.dashboard.stroke}
                padding={Spacing['3xl']}
                shadowOffset={6}
                customRadius={{
                  borderTopLeftRadius: 15,
                  borderTopRightRadius: 15,
                  borderBottomRightRadius: 15,
                  borderBottomLeftRadius: 15,
                }}
                style={styles.card}
              >
                <View style={styles.fields}>
                  <CustomInput
                    label={t('username')}
                    value={username}
                    onChange={setUsername}
                    placeholder={t('auth.usernamePlaceholder')}
                    icon="person"
                  />
                  <CustomInput
                    label={t('email')}
                    value={email}
                    onChange={setEmail}
                    placeholder={t('auth.emailPlaceholder')}
                    icon="email"
                    keyboardType="email-address"
                    isAlt
                  />
                  <CustomInput
                    label={t('auth.passwordMin')}
                    value={password}
                    onChange={setPassword}
                    placeholder="••••••••"
                    icon="lock"
                    secure
                  />
                  <CustomInput
                    label={t('auth.confirmPassword')}
                    value={password2}
                    onChange={setPassword2}
                    placeholder="••••••••"
                    icon="lock"
                    secure
                    isAlt
                  />
                  {password2 !== '' && password !== password2 && (
                    <Text style={styles.mismatch}>⚠️ {t('auth.passwordMismatchInline')}</Text>
                  )}
                </View>

                {/* GDPR checkbox */}
                <Pressable style={styles.checkRow} onPress={() => setAccepted(!accepted)}>
                  <View style={[
                    styles.checkbox,
                    accepted && { backgroundColor: Colors.dashboard.primaryFixed }
                  ]}>
                    {accepted && <MaterialIcons name="check" size={16} color={Colors.dashboard.stroke} />}
                  </View>
                  <Text style={styles.checkText}>
                    {t('auth.acceptPrefix')}{' '}
                    <Text style={styles.checkLink}>{t('auth.privacyPolicy')}</Text>
                    {' '}(GDPR)
                  </Text>
                </Pressable>

                <PrimaryButton
                  label={t('auth.registerArrow')}
                  onPress={handleRegister}
                  loading={loading}
                  disabled={!accepted}
                  style={styles.registerBtn}
                />
              </GlassCardSimple>
            </Animated.View>

            {/* Divider */}
            <View style={styles.dividerContainer}>
              <View style={styles.dividerLine} />
              <View style={styles.dividerBox}>
                <Text style={styles.dividerText}>VAGY</Text>
              </View>
              <View style={styles.dividerLine} />
            </View>

            {/* Login Link */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>{t('auth.hasAccount')} </Text>
              <Link href="/auth/login" asChild>
                <Pressable hitSlop={8}>
                  <Text style={styles.footerLink}>{t('auth.loginLink')}</Text>
                </Pressable>
              </Link>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dashboard.page,
  },
  bubble: {
    position: 'absolute',
    borderWidth: 0.8,
    borderColor: Colors.dashboard.stroke,
    opacity: 0.6,
  },
  bubble1: {
    top: 40,
    left: -20,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.dashboard.softBlue,
    transform: [{ scaleX: 1.2 }],
  },
  bubble2: {
    bottom: 80,
    right: -20,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.dashboard.primaryFixed,
    transform: [{ rotate: '15deg' }],
  },
  bubble3: {
    top: '20%',
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.dashboard.errorContainer,
    opacity: 0.5,
  },
  scroll: {
    flexGrow: 1,
    padding: Spacing.xl,
    paddingBottom: Spacing['6xl'],
  },
  header: {
    alignItems: 'center',
    marginTop: Spacing.xl,
    marginBottom: Spacing['2xl'],
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  title: {
    fontSize: 48,
    fontWeight: '800',
    fontStyle: 'italic',
    color: Colors.dashboard.nutritionIcon,
    marginBottom: Spacing.xs,
  },
  sparkle: {
    position: 'absolute',
    right: -24,
    top: -10,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '500',
    color: Colors.dashboard.onSurfaceVariant,
    marginBottom: Spacing['2xl'],
  },
  characterContainer: {
    position: 'relative',
    width: 100,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  character: {
    zIndex: 2,
  },
  characterBubble: {
    position: 'absolute',
    right: -30,
    top: 10,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.dashboard.errorContainer,
    borderWidth: 0.8,
    borderColor: Colors.dashboard.stroke,
    opacity: 0.4,
    zIndex: 1,
  },
  card: {
    marginBottom: Spacing.xl,
  },
  fields: {
    gap: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  mismatch: {
    fontSize: 12,
    color: Colors.status.banned,
    marginTop: -Spacing.md,
    marginLeft: 4,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing['2xl'],
  },
  checkbox: {
    width: 24, height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: Colors.dashboard.stroke,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.dashboard.page,
  },
  checkText: {
    flex: 1,
    fontSize: 12,
    color: Colors.dashboard.onSurfaceVariant,
  },
  checkLink: {
    color: Colors.dashboard.nutritionIcon,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  registerBtn: {
    marginTop: Spacing.sm,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: Spacing['2xl'],
    gap: Spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.dashboard.stroke,
    borderStyle: 'dashed',
    borderRadius: 1,
    borderWidth: 0.5,
    borderColor: Colors.dashboard.stroke,
  },
  dividerBox: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
    borderWidth: 1.5,
    borderColor: Colors.dashboard.stroke,
    borderRadius: 8,
    backgroundColor: Colors.dashboard.page,
  },
  dividerText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.dashboard.onSurfaceVariant,
  },
  footer: {
    alignItems: 'center',
    marginBottom: Spacing['3xl'],
  },
  footerText: {
    fontSize: 16,
    color: Colors.dashboard.onSurfaceVariant,
  },
  footerLink: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.dashboard.nutritionIcon,
    textDecorationLine: 'underline',
    marginTop: 4,
  },
});
