import React from 'react';
import {
  View, Text, StyleSheet, Pressable,
  KeyboardAvoidingView, Platform, ScrollView, ViewStyle, StyleProp,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import AnimatedMeshBackground from '../ui/AnimatedMeshBackground';
import { GlassCardSimple } from '../ui/GlassCard';
import { PrimaryButton, GhostButton } from '../ui/Button';
import { Colors, Gradients, Radius, Spacing, Typography } from '../../design/tokens';

// ─── Progress bar ────────────────────────────────────────────────────────────

interface ProgressProps {
  step: number;
  total: number;
}

export function OnboardingProgressBar({ step, total }: ProgressProps) {
  return (
    <View style={progressStyles.container}>
      <View style={progressStyles.dotsRow}>
        {Array.from({ length: total }).map((_, i) => (
          <View
            key={i}
            style={[
              progressStyles.dot,
              i < step && progressStyles.dotDone,
              i === step - 1 && progressStyles.dotActive,
            ]}
          />
        ))}
      </View>
      <Text style={progressStyles.label}>{step} / {total}</Text>
    </View>
  );
}

const progressStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing['2xl'],
  },
  dotsRow: { flexDirection: 'row', gap: 6 },
  dot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  dotDone: { backgroundColor: 'rgba(255,255,255,0.7)', width: 8 },
  dotActive: {
    backgroundColor: '#fff',
    width: 24,
    borderRadius: 4,
  },
  label: {
    ...Typography.caption,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '700',
  },
});

// ─── Onboarding shell ────────────────────────────────────────────────────────

interface OnboardingShellProps {
  step: number;
  total: number;
  children: React.ReactNode;
  cardStyle?: StyleProp<ViewStyle>;

  // Nav gombok
  onNext?: () => void;
  onSkip?: () => void;
  onBack?: () => void;
  nextLabel?: string;
  skipLabel?: string;
  nextDisabled?: boolean;
  nextLoading?: boolean;
  hideBack?: boolean;
  hideSkip?: boolean;

  // Ha true, ScrollView-ba csomagolja
  scrollable?: boolean;
}

export default function OnboardingShell({
  step, total, children, cardStyle,
  onNext, onSkip, onBack,
  nextLabel,
  skipLabel,
  nextDisabled = false,
  nextLoading = false,
  hideBack = false,
  hideSkip = false,
  scrollable = false,
}: OnboardingShellProps) {
  const { t } = useTranslation();
  const resolvedNextLabel = nextLabel ?? t('onboarding.next');
  const resolvedSkipLabel = skipLabel ?? t('onboarding.skip');
  const Content = (
    <View style={shellStyles.inner}>
      <OnboardingProgressBar step={step} total={total} />

      <GlassCardSimple
        backgroundColor={Colors.glass.whiteStrong}
        borderColor={Colors.glass.border}
        padding={Spacing['2xl']}
        radius={Radius['3xl']}
        style={[shellStyles.card, cardStyle]}
      >
        {children}
      </GlassCardSimple>

      {/* Navigációs gombok */}
      <View style={shellStyles.btnRow}>
        {!hideSkip && onSkip && (
          <GhostButton
            label={resolvedSkipLabel}
            onPress={onSkip}
            style={shellStyles.skipBtn}
          />
        )}
        {onNext && (
          <PrimaryButton
            label={resolvedNextLabel}
            onPress={onNext}
            disabled={nextDisabled}
            loading={nextLoading}
            style={hideSkip ? shellStyles.nextBtnFull : shellStyles.nextBtn}
          />
        )}
      </View>

      {!hideBack && onBack && (
        <Pressable onPress={onBack} style={shellStyles.backBtn} hitSlop={12}>
          <Text style={shellStyles.backText}>{t('onboarding.back')}</Text>
        </Pressable>
      )}
    </View>
  );

  return (
    <AnimatedMeshBackground colors={Gradients.meshMain} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          {scrollable ? (
            <ScrollView
              contentContainerStyle={shellStyles.scrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {Content}
            </ScrollView>
          ) : (
            <View style={shellStyles.scrollContent}>{Content}</View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </AnimatedMeshBackground>
  );
}

const shellStyles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    padding: Spacing.xl,
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
  },
  card: {
    shadowColor: 'rgba(31,38,135,0.2)',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 1,
    shadowRadius: 40,
    elevation: 12,
  },
  btnRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  skipBtn: { flex: 1 },
  nextBtn: { flex: 2 },
  nextBtnFull: { flex: 1 },
  backBtn: {
    alignSelf: 'center',
    marginTop: Spacing.sm,
    padding: Spacing.sm,
  },
  backText: {
    color: 'rgba(255,255,255,0.75)',
    ...Typography.label,
  },
});
