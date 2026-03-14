import React, { useRef, useEffect } from 'react';
import { View, StyleSheet, Animated, ViewStyle, StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface Props {
  colors?: string[];
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  animate?: boolean;
}

export default function AnimatedMeshBackground({
  colors = ['#FF9A6C', '#FFD4B8', '#A8EDBC', '#7EC8E3'],
  children,
  style,
  animate = true,
}: Props) {
  const shift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!animate) return;
    Animated.loop(
      Animated.sequence([
        Animated.timing(shift, { toValue: 1, duration: 8000, useNativeDriver: false }),
        Animated.timing(shift, { toValue: 0, duration: 8000, useNativeDriver: false }),
      ])
    ).start();
  }, [animate]);

  // Kis pozíció-eltolás az animációhoz
  const translateX = shift.interpolate({ inputRange: [0, 1], outputRange: [0, 15] });
  const translateY = shift.interpolate({ inputRange: [0, 1], outputRange: [0, -10] });

  return (
    <View style={[styles.container, style]}>
      <Animated.View
        style={[
          StyleSheet.absoluteFillObject,
          { transform: [{ translateX }, { translateY }] },
        ]}
        pointerEvents="none"
      >
        <LinearGradient
          colors={colors as any}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
      </Animated.View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
});
