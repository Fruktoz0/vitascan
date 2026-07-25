import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { Link, useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import DoodleCharacter from '../../src/components/ui/DoodleCharacter';
import { GlassCardSimple } from '../../src/components/ui/GlassCard';
import { ResponsiveLayout, webPointer } from '../../src/components/layout/ResponsiveLayout';
import { Colors, Spacing } from '../../src/design/tokens';
import { ApiError } from '../../src/services/api';
import { useAuthStore } from '../../src/stores/authStore';

// Stitch: .wobbly-border (ellipszis sarok) — RN-ben sarconkénti, erősen aszimmetrikus ívek
const CARD_FRAME = {
  borderTopLeftRadius: 30,
  borderTopRightRadius: 11,
  borderBottomRightRadius: 34,
  borderBottomLeftRadius: 13,
} as const;

type GlassInputOutlineIcon = 'email-outline' | 'lock-outline';

function GlassInput({
  value, onChange, placeholder, icon,
  keyboardType = 'default', secure = false, autoComplete,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  icon: GlassInputOutlineIcon;
  keyboardType?: any;
  secure?: boolean;
  autoComplete?: any;
}) {
  const [focused, setFocused] = useState(false);

  return (
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
  // bg-surface border-[0.8px] border-[#1A1A1A] py-3 pl-12 pr-4
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
  // absolute left-4 top-1/2 -translate-y-1/2  →  left: 16, vertically centred via top
  icon: {
    position: 'absolute',
    left: 12,
    top: 15,
    zIndex: 1,
  },
  // pl-12 (48px) pr-4 (16px) py-3 (12px)  font-body-md (16px/1.6)
  textInput: {
    fontSize: 17,
    lineHeight: 22,
    color: Colors.dashboard.stroke,
    paddingLeft: 42,
    paddingRight: 12,
    paddingVertical: 11,
  },
});

export default function LoginScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const login = useAuthStore((s) => s.login);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

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
    <ResponsiveLayout>
    <View style={styles.container}>
      {/* Háttér dekoratív blob-ok */}
      <View style={[styles.blob, styles.blob1]} />
      <View style={[styles.blob, styles.blob2]} />
      <View style={[styles.blob, styles.blob3]} />

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
            {/* Fejléc / Logo */}
            <View style={styles.logoArea}>
              <View>
                <Text style={styles.appName}>Vitascan</Text>
                <View style={styles.sparkle}>
                  <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <Path
                      d="M12 3v3m0 12v3m9-9h-3M6 12H3m14.485-6.364l-2.121 2.121M7.636 17.657l-2.121 2.121m14.485 0l-2.121-2.121M7.636 6.343L5.515 4.222"
                      stroke={Colors.dashboard.stroke}
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </Svg>
                </View>
              </View>
              <Text style={styles.tagline}>{t('auth.healthAndNutrition')}</Text>
              <DoodleCharacter size={100} style={styles.doodle} />
            </View>

            {/* ── Login kártya ── */}
            <Animated.View style={{ transform: [{ translateX: shakeX }] }}>
              <GlassCardSimple
                backgroundColor={Colors.dashboard.card}
                borderColor={Colors.dashboard.stroke}
                borderWidth={1.2}
                padding={Spacing['3xl']}
                customRadius={CARD_FRAME}
                shadowOffset={6}
                style={styles.card}
              >
                {/* Email mező */}
                <GlassInput
                  icon="email-outline"
                  value={email}
                  onChange={setEmail}
                  placeholder="you@example.com"
                  keyboardType="email-address"
                  autoComplete="email"
                />

                {/* Jelszó mező + Elfelejtett jelszó */}
                <View style={styles.passwordBlock}>
                  <GlassInput
                    icon="lock-outline"
                    value={password}
                    onChange={setPassword}
                    placeholder="••••••••"
                    secure
                    autoComplete="password"
                  />
                  <Pressable style={styles.forgotPass} hitSlop={8}>
                    <Text style={styles.forgotPassText}>{t('auth.forgotPassword')}</Text>
                  </Pressable>
                </View>

                {/* ── Belépés gomb (hard shadow + wobbly) ── */}
                {/* Outer wrapper reservál helyet a 4px hard shadownak */}
                <View style={styles.btnWrapper}>
                  {/* Kemény árnyék — a Pressable háttérje iOS + NativeWind jsx mellett nem mindig rajzolódik; a vizuális felület külön View. */}
                  <View style={styles.btnShadow} pointerEvents="none" />
                  <Pressable
                    onPress={handleLogin}
                    disabled={loading}
                    android_ripple={{ color: 'rgba(255,255,255,0.22)' }}
                    style={({ pressed }) => [
                      styles.loginBtnHit,
                      webPointer,
                      pressed && styles.btnPressed,
                    ]}
                  >
                    <View style={styles.loginBtnFace}>
                      {loading ? (
                        <ActivityIndicator color={Colors.dashboard.onSecondary} />
                      ) : (
                        <View style={styles.loginBtnRow}>
                          <Text style={styles.loginBtnText}>{t('auth.loginCta')}</Text>
                          <MaterialIcons name="arrow-forward" size={24} color={Colors.dashboard.onSecondary} />
                        </View>
                      )}
                    </View>
                  </Pressable>
                </View>
              </GlassCardSimple>
            </Animated.View>

            {/* Elválasztó */}
            <View style={styles.dividerContainer}>
              <View style={styles.dividerLine} />
              <View style={styles.dividerLabel}>
                <Text style={styles.dividerText}>{t('common.or')}</Text>
              </View>
              <View style={styles.dividerLine} />
            </View>

            {/* Regisztráció link */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>{t('auth.noAccount')} </Text>
              <Link href="/auth/register" asChild>
                <Pressable hitSlop={8}>
                  <Text style={styles.footerLink}>{t('register')}</Text>
                </Pressable>
              </Link>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
    </ResponsiveLayout>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dashboard.page,
  },

  // ── Háttér dekoráció ──
  blob: {
    position: 'absolute',
    borderWidth: 0.8,
    borderColor: Colors.dashboard.stroke,
    opacity: 0.6,
  },
  blob1: {
    top: 40,
    left: 20,
    width: 96,
    height: 96,
    backgroundColor: Colors.dashboard.softBlue,
    borderRadius: 40,
    transform: [{ rotate: '-15deg' }],
  },
  blob2: {
    bottom: 80,
    right: 20,
    width: 128,
    height: 128,
    backgroundColor: Colors.dashboard.softGreen,
    borderRadius: 60,
    transform: [{ rotate: '15deg' }],
  },
  blob3: {
    top: '25%',
    right: 40,
    width: 64,
    height: 64,
    backgroundColor: Colors.dashboard.blobPeach,
    borderRadius: 30,
    transform: [{ rotate: '30deg' }],
  },

  // ── Scroll ──
  scroll: {
    flexGrow: 1,
    padding: Spacing.xl,
    justifyContent: 'center',
    gap: Spacing.xl,
  },

  // ── Logo terület ──
  logoArea: {
    alignItems: 'center',
  },
  appName: {
    fontSize: 48,
    fontWeight: '800',
    color: Colors.dashboard.nutritionIcon,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  sparkle: {
    position: 'absolute',
    top: -10,
    right: -25,
  },
  tagline: {
    fontSize: 18,
    fontWeight: '500',
    color: Colors.dashboard.onSurfaceVariant,
    marginTop: 4,
  },
  doodle: {
    marginTop: Spacing.md,
    marginBottom: 0,
    zIndex: 20,
  },

  // ── Kártya ──
  card: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    marginTop: Spacing['3xl'],
  },

  // gap-md (24px) a minta kártyán az email és jelszó szekció között
  passwordBlock: {
    marginTop: Spacing['2xl'],
  },

  // Elfelejtett jelszó: jobb oldali, aláhúzott, 14px bold, primary szín
  forgotPass: {
    alignSelf: 'flex-end',
    marginTop: 8,
  },
  forgotPassText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#4f5d77',
    textDecorationLine: 'underline',
  },

  // ── Gomb (hard shadow + wobbly) ──
  // mt-4 (16px) az előző mezőtől, paddingRight/Bottom 4px a shadow helynek
  btnWrapper: {
    marginTop: 16,
    paddingRight: 4,
    paddingBottom: 4,
    position: 'relative',
  },
  // Eltolt szilárd fekete árnyék: shadow-[4px_4px_0px_0px_rgba(28,27,27,1)] — PrimaryButton hardShadow mintája
  btnShadow: {
    ...StyleSheet.absoluteFillObject,
    top: 4,
    left: 4,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.dashboard.shadowHard,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 4,
    borderBottomLeftRadius: 3,
    zIndex: 0,
  },
  // Kattintási felület (NativeWind / iOS: ne ide tegyük a hátteret)
  loginBtnHit: {
    position: 'relative',
    zIndex: 1,
    alignSelf: 'stretch',
    elevation: 8,
  },
  // bg-secondary (#655d4f) border py-4 px-8 — vizuális „gombtest”
  loginBtnFace: {
    width: '100%',
    backgroundColor: Colors.dashboard.secondary,
    borderWidth: 1,
    borderColor: Colors.dashboard.stroke,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 4,
    borderBottomLeftRadius: 3,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  btnPressed: {
    transform: [{ translateX: 4 }, { translateY: 4 }],
  },
  // font-headline-md: 24px / 700
  loginBtnText: {
    fontSize: 24,
    lineHeight: 31,
    fontWeight: '700',
    color: Colors.dashboard.onSecondary,
  },

  // ── Elválasztó ──
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
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

  // ── Lábléc ──
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
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
