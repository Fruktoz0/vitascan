import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { GlassCardSimple } from '../components/ui/GlassCard';
import KcalRing from '../components/ui/KcalRing';
import { MacroChip } from '../components/ui/MacroBar';
import WaterProgressBar from '../components/ui/WaterProgressBar';
import { AddFoodManualModal, FoodDetailModal } from '../components/food/FoodModals';
import { IconAdd, IconAddCircle, IconCalendarToday, IconRestaurant, IconWeight } from '../components/ui/Icons';
import { Colors } from '../design/tokens';
import { statsApi, waterApi, weightApi, type Food } from '../services/api';
import { useProfileStore } from '../stores/profileStore';
import { UserAvatar } from '../components/ui/AvatarPicker';

type MealType = 'BREAKFAST' | 'TIZORAI' | 'LUNCH' | 'UZSONNA' | 'DINNER' | 'SNACK';

function sumMeal(logs: any[] | undefined) {
  return (logs ?? []).reduce(
    (acc, l) => ({
      kcal: acc.kcal + (l.kcal ?? 0),
      protein: acc.protein + (l.protein ?? 0),
      carbs: acc.carbs + (l.carbs ?? 0),
      fat: acc.fat + (l.fat ?? 0),
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

function MealRow({
  label,
  kcal,
  protein,
  carbs,
  fat,
  onAdd,
}: {
  label: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  onAdd: () => void;
}) {
  return (
    <div className={styles.mealRow}>
      <div className={styles.mealRowLeft}>
        <span className={styles.mealRowLabel}>{label}:</span>
        <span className={styles.mealRowKcal}>{Math.round(kcal)} kcal</span>
        <span className={styles.mealRowMacros}>
          F {Math.round(protein * 10) / 10}g · Sz {Math.round(carbs * 10) / 10}g · Zs {Math.round(fat * 10) / 10}g
        </span>
      </div>
      <button type="button" className={styles.mealRowAddBtn} onClick={onAdd}>
        <IconAdd size={16} color={Colors.dashboard.stroke} />
      </button>
    </div>
  );
}

export default function HomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { selectedDate, changeDateBy } = useDateStore();
  const avatarKey = useProfileStore((s) => s.avatarKey);
  const [data, setData] = useState<any>(null);
  const [water, setWater] = useState<any>(null);
  const [weight, setWeight] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [manualOpen, setManualOpen] = useState(false);
  const [selectedFood, setSelectedFood] = useState<Food | null>(null);
  const [mealForAdd, setMealForAdd] = useState<MealType>('SNACK');
  const touchStartX = useRef<number | null>(null);

  const openAddFood = (meal: MealType) => {
    setMealForAdd(meal);
    setManualOpen(true);
  };

  const getHeaderDateText = () => {
    const today = new Date();
    const current = new Date(selectedDate);
    today.setHours(0, 0, 0, 0);
    current.setHours(0, 0, 0, 0);
    const diffDays = Math.round((current.getTime() - today.getTime()) / 86400000);
    if (diffDays === 0) return t('date.today');
    if (diffDays === 1) return t('date.tomorrow');
    if (diffDays === -1) return t('date.yesterday');
    return current.toLocaleDateString(i18n.language === 'hu' ? 'hu-HU' : 'en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const dateStr = selectedDate.toISOString().split('T')[0];
      const [summary, waterData, weightData] = await Promise.all([
        statsApi.day(dateStr),
        waterApi.getByDate(dateStr),
        weightApi.getByDate(dateStr),
      ]);
      setData(summary);
      setWater(waterData);
      setWeight(weightData);
    } catch {}
    setLoading(false);
  }, [selectedDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAdjustWater = async (ml: number) => {
    try {
      const dateStr = selectedDate.toISOString().split('T')[0];
      setWater(await waterApi.adjust(ml, dateStr));
    } catch {}
  };

  const handleAdjustWeight = async (delta: number) => {
    try {
      const dateStr = selectedDate.toISOString().split('T')[0];
      const baseWeight = typeof weight?.weightKg === 'number' ? weight.weightKg : 72.5;
      const nextWeight = Math.max(20, Math.min(500, Math.round((baseWeight + delta) * 10) / 10));
      setWeight(await weightApi.setForDate(dateStr, nextWeight));
    } catch {}
  };

  if (loading && !data) {
    return (
      <div className={styles.screen}>
        <div className={styles.loadingCenter}>
          <div className="spinner" />
        </div>
      </div>
    );
  }

  const totals = data?.totals ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const goals = data?.goals ?? { dailyKcalGoal: 2200 };
  const breakfast = sumMeal(data?.byMealType?.BREAKFAST);
  const tizorai = sumMeal(data?.byMealType?.TIZORAI);
  const lunch = sumMeal(data?.byMealType?.LUNCH);
  const uzsonna = sumMeal(data?.byMealType?.UZSONNA);
  const dinner = sumMeal(data?.byMealType?.DINNER);
  const weightValue = typeof weight?.weightKg === 'number' ? weight.weightKg.toFixed(1) : '--';
  const lastMeasuredText = weight?.lastMeasuredAt
    ? t('homeScreen.weightLastMeasuredToday')
    : t('homeScreen.weightNoMeasurement');

  return (
    <div
      className={`${styles.screen} page-scroll`}
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0].clientX;
      }}
      onTouchEnd={(e) => {
        if (touchStartX.current == null) return;
        const dx = e.changedTouches[0].clientX - touchStartX.current;
        if (dx > 50) changeDateBy(-1);
        else if (dx < -50) changeDateBy(1);
        touchStartX.current = null;
      }}
    >
      <div className={`${styles.blob} ${styles.blobMint}`} />
      <div className={`${styles.blob} ${styles.blobPeach}`} />
      <div className={`${styles.blob} ${styles.blobLavender}`} />

      <header className={styles.topBar}>
        <div className={styles.avatar}>
          <UserAvatar avatarKey={avatarKey} size={40} />
        </div>
        <h1 className={styles.dateTitle}>{getHeaderDateText()}</h1>
        <button type="button" className={styles.calendarBtn} onClick={() => navigate('/date-picker')}>
          <span className={styles.calendarShadow} />
          <span className={styles.calendarInner}>
            <IconCalendarToday size={20} color={Colors.dashboard.stroke} />
          </span>
        </button>
      </header>

      <div className={styles.content}>
        <GlassCardSimple
          backgroundColor={Colors.dashboard.card}
          padding={24}
          customRadius={{
            borderTopLeftRadius: 24,
            borderTopRightRadius: 16,
            borderBottomRightRadius: 32,
            borderBottomLeftRadius: 16,
          }}
        >
          <div className={styles.kcalRow}>
            <div>
              <div className={styles.kcalLabel}>CALORIES</div>
              <div className={styles.kcalValue}>{Math.round(totals.kcal).toLocaleString('en-US')}</div>
              <div className={styles.kcalSub}>/ {Math.round(goals.dailyKcalGoal).toLocaleString('en-US')} kcal</div>
            </div>
            <KcalRing consumed={totals.kcal} goal={goals.dailyKcalGoal} size={100} strokeWidth={8} />
          </div>
        </GlassCardSimple>

        <div className={styles.macroRow}>
          <MacroChip type="protein" value={totals.protein} goal={140} />
          <MacroChip type="carbs" value={totals.carbs} goal={250} />
          <MacroChip type="fat" value={totals.fat} goal={65} />
        </div>

        <div className={styles.weightWrap}>
          <span className={styles.weightShadow} />
          <div className={styles.weightCard}>
            <div className={styles.weightTop}>
              <div className={styles.weightTitleRow}>
                <span className={styles.weightIcon}>
                  <IconWeight size={16} color={Colors.dashboard.stroke} />
                </span>
                <div>
                  <div className={styles.weightTitle}>Súly</div>
                  <div className={styles.weightSub}>{lastMeasuredText}</div>
                </div>
              </div>
              <div>
                <span className={styles.weightNum}>{weightValue}</span>
                <span className={styles.weightUnit}> kg</span>
              </div>
            </div>
            <div className={styles.weightActions}>
              <button type="button" className={styles.weightBtn} onClick={() => handleAdjustWeight(-0.1)}>
                −
              </button>
              <button type="button" className={styles.weightBtn} onClick={() => handleAdjustWeight(0.1)}>
                +
              </button>
            </div>
          </div>
        </div>

        <WaterProgressBar totalMl={water?.totalMl ?? 0} goalMl={water?.goalMl ?? 2500} onAdjust={handleAdjustWater} />

        <GlassCardSimple
          backgroundColor={Colors.dashboard.card}
          padding={20}
          customRadius={{
            borderTopLeftRadius: 32,
            borderTopRightRadius: 16,
            borderBottomRightRadius: 24,
            borderBottomLeftRadius: 32,
          }}
        >
          <div className={styles.nutritionHeader}>
            <IconRestaurant size={20} color={Colors.dashboard.nutritionIcon} />
            <span className={styles.nutritionTitle}>{t('homeScreen.todayMeals')}</span>
          </div>
          <MealRow label={t('food.breakfast')} {...breakfast} onAdd={() => openAddFood('BREAKFAST')} />
          <div className={styles.mealDivider} />
          <MealRow label={t('food.tizorai')} {...tizorai} onAdd={() => openAddFood('TIZORAI')} />
          <div className={styles.mealDivider} />
          <MealRow label={t('food.lunch')} {...lunch} onAdd={() => openAddFood('LUNCH')} />
          <div className={styles.mealDivider} />
          <MealRow label={t('food.uzsonna')} {...uzsonna} onAdd={() => openAddFood('UZSONNA')} />
          <div className={styles.mealDivider} />
          <MealRow label={t('food.dinner')} {...dinner} onAdd={() => openAddFood('DINNER')} />
        </GlassCardSimple>

        <button type="button" className={styles.addFoodOuter} onClick={() => openAddFood('SNACK')}>
          <span className={styles.addFoodShadow} />
          <span className={styles.addFoodBtn}>
            <IconAddCircle size={24} color={Colors.dashboard.stroke} />
            <span>{t('homeScreen.addFoodCta')}</span>
          </span>
        </button>
      </div>

      <AddFoodManualModal
        visible={manualOpen}
        onClose={() => setManualOpen(false)}
        onCreated={(food) => {
          setSelectedFood(food);
          setManualOpen(false);
        }}
        onOpenScanner={() => navigate('/scanner')}
      />
      <FoodDetailModal
        food={selectedFood}
        visible={!!selectedFood}
        onClose={() => setSelectedFood(null)}
        onLogAdded={fetchData}
        logSource="SEARCH"
        initialMealType={mealForAdd}
      />
    </div>
  );
}
