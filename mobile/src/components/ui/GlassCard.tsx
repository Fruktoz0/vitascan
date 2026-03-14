import React from 'react';
import { View, ViewStyle, StyleSheet, StyleProp } from 'react-native';
import { BlurView } from 'expo-blur';
import { Colors, Radius, Shadows } from '../design/tokens';

interface GlassCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;        // blur erőssége: 0–100
  tint?: 'light' | 'dark' | 'default';
  padding?: number;
  radius?: number;
  borderColor?: string;
  noShadow?: boolean;
}

export default function GlassCard({
  children,
  style,
  intensity = 60,
  tint = 'light',
  padding = 20,
  radius = Radius.xl,
  borderColor = Colors.glass.border,
  noShadow = false,
}: GlassCardProps) {
  return (
    <View
      style={[
        styles.wrapper,
        { borderRadius: radius },
        !noShadow && Shadows.glass,
        style,
      ]}
    >
      <BlurView
        intensity={intensity}
        tint={tint}
        style={[
          styles.blur,
          {
            borderRadius: radius,
            padding,
            borderWidth: 1.5,
            borderColor,
          },
        ]}
      >
        {children}
      </BlurView>
    </View>
  );
}

// Egyszerűbb, nem blur-alapú verzió (régebbi Android fallback)
export function GlassCardSimple({
  children,
  style,
  padding = 20,
  radius = Radius.xl,
  backgroundColor = Colors.glass.white,
  borderColor = Colors.glass.border,
  noShadow = false,
}: Omit<GlassCardProps, 'intensity' | 'tint'> & { backgroundColor?: string }) {
  return (
    <View
      style={[
        {
          backgroundColor,
          borderRadius: radius,
          padding,
          borderWidth: 1.5,
          borderColor,
        },
        !noShadow && Shadows.glass,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    overflow: 'hidden',
  },
  blur: {
    overflow: 'hidden',
  },
});
