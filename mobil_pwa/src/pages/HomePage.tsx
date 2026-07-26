import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { GlassCardSimple } from '../components/ui/GlassCard';
import KcalRing from '../components/ui/KcalRing';
import { MacroChip } from '../components/ui/MacroBar';
import WaterProgressBar from '../components/ui/WaterProgressBar';
import { AddFoodManualModal, FoodDetailModal, EditLogModal, distinctBrand, type DailyLogItem } from '../components/food/FoodModals';
import { IconAdd, IconAddCircle, IconCalendarToday, IconRestaurant, IconWeight } from '../components/ui/Icons';
import { Colors } from '../design/tokens';
import { statsApi, waterApi, weightApi, type Food } from '../services/api';
import { useDateStore } from '../stores/dateStore';
import { useProfileStore } from '../stores/profileStore';
import { UserAvatar } from '../components/ui/AvatarPicker';
import { MEAL_META, type MealType } from '../utils/mealMeta';
import styles from './HomePage.module.css';


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

function fmtMacro(n: number) {
  return Math.round(n * 10) / 10;
}

function MealSection({
  meal,
  label,
  logs,
  onAdd,
  onEditLog,
  customRadius,
}: {
  meal: MealType;
  label: string;
  logs: any[];
  onAdd: () => void;
  onEditLog: (log: DailyLogItem) => void;
  customRadius?: {
    borderTopLeftRadius?: number;
    borderTopRightRadius?: number;
    borderBottomRightRadius?: number;
    borderBottomLeftRadius?: number;
  };
}) {
  const totals = sumMeal(logs);
  const meta = MEAL_META[meal];
  const MealIcon = meta.Icon;
  return (
    <GlassCardSimple
      backgroundColor="#FFFFFF"
      padding={14}
      shadowOffset={2}
      customRadius={customRadius}
    >
      <div className={styles.mealSection}>
        <div className={styles.mealRow}>
          <div className={styles.mealRowLeft}>
            <span className={styles.mealIconCircle} style={{ background: meta.bg }}>
              <MealIcon size={13} color={Colors.dashboard.stroke} />
            </span>
            <div className={styles.mealRowText}>
              <span className={styles.mealRowLabel}>{label}</span>
              <span className={styles.mealRowKcal}>{Math.round(totals.kcal)} kcal</span>
              <span className={styles.mealRowMacros}>
                F {fmtMacro(totals.protein)}g · Sz {fmtMacro(totals.carbs)}g · Zs {fmtMacro(totals.fat)}g
              </span>
            </div>
          </div>
          <button type="button" className={styles.mealRowAddBtn} onClick={onAdd}>
            <IconAdd size={16} color={Colors.dashboard.stroke} />
          </button>
        </div>
        {logs.length > 0 && (
          <div className={styles.mealItems}>
            {logs.map((log) => {
              const brand = distinctBrand(log.foodName, log.brand);
              return (
              <button
                key={log.id}
                type="button"
                className={styles.mealFoodItem}
                onClick={() => onEditLog(log)}
              >
                <div className={styles.mealFoodLeft}>
                  <span className={styles.mealFoodName}>{log.foodName}</span>
                  {brand ? <span className={styles.mealFoodBrand}>{brand}</span> : null}
                  <span className={styles.mealFoodMeta}>{Math.round(log.amount ?? 100)}g</span>
                </div>
                <div className={styles.mealFoodRight}>
                  <span className={styles.mealFoodKcal}>{Math.round(log.kcal)} kcal</span>
                  <span className={styles.mealFoodMacros}>
                    F {fmtMacro(log.protein)} · Sz {fmtMacro(log.carbs)} · Zs {fmtMacro(log.fat)}
                  </span>
                </div>
              </button>
              );
            })}
          </div>
        )}
      </div>
    </GlassCardSimple>
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
  const [selectedLog, setSelectedLog] = useState<DailyLogItem | null>(null);
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
      const base =
        typeof weight?.weightKg === 'number'
          ? weight.weightKg
          : typeof weight?.suggestedWeightKg === 'number'
            ? weight.suggestedWeightKg
            : null;
      if (base == null) return;
      const nextWeight = Math.max(20, Math.min(500, Math.round((base + delta) * 10) / 10));
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
  const goals = data?.goals ?? {
    dailyKcalGoal: 2200,
    dailyProteinGoal: 140,
    dailyCarbsGoal: 250,
    dailyFatGoal: 65,
  };
  const breakfastLogs = data?.byMealType?.BREAKFAST ?? [];
  const tizoraiLogs = data?.byMealType?.TIZORAI ?? [];
  const lunchLogs = data?.byMealType?.LUNCH ?? [];
  const uzsonnaLogs = data?.byMealType?.UZSONNA ?? [];
  const dinnerLogs = data?.byMealType?.DINNER ?? [];
  const weightValue = typeof weight?.weightKg === 'number' ? weight.weightKg.toFixed(1) : '--';
  const todayStr = new Date().toISOString().split('T')[0];
  const selectedDateStr = selectedDate.toISOString().split('T')[0];
  const hasDayWeight = typeof weight?.weightKg === 'number';
  const lastMeasuredText = !hasDayWeight
    ? t('homeScreen.weightNoMeasurement')
    : selectedDateStr === todayStr
      ? t('homeScreen.weightLastMeasuredToday')
      : t('homeScreen.weightMeasuredOnDay', {
          date: selectedDate.toLocaleDateString(
            i18n.language === 'hu' ? 'hu-HU' : 'en-US',
            { month: 'short', day: 'numeric' },
          ),
        });

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
          <MacroChip
            type="protein"
            value={totals.protein}
            goal={goals.dailyProteinGoal ?? 140}
            onClick={() => navigate('/goals?focus=protein')}
          />
          <MacroChip
            type="carbs"
            value={totals.carbs}
            goal={goals.dailyCarbsGoal ?? 250}
            onClick={() => navigate('/goals?focus=carbs')}
          />
          <MacroChip
            type="fat"
            value={totals.fat}
            goal={goals.dailyFatGoal ?? 65}
            onClick={() => navigate('/goals?focus=fat')}
          />
        </div>

        <GlassCardSimple
          backgroundColor={Colors.dashboard.card}
          padding={16}
          customRadius={{
            borderTopLeftRadius: 32,
            borderTopRightRadius: 16,
            borderBottomRightRadius: 24,
            borderBottomLeftRadius: 32,
          }}
        >
          <div className={styles.mealsBlock}>
            <div className={styles.nutritionHeader}>
              <span className={styles.nutritionIconCircle}>
                <span className={styles.nutritionIconShadow} />
                <span className={styles.nutritionIconInner}>
                  <IconRestaurant size={20} color={Colors.dashboard.nutritionIcon} />
                </span>
              </span>
              <span className={styles.nutritionTitle}>{t('homeScreen.todayMeals')}</span>
            </div>
            <div className={styles.mealCards}>
              <MealSection
                meal="BREAKFAST"
                label={t('food.breakfast')}
                logs={breakfastLogs}
                onAdd={() => openAddFood('BREAKFAST')}
                onEditLog={setSelectedLog}
                customRadius={{
                  borderTopLeftRadius: 22,
                  borderTopRightRadius: 14,
                  borderBottomRightRadius: 18,
                  borderBottomLeftRadius: 16,
                }}
              />
              <MealSection
                meal="TIZORAI"
                label={t('food.tizorai')}
                logs={tizoraiLogs}
                onAdd={() => openAddFood('TIZORAI')}
                onEditLog={setSelectedLog}
                customRadius={{
                  borderTopLeftRadius: 16,
                  borderTopRightRadius: 22,
                  borderBottomRightRadius: 14,
                  borderBottomLeftRadius: 20,
                }}
              />
              <MealSection
                meal="LUNCH"
                label={t('food.lunch')}
                logs={lunchLogs}
                onAdd={() => openAddFood('LUNCH')}
                onEditLog={setSelectedLog}
                customRadius={{
                  borderTopLeftRadius: 20,
                  borderTopRightRadius: 14,
                  borderBottomRightRadius: 22,
                  borderBottomLeftRadius: 16,
                }}
              />
              <MealSection
                meal="UZSONNA"
                label={t('food.uzsonna')}
                logs={uzsonnaLogs}
                onAdd={() => openAddFood('UZSONNA')}
                onEditLog={setSelectedLog}
                customRadius={{
                  borderTopLeftRadius: 14,
                  borderTopRightRadius: 20,
                  borderBottomRightRadius: 16,
                  borderBottomLeftRadius: 22,
                }}
              />
              <MealSection
                meal="DINNER"
                label={t('food.dinner')}
                logs={dinnerLogs}
                onAdd={() => openAddFood('DINNER')}
                onEditLog={setSelectedLog}
                customRadius={{
                  borderTopLeftRadius: 22,
                  borderTopRightRadius: 16,
                  borderBottomRightRadius: 18,
                  borderBottomLeftRadius: 20,
                }}
              />
            </div>
          </div>
        </GlassCardSimple>

        <WaterProgressBar
          totalMl={water?.totalMl ?? 0}
          goalMl={water?.goalMl ?? 2500}
          onAdjust={handleAdjustWater}
          onOpenLog={() => navigate('/water')}
        />

        <div className={styles.weightWrap}>
          <span className={styles.weightShadow} />
          <div className={styles.weightCard}>
            <button
              type="button"
              className={styles.weightTopBtn}
              onClick={() => navigate('/weight')}
            >
              <div className={styles.weightTitleRow}>
                <span className={styles.weightIcon}>
                  <IconWeight size={16} color={Colors.dashboard.stroke} />
                </span>
                <div>
                  <div className={styles.weightTitle}>{t('homeScreen.weight')}</div>
                  <div className={styles.weightSub}>{lastMeasuredText}</div>
                </div>
              </div>
              <div>
                <span className={styles.weightNum}>{weightValue}</span>
                <span className={styles.weightUnit}> kg</span>
              </div>
            </button>
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
        }}
        onOpenScanner={() => navigate('/scanner')}
        onOpenAiRecognize={() =>
          navigate(`/ai-recognize?mealType=${mealForAdd}`)
        }
      />
      <FoodDetailModal
        food={selectedFood}
        visible={!!selectedFood}
        onClose={() => setSelectedFood(null)}
        onLogAdded={() => {
          setSelectedFood(null);
          setManualOpen(false);
          fetchData();
        }}
        logSource="SEARCH"
        initialMealType={mealForAdd}
      />
      <EditLogModal
        log={selectedLog}
        visible={!!selectedLog}
        onClose={() => setSelectedLog(null)}
        onSaved={fetchData}
      />
    </div>
  );
}
