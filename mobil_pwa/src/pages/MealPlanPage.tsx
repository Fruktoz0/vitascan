import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import AuthedImage from '../components/ui/AuthedImage';
import { GlassCardSimple } from '../components/ui/GlassCard';
import MealPlanPickerSheet, { type PickerPick } from '../components/food/MealPlanPickerSheet';
import MealPlanPantry from '../components/food/MealPlanPantry';
import {
  IconAdd,
  IconArrowBack,
  IconBrain,
  IconCalendarMonthOutline,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconClose,
  IconDelete,
  IconEdit,
  IconKitchen,
  IconRestaurant,
  IconShoppingBasket,
} from '../components/ui/Icons';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { SwipeDeleteRow } from '../components/ui/SwipeDeleteRow';
import { Colors } from '../design/tokens';
import { useFastingLogGuard } from '../hooks/useFastingLogGuard';
import { useTierStore } from '../stores/tierStore';
import {
  getErrorMessage,
  mealPlanApi,
  type MealPlanSlot,
  type MealPlanWeek,
} from '../services/api';
import { useCartStore } from '../stores/cartStore';
import { MEAL_META, type MealType } from '../utils/mealMeta';
import {
  addDays,
  PLAN_MEALS,
  parseDateKey,
  setPlanOwnerId,
  startOfIsoWeek,
  weekDates,
} from '../utils/mealPlan';
import { toLocalDateStr } from '../stores/dateStore';
import styles from './MealPlanPage.module.css';

const MEAL_I18N: Record<MealType, string> = {
  BREAKFAST: 'food.breakfast',
  TIZORAI: 'food.tizorai',
  LUNCH: 'food.lunch',
  UZSONNA: 'food.uzsonna',
  DINNER: 'food.dinner',
  SNACK: 'food.snack',
};

const WEEK_HEAD = ['H', 'K', 'Sz', 'Cs', 'P', 'Szo', 'V'];

const DIET_TAGS = ['GLUTEN_FREE', 'DAIRY_FREE', 'SUGAR_FREE', 'VEGAN'] as const;
type DietTag = (typeof DIET_TAGS)[number];
const DIET_I18N: Record<DietTag, string> = {
  GLUTEN_FREE: 'mealPlan.dietGlutenFree',
  DAIRY_FREE: 'mealPlan.dietDairyFree',
  SUGAR_FREE: 'mealPlan.dietSugarFree',
  VEGAN: 'mealPlan.dietVegan',
};

function todayKey() {
  return toLocalDateStr(new Date());
}

function buildMonthWeeks(year: number, month: number): Date[][] {
  const first = new Date(year, month, 1);
  const start = startOfIsoWeek(first);
  const weeks: Date[][] = [];
  let cursor = start;
  for (let w = 0; w < 6; w += 1) {
    const row = Array.from({ length: 7 }, (_, i) => addDays(cursor, i));
    weeks.push(row);
    cursor = addDays(cursor, 7);
    if (cursor.getMonth() !== month && cursor > new Date(year, month + 1, 0)) break;
  }
  return weeks;
}

export default function MealPlanPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { confirmIfActive, dialog: fastingDialog } = useFastingLogGuard();
  const [weekStart, setWeekStart] = useState(() => toLocalDateStr(startOfIsoWeek(new Date())));
  const [ownerId, setOwnerId] = useState<string | undefined>(searchParams.get('ownerId') || undefined);
  const [data, setData] = useState<MealPlanWeek | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => todayKey());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ date: string; meal: MealType } | null>(null);
  const [tab, setTab] = useState<'plan' | 'pantry'>(searchParams.get('tab') === 'pantry' ? 'pantry' : 'plan');
  const [view, setView] = useState<'day' | 'week'>('day');
  const [generating, setGenerating] = useState(false);
  const [usePantry, setUsePantry] = useState(true);
  const [seasonal, setSeasonal] = useState(true);
  const [deductOnPush, setDeductOnPush] = useState(true);
  const [scope, setScope] = useState<'day' | 'week'>('week');
  const [diet, setDiet] = useState<DietTag[]>([]);
  const [matchKcal, setMatchKcal] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const [clearConfirm, setClearConfirm] = useState<'day' | 'week' | null>(null);
  const [slotDelete, setSlotDelete] = useState<MealPlanSlot | null>(null);
  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const isPremium = useTierStore((s) => s.isPremium);
  const fetchTier = useTierStore((s) => s.fetch);
  const premium = isPremium();

  useEffect(() => {
    void fetchTier();
  }, [fetchTier]);

  const toggleDiet = (tag: DietTag) =>
    setDiet((prev) => (prev.includes(tag) ? prev.filter((d) => d !== tag) : [...prev, tag]));

  const locale = i18n.language?.startsWith('en') ? 'en-US' : 'hu-HU';
  const days = useMemo(() => weekDates(weekStart), [weekStart]);
  const today = todayKey();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await mealPlanApi.get({ weekStart, ownerId });
      setData(res);
      setPlanOwnerId(res.isOwn ? null : res.owner.id);
    } catch (err) {
      setError(getErrorMessage(err, t('mealPlan.loadError')));
    } finally {
      setLoading(false);
    }
  }, [weekStart, ownerId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const dates = weekDates(weekStart);
    if (!dates.includes(selectedDate)) setSelectedDate(weekStart);
  }, [weekStart, selectedDate]);

  useEffect(() => {
    const q = searchParams.get('ownerId');
    if (q && q !== ownerId) setOwnerId(q);
    const nextTab = searchParams.get('tab') === 'pantry' ? 'pantry' : 'plan';
    if (nextTab !== tab) setTab(nextTab);
  }, [searchParams, ownerId, tab]);

  const slotsByDayMeal = useMemo(() => {
    const map = new Map<string, MealPlanSlot>();
    for (const slot of data?.slots ?? []) {
      map.set(`${slot.slotDate}:${slot.mealType}`, slot);
    }
    return map;
  }, [data]);

  const weekLabel = useMemo(() => {
    const a = parseDateKey(weekStart);
    const b = addDays(a, 6);
    const fmt = (d: Date) =>
      d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
    return `${fmt(a)} – ${fmt(b)}`;
  }, [weekStart, locale]);

  const shiftWeek = (dir: number) => {
    const next = toLocalDateStr(addDays(parseDateKey(weekStart), dir * 7));
    setWeekStart(next);
    setSelectedDate(next);
  };

  const jumpToDay = (d: Date) => {
    setWeekStart(toLocalDateStr(startOfIsoWeek(d)));
    setSelectedDate(toLocalDateStr(d));
    setView('day');
    setCalOpen(false);
  };

  const jumpToWeek = (mondayDate: Date) => {
    const mon = startOfIsoWeek(mondayDate);
    setWeekStart(toLocalDateStr(mon));
    setSelectedDate(toLocalDateStr(mon));
    setView('week');
    setCalOpen(false);
  };

  const shiftCalMonth = (dir: number) =>
    setCalMonth((prev) => {
      const m = prev.month + dir;
      if (m < 0) return { year: prev.year - 1, month: 11 };
      if (m > 11) return { year: prev.year + 1, month: 0 };
      return { year: prev.year, month: m };
    });

  const switchOwner = (id: string, isOwn: boolean) => {
    const next = isOwn ? undefined : id;
    setOwnerId(next);
    setPlanOwnerId(next ?? null);
    const params = new URLSearchParams(searchParams);
    if (next) params.set('ownerId', next);
    else params.delete('ownerId');
    if (tab === 'pantry') params.set('tab', 'pantry');
    setSearchParams(params, { replace: true });
  };

  const switchTab = (next: 'plan' | 'pantry') => {
    setTab(next);
    const params = new URLSearchParams(searchParams);
    if (next === 'pantry') params.set('tab', 'pantry');
    else params.delete('tab');
    setSearchParams(params, { replace: true });
  };

  const applyPick = async (date: string, meal: MealType, pick: PickerPick) => {
    try {
      await mealPlanApi.upsertSlot({
        weekStart,
        ownerId,
        slotDate: date,
        mealType: meal,
        source: pick.source,
        recipeId: pick.source === 'RECIPE' ? pick.recipeId : null,
        templateId: pick.source === 'TEMPLATE' ? pick.templateId : null,
        servings: pick.source === 'SKIPPED' ? 1 : pick.servings,
      });
      setPicker(null);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, t('mealPlan.saveError')));
    }
  };

  const handleLog = async (slot: MealPlanSlot) => {
    setBusyId(slot.id);
    setError('');
    try {
      await confirmIfActive();
      await mealPlanApi.logSlot(slot.id, {
        date: slot.slotDate,
        servings: slot.servings,
        deductPantry: deductOnPush,
      });
      await load();
    } catch (err) {
      setError(getErrorMessage(err, t('mealPlan.logError')));
    } finally {
      setBusyId(null);
    }
  };

  const handleClearDay = async () => {
    try {
      await mealPlanApi.deleteDay(selectedDate, { ownerId });
      await load();
    } catch (err) {
      setError(getErrorMessage(err, t('mealPlan.saveError')));
    }
  };

  const handleClearWeek = async () => {
    try {
      for (const d of days) {
        await mealPlanApi.deleteDay(d, { ownerId });
      }
      await load();
    } catch (err) {
      setError(getErrorMessage(err, t('mealPlan.saveError')));
    }
  };

  const handleDeleteSlot = async (alsoDiary: boolean) => {
    if (!slotDelete) return;
    const id = slotDelete.id;
    setSlotDelete(null);
    try {
      await mealPlanApi.deleteSlot(id, alsoDiary);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, t('mealPlan.saveError')));
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setError('');
    try {
      const res = await mealPlanApi.generate({
        weekStart,
        ownerId,
        usePantry,
        seasonal,
        scope,
        date: scope === 'day' ? selectedDate : undefined,
        diet: premium && diet.length ? diet : undefined,
        matchKcal: premium ? matchKcal : undefined,
        locale: i18n.language?.startsWith('en') ? 'en' : 'hu',
      });
      setData(res);
    } catch (err) {
      setError(getErrorMessage(err, t('mealPlan.generateError')));
    } finally {
      setGenerating(false);
    }
  };

  const handleWeekCart = async () => {
    setError('');
    try {
      const missing = await mealPlanApi.missing({ weekStart, ownerId });
      if (missing.lines.length === 0) {
        setError(t('mealPlan.cartEmpty'));
        return;
      }
      const cart = useCartStore.getState();
      if (cart.activeListId) {
        cart.addRecipeIngredients(missing.recipeId, missing.lines);
      } else {
        await mealPlanApi.addToCart({ weekStart, ownerId });
        if (cart.userId) await cart.hydrate(cart.userId);
      }
      useCartStore.getState().openSheet();
    } catch (err) {
      setError(getErrorMessage(err, t('mealPlan.cartError')));
    }
  };

  const renderSlot = (date: string, meal: MealType, compact = false) => {
    const slot = slotsByDayMeal.get(`${date}:${meal}`);
    const meta = MEAL_META[meal];
    const Icon = meta.Icon;
    const filled = Boolean(slot && slot.source !== 'SKIPPED');

    return (
      <div className={compact ? styles.weekSlot : styles.slotRow}>
        <SwipeDeleteRow
          enabled={filled}
          deleteLabel={t('mealPlan.delete')}
          onDelete={() => {
            if (slot) setSlotDelete(slot);
          }}
          editAction={{
            label: t('mealPlan.edit'),
            icon: <IconEdit size={22} color="#E65100" />,
            onClick: () => setPicker({ date, meal }),
          }}
        >
          <div className={styles.slotFace}>
            <button
              type="button"
              className={styles.slot}
              onClick={() => setPicker({ date, meal })}
            >
              <span className={styles.slotIcon} style={{ background: meta.bg }}>
                {slot?.hasImage && slot.recipeId ? (
                  <AuthedImage recipeId={slot.recipeId} alt="" revision={slot.imageRevision} />
                ) : (
                  <Icon size={compact ? 16 : 18} color={Colors.dashboard.stroke} />
                )}
              </span>
              <span className={styles.slotText}>
                <span className={styles.slotMeal}>{t(MEAL_I18N[meal])}</span>
                <span className={styles.slotTitle}>
                  {slot?.source === 'SKIPPED'
                    ? t('mealPlan.skip')
                    : slot?.title || t('mealPlan.emptySlot')}
                </span>
                <span className={styles.slotMeta}>
                  {slot?.logged
                    ? t('mealPlan.logged')
                    : slot?.kcal != null
                      ? t('mealPlan.kcal', { kcal: slot.kcal })
                      : slot
                        ? t('mealPlan.planned')
                        : t('mealPlan.addSlot')}
                </span>
              </span>
              {!filled ? <IconAdd size={20} color={Colors.dashboard.stroke} /> : null}
            </button>
            {filled && slot?.loggable && !slot.logged ? (
              <button
                type="button"
                className={styles.logBtn}
                disabled={busyId === slot.id}
                onClick={() => void handleLog(slot)}
              >
                <span className={styles.btnShadow} />
                <span className={styles.logFace}>
                  {busyId === slot.id ? t('mealPlan.pushing') : t('mealPlan.push')}
                </span>
              </button>
            ) : null}
          </div>
        </SwipeDeleteRow>
      </div>
    );
  };

  return (
    <div className={`${styles.screen} page-scroll`}>
      <div className={`${styles.blob} ${styles.blobMint}`} />
      <div className={`${styles.blob} ${styles.blobPeach}`} />
      <div className={`${styles.blob} ${styles.blobWood}`} />

      <header className={styles.topBar}>
        <button type="button" className={styles.back} onClick={() => navigate('/menu')}>
          <span className={styles.backShadow} />
          <span className={styles.backInner}>
            <IconArrowBack size={22} color={Colors.dashboard.stroke} />
          </span>
        </button>
        <h1 className={styles.pageTitle}>{t('mealPlan.title')}</h1>
        {tab === 'plan' ? (
          <button
            type="button"
            className={styles.back}
            aria-label={t('date.calendar')}
            onClick={() => {
              const d = parseDateKey(selectedDate);
              setCalMonth({ year: d.getFullYear(), month: d.getMonth() });
              setCalOpen(true);
            }}
          >
            <span className={styles.backShadow} />
            <span className={styles.backInner}>
              <IconCalendarMonthOutline size={22} color={Colors.dashboard.stroke} />
            </span>
          </button>
        ) : (
          <span className={styles.back} style={{ visibility: 'hidden' }} />
        )}
      </header>

      {data && data.plans.length > 1 ? (
        <div className={styles.switcher}>
          {data.plans.map((p) => (
            <button
              key={p.ownerId}
              type="button"
              className={`${styles.chip} ${(ownerId ? ownerId === p.ownerId : p.isOwn) ? styles.chipOn : ''}`}
              onClick={() => switchOwner(p.ownerId, p.isOwn)}
            >
              {p.isOwn ? t('mealPlan.ownPlan') : p.username}
            </button>
          ))}
        </div>
      ) : null}

      <div className={styles.switcher}>
        <button
          type="button"
          className={`${styles.chip} ${tab === 'plan' ? styles.chipOn : ''}`}
          onClick={() => switchTab('plan')}
        >
          <IconRestaurant size={16} color={Colors.dashboard.stroke} />
          {t('mealPlan.tabPlan')}
        </button>
        <button
          type="button"
          className={`${styles.chip} ${tab === 'pantry' ? styles.chipOn : ''}`}
          onClick={() => switchTab('pantry')}
        >
          <IconKitchen size={16} color={Colors.dashboard.stroke} />
          {t('mealPlan.tabPantry')}
        </button>
      </div>

      {tab === 'pantry' ? (
        <MealPlanPantry ownerId={ownerId} />
      ) : (
        <>
          <div className={styles.weekCard}>
            <div className={styles.monthRow}>
              <button type="button" onClick={() => shiftWeek(-1)} aria-label={t('mealPlan.weekPrev')}>
                <IconChevronLeft size={24} color={Colors.dashboard.stroke} />
              </button>
              <h2>{weekLabel}</h2>
              <button type="button" onClick={() => shiftWeek(1)} aria-label={t('mealPlan.weekNext')}>
                <IconChevronRight size={24} color={Colors.dashboard.stroke} />
              </button>
            </div>
            <div className={styles.weekHead}>
              {WEEK_HEAD.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            <div className={styles.week}>
              {days.map((d) => {
                const dt = parseDateKey(d);
                const filled = PLAN_MEALS.some((m) => {
                  const s = slotsByDayMeal.get(`${d}:${m}`);
                  return s && s.source !== 'SKIPPED';
                });
                return (
                  <button
                    key={d}
                    type="button"
                    className={`${styles.calDay} ${d === today ? styles.calDayToday : ''} ${d === selectedDate ? styles.calDayOn : ''}`}
                    onClick={() => {
                      setSelectedDate(d);
                      setView('day');
                    }}
                  >
                    <span className={styles.calDayNum}>{dt.getDate()}</span>
                    {filled ? <span className={styles.calDot} /> : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div className={styles.switcher}>
            <button
              type="button"
              className={`${styles.chip} ${view === 'day' ? styles.chipOn : ''}`}
              onClick={() => setView('day')}
            >
              {t('mealPlan.viewDay')}
            </button>
            <button
              type="button"
              className={`${styles.chip} ${view === 'week' ? styles.chipOn : ''}`}
              onClick={() => setView('week')}
            >
              {t('mealPlan.viewWeek')}
            </button>
          </div>

          {error ? <p className={styles.error} style={{ padding: '0 16px 8px' }}>{error}</p> : null}

          <div className={styles.content}>
            <GlassCardSimple
              padding={16}
              customRadius={{
                borderTopLeftRadius: 22,
                borderTopRightRadius: 28,
                borderBottomRightRadius: 18,
                borderBottomLeftRadius: 24,
              }}
            >
              <div className={styles.genCard}>
                <div className={styles.genHeader}>
                  <span className={styles.genIcon}>
                    <IconBrain size={22} color={Colors.dashboard.stroke} />
                  </span>
                  <div className={styles.genHeaderText}>
                    <strong className={styles.genTitle}>{t('mealPlan.genTitle')}</strong>
                    <span className={styles.genSubtitle}>{t('mealPlan.genSubtitle')}</span>
                  </div>
                </div>

                <div className={styles.optBlock}>
                  <span className={styles.optLabel}>{t('mealPlan.scopeLabel')}</span>
                  <div className={styles.segmented}>
                    <button
                      type="button"
                      className={`${styles.seg} ${scope === 'day' ? styles.segOn : ''}`}
                      onClick={() => setScope('day')}
                    >
                      {t('mealPlan.scopeDay')}
                    </button>
                    <button
                      type="button"
                      className={`${styles.seg} ${scope === 'week' ? styles.segOn : ''}`}
                      onClick={() => setScope('week')}
                    >
                      {t('mealPlan.scopeWeek')}
                    </button>
                  </div>
                </div>

                <div className={styles.optBlock}>
                  <span className={styles.optLabel}>{t('mealPlan.usePantryLabel')}</span>
                  <div className={styles.segmented}>
                    <button
                      type="button"
                      className={`${styles.seg} ${usePantry ? styles.segOn : ''}`}
                      onClick={() => setUsePantry(true)}
                    >
                      {t('mealPlan.usePantryYes')}
                    </button>
                    <button
                      type="button"
                      className={`${styles.seg} ${!usePantry ? styles.segOn : ''}`}
                      onClick={() => setUsePantry(false)}
                    >
                      {t('mealPlan.usePantryNo')}
                    </button>
                  </div>
                </div>

                <div className={styles.optBlock}>
                  <span className={styles.optLabel}>
                    {t('mealPlan.dietLabel')}
                    {!premium ? <span className={styles.proTag}>{t('mealPlan.pro')}</span> : null}
                  </span>
                  <div className={styles.chipWrap}>
                    {DIET_TAGS.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        disabled={!premium}
                        className={`${styles.dietChip} ${diet.includes(tag) ? styles.dietChipOn : ''} ${!premium ? styles.dietChipLocked : ''}`}
                        onClick={() => toggleDiet(tag)}
                      >
                        {diet.includes(tag) ? <IconCheck size={13} color={Colors.dashboard.stroke} /> : null}
                        {t(DIET_I18N[tag])}
                      </button>
                    ))}
                  </div>
                </div>

                <div className={styles.optBlock}>
                  <span className={styles.optLabel}>{t('mealPlan.extrasLabel')}</span>
                  <div className={styles.chipWrap}>
                    <button
                      type="button"
                      disabled={!premium}
                      className={`${styles.toggle} ${matchKcal && premium ? styles.toggleOn : ''} ${!premium ? styles.dietChipLocked : ''}`}
                      onClick={() => setMatchKcal((v) => !v)}
                    >
                      {t('mealPlan.matchKcal')}
                      {!premium ? <span className={styles.proTag}>{t('mealPlan.pro')}</span> : null}
                    </button>
                    <button
                      type="button"
                      className={`${styles.toggle} ${seasonal ? styles.toggleOn : ''}`}
                      onClick={() => setSeasonal((v) => !v)}
                    >
                      {t('mealPlan.seasonal')}
                    </button>
                    <button
                      type="button"
                      className={`${styles.toggle} ${deductOnPush ? styles.toggleOn : ''}`}
                      onClick={() => setDeductOnPush((v) => !v)}
                    >
                      {t('mealPlan.deductOnPush')}
                    </button>
                  </div>
                </div>

                {data?.generate ? (
                  <p className={styles.quota}>
                    {t('mealPlan.generateQuota', {
                      remaining: data.generate.remaining,
                      limit: data.generate.limit,
                    })}
                  </p>
                ) : null}

                <button
                  type="button"
                  className={`${styles.hardBtn} ${styles.hardBtnMint} ${styles.genPrimary}`}
                  disabled={generating}
                  onClick={() => void handleGenerate()}
                >
                  <span className={styles.btnShadow} />
                  <span className={styles.hardFace}>
                    <IconBrain size={16} color={Colors.dashboard.stroke} />
                    {generating
                      ? t('mealPlan.generating')
                      : scope === 'day'
                        ? t('mealPlan.generateDay')
                        : t('mealPlan.generate')}
                  </span>
                </button>

                <div className={styles.toolbar}>
                  <button type="button" className={styles.hardBtn} onClick={() => void handleWeekCart()}>
                    <span className={styles.btnShadow} />
                    <span className={styles.hardFace}>
                      <IconShoppingBasket size={16} color={Colors.dashboard.stroke} />
                      {t('mealPlan.weekToCart')}
                    </span>
                  </button>
                </div>
              </div>
            </GlassCardSimple>

            {loading && !data ? (
              <div className={styles.center}>
                <div className="spinner" />
              </div>
            ) : view === 'week' ? (
              <>
              <GlassCardSimple
                padding={12}
                customRadius={{
                  borderTopLeftRadius: 22,
                  borderTopRightRadius: 28,
                  borderBottomRightRadius: 18,
                  borderBottomLeftRadius: 24,
                }}
              >
                <div className={styles.weekBoard}>
                  {days.map((d) => {
                    const dt = parseDateKey(d);
                    const dayKcal = PLAN_MEALS.reduce((sum, meal) => {
                      const s = slotsByDayMeal.get(`${d}:${meal}`);
                      return sum + (s?.kcal ?? 0);
                    }, 0);
                    return (
                      <section key={d} className={styles.weekDayBlock}>
                        <button
                          type="button"
                          className={styles.dayCardHead}
                          onClick={() => {
                            setSelectedDate(d);
                            setView('day');
                          }}
                        >
                          <span className={styles.dayCardTitle}>
                            {dt.toLocaleDateString(locale, { weekday: 'long', day: 'numeric' })}
                          </span>
                          {dayKcal > 0 ? (
                            <span className={styles.dayCardKcal}>{t('mealPlan.kcal', { kcal: dayKcal })}</span>
                          ) : null}
                        </button>
                        {PLAN_MEALS.map((meal) => renderSlot(d, meal, true))}
                      </section>
                    );
                  })}
                </div>
              </GlassCardSimple>
              <button
                type="button"
                className={styles.clearBtn}
                onClick={() => setClearConfirm('week')}
              >
                <span className={styles.btnShadow} />
                <span className={styles.clearFace}>
                  <IconDelete size={16} color={Colors.dashboard.stroke} />
                  {t('mealPlan.clearWeek')}
                </span>
              </button>
              </>
            ) : (
              <>
                {PLAN_MEALS.map((meal) => (
                  <GlassCardSimple
                    key={meal}
                    padding={14}
                    customRadius={{
                      borderTopLeftRadius: 22,
                      borderTopRightRadius: 18,
                      borderBottomRightRadius: 26,
                      borderBottomLeftRadius: 16,
                    }}
                  >
                    {renderSlot(selectedDate, meal)}
                  </GlassCardSimple>
                ))}
                <button
                  type="button"
                  className={styles.clearBtn}
                  onClick={() => setClearConfirm('day')}
                >
                  <span className={styles.btnShadow} />
                  <span className={styles.clearFace}>
                    <IconDelete size={16} color={Colors.dashboard.stroke} />
                    {t('mealPlan.clearDay')}
                  </span>
                </button>
              </>
            )}
          </div>
        </>
      )}

      <MealPlanPickerSheet
        open={Boolean(picker)}
        mealType={picker?.meal ?? 'LUNCH'}
        onClose={() => setPicker(null)}
        onPick={(pick) => {
          if (picker) void applyPick(picker.date, picker.meal, pick);
        }}
      />

      {calOpen ? (
        <div className={styles.calOverlay} onClick={() => setCalOpen(false)}>
          <div className={styles.calCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.calTop}>
              <h2 className={styles.calTitle}>
                {new Date(calMonth.year, calMonth.month, 1).toLocaleDateString(locale, {
                  month: 'long',
                  year: 'numeric',
                })}
              </h2>
              <button
                type="button"
                className={styles.calClose}
                aria-label={t('common.close')}
                onClick={() => setCalOpen(false)}
              >
                <IconClose size={20} color={Colors.dashboard.stroke} />
              </button>
            </div>

            <div className={styles.monthRow}>
              <button type="button" onClick={() => shiftCalMonth(-1)} aria-label={t('mealPlan.weekPrev')}>
                <IconChevronLeft size={24} color={Colors.dashboard.stroke} />
              </button>
              <span className={styles.calHint}>{t('mealPlan.calHint')}</span>
              <button type="button" onClick={() => shiftCalMonth(1)} aria-label={t('mealPlan.weekNext')}>
                <IconChevronRight size={24} color={Colors.dashboard.stroke} />
              </button>
            </div>

            <div className={styles.calGridHead}>
              <span className={styles.calWeekCol} />
              {WEEK_HEAD.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>

            {buildMonthWeeks(calMonth.year, calMonth.month).map((row) => {
              const rowStart = toLocalDateStr(row[0]);
              const inThisWeek = rowStart === weekStart;
              return (
                <div key={rowStart} className={styles.calRow}>
                  <button
                    type="button"
                    className={`${styles.calWeekBtn} ${inThisWeek ? styles.calWeekBtnOn : ''}`}
                    aria-label={t('mealPlan.selectWeek')}
                    onClick={() => jumpToWeek(row[0])}
                  >
                    {t('mealPlan.weekShort')}
                  </button>
                  {row.map((dt) => {
                    const key = toLocalDateStr(dt);
                    const other = dt.getMonth() !== calMonth.month;
                    const isToday = key === today;
                    const isSel = key === selectedDate;
                    return (
                      <button
                        key={key}
                        type="button"
                        className={`${styles.calCell} ${other ? styles.calCellOther : ''} ${isToday ? styles.calCellToday : ''} ${isSel ? styles.calCellOn : ''}`}
                        onClick={() => jumpToDay(dt)}
                      >
                        {dt.getDate()}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {clearConfirm ? (
        <ConfirmDialog
          visible
          title={clearConfirm === 'week' ? t('mealPlan.clearWeekTitle') : t('mealPlan.clearDayTitle')}
          message={clearConfirm === 'week' ? t('mealPlan.clearWeekMessage') : t('mealPlan.clearDayMessage')}
          confirmLabel={t('mealPlan.clearConfirm')}
          cancelLabel={t('common.cancel')}
          destructive
          onClose={() => setClearConfirm(null)}
          onConfirm={() => {
            if (clearConfirm === 'week') void handleClearWeek();
            else void handleClearDay();
          }}
        />
      ) : null}

      {slotDelete ? (
        <div className={styles.editOverlay} onClick={() => setSlotDelete(null)}>
          <div
            className={styles.editSheet}
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.editTop}>
              <div>
                <h2 className={styles.editTitle}>{t('mealPlan.deleteTitle')}</h2>
                <p className={styles.editHint}>
                  {slotDelete.title
                    ? t('mealPlan.deleteNamed', { name: slotDelete.title })
                    : t('mealPlan.deleteMessage')}
                </p>
              </div>
              <button
                type="button"
                className={styles.editClose}
                aria-label={t('common.close')}
                onClick={() => setSlotDelete(null)}
              >
                <IconClose size={18} color={Colors.dashboard.stroke} />
              </button>
            </div>
            <div className={styles.deleteActions}>
              <button
                type="button"
                className={`${styles.hardBtn} ${styles.hardBtnMint}`}
                onClick={() => void handleDeleteSlot(false)}
              >
                <span className={styles.btnShadow} />
                <span className={styles.hardFace}>{t('mealPlan.deletePlanOnly')}</span>
              </button>
              {slotDelete.logged ? (
                <button
                  type="button"
                  className={styles.clearBtn}
                  onClick={() => void handleDeleteSlot(true)}
                >
                  <span className={styles.btnShadow} />
                  <span className={styles.clearFace}>{t('mealPlan.deleteWithDiary')}</span>
                </button>
              ) : null}
              <button type="button" className={styles.ghost} onClick={() => setSlotDelete(null)}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {fastingDialog}
    </div>
  );
}
