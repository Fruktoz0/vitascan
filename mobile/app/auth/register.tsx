import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView,
  Alert, Animated, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { GlassCardSimple } from '../../src/components/ui/GlassCard';
import { Colors, Spacing } from '../../src/design/tokens';
import { useAuthStore } from '../../src/stores/authStore';
import { ApiError } from '../../src/services/api';
import { CharacterIcon, SparkleIcon } from '../../src/components/ui/CharacterIcon';

// Mint CTA + kártya: ugyanaz a „kézzel rajzolt” logika, mint a login kártyán (kissé más sarokértékek)
const REGISTER_CARD_FRAME = {
  borderTopLeftRadius: 28,
  borderTopRightRadius: 12,
  borderBottomRightRadius: 32,
  borderBottomLeftRadius: 14,
} as const;

const SUBMIT_BTN_FRAME = {
  borderTopLeftRadius: 10,
  borderTopRightRadius: 4,
  borderBottomRightRadius: 8,
  borderBottomLeftRadius: 5,
} as const;

type OutlineFieldIcon = 'account-outline' | 'email-outline' | 'lock-outline';

function CustomInput({
  label, value, onChange, placeholder, icon, secure = false, keyboardType = 'default',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  icon: OutlineFieldIcon;
  secure?: boolean;
  keyboardType?: any;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={inputStyles.wrap}>
      <Text style={inputStyles.label}>{label}</Text>
      <View style={[inputStyles.wrapper, focused && inputStyles.wrapperFocused]}>
        <MaterialCommunityIcons
          name={icon}
          size={18}
          color="#4f5d77"
          style={inputStyles.icon}
        />
        <TextInput
          style={inputStyles.textInput}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={Colors.dashboard.onSurfaceVariant}
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

// Mezők: login GlassInput-t követik (négyzetes, bézs háttér, bal ikon)
const inputStyles = StyleSheet.create({
  wrap: { gap: Spacing.sm },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.dashboard.stroke,
    marginLeft: 4,
  },
  wrapper: {
    borderWidth: 1.2,
    borderColor: Colors.dashboard.stroke,
    backgroundColor: '#ece9e6',
    borderRadius: 2,
    minHeight: 50,
    justifyContent: 'center',
  },
  wrapperFocused: {
    borderColor: '#121212',
    backgroundColor: '#f3f1ef',
  },
  icon: {
    position: 'absolute',
    left: 12,
    top: 15,
    zIndex: 1,
  },
  textInput: {
    fontSize: 17,
    lineHeight: 22,
    color: Colors.dashboard.stroke,
    paddingLeft: 42,
    paddingRight: 12,
    paddingVertical: 11,
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
                borderWidth={1.2}
                padding={Spacing['3xl']}
                shadowOffset={6}
                customRadius={REGISTER_CARD_FRAME}
                style={styles.card}
              >
                <View style={styles.fields}>
                  <CustomInput
                    label={t('username')}
                    value={username}
                    onChange={setUsername}
                    placeholder={t('auth.usernamePlaceholder')}
                    icon="account-outline"
                  />
                  <CustomInput
                    label={t('email')}
                    value={email}
                    onChange={setEmail}
                    placeholder={t('auth.emailPlaceholder')}
                    icon="email-outline"
                    keyboardType="email-address"
                  />
                  <CustomInput
                    label={t('auth.passwordMin')}
                    value={password}
                    onChange={setPassword}
                    placeholder="••••••••"
                    icon="lock-outline"
                    secure
                  />
                  <CustomInput
                    label={t('auth.confirmPassword')}
                    value={password2}
                    onChange={setPassword2}
                    placeholder="••••••••"
                    icon="lock-outline"
                    secure
                  />
                  {password2 !== '' && password !== password2 && (
                    <Text style={styles.mismatch}>⚠️ {t('auth.passwordMismatchInline')}</Text>
                  )}
                </View>

                {/* GDPR checkbox */}
                <Pressable style={styles.checkRow} onPress={() => setAccepted(!accepted)}>
                  <View style={[
                    styles.checkbox,
                    accepted && { backgroundColor: Colors.dashboard.primaryFixed },
                  ]}>
                    {accepted && <MaterialIcons name="check" size={16} color={Colors.dashboard.stroke} />}
                  </View>
                  <Text style={styles.checkText}>
                    {t('auth.acceptPrefix')}{' '}
                    <Text style={styles.checkLink}>{t('auth.privacyPolicy')}</Text>
                    {' '}(GDPR)
                  </Text>
                </Pressable>

                {/* Minta: világos menta gomb, szabálytalan sarkok, kemény árnyék (login gomb mintája, Pressable + belső View) */}
                <View style={[styles.submitBtnOuter, !accepted && styles.submitBtnOuterDim]}>
                  <View style={styles.submitBtnShadow} pointerEvents="none" />
                  <Pressable
                    onPress={handleRegister}
                    disabled={!accepted || loading}
                    android_ripple={{ color: 'rgba(26,26,26,0.08)' }}
                    style={({ pressed }) => [
                      styles.submitBtnHit,
                      pressed && accepted && !loading && styles.submitBtnPressed,
                    ]}
                  >
                    <View style={styles.submitBtnFace}>
                      {loading ? (
                        <ActivityIndicator color={Colors.dashboard.stroke} />
                      ) : (
                        <View style={styles.submitBtnRow}>
                          <Text style={styles.submitBtnText}>{t('auth.registerCta')}</Text>
                          <MaterialIcons name="arrow-forward" size={22} color={Colors.dashboard.stroke} />
                        </View>
                      )}
                    </View>
                  </Pressable>
                </View>
              </GlassCardSimple>
            </Animated.View>

            {/* Divider */}
            <View style={styles.dividerContainer}>
              <View style={styles.dividerLine} />
              <View style={styles.dividerLabel}>
                <Text style={styles.dividerText}>{t('common.or')}</Text>
              </View>
              <View style={styles.dividerLine} />
            </View>

            {/* Login Link */}
            <View style={styles.footer}>
              <Text style={styles.footerText} numberOfLines={1}>
                {t('auth.hasAccount')}{' '}
              </Text>
              <Link href="/auth/login" asChild>
                <Pressable hitSlop={8}>
                  <Text style={styles.footerLink} numberOfLines={1}>
                    {t('auth.loginLink')}
                  </Text>
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
    justifyContent: 'center',
    gap: Spacing.xl,
  },
  header: {
    alignItems: 'center',
    marginTop: Spacing.xl,
    marginBottom: 0,
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
    marginBottom: Spacing.md,
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
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    marginTop: Spacing['3xl'],
    marginBottom: Spacing.xl,
  },
  fields: {
    gap: Spacing['2xl'],
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
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.2,
    borderColor: Colors.dashboard.stroke,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.dashboard.card,
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
  submitBtnOuter: {
    marginTop: Spacing.sm,
    paddingRight: 4,
    paddingBottom: 4,
    position: 'relative',
  },
  submitBtnOuterDim: {
    opacity: 0.52,
  },
  submitBtnShadow: {
    ...StyleSheet.absoluteFillObject,
    top: 4,
    left: 4,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.dashboard.shadowHard,
    ...SUBMIT_BTN_FRAME,
    zIndex: 0,
  },
  submitBtnHit: {
    position: 'relative',
    zIndex: 1,
    alignSelf: 'stretch',
    elevation: 8,
  },
  submitBtnFace: {
    width: '100%',
    backgroundColor: Colors.dashboard.blobMint,
    borderWidth: 1,
    borderColor: Colors.dashboard.stroke,
    ...SUBMIT_BTN_FRAME,
    paddingVertical: 16,
    paddingHorizontal: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  submitBtnText: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
    color: Colors.dashboard.stroke,
  },
  submitBtnPressed: {
    transform: [{ translateX: 4 }, { translateY: 4 }],
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: Spacing['2xl'],
  },
  dividerLine: {
    flex: 1,
    height: 1,
    borderWidth: 0.5,
    borderColor: Colors.dashboard.stroke,
    borderStyle: 'dashed',
  },
  dividerLabel: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderWidth: 0.8,
    borderColor: Colors.dashboard.stroke,
    backgroundColor: Colors.dashboard.page,
    marginHorizontal: 8,
    borderRadius: 6,
  },
  dividerText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.dashboard.onSurfaceVariant,
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    justifyContent: 'center',
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
  },
});
