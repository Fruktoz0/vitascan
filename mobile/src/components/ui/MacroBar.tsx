import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, Radius, Typography } from '../../design/tokens';
import { GlassCardSimple } from './GlassCard';

interface MacroBarProps {
  label: string;
  value: number;       // aktuális g
  goal?: number;       // napi cél g (opcionális)
  unit?: string;
  type: 'protein' | 'carbs' | 'fat';
}

const MACRO_CONFIG = {
  protein: {
    label: 'Protein',
    icon: 'egg-alt',
    bgColor: Colors.dashboard.proteinBg,
    trackColor: Colors.dashboard.proteinTrack,
    fillColor: Colors.dashboard.proteinFill,
    radii: {
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      borderBottomRightRadius: 16,
      borderBottomLeftRadius: 16,
    }
  },
  carbs: {
    label: 'Carbs',
    icon: 'bakery-dining',
    bgColor: Colors.dashboard.carbsBg,
    trackColor: Colors.dashboard.carbsTrack,
    fillColor: Colors.dashboard.carbsFill,
    radii: {
      borderTopLeftRadius: 24,
      borderTopRightRadius: 16,
      borderBottomRightRadius: 16,
      borderBottomLeftRadius: 24,
    }
  },
  fat: {
    label: 'Fat',
    icon: 'opacity',
    bgColor: Colors.dashboard.fatBg,
    trackColor: Colors.dashboard.fatTrack,
    fillColor: Colors.dashboard.fatFill,
    radii: {
      borderTopLeftRadius: 16,
      borderTopRightRadius: 24,
      borderBottomRightRadius: 24,
      borderBottomLeftRadius: 16,
    }
  },
};

// Kompakt kártyás változat a Home screen-hez HTML alapján
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
  const pct = goal ? Math.min(value / goal, 1) : 0;
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
    <GlassCardSimple
      style={{ flex: 1, minHeight: 110 }}
      innerStyle={{ flex: 1, justifyContent: 'space-between' }}
      padding={12}
      customRadius={config.radii}
      backgroundColor={config.bgColor}
      shadowOffset={3} // HTML-ben 3px_3px_0px_0px
    >
      <View style={styles.header}>
        <Text style={styles.label}>{config.label}</Text>
        <MaterialIcons
          name={config.icon as keyof typeof MaterialIcons.glyphMap}
          size={16}
          color={
            type === 'protein'
              ? Colors.dashboard.proteinFill
              : type === 'carbs'
              ? Colors.dashboard.carbsFill
              : Colors.dashboard.fatFill
          }
        />
      </View>
      
      <View>
        <Text style={styles.value}>{Math.round(value)}g</Text>
        
        <View style={[styles.track, { backgroundColor: config.trackColor }]}>
          <Animated.View
            style={[
              styles.fill,
              { backgroundColor: config.fillColor, width: animWidth },
            ]}
          />
        </View>
        
        {goal && (
          <Text style={styles.goal}>/ {goal}g</Text>
        )}
      </View>
    </GlassCardSimple>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.dashboard.tabInactive,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  icon: {
    fontSize: 16,
  },
  value: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.dashboard.stroke,
    marginBottom: 4,
  },
  track: {
    width: '100%',
    height: 6,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: Colors.dashboard.stroke,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRightWidth: 1.5,
    borderRightColor: Colors.dashboard.stroke,
    borderTopRightRadius: Radius.full,
    borderBottomRightRadius: Radius.full,
  },
  goal: {
    fontSize: 10,
    fontWeight: '500',
    color: Colors.dashboard.tabInactive,
    marginTop: 4,
    textAlign: 'right',
  },
});
