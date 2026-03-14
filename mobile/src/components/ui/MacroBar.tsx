import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Gradients, Typography, Radius } from '../../design/tokens';

interface MacroBarProps {
  label: string;
  value: number;       // aktuális g
  goal?: number;       // napi cél g (opcionális)
  unit?: string;
  type: 'protein' | 'carbs' | 'fat' | 'fiber' | 'sugar' | 'kcal';
  animate?: boolean;
}

const MACRO_CONFIG = {
  protein: { emoji: '💪', label: 'Fehérje', colors: Gradients.protein },
  carbs:   { emoji: '🌾', label: 'Szénhidrát', colors: Gradients.carbs },
  fat:     { emoji: '🥑', label: 'Zsír', colors: Gradients.fat },
  fiber:   { emoji: '🌿', label: 'Rost', colors: Gradients.fiber },
  sugar:   { emoji: '🍬', label: 'Cukor', colors: Colors.macro.sugarGrad },
  kcal:    { emoji: '🔥', label: 'Kalória', colors: Gradients.cardOrange },
};

export default function MacroBar({
  label,
  value,
  goal,
  unit = 'g',
  type,
  animate = true,
}: MacroBarProps) {
  const config = MACRO_CONFIG[type];
  const pct = goal ? Math.min(value / goal, 1) : 0;
  const widthAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!animate) return;
    Animated.spring(widthAnim, {
      toValue: pct,
      friction: 8,
      tension: 40,
      useNativeDriver: false,
    }).start();
  }, [pct]);

  const animatedWidth = widthAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const isOver = goal && value > goal;
  const mainColor = Colors.macro[type];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.labelRow}>
          <Text style={styles.emoji}>{config.emoji}</Text>
          <Text style={styles.label}>{label || config.label}</Text>
        </View>
        <View style={styles.valueRow}>
          <Text style={[styles.value, { color: mainColor }]}>
            {unit === 'kcal' ? Math.round(value) : Math.round(value * 10) / 10}
          </Text>
          <Text style={styles.unit}>{unit}</Text>
          {goal && (
            <Text style={styles.goal}>
              {' '}/ {unit === 'kcal' ? Math.round(goal) : goal}{unit}
            </Text>
          )}
        </View>
      </View>

      {goal && (
        <View style={styles.track}>
          <Animated.View style={[styles.fillWrapper, { width: animatedWidth }]}>
            <LinearGradient
              colors={config.colors as any}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.fill, isOver && styles.fillOver]}
            />
          </Animated.View>
        </View>
      )}
    </View>
  );
}

// Kompakt kártyás változat a Home screen-hez
export function MacroChip({
  type,
  value,
  goal,
}: {
  type: 'protein' | 'carbs' | 'fat';
  value: number;
  goal?: number;
}) {
  const config = MACRO_CONFIG[type];
  const mainColor = Colors.macro[type];
  const lightColor = Colors.macro[`${type}Light` as keyof typeof Colors.macro] as string;
  const pct = goal ? Math.min(value / goal, 1) : null;

  return (
    <View style={[chipStyles.card, { backgroundColor: lightColor, borderColor: mainColor + '30' }]}>
      <Text style={chipStyles.emoji}>{config.emoji}</Text>
      <Text style={[chipStyles.value, { color: mainColor }]}>
        {Math.round(value * 10) / 10}g
      </Text>
      <Text style={chipStyles.label}>{config.label}</Text>
      {pct !== null && (
        <View style={chipStyles.track}>
          <LinearGradient
            colors={config.colors as any}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[chipStyles.fill, { width: `${pct * 100}%` }]}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  emoji: { fontSize: 16 },
  label: { ...Typography.label, color: Colors.text.secondary },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 1 },
  value: { fontSize: 16, fontWeight: '800' },
  unit: { ...Typography.caption, color: Colors.text.muted, marginLeft: 1 },
  goal: { ...Typography.caption, color: Colors.text.muted },
  track: {
    height: 8,
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  fillWrapper: { height: '100%' },
  fill: { flex: 1, borderRadius: Radius.full },
  fillOver: { opacity: 0.6 },
});

const chipStyles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: Radius.lg,
    padding: 14,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1.5,
  },
  emoji: { fontSize: 22 },
  value: { fontSize: 18, fontWeight: '800' },
  label: { ...Typography.caption, color: Colors.text.muted },
  track: {
    width: '100%',
    height: 5,
    backgroundColor: 'rgba(0,0,0,0.08)',
    borderRadius: Radius.full,
    overflow: 'hidden',
    marginTop: 2,
  },
  fill: { height: '100%', borderRadius: Radius.full },
});
