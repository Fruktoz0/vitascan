import { useTranslation } from 'react-i18next';
import { Colors } from '../../design/tokens';
import { IconEggAlt, IconFire, IconGrain, IconOpacity } from '../ui/Icons';
import { RecipeDietBadges } from './RecipeDietBadges';
import type { RecipeDietTag, RecipeNutrition } from '../../services/api';
import styles from './RecipeNutritionCard.module.css';

type MacroSet = {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
};

const MACROS = [
  {
    key: 'protein' as const,
    labelKey: 'food.protein',
    Icon: IconEggAlt,
    bg: Colors.dashboard.blobLavender,
    color: Colors.dashboard.proteinFill,
  },
  {
    key: 'carbs' as const,
    labelKey: 'food.carbs',
    Icon: IconGrain,
    bg: Colors.dashboard.tertiaryFixed,
    color: Colors.dashboard.carbsFill,
  },
  {
    key: 'fat' as const,
    labelKey: 'food.fat',
    Icon: IconOpacity,
    bg: Colors.dashboard.blobMint,
    color: Colors.dashboard.fatFill,
  },
];

function round1(v: number) {
  return Math.round(v * 10) / 10;
}

function per100g(nutrition: RecipeNutrition): MacroSet | null {
  const g = nutrition.gramsPerServing;
  if (!g || g <= 0) return null;
  const s = 100 / g;
  return {
    kcal: Math.round(nutrition.kcal * s),
    protein: round1(nutrition.protein * s),
    carbs: round1(nutrition.carbs * s),
    fat: round1(nutrition.fat * s),
  };
}

function fmtG(v: number) {
  return `${Number.isInteger(v) ? v : v.toFixed(1)}g`;
}

function Column({
  label,
  values,
}: {
  label: string;
  values: MacroSet | null;
}) {
  const { t } = useTranslation();
  return (
    <div className={styles.col}>
      <span className={styles.colHead}>{label}</span>
      <div className={styles.kcalBlock}>
        <span className={styles.kcalIcon}>
          <IconFire size={16} color={Colors.macro.kcal} />
        </span>
        <span className={styles.kcal}>{values ? values.kcal : '—'}</span>
        <span className={styles.kcalUnit}>kcal</span>
      </div>
      <div className={styles.macroList}>
        {MACROS.map((macro) => {
          const Icon = macro.Icon;
          return (
            <div key={macro.key} className={styles.macroRow}>
              <span className={styles.macroIcon} style={{ background: macro.bg }}>
                <Icon size={11} color={macro.color} />
              </span>
              <span className={styles.macroLbl}>{t(macro.labelKey)}</span>
              <strong className={styles.macroVal}>{values ? fmtG(values[macro.key]) : '—'}</strong>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function RecipeNutritionCard({
  nutrition,
  dietTags,
}: {
  nutrition: RecipeNutrition;
  dietTags?: RecipeDietTag[] | null;
}) {
  const { t } = useTranslation();
  const title = nutrition.incomplete ? t('recipes.nutritionPartial') : t('recipes.nutritionTitle');
  const serving: MacroSet = {
    kcal: nutrition.kcal,
    protein: nutrition.protein,
    carbs: nutrition.carbs,
    fat: nutrition.fat,
  };

  return (
    <section className={styles.card}>
      <div className={styles.head}>
        <span className={styles.headIcon}>
          <IconFire size={18} color={Colors.macro.kcal} />
        </span>
        <h3 className={styles.title}>{title}</h3>
      </div>
      <div className={styles.cols}>
        <Column label={t('recipes.perServing')} values={serving} />
        <Column label={t('recipes.per100g')} values={per100g(nutrition)} />
      </div>
      <RecipeDietBadges tags={dietTags} />
    </section>
  );
}
