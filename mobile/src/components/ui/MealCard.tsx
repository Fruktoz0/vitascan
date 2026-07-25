import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, LayoutAnimation, Platform, UIManager,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Colors, Radius, Typography } from '../../design/tokens';
import { GlassCardSimple } from './GlassCard';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

const MEAL_META_BASE: Record<string, { emoji: string; bgColor: string }> = {
  BREAKFAST: { emoji: '🌅', bgColor: Colors.dashboard.softOrange },
  TIZORAI: { emoji: '🥐', bgColor: Colors.dashboard.primaryFixed },
  LUNCH: { emoji: '☀️', bgColor: Colors.dashboard.softGreen },
  UZSONNA: { emoji: '🍪', bgColor: Colors.dashboard.secondaryContainer },
  DINNER: { emoji: '🌙', bgColor: Colors.dashboard.softBlue },
  SNACK: { emoji: '🍎', bgColor: Colors.dashboard.blobPeach },
  OTHER: { emoji: '🍽️', bgColor: Colors.dashboard.blobLavender },
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
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);
  const labels: Record<string, string> = {
    BREAKFAST: t('food.breakfast'),
    TIZORAI: t('food.tizorai'),
    LUNCH: t('food.lunch'),
    UZSONNA: t('food.uzsonna'),
    DINNER: t('food.dinner'),
    SNACK: t('food.snack'),
    OTHER: t('food.other'),
  };
  const metaBase = MEAL_META_BASE[mealType] ?? MEAL_META_BASE.OTHER;
  const meta = { ...metaBase, label: labels[mealType] ?? labels.OTHER };

  const totalKcal = logs.reduce((sum, l) => sum + l.kcal, 0);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((v) => !v);
  };

  return (
    <GlassCardSimple
      padding={0}
      backgroundColor={meta.bgColor}
      borderColor={Colors.dashboard.stroke}
    >
      {/* Fejléc */}
      <Pressable style={styles.header} onPress={toggle}>
        <View style={styles.iconCircle}>
          <Text style={styles.mealEmoji}>{meta.emoji}</Text>
        </View>
        <View style={styles.headerText}>
          <Text style={styles.mealLabel}>{meta.label}</Text>
          <Text style={styles.mealCount}>{logs.length} {t('mealCard.items')}</Text>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.mealKcal}>
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
                  {t('mealCard.proteinShort')}: {Math.round(log.protein)}g · {t('mealCard.carbsShort')}: {Math.round(log.carbs)}g · {t('mealCard.fatShort')}: {Math.round(log.fat)}g
                </Text>
              </View>
              <View style={styles.entryRight}>
                <Text style={styles.entryAmount}>{log.amount}g</Text>
                <Text style={styles.entryKcal}>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.dashboard.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.dashboard.stroke,
  },
  mealEmoji: { fontSize: 22 },
  headerText: { flex: 1 },
  mealLabel: { ...Typography.subtitle, color: Colors.dashboard.stroke },
  mealCount: { ...Typography.caption, color: Colors.text.secondary, marginTop: 2, fontWeight: '600' },
  headerRight: { alignItems: 'flex-end', gap: 4 },
  mealKcal: { fontSize: 16, fontWeight: '800', color: Colors.dashboard.stroke },
  chevron: { fontSize: 12, color: Colors.dashboard.stroke },
  entries: {
    borderTopWidth: 1.5,
    borderTopColor: Colors.dashboard.stroke,
    backgroundColor: Colors.dashboard.card,
    paddingHorizontal: 16,
    borderBottomLeftRadius: 30, // Hogy ne takarja el a kártya sarkát
    borderBottomRightRadius: 30,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 10,
  },
  entryDivider: {
    borderBottomWidth: 1.5,
    borderBottomColor: Colors.dashboard.strokeSoft,
  },
  entryMain: { flex: 1 },
  entryName: { ...Typography.bodyMedium, color: Colors.dashboard.stroke, fontSize: 15 },
  entryMacros: { ...Typography.caption, color: Colors.text.secondary, marginTop: 2, fontWeight: '500' },
  entryRight: { alignItems: 'flex-end', gap: 2 },
  entryAmount: { ...Typography.caption, color: Colors.text.secondary },
  entryKcal: { fontSize: 14, fontWeight: '800', color: Colors.dashboard.stroke },
  deleteBtn: { padding: 4 },
  deleteIcon: { fontSize: 14, color: Colors.dashboard.stroke, fontWeight: '900' },
});
