import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Colors } from '../../design/tokens';
import type { StructuredDailyAnalysis, MealTypeKey } from '../../utils/parseAnalysisContent';

const MEAL_LABEL_KEY: Record<MealTypeKey, string> = {
  BREAKFAST: 'food.breakfast',
  TIZORAI: 'food.tizorai',
  LUNCH: 'food.lunch',
  UZSONNA: 'food.uzsonna',
  DINNER: 'food.dinner',
  SNACK: 'food.snack',
};

function BulletList({
  items,
  variant,
  label,
}: {
  items: string[];
  variant: 'positive' | 'negative';
  label: string;
}) {
  if (items.length === 0) return null;
  const chipStyle = variant === 'positive' ? styles.chipPositive : styles.chipNegative;
  return (
    <View style={styles.block}>
      <View style={[styles.chip, chipStyle]}>
        <Text style={styles.chipText}>{label}</Text>
      </View>
      {items.map((item, i) => (
        <Text key={`${variant}-${i}`} style={styles.bullet}>
          • {item}
        </Text>
      ))}
    </View>
  );
}

export function AnalysisResultView({ data }: { data: StructuredDailyAnalysis }) {
  const { t } = useTranslation();
  const meals = data.meals.filter((m) => m.status === 'evaluated');

  return (
    <View style={styles.root}>
      <View style={styles.mealsBlock}>
        {meals.map((meal) => (
          <View key={meal.mealType} style={styles.mealSection}>
            <Text style={styles.mealTitle}>{t(MEAL_LABEL_KEY[meal.mealType])}</Text>
            <BulletList
              items={meal.positives}
              variant="positive"
              label={t('foodLibraryScreen.analysisPositives', 'Pozitív')}
            />
            <BulletList
              items={meal.negatives}
              variant="negative"
              label={t('foodLibraryScreen.analysisNegatives', 'Javítandó')}
            />
            {meal.positives.length === 0 && meal.negatives.length === 0 && (
              <Text style={styles.skip}>—</Text>
            )}
          </View>
        ))}
      </View>

      <View style={styles.dayPanel}>
        <View style={styles.daySection}>
          <Text style={styles.dayTitle}>
            {t('foodLibraryScreen.analysisSummary', 'Napi összegzés')}
          </Text>
          <BulletList
            items={data.summary.positives}
            variant="positive"
            label={t('foodLibraryScreen.analysisPositives', 'Pozitív')}
          />
          <BulletList
            items={data.summary.negatives}
            variant="negative"
            label={t('foodLibraryScreen.analysisNegatives', 'Javítandó')}
          />
        </View>

        {data.suggestions.length > 0 && (
          <View style={[styles.daySection, styles.daySectionBorder]}>
            <Text style={styles.dayTitle}>
              {t('foodLibraryScreen.analysisSuggestions', 'Javaslatok')}
            </Text>
            {data.suggestions.map((item, i) => (
              <Text key={`tip-${i}`} style={styles.bullet}>
                • {item}
              </Text>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 14 },
  mealsBlock: {},
  mealSection: {
    paddingVertical: 10,
    borderBottomWidth: 0.8,
    borderBottomColor: Colors.dashboard.outlineVariant,
    borderStyle: 'dashed',
  },
  mealTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.dashboard.stroke,
    marginBottom: 8,
  },
  skip: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.dashboard.tabInactive,
  },
  dayPanel: {
    marginTop: 4,
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 12,
    borderWidth: 1.5,
    borderColor: Colors.dashboard.stroke,
    borderRadius: 16,
    backgroundColor: Colors.dashboard.softBlue,
    gap: 4,
  },
  daySection: {
    gap: 4,
  },
  daySectionBorder: {
    marginTop: 10,
    paddingTop: 12,
    borderTopWidth: 0.8,
    borderTopColor: Colors.dashboard.stroke,
    borderStyle: 'dashed',
  },
  dayTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: Colors.dashboard.stroke,
    marginBottom: 6,
  },
  block: { marginBottom: 8 },
  chip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.dashboard.stroke,
    marginBottom: 4,
  },
  chipPositive: { backgroundColor: Colors.dashboard.softGreen },
  chipNegative: { backgroundColor: '#ffe8cc' },
  chipText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.dashboard.stroke,
  },
  bullet: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
    color: Colors.dashboard.stroke,
    marginTop: 2,
  },
});
