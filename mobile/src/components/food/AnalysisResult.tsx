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
  variant: 'positive' | 'negative' | 'tip';
  label: string;
}) {
  if (items.length === 0) return null;
  const chipStyle =
    variant === 'positive'
      ? styles.chipPositive
      : variant === 'negative'
        ? styles.chipNegative
        : styles.chipTip;
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

  return (
    <View style={styles.root}>
      {data.meals.map((meal) => (
        <View key={meal.mealType} style={styles.mealSection}>
          <Text style={styles.mealTitle}>{t(MEAL_LABEL_KEY[meal.mealType])}</Text>
          {meal.status === 'empty_ok' && (
            <Text style={styles.skip}>
              {t('foodLibraryScreen.analysisEmptyOk', 'Még nincs rögzítve')}
            </Text>
          )}
          {meal.status === 'empty_missed' && (
            <>
              <Text style={styles.skip}>
                {t('foodLibraryScreen.analysisEmptyMissed', 'Nem került rögzítésre')}
              </Text>
              <BulletList
                items={meal.negatives}
                variant="negative"
                label={t('foodLibraryScreen.analysisNegatives', 'Javítandó')}
              />
            </>
          )}
          {meal.status === 'evaluated' && (
            <>
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
            </>
          )}
        </View>
      ))}

      <View style={styles.mealSection}>
        <Text style={styles.mealTitle}>
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
        <View style={[styles.mealSection, styles.lastSection]}>
          <Text style={styles.mealTitle}>
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
  );
}

const styles = StyleSheet.create({
  root: { gap: 4 },
  mealSection: {
    paddingVertical: 10,
    borderBottomWidth: 0.8,
    borderBottomColor: Colors.dashboard.outlineVariant,
    borderStyle: 'dashed',
  },
  lastSection: { borderBottomWidth: 0, paddingBottom: 0 },
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
  chipTip: { backgroundColor: Colors.dashboard.softBlue },
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
