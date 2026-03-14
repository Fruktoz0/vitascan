import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, LayoutAnimation, Platform, UIManager,
} from 'react-native';
import { Colors, Radius, Shadows, Typography } from '../../design/tokens';
import { GlassCardSimple } from './GlassCard';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

const MEAL_META: Record<string, { emoji: string; label: string; color: string; bgColor: string }> = {
  BREAKFAST: { emoji: '🌅', label: 'Reggeli',   color: '#F5A623', bgColor: '#FFF8EC' },
  LUNCH:     { emoji: '☀️', label: 'Ebéd',       color: '#2ECC71', bgColor: '#F0FFF4' },
  DINNER:    { emoji: '🌙', label: 'Vacsora',    color: '#9B59B6', bgColor: '#F8F0FF' },
  SNACK:     { emoji: '🍎', label: 'Snack',      color: '#FF6B35', bgColor: '#FFF0EA' },
  OTHER:     { emoji: '🍽️', label: 'Egyéb',     color: '#4A90D9', bgColor: '#EBF4FF' },
};

interface LogEntry {
  id: string;
  foodName: string;
  amount: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface MealCardProps {
  mealType: string;
  logs: LogEntry[];
  onDeleteLog?: (id: string) => void;
}

export default function MealCard({ mealType, logs, onDeleteLog }: MealCardProps) {
  const [expanded, setExpanded] = useState(true);
  const meta = MEAL_META[mealType] ?? MEAL_META.OTHER;

  const totalKcal = logs.reduce((sum, l) => sum + l.kcal, 0);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((v) => !v);
  };

  return (
    <GlassCardSimple
      padding={0}
      backgroundColor={meta.bgColor}
      borderColor={meta.color + '30'}
      style={styles.card}
    >
      {/* Fejléc */}
      <Pressable style={styles.header} onPress={toggle}>
        <View style={[styles.iconCircle, { backgroundColor: meta.color + '20' }]}>
          <Text style={styles.mealEmoji}>{meta.emoji}</Text>
        </View>
        <View style={styles.headerText}>
          <Text style={styles.mealLabel}>{meta.label}</Text>
          <Text style={styles.mealCount}>{logs.length} tétel</Text>
        </View>
        <View style={styles.headerRight}>
          <Text style={[styles.mealKcal, { color: meta.color }]}>
            {Math.round(totalKcal)} kcal
          </Text>
          <Text style={styles.chevron}>{expanded ? '▲' : '▼'}</Text>
        </View>
      </Pressable>

      {/* Bejegyzések listája */}
      {expanded && (
        <View style={styles.entries}>
          {logs.map((log, idx) => (
            <View
              key={log.id}
              style={[
                styles.entryRow,
                idx < logs.length - 1 && styles.entryDivider,
              ]}
            >
              <View style={styles.entryMain}>
                <Text style={styles.entryName} numberOfLines={1}>
                  {log.foodName}
                </Text>
                <Text style={styles.entryMacros}>
                  F: {Math.round(log.protein)}g · Sz: {Math.round(log.carbs)}g · Zs: {Math.round(log.fat)}g
                </Text>
              </View>
              <View style={styles.entryRight}>
                <Text style={styles.entryAmount}>{log.amount}g</Text>
                <Text style={[styles.entryKcal, { color: meta.color }]}>
                  {Math.round(log.kcal)} kcal
                </Text>
              </View>
              {onDeleteLog && (
                <Pressable
                  style={styles.deleteBtn}
                  onPress={() => onDeleteLog(log.id)}
                  hitSlop={8}
                >
                  <Text style={styles.deleteIcon}>✕</Text>
                </Pressable>
              )}
            </View>
          ))}
        </View>
      )}
    </GlassCardSimple>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 10,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealEmoji: { fontSize: 22 },
  headerText: { flex: 1 },
  mealLabel: { ...Typography.bodyMedium, color: Colors.text.primary },
  mealCount: { ...Typography.caption, color: Colors.text.muted, marginTop: 1 },
  headerRight: { alignItems: 'flex-end', gap: 2 },
  mealKcal: { fontSize: 16, fontWeight: '800' },
  chevron: { fontSize: 10, color: Colors.text.muted },
  entries: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
    paddingHorizontal: 14,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 8,
  },
  entryDivider: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  entryMain: { flex: 1 },
  entryName: { ...Typography.bodyMedium, color: Colors.text.primary, fontSize: 14 },
  entryMacros: { ...Typography.caption, color: Colors.text.muted, marginTop: 2 },
  entryRight: { alignItems: 'flex-end', gap: 1 },
  entryAmount: { ...Typography.caption, color: Colors.text.muted },
  entryKcal: { fontSize: 13, fontWeight: '700' },
  deleteBtn: { padding: 4 },
  deleteIcon: { fontSize: 12, color: Colors.text.muted },
});
