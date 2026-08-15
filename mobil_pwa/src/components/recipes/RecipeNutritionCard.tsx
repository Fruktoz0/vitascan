import { useTranslation } from 'react-i18next';
import { Colors } from '../../design/tokens';
import { IconEggAlt, IconFire, IconGrain, IconOpacity } from '../ui/Icons';
import { RecipeDietBadges } from './RecipeDietBadges';
import type { RecipeDietTag, RecipeNutrition } from '../../services/api';
import styles from './RecipeNutritionCard.module.css';

export function RecipeNutritionCard({
  nutrition,
  dietTags,
}: {
  nutrition: RecipeNutrition;
  dietTags?: RecipeDietTag[] | null;
}) {
  const { t } = useTranslation();
  const title = nutrition.incomplete ? t('recipes.nutritionPartial') : t('recipes.nutritionTitle');

  return (
    <section className={styles.card}>
      <h3 className={styles.title}>{title}</h3>
      <div className={styles.kcalRow}>
        <span className={styles.kcalIcon}>
          <IconFire size={18} color={Colors.macro.kcal} />
        </span>
        <span className={styles.kcalValue}>{nutrition.kcal}</span>
        <span className={styles.kcalUnit}>kcal / {t('recipes.servings').toLowerCase()}</span>
      </div>
      <div className={styles.macros}>
        <div className={styles.macro}>
          <span className={styles.macroIcon} style={{ background: Colors.dashboard.proteinBg }}>
            <IconEggAlt size={16} color={Colors.dashboard.proteinFill} />
          </span>
          <span className={styles.macroVal}>{nutrition.protein}g</span>
          <span className={styles.macroLbl}>{t('food.protein')}</span>
        </div>
        <div className={styles.macro}>
          <span className={styles.macroIcon} style={{ background: Colors.dashboard.carbsBg }}>
            <IconGrain size={16} color={Colors.dashboard.carbsFill} />
          </span>
          <span className={styles.macroVal}>{nutrition.carbs}g</span>
          <span className={styles.macroLbl}>{t('food.carbs')}</span>
        </div>
        <div className={styles.macro}>
          <span className={styles.macroIcon} style={{ background: Colors.dashboard.fatBg }}>
            <IconOpacity size={16} color={Colors.dashboard.fatFill} />
          </span>
          <span className={styles.macroVal}>{nutrition.fat}g</span>
          <span className={styles.macroLbl}>{t('food.fat')}</span>
        </div>
      </div>
      <RecipeDietBadges tags={dietTags} />
    </section>
  );
}
