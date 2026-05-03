import { BlurView } from 'expo-blur';
import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Colors, Radius, Shadows } from '../../design/tokens';

interface GlassCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
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

export function GlassCardSimple({
  children,
  style,
  innerStyle,
  padding = 24,
  radius = 24,
  customRadius,
  backgroundColor = Colors.dashboard.card,
  borderColor = Colors.dashboard.stroke,
  borderWidth = 1.5,
  noShadow = false,
  shadowOffset = 4,
}: Omit<GlassCardProps, 'intensity' | 'tint'> & {
  backgroundColor?: string;
  borderWidth?: number;
  shadowOffset?: number;
  innerStyle?: StyleProp<ViewStyle>;
  customRadius?: {
    borderTopLeftRadius?: number;
    borderTopRightRadius?: number;
    borderBottomRightRadius?: number;
    borderBottomLeftRadius?: number;
  };
}) {
  const radii = customRadius ?? { borderRadius: radius };

  return (
    <View style={[style, !noShadow && { paddingBottom: shadowOffset, paddingRight: shadowOffset }]}>
      {!noShadow && (
        <View
          style={[
            StyleSheet.absoluteFillObject,
            {
              backgroundColor: Colors.dashboard.shadowHard,
              top: shadowOffset,
              left: shadowOffset,
            },
            radii,
          ]}
        />
      )}
      <View
        style={[
          {
            backgroundColor,
            padding,
            borderWidth,
            borderColor,
          },
          radii,
          innerStyle,
        ]}
      >
        {children}
      </View>
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
