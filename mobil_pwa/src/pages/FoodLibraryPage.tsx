import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { BentoCard } from '../components/ui/BentoCard';
import { AddFoodManualModal, FoodDetailModal } from '../components/food/FoodModals';
import {
  IconAdd,
  IconBakeryDining,
  IconCalendarToday,
  IconEdit,
  IconEggAlt,
  IconIcecream,
  IconLocalFire,
  IconLunchDining,
  IconRamenDining,
} from '../components/ui/Icons';
import { statsApi, type Food } from '../services/api';
import { useDateStore } from '../stores/dateStore';
import { useProfileStore } from '../stores/profileStore';
import { UserAvatar } from '../components/ui/AvatarPicker';
import { Colors } from '../design/tokens';
import styles from './FoodLibraryPage.module.css';

type MealType = 'BREAKFAST' | 'TIZORAI' | 'LUNCH' | 'UZSONNA' | 'DINNER' | 'SNACK';

const MEAL_META: Record<MealType, { Icon: typeof IconBakeryDining; bg: string }> = {
  BREAKFAST: { Icon: IconBakeryDining, bg: Colors.dashboard.tertiaryFixed },
  TIZORAI: { Icon: IconEggAlt, bg: Colors.dashboard.primaryFixed },
  LUNCH: { Icon: IconLunchDining, bg: Colors.dashboard.errorContainer },
  UZSONNA: { Icon: IconIcecream, bg: Colors.dashboard.secondaryContainer },
  DINNER: { Icon: IconRamenDining, bg: Colors.dashboard.surfaceContainerHigh },
  SNACK: { Icon: IconIcecream, bg: Colors.dashboard.blobPeach },
};

export default function FoodLibraryPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { selectedDate } = useDateStore();
  const avatarKey = useProfileStore((s) => s.avatarKey);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [manualOpen, setManualOpen] = useState(false);
  const [selectedFood, setSelectedFood] = useState<Food | null>(null);
  const [mealForAdd, setMealForAdd] = useState<MealType>('SNACK');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const dateStr = selectedDate.toISOString().split('T')[0];
      setData(await statsApi.day(dateStr));
    } catch {}
    setLoading(false);
  }, [selectedDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const dateTitle = selectedDate.toLocaleDateString(i18n.language === 'hu' ? 'hu-HU' : 'en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const totals = data?.totals ?? { kcal: 0 };
  const meals: MealType[] = ['BREAKFAST', 'TIZORAI', 'LUNCH', 'UZSONNA', 'DINNER', 'SNACK'];
  const labels: Record<MealType, string> = {
    BREAKFAST: t('food.breakfast'),
    TIZORAI: t('food.tizorai'),
    LUNCH: t('food.lunch'),
    UZSONNA: t('food.uzsonna'),
    DINNER: t('food.dinner'),
    SNACK: t('food.snack'),
  };

  return (
    <div className={`${styles.screen} page-scroll`}>
      <header className={styles.header}>
        <div className={styles.avatar}>
          <UserAvatar avatarKey={avatarKey} size={40} />
        </div>
        <h1 className={styles.headerTitle}>{t('foodLibrary')}</h1>
        <button type="button" className={styles.calBtn} onClick={() => navigate('/date-picker')}>
          <span className={styles.calShadow} />
          <span className={styles.calInner}>
            <IconCalendarToday size={20} color={Colors.dashboard.stroke} />
          </span>
        </button>
      </header>

      <div className={styles.summary}>
        <div>
          <div className={styles.todayTitle}>{dateTitle}</div>
          <div className={styles.todaySubtitle}>{Math.round(totals.kcal)} kcal</div>
        </div>
        <div className={styles.fireOuter}>
          <span className={styles.fireShadow} />
          <span className={styles.fireInner}>
            <IconLocalFire size={24} color={Colors.dashboard.stroke} />
          </span>
        </div>
      </div>

      <div className={styles.content}>
        {loading && !data ? (
          <div className={styles.center}>
            <div className="spinner" />
          </div>
        ) : (
          meals.map((meal) => {
            const logs = data?.byMealType?.[meal] ?? [];
            const mealKcal = logs.reduce((a: number, l: any) => a + (l.kcal ?? 0), 0);
            const meta = MEAL_META[meal];
            const MealIcon = meta.Icon;
            return (
              <BentoCard key={meal} backgroundColor={Colors.dashboard.card} padding={16}>
                <div className={styles.mealHead}>
                  <div className={styles.mealTitleRow}>
                    <span className={styles.iconCircle} style={{ background: meta.bg }}>
                      <MealIcon size={28} color={Colors.dashboard.stroke} />
                    </span>
                    <h2 className={styles.mealTitle}>{labels[meal]}</h2>
                  </div>
                  <span className={`${styles.kcalBadge} ${logs.length === 0 ? styles.kcalEmpty : ''}`}>
                    {mealKcal} kcal
                  </span>
                </div>

                {logs.map((log: any) => (
                  <div key={log.id} className={styles.mealItem}>
                    <div>
                      <div className={styles.itemName}>{log.foodName}</div>
                      <div className={styles.itemMeta}>{log.amount ?? 100}g</div>
                    </div>
                    <div className={styles.itemKcal}>{log.kcal} kcal</div>
                  </div>
                ))}

                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.addBtn}
                    onClick={() => {
                      setMealForAdd(meal);
                      setManualOpen(true);
                    }}
                  >
                    <span className={styles.btnShadow} />
                    <span className={styles.addFace}>
                      <IconAdd size={18} color={Colors.dashboard.stroke} /> {t('common.add')}
                    </span>
                  </button>
                  <button type="button" className={styles.editBtn} onClick={() => navigate('/scanner')}>
                    <span className={styles.btnShadow} />
                    <span className={styles.editFace}>
                      <IconEdit size={18} color={Colors.dashboard.stroke} />
                    </span>
                  </button>
                </div>
              </BentoCard>
            );
          })
        )}
      </div>

      <AddFoodManualModal
        visible={manualOpen}
        onClose={() => setManualOpen(false)}
        onCreated={(food) => setSelectedFood(food)}
        onOpenScanner={() => navigate('/scanner')}
      />
      <FoodDetailModal
        food={selectedFood}
        visible={!!selectedFood}
        onClose={() => setSelectedFood(null)}
        onLogAdded={fetchData}
        logSource="MANUAL"
        initialMealType={mealForAdd}
      />
    </div>
  );
}
