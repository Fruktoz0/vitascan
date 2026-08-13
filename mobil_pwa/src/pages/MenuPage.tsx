import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { IconChevronRight, IconPersonOutline, IconRestaurant, IconTarget } from '../components/ui/Icons';
import styles from './MenuPage.module.css';

export default function MenuPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className={`${styles.screen} page-scroll`}>
      <div className={`${styles.blob} ${styles.blobMint}`} />
      <div className={`${styles.blob} ${styles.blobPeach}`} />
      <div className={`${styles.blob} ${styles.blobLavender}`} />

      <h1 className={styles.pageTitle}>{t('menu.title')}</h1>

      <div className={styles.listWrap}>
        <span className={styles.cardShadow} />
        <div className={styles.listInner}>
          <button type="button" className={styles.row} onClick={() => navigate('/menu/profile')}>
            <span className={`${styles.rowIcon} ${styles.iconProfile}`}>
              <IconPersonOutline size={22} color="#2E7D32" />
            </span>
            <span className={styles.rowText}>
              <span className={styles.rowTitle}>{t('menu.profile')}</span>
              <span className={styles.rowHint}>{t('menu.profileHint')}</span>
            </span>
            <IconChevronRight size={18} color="#B0BEC5" />
          </button>

          <button type="button" className={styles.row} onClick={() => navigate('/goals')}>
            <span className={`${styles.rowIcon} ${styles.iconGoals}`}>
              <IconTarget size={22} color="#1565C0" />
            </span>
            <span className={styles.rowText}>
              <span className={styles.rowTitle}>{t('menu.goals')}</span>
              <span className={styles.rowHint}>{t('menu.goalsHint')}</span>
            </span>
            <IconChevronRight size={18} color="#B0BEC5" />
          </button>

          <button type="button" className={styles.row} onClick={() => navigate('/recipes')}>
            <span className={`${styles.rowIcon} ${styles.iconRecipes}`}>
              <IconRestaurant size={22} color="#E65100" />
            </span>
            <span className={styles.rowText}>
              <span className={styles.rowTitle}>{t('menu.recipes')}</span>
              <span className={styles.rowHint}>{t('menu.recipesHint')}</span>
            </span>
            <IconChevronRight size={18} color="#B0BEC5" />
          </button>
        </div>
      </div>
    </div>
  );
}
