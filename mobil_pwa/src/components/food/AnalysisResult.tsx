import { useTranslation } from 'react-i18next';
import type { StructuredDailyAnalysis, MealTypeKey } from '../../utils/parseAnalysisContent';
import styles from './AnalysisResult.module.css';

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
  return (
    <div className={styles.block}>
      <div className={`${styles.blockLabel} ${styles[variant]}`}>{label}</div>
      <ul className={styles.list}>
        {items.map((item, i) => (
          <li key={`${variant}-${i}`} className={styles.listItem}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AnalysisResultView({
  data,
  hideMeals = false,
}: {
  data: StructuredDailyAnalysis;
  /** Fitness coach overview: skip per-meal blocks */
  hideMeals?: boolean;
}) {
  const { t } = useTranslation();
  const meals = hideMeals ? [] : data.meals.filter((m) => m.status === 'evaluated');

  return (
    <div className={styles.root}>
      {!hideMeals && meals.length > 0 && (
        <div className={styles.mealsBlock}>
          {meals.map((meal) => (
            <section key={meal.mealType} className={styles.mealSection}>
              <h3 className={styles.mealTitle}>{t(MEAL_LABEL_KEY[meal.mealType])}</h3>
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
                <p className={styles.skip}>—</p>
              )}
            </section>
          ))}
        </div>
      )}

      <div className={styles.dayPanel}>
        <section className={styles.daySection}>
          <h3 className={styles.dayTitle}>
            {hideMeals
              ? t('fitness.aiOverview', 'Napi edzői összkép')
              : t('foodLibraryScreen.analysisSummary', 'Napi összegzés')}
          </h3>
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
        </section>

        {data.suggestions.length > 0 && (
          <section className={styles.daySection}>
            <h3 className={styles.dayTitle}>
              {hideMeals
                ? t('fitness.aiCoachTips', 'Edzői javaslatok')
                : t('foodLibraryScreen.analysisSuggestions', 'Javaslatok')}
            </h3>
            <ul className={styles.list}>
              {data.suggestions.map((item, i) => (
                <li key={`tip-${i}`} className={styles.listItem}>
                  {item}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
