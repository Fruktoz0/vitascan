import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import {
  IconAdd,
  IconAddCircle,
  IconApple,
  IconArrowBack,
  IconArrowForward,
  IconBolt,
  IconLeaf,
  IconPeopleOutline,
  IconPieChartOutline,
  IconQrCodeScanner,
  IconRemove,
  IconRestaurantOutline,
  IconSearch,
  IconThumbDown,
  IconThumbUp,
  IconVerified,
} from '../ui/Icons';
import { GlassCardSimple } from '../ui/GlassCard';
import { foodApi, logApi, type Food, type FoodStatus } from '../../services/api';
import { Colors } from '../../design/tokens';
import styles from './FoodModals.module.css';

type MealType = 'BREAKFAST' | 'TIZORAI' | 'LUNCH' | 'UZSONNA' | 'DINNER' | 'SNACK';

const MEAL_TYPES: MealType[] = ['BREAKFAST', 'TIZORAI', 'LUNCH', 'UZSONNA', 'DINNER', 'SNACK'];

interface FoodDetailModalProps {
  food: Food | null;
  visible: boolean;
  onClose: () => void;
  onLogAdded?: () => void;
  logSource?: 'SCAN' | 'SEARCH' | 'MANUAL';
  initialMealType?: MealType;
}

function MacroBar({
  label,
  grams,
  percent,
  color,
  rotation = 0,
  sugarNote,
}: {
  label: string;
  grams: number;
  percent: number;
  color: string;
  rotation?: number;
  sugarNote?: string;
}) {
  const width = Math.max(4, Math.min(100, percent));
  return (
    <div className={styles.macroBarRow}>
      <div className={styles.macroLabelRow}>
        <span className={styles.macroLabel}>
          {label} ({grams}g)
        </span>
        <span className={styles.macroPct}>{Math.round(percent)}%</span>
      </div>
      <div className={styles.macroTrack}>
        <div
          className={styles.macroFill}
          style={{
            width: `${width}%`,
            background: color,
            transform: `rotate(${rotation}deg)`,
          }}
        />
      </div>
      {sugarNote ? <p className={styles.sugarNote}>{sugarNote}</p> : null}
    </div>
  );
}

function VoteButtons({
  food,
  onVoted,
}: {
  food: Food;
  onVoted: (score: number, myVote: 1 | -1 | null, status?: FoodStatus) => void;
}) {
  const { t } = useTranslation();
  const [myVote, setMyVote] = useState<1 | -1 | null>(food.myVote ?? null);
  const [score, setScore] = useState(food.score ?? 0);
  const [status, setStatus] = useState<FoodStatus>(food.status ?? 'UNVERIFIED');
  const [loading, setLoading] = useState(false);
  const [hydrating, setHydrating] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setHydrating(true);
    setMyVote(food.myVote ?? null);
    setScore(food.score ?? 0);
    setStatus(food.status ?? 'UNVERIFIED');

    (async () => {
      if (!food.id || String(food.id).startsWith('off_')) {
        if (!cancelled) setHydrating(false);
        return;
      }
      try {
        const fresh = await foodApi.getById(food.id);
        if (cancelled) return;
        setScore(fresh.score ?? 0);
        setMyVote(fresh.myVote ?? null);
        setStatus(fresh.status ?? 'UNVERIFIED');
        onVoted(fresh.score ?? 0, fresh.myVote ?? null, fresh.status);
      } catch {
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // csak food.id váltáskor töltünk újra
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [food.id]);

  const handleVote = async (value: 1 | -1) => {
    if (loading || hydrating) return;
    setLoading(true);
    const prev = { score, myVote, status };
    // optimistic
    if (myVote === value) {
      setMyVote(null);
      setScore((s) => s - value);
    } else if (myVote == null) {
      setMyVote(value);
      setScore((s) => s + value);
    } else {
      setMyVote(value);
      setScore((s) => s - myVote + value);
    }

    try {
      await foodApi.vote(food.id, value);
      const fresh = await foodApi.getById(food.id);
      setScore(fresh.score ?? 0);
      setMyVote(fresh.myVote ?? null);
      setStatus(fresh.status ?? 'UNVERIFIED');
      onVoted(fresh.score ?? 0, fresh.myVote ?? null, fresh.status);
    } catch {
      setScore(prev.score);
      setMyVote(prev.myVote);
      setStatus(prev.status);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.voteBlock}>
      <div className={styles.voteHeader}>
        <div className={styles.voteHeaderLeft}>
          <IconPeopleOutline size={24} color={Colors.dashboard.stroke} />
          <span className={styles.voteTitle}>{t('food.communityRating')}</span>
        </div>
        {status === 'VERIFIED' && <IconVerified size={28} color="#00E676" />}
      </div>

      <div className={styles.voteRail}>
        <button
          type="button"
          className={styles.voteBtnWrap}
          onClick={() => handleVote(-1)}
          disabled={loading || hydrating}
          aria-pressed={myVote === -1}
        >
          <span className={styles.voteBtnShadow} />
          <span
            className={`${styles.voteBtnInner} ${styles.voteBtnDown} ${myVote === -1 ? styles.voteBtnSelected : ''}`}
          >
            <IconThumbDown size={16} color="#D32F2F" />
            <span className={styles.voteTextDown}>{t('food.inaccurate').toUpperCase()}</span>
          </span>
        </button>

        <div className={styles.voteScoreWrap}>
          {hydrating || loading ? (
            <span className="spinner" style={{ width: 18, height: 18 }} />
          ) : (
            <span className={styles.voteScore}>
              {score > 0 ? '+' : ''}
              {score}
            </span>
          )}
        </div>

        <button
          type="button"
          className={styles.voteBtnWrap}
          onClick={() => handleVote(1)}
          disabled={loading || hydrating}
          aria-pressed={myVote === 1}
        >
          <span className={styles.voteBtnShadow} />
          <span
            className={`${styles.voteBtnInner} ${styles.voteBtnUp} ${myVote === 1 ? styles.voteBtnSelected : ''}`}
          >
            <IconThumbUp size={16} color="#388E3C" />
            <span className={styles.voteTextUp}>{t('food.accurate').toUpperCase()}</span>
          </span>
        </button>
      </div>

      <p className={styles.voteFooter}>{t('food.verificationNote')}</p>
    </div>
  );
}

export function FoodDetailModal({
  food,
  visible,
  onClose,
  onLogAdded,
  logSource = 'SEARCH',
  initialMealType = 'SNACK',
}: FoodDetailModalProps) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState('100');
  const [mealType, setMealType] = useState<MealType>(initialMealType);
  const [adding, setAdding] = useState(false);
  const [currentFood, setCurrentFood] = useState<Food | null>(null);

  useEffect(() => {
    setCurrentFood(food);
  }, [food]);

  useEffect(() => {
    if (visible && food) {
      setMealType(initialMealType);
      const serving = food.servingSize != null && food.servingSize > 0 ? food.servingSize : 100;
      setAmount(String(Math.round(serving)));
    }
  }, [visible, initialMealType, food]);

  if (!visible || !currentFood) return null;

  const displayName =
    (i18n.language === 'en' ? currentFood.nameEn : currentFood.nameHu) ??
    currentFood.displayName ??
    currentFood.name;

  const servingSize = currentFood.servingSize != null && currentFood.servingSize > 0 ? currentFood.servingSize : 100;
  const servingUnit = currentFood.servingUnit?.trim() || 'g';
  const portionLabel = `${Math.round(servingSize)}${servingUnit} / ${t('food.serving')}`;

  const g = parseFloat(amount) || 0;
  const calc = {
    kcal: Math.round((currentFood.kcal / 100) * g),
    protein: Math.round((currentFood.protein / 100) * g * 10) / 10,
    carbs: Math.round((currentFood.carbs / 100) * g * 10) / 10,
    fat: Math.round((currentFood.fat / 100) * g * 10) / 10,
    sugar:
      currentFood.sugar != null ? Math.round((currentFood.sugar / 100) * g * 10) / 10 : null,
    fiber:
      currentFood.fiber != null ? Math.round((currentFood.fiber / 100) * g * 10) / 10 : null,
  };

  const totalMacro = Math.max(0.1, currentFood.carbs + currentFood.protein + currentFood.fat);
  const carbsPct = (currentFood.carbs / totalMacro) * 100;
  const proteinPct = (currentFood.protein / totalMacro) * 100;
  const fatPct = (currentFood.fat / totalMacro) * 100;

  const mealLabel = (m: MealType) => {
    if (m === 'BREAKFAST') return t('food.breakfast');
    if (m === 'TIZORAI') return t('food.tizorai');
    if (m === 'LUNCH') return t('food.lunch');
    if (m === 'UZSONNA') return t('food.uzsonna');
    if (m === 'DINNER') return t('food.dinner');
    return t('food.snack');
  };

  const adjustAmount = (delta: number) => {
    const next = Math.max(0, Math.round((parseFloat(amount) || 0) + delta));
    setAmount(String(next));
  };

  const handleAddLog = async () => {
    if (!g || g <= 0) {
      window.alert(t('food.enterAmount'));
      return;
    }
    setAdding(true);
    try {
      const isUuid =
        typeof currentFood.id === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          currentFood.id,
        );
      await logApi.create({
        ...(isUuid ? { foodId: currentFood.id } : {}),
        foodName: displayName,
        kcal: calc.kcal,
        protein: calc.protein,
        carbs: calc.carbs,
        fat: calc.fat,
        fiber: calc.fiber ?? undefined,
        sugar: calc.sugar ?? undefined,
        amount: g,
        mealType,
        source: logSource,
      });
      onLogAdded?.();
      onClose();
    } catch (e: any) {
      window.alert(e?.message || t('food.errorTitle'));
    } finally {
      setAdding(false);
    }
  };

  return createPortal(
    <div className={styles.detailScreen}>
      <header className={styles.detailHeader}>
        <button type="button" className={styles.backBtn} onClick={onClose}>
          <span className={styles.backBtnShadow} />
          <span className={styles.backBtnInner}>
            <IconArrowBack size={24} color={Colors.dashboard.stroke} />
          </span>
        </button>
        <h2 className={styles.detailTitle}>{t('food.productDetailsTitle')}</h2>
        <span className={styles.headerSpacer} />
      </header>

      <div className={styles.detailBody}>
        <div className={styles.productCard}>
          <span className={styles.productShadow} />
          <div className={styles.productInner}>
            <span className={styles.productDecorLeft}>
              <IconApple size={80} color={Colors.dashboard.stroke} style={{ opacity: 0.1 }} />
            </span>
            <span className={styles.productDecorRight}>
              <IconLeaf size={32} color={Colors.dashboard.nutritionIcon} style={{ opacity: 0.3 }} />
            </span>
            <h3 className={styles.foodName}>{displayName}</h3>
            <div className={styles.portionBadgeWrap}>
              <span className={styles.portionBadgeShadow} />
              <span className={styles.portionBadgeInner}>
                <span className={styles.portionText}>{portionLabel}</span>
              </span>
            </div>
          </div>
        </div>

        <div className={styles.sections}>
          <GlassCardSimple padding={20} radius={24} shadowOffset={3}>
            <div className={styles.amountStepper}>
              <button type="button" className={styles.amountStepBtn} onClick={() => adjustAmount(-10)}>
                <span className={styles.amountStepShadow} />
                <span className={styles.amountStepFace}>
                  <IconRemove size={22} color={Colors.dashboard.stroke} />
                </span>
              </button>
              <div className={styles.amountCenter}>
                <input
                  className={styles.amountInputCompact}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
                  inputMode="decimal"
                  placeholder="100"
                />
                <span className={styles.amountUnit}>g</span>
              </div>
              <button type="button" className={styles.amountStepBtn} onClick={() => adjustAmount(10)}>
                <span className={styles.amountStepShadow} />
                <span className={styles.amountStepFace}>
                  <IconAdd size={22} color={Colors.dashboard.stroke} />
                </span>
              </button>
            </div>
          </GlassCardSimple>

          <GlassCardSimple padding={20} radius={24} shadowOffset={3}>
            <div className={styles.sectionHeaderSmall}>
              <IconPieChartOutline size={24} color={Colors.dashboard.stroke} />
              <span className={styles.sectionTitle}>Makrotápanyagok</span>
            </div>
            <div className={styles.macroEnergyRow}>
              <div className={styles.energyLeft}>
                <IconBolt size={20} color={Colors.dashboard.nutritionIcon} />
                <span className={styles.energyLabel}>{t('food.energy').toUpperCase()}</span>
              </div>
              <span className={styles.energyValue}>{calc.kcal} kcal</span>
            </div>
            <div className={styles.macroBars}>
              <MacroBar
                label={t('food.protein')}
                grams={currentFood.protein}
                percent={proteinPct}
                color={Colors.dashboard.proteinFill}
                rotation={0.5}
              />
              <MacroBar
                label={t('food.carbs')}
                grams={currentFood.carbs}
                percent={carbsPct}
                color={Colors.dashboard.carbsFill}
                rotation={-0.5}
                sugarNote={
                  currentFood.sugar != null
                    ? `${t('food.ofWhichSugar')}: ${currentFood.sugar}g / 100g`
                    : undefined
                }
              />
              <MacroBar
                label={t('food.fat')}
                grams={currentFood.fat}
                percent={fatPct}
                color={Colors.dashboard.fatFill}
                rotation={-0.5}
              />
            </div>
            {currentFood.fiber != null && (
              <div className={styles.extraNutri}>
                <div className={styles.nutrRow}>
                  <span className={styles.nutrDot} style={{ background: Colors.macro.fiber }} />
                  <span className={styles.nutrLabel}>{t('food.fiberPer100g')}</span>
                  <span className={styles.nutrValue} style={{ color: Colors.macro.fiber }}>
                    {currentFood.fiber}g
                  </span>
                </div>
              </div>
            )}
          </GlassCardSimple>

          <GlassCardSimple padding={20} radius={24} shadowOffset={3}>
            <div className={styles.sectionHeaderSmall}>
              <IconRestaurantOutline size={24} color={Colors.dashboard.stroke} />
              <span className={styles.sectionTitle}>{t('food.mealType')}</span>
            </div>
            <div className={styles.mealRow}>
              {MEAL_TYPES.map((m) => {
                const active = mealType === m;
                return (
                  <button
                    key={m}
                    type="button"
                    className={styles.mealBtnWrap}
                    onClick={() => setMealType(m)}
                  >
                    {active && <span className={styles.mealBtnShadow} />}
                    <span className={`${styles.mealBtnInner} ${active ? styles.mealBtnInnerActive : ''}`}>
                      <span className={`${styles.mealBtnText} ${active ? styles.mealBtnTextActive : ''}`}>
                        {mealLabel(m)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </GlassCardSimple>

          {currentFood.id && !String(currentFood.id).startsWith('off_') && (
            <GlassCardSimple padding={20} radius={24} shadowOffset={3}>
              <VoteButtons
                food={currentFood}
                onVoted={(score, myVote, status) =>
                  setCurrentFood((f) => (f ? { ...f, score, myVote, ...(status ? { status } : {}) } : f))
                }
              />
            </GlassCardSimple>
          )}

          <div className={styles.scrollSpacer} />
        </div>
      </div>

      <footer className={styles.detailFooter}>
        <button type="button" className={styles.addBtnWrap} onClick={handleAddLog} disabled={adding}>
          <span className={styles.addBtnShadow} />
          <span className={styles.addBtnInner}>
            <IconAddCircle size={24} color="#fff" />
            <span className={styles.addBtnLabel}>
              {adding ? 'Folyamatban...' : t('food.addToLog')}
            </span>
          </span>
        </button>
      </footer>
    </div>,
    document.body,
  );
}

interface AddFoodManualModalProps {
  visible: boolean;
  prefillBarcode?: string;
  prefillName?: string;
  onClose: () => void;
  onCreated?: (food: Food) => void;
  onOpenScanner?: () => void;
}

const FILTER_TABS = ['Legutobbiak', 'Kedvencek', 'Gyakori', 'Sajat etelek'];

export function AddFoodManualModal({
  visible,
  prefillBarcode,
  prefillName,
  onClose,
  onCreated,
  onOpenScanner,
}: AddFoodManualModalProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState(prefillName ?? prefillBarcode ?? '');
  const [foods, setFoods] = useState<Food[]>([]);
  const [loading, setLoading] = useState(false);
  const cleanQuery = query.trim();

  useEffect(() => {
    if (!visible) return;
    setQuery(prefillName ?? prefillBarcode ?? '');
  }, [visible, prefillName, prefillBarcode]);

  useEffect(() => {
    if (!visible) return;
    if (cleanQuery.length < 2) {
      setFoods([]);
      setLoading(false);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await foodApi.search(cleanQuery, { limit: 20 });
        setFoods(res.foods);
      } catch {
        setFoods([]);
      } finally {
        setLoading(false);
      }
    }, 280);
    return () => clearTimeout(timer);
  }, [cleanQuery, visible]);

  if (!visible) return null;

  const getDisplayName = (item: Food) =>
    (i18n.language === 'en' ? item.nameEn : item.nameHu) ?? item.displayName ?? item.name;

  return createPortal(
    <div className={styles.addOverlay}>
      <div className={styles.addScreen}>
        <div className={styles.addHeaderBand}>
          <div className={styles.addHeaderTop}>
            <button type="button" className={styles.iconBtnAbsolute} onClick={onClose}>
              <span className={styles.iconShadow} />
              <span className={styles.iconFace}>
                <IconArrowBack size={20} color={Colors.dashboard.stroke} />
              </span>
            </button>
            <h2 className={styles.addTitle}>{t('food.manualAddTitle')}</h2>
          </div>

          <div className={styles.searchWrap}>
            <span className={styles.searchShadow} />
            <div className={styles.searchBoxInner}>
              <IconSearch size={18} color={Colors.dashboard.tabInactive} />
              <input
                className={styles.searchInputInner}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('food.searchPlaceholder')}
                autoFocus
              />
            </div>
          </div>

          <div className={styles.tabRow}>
            {FILTER_TABS.map((label, idx) => (
              <div key={label} className={`${styles.tabChip} ${idx === 0 ? styles.tabChipActive : ''}`}>
                <span className={idx === 0 ? styles.tabChipTextActive : styles.tabChipText}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.addBody}>
          <GlassCardSimple padding={16} shadowOffset={3}>
            {cleanQuery.length < 2 ? (
              <div className={styles.skeletonWrap}>
                {[0, 1, 2, 3].map((row) => (
                  <div key={row} className={styles.skeletonRow}>
                    <div className={styles.skeletonAvatar} />
                    <div className={styles.skeletonTextCol}>
                      <div className={`${styles.skeletonLine} ${styles.skeletonLineMain}`} />
                      <div className={`${styles.skeletonLine} ${styles.skeletonLineSub}`} />
                    </div>
                    <div className={styles.skeletonCircle} />
                  </div>
                ))}
              </div>
            ) : loading ? (
              <div className={styles.loadingWrap}>
                <div className="spinner" />
                <p className={styles.emptyHint}>{t('food.searching')}</p>
              </div>
            ) : foods.length === 0 ? (
              <div className={styles.loadingWrap}>
                <p className={styles.emptyHint}>{t('food.noResults')}</p>
              </div>
            ) : (
              foods.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={styles.quickRow}
                  onClick={() => {
                    onCreated?.(item);
                    onClose();
                  }}
                >
                  <span className={styles.quickEmoji} aria-hidden>
                    {'\u{1F37D}'}
                  </span>
                  <span className={styles.resultInfo}>
                    <span className={styles.quickName}>{getDisplayName(item)}</span>
                    <span className={styles.quickMeta}>{Math.round(item.kcal)} kcal / 100g</span>
                  </span>
                  <span className={styles.quickAddBtn}>
                    <IconAdd size={18} color={Colors.dashboard.stroke} />
                  </span>
                </button>
              ))
            )}
          </GlassCardSimple>

          {onOpenScanner && (
            <button
              type="button"
              className={styles.scanCardWrap}
              onClick={() => {
                onClose();
                onOpenScanner();
              }}
            >
              <span className={styles.scanCardShadow} />
              <span className={styles.scanCardInner}>
                <span className={styles.scanIconWrap}>
                  <IconQrCodeScanner size={22} color={Colors.dashboard.stroke} />
                </span>
                <span className={styles.resultInfo}>
                  <span className={styles.scanTitle}>Vonalkod beolvasasa</span>
                  <span className={styles.scanSub}>Gyorsabb hozzaadas termekekhez</span>
                </span>
                <IconArrowForward size={14} color={Colors.dashboard.tabInactive} />
              </span>
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
