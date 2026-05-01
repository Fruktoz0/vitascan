import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors } from '../../design/tokens';

interface KcalRingProps {
  consumed: number;
  goal: number;
  size?: number;
  strokeWidth?: number;
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export default function KcalRing({
  consumed,
  goal,
  size = 100,
  strokeWidth = 8,
}: KcalRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(consumed / goal, 1);

  const animValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(animValue, {
      toValue: pct,
      friction: 8,
      tension: 30,
      useNativeDriver: false,
    }).start();
  }, [pct]);

  const strokeDashoffset = animValue.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0],
  });

  const cx = size / 2;
  const cy = size / 2;

  // HTML: stroke="#ffb77d" (tertiary-fixed-dim)
  const fillColor = Colors.dashboard.kcalFill;
  // HTML: stroke="#f1edec" (surface-container track)
  const trackColor = Colors.dashboard.kcalTrack;
  // HTML: inner dashed ring + outer dashed ring stroke="#1c1b1b" stroke-dasharray="4 4"
  const doodleColor = Colors.dashboard.stroke;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size} style={styles.svg}>
        {/* HTML: background track circle */}
        <Circle
          cx={cx} cy={cy} r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />

        {/* HTML: progress arc – stroke="#ffb77d" stroke-linecap="round" */}
        <AnimatedCircle
          cx={cx} cy={cy} r={radius}
          stroke={fillColor}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          rotation="-90"
          origin={`${cx}, ${cy}`}
        />

        {/* HTML: Inner doodle circle – stroke-dasharray="4 4" stroke-width="0.8" */}
        <Circle
          cx={cx} cy={cy} r={radius - strokeWidth / 2 - 4}
          stroke={doodleColor}
          strokeWidth={1}
          strokeDasharray="4 4"
          fill="none"
          opacity={0.7}
        />

        {/* HTML: Outer doodle circle – stroke-dasharray="6 3" stroke-width="0.8" */}
        <Circle
          cx={cx} cy={cy} r={radius + strokeWidth / 2 + 4}
          stroke={doodleColor}
          strokeWidth={1}
          strokeDasharray="6 3"
          fill="none"
          opacity={0.7}
        />
      </Svg>

      {/* HTML: <span class="material-symbols-outlined text-tertiary-fixed-dim">local_fire_department</span> */}
      <View style={styles.center}>
        <MaterialIcons
          name="local-fire-department"
          size={Math.round(size * 0.32)}
          color={fillColor}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
  svg: { position: 'absolute' },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
