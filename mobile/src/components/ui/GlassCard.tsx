import React from 'react';
import { View, ViewStyle, StyleSheet, StyleProp } from 'react-native';
import { BlurView } from 'expo-blur';
import { Colors, Radius, Shadows } from '../../design/tokens';

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

// Az eredeti GlassCard megtartása a kompatibilitás miatt
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

// Új BentoCard a "Tactile Cartooning" stílus alapján
export function GlassCardSimple({
  children,
  style,
  innerStyle,
  padding = 24,
  radius = 24,
  customRadius,
  backgroundColor = Colors.dashboard.card,
  borderColor = Colors.dashboard.stroke,
  noShadow = false,
  shadowOffset = 4,
}: Omit<GlassCardProps, 'intensity' | 'tint'> & { 
  backgroundColor?: string;
  shadowOffset?: number;
  innerStyle?: StyleProp<ViewStyle>;
  customRadius?: {
    borderTopLeftRadius?: number;
    borderTopRightRadius?: number;
    borderBottomRightRadius?: number;
    borderBottomLeftRadius?: number;
  };
}) {
  const radii = customRadius || { borderRadius: radius };
  
  return (
    <View style={[style, !noShadow && { paddingBottom: shadowOffset, paddingRight: shadowOffset }]}>
      {/* Képregényes "Hard Shadow" effektus (fekete, eltolt, nincs blur) */}
      {!noShadow && (
        <View
          style={[
            StyleSheet.absoluteFillObject,
            {
              backgroundColor: Colors.dashboard.shadowHard,
              top: shadowOffset,
              left: shadowOffset,
            },
            radii
          ]}
        />
      )}
      
      {/* Fő tartalom */}
      <View
        style={[
          {
            backgroundColor,
            padding,
            borderWidth: 1.5, // ~0.8px in HTML, de RN-ben 1.5 mutat jobban nagy felbontáson
            borderColor,
          },
          radii,
          innerStyle
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
