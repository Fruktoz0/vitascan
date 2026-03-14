import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import { Colors, Typography } from '../../design/tokens';

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
  size = 180,
  strokeWidth = 14,
}: KcalRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(consumed / goal, 1);
  const isOver = consumed > goal;
  const remaining = Math.max(goal - consumed, 0);

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

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size} style={styles.svg}>
        <Defs>
          <SvgGradient id="kcalGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor={isOver ? '#E53E3E' : '#FF6B35'} />
            <Stop offset="100%" stopColor={isOver ? '#FF6B35' : '#FF9A6C'} />
          </SvgGradient>
        </Defs>

        {/* Track (szürke háttér) */}
        <Circle
          cx={cx}
          cy={cy}
          r={radius}
          stroke="rgba(255,255,255,0.25)"
          strokeWidth={strokeWidth}
          fill="none"
        />

        {/* Animated progress arc */}
        <AnimatedCircle
          cx={cx}
          cy={cy}
          r={radius}
          stroke="url(#kcalGrad)"
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          rotation="-90"
          origin={`${cx}, ${cy}`}
        />
      </Svg>

      {/* Középső szöveg */}
      <View style={styles.center}>
        <Text style={[styles.number, isOver && styles.numberOver]}>
          {Math.round(consumed)}
        </Text>
        <Text style={styles.unit}>kcal</Text>
        <View style={styles.divider} />
        <Text style={styles.remaining}>
          {isOver
            ? `+${Math.round(consumed - goal)} felett`
            : `${Math.round(remaining)} maradt`
          }
        </Text>
      </View>
    </View>
  );
}

// Kisebb, inline változat (kártyákhoz)
export function MiniKcalBar({
  consumed,
  goal,
  label,
}: {
  consumed: number;
  goal: number;
  label?: string;
}) {
  const pct = Math.min(consumed / goal, 1);
  const widthAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(widthAnim, {
      toValue: pct,
      friction: 8,
      tension: 40,
      useNativeDriver: false,
    }).start();
  }, [pct]);

  const animWidth = widthAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={miniStyles.container}>
      <View style={miniStyles.header}>
        <Text style={miniStyles.label}>{label ?? '🔥 Kalória'}</Text>
        <Text style={miniStyles.value}>
          <Text style={miniStyles.consumed}>{Math.round(consumed)}</Text>
          <Text style={miniStyles.goal}> / {Math.round(goal)} kcal</Text>
        </Text>
      </View>
      <View style={miniStyles.track}>
        <Animated.View style={[miniStyles.fill, { width: animWidth }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
  svg: { position: 'absolute' },
  center: { alignItems: 'center' },
  number: {
    ...Typography.number,
    color: Colors.text.white,
    lineHeight: 52,
  },
  numberOver: { color: '#FFD4B8' },
  unit: {
    ...Typography.caption,
    color: 'rgba(255,255,255,0.75)',
    marginTop: -4,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  divider: {
    width: 32,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginVertical: 6,
  },
  remaining: {
    ...Typography.label,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
  },
});

const miniStyles = StyleSheet.create({
  container: { gap: 6 },
  header: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { ...Typography.label, color: Colors.text.secondary },
  value: {},
  consumed: { fontSize: 14, fontWeight: '800', color: Colors.primary },
  goal: { fontSize: 13, color: Colors.text.muted },
  track: {
    height: 10,
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderRadius: 5,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 5,
  },
});
