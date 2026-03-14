import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, ViewStyle, StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface AnimatedMeshBackgroundProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  colors?: string[];
  speed?: 'slow' | 'medium' | 'fast';
}

// Egy lassan mozgó, "lélegző" mesh gradiens háttér
// Két LinearGradient réteg animált opacity-val váltakozik
export default function AnimatedMeshBackground({
  children,
  style,
  colors = ['#FF9A6C', '#FFD4B8', '#A8EDBC', '#7EC8E3'],
  speed = 'slow',
}: AnimatedMeshBackgroundProps) {
  const opacity = useRef(new Animated.Value(0)).current;

  const duration = speed === 'slow' ? 6000 : speed === 'medium' ? 3000 : 1500;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration,
          useNativeDriver: true,
        }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  // Alternatív gradiens kis eltolással a "mozgás" érzetéhez
  const altColors = [...colors].reverse();

  return (
    <View style={[styles.container, style]}>
      {/* Alap gradiens */}
      <LinearGradient
        colors={colors as any}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      {/* Animált felső réteg */}
      <Animated.View style={[StyleSheet.absoluteFillObject, { opacity }]}>
        <LinearGradient
          colors={altColors as any}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
      </Animated.View>
      {children}
    </View>
  );
}

// Statikus verzió — egyszerűbb esetekre
export function MeshBackground({
  children,
  style,
  colors = ['#FF9A6C', '#FFD4B8', '#A8EDBC', '#7EC8E3'],
  start = { x: 0, y: 0 },
  end = { x: 1, y: 1 },
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  colors?: string[];
  start?: { x: number; y: number };
  end?: { x: number; y: number };
}) {
  return (
    <LinearGradient colors={colors as any} start={start} end={end} style={[styles.container, style]}>
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
