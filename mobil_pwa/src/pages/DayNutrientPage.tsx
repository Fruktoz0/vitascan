import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { GlassCardSimple } from '../components/ui/GlassCard';
import { IconArrowBack } from '../components/ui/Icons';
import { Colors } from '../design/tokens';
import { statsApi } from '../services/api';
import { toLocalDateStr, useDateStore } from '../stores/dateStore';
import { groupDiaryLogs, type DiaryEntry, type DiaryLogLike } from '../utils/groupDiaryLogs';
import styles from './DayNutrientPage.module.css';

export type NutrientMetric = 'kcal' | 'protein' | 'carbs' | 'fat';

const METRICS: NutrientMetric[] = ['kcal', 'protein', 'carbs', 'fat'];
const TOP_SLICES = 6;

type Row = {
  id: string;
  name: string;
  amount: number;
  value: number;
};

function isMetric(v: string | undefined): v is NutrientMetric {
  return !!v && (METRICS as string[]).includes(v);
}

function entryValue(entry: DiaryEntry, metric: NutrientMetric): number {
  if (entry.kind === 'group') return entry.totals[metric] ?? 0;
  return Number(entry.log[metric] ?? 0);
}

function entryAmount(entry: DiaryEntry): number {
  if (entry.kind === 'group') return entry.totals.amount;
  return Number(entry.log.amount ?? 0);
}

function entryName(entry: DiaryEntry): string {
  if (entry.kind === 'group') return entry.title;
  return entry.log.foodName;
}

function entryId(entry: DiaryEntry): string {
  return entry.kind === 'group' ? `g:${entry.logGroupId}` : entry.log.id;
}

function mixHex(a: string, b: string, t: number): string {
  const parse = (hex: string) => {
    const n = parseInt(hex.replace('#', ''), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  };
  const ca = parse(a);
  const cb = parse(b);
  const r = Math.round(ca.r + (cb.r - ca.r) * t);
  const g = Math.round(ca.g + (cb.g - ca.g) * t);
  const bl = Math.round(ca.b + (cb.b - ca.b) * t);
  return `#${((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)}`;
}

function metricColor(metric: NutrientMetric): string {
  if (metric === 'kcal') return Colors.dashboard.kcalFill;
  if (metric === 'protein') return Colors.dashboard.proteinFill;
  if (metric === 'carbs') return Colors.dashboard.carbsFill;
  return Colors.dashboard.fatFill;
}

function collectLogs(data: { logs?: DiaryLogLike[]; byMealType?: Record<string, DiaryLogLike[]> } | null) {
  if (Array.isArray(data?.logs) && data.logs.length) return data.logs;
  return Object.values(data?.byMealType ?? {}).flat();
}

function ShareDonut({
  slices,
  color,
  totalLabel,
}: {
  slices: { id: string; name: string; value: number; color: string }[];
  color: string;
  totalLabel: string;
}) {
  const size = 168;
  const stroke = 22;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const sum = slices.reduce((s, x) => s + x.value, 0);
  let offset = 0;

  return (
    <div className={styles.donutWrap}>
      <div className={styles.donutSvgWrap} style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={Colors.dashboard.kcalTrack}
            strokeWidth={stroke}
          />
          {sum > 0
            ? slices.map((slice) => {
                const len = (slice.value / sum) * c;
                const dashoffset = -offset;
                offset += len;
                return (
                  <circle
                    key={slice.id}
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    fill="none"
                    stroke={slice.color}
                    strokeWidth={stroke}
                    strokeDasharray={`${Math.max(0, len - 1.2)} ${c}`}
                    strokeDashoffset={dashoffset}
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                    strokeLinecap="butt"
                  />
                );
              })
            : null}
        </svg>
        <div className={styles.donutCenter}>
          <span className={styles.donutTotal} style={{ color }}>
            {totalLabel}
          </span>
        </div>
      </div>
      <ul className={styles.legend}>
        {slices.map((slice) => (
          <li key={slice.id} className={styles.legendItem}>
            <span className={styles.legendSwatch} style={{ background: slice.color }} />
            <span className={styles.legendName}>{slice.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function DayNutrientPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { metric: metricParam } = useParams<{ metric: string }>();
  const selectedDate = useDateStore((s) => s.selectedDate);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const metric = isMetric(metricParam) ? metricParam : null;

  useEffect(() => {
    if (!metric) return;
    let cancelled = false;
    setLoading(true);
    statsApi
      .day(toLocalDateStr(selectedDate))
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [metric, selectedDate]);

  const rows = useMemo(() => {
    if (!metric) return [];
    const entries = groupDiaryLogs(collectLogs(data));
    const mapped: Row[] = entries
      .map((entry) => ({
        id: entryId(entry),
        name: entryName(entry),
        amount: entryAmount(entry),
        value: entryValue(entry, metric),
      }))
      .filter((row) => row.value > 0)
      .sort((a, b) => b.value - a.value);
    return mapped;
  }, [data, metric]);

  if (!metric) return <Navigate to="/home" replace />;

  const color = metricColor(metric);
  const totals = data?.totals ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const goals = data?.goals ?? {};
  const total = Number(totals[metric] ?? 0) || rows.reduce((s, r) => s + r.value, 0);
  const goal =
    metric === 'kcal'
      ? Number(goals.dailyKcalGoal ?? 0)
      : metric === 'protein'
        ? Number(goals.dailyProteinGoal ?? 0)
        : metric === 'carbs'
          ? Number(goals.dailyCarbsGoal ?? 0)
          : Number(goals.dailyFatGoal ?? 0);

  const title =
    metric === 'kcal'
      ? t('homeScreen.breakdownTitleKcal')
      : metric === 'protein'
        ? t('homeScreen.breakdownTitleProtein')
        : metric === 'carbs'
          ? t('homeScreen.breakdownTitleCarbs')
          : t('homeScreen.breakdownTitleFat');

  const formatValue = (n: number) =>
    metric === 'kcal'
      ? `${Math.round(n)} ${t('homeScreen.breakdownUnitKcal')}`
      : `${Math.round(n * 10) / 10} ${t('homeScreen.breakdownUnitG')}`;

  const slices = (() => {
    if (rows.length === 0) return [];
    const top = rows.slice(0, TOP_SLICES);
    const rest = rows.slice(TOP_SLICES);
    const restSum = rest.reduce((s, r) => s + r.value, 0);
    const items = restSum > 0 ? [...top, { id: 'other', name: t('homeScreen.breakdownOther'), amount: 0, value: restSum }] : top;
    return items.map((row, i) => ({
      id: row.id,
      name: row.name,
      value: row.value,
      color:
        restSum > 0 && i === items.length - 1
          ? mixHex(color, Colors.dashboard.stroke, 0.22)
          : mixHex(color, '#ffffff', (i / Math.max(1, items.length - 1)) * 0.42),
    }));
  })();

  return (
    <div className={`${styles.screen} page-scroll`}>
      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={() => navigate('/home')} aria-label={t('common.back')}>
          <IconArrowBack size={22} color={Colors.dashboard.stroke} />
        </button>
        <h1 className={styles.title}>{title}</h1>
        <span className={styles.headerSpacer} />
      </header>

      <div className={styles.content}>
        {loading && !data ? (
          <div className={styles.loading}>
            <div className="spinner" />
          </div>
        ) : (
          <>
            <GlassCardSimple padding={20} radius={24} shadowOffset={3}>
              <div className={styles.summary}>
                <div className={styles.summaryValue} style={{ color }}>
                  {formatValue(total)}
                </div>
                {goal > 0 ? (
                  <div className={styles.summaryGoal}>
                    {t('homeScreen.breakdownOfGoal', { goal: formatValue(goal) })}
                  </div>
                ) : null}
              </div>
              {rows.length > 0 ? (
                <ShareDonut slices={slices} color={color} totalLabel={formatValue(total)} />
              ) : (
                <p className={styles.empty}>{t('homeScreen.breakdownEmpty')}</p>
              )}
            </GlassCardSimple>

            {rows.length > 0 ? (
              <GlassCardSimple padding={8} radius={24} shadowOffset={3}>
                <ul className={styles.list}>
                  {rows.map((row) => {
                    const pct = total > 0 ? (row.value / total) * 100 : 0;
                    return (
                      <li key={row.id} className={styles.row}>
                        <div className={styles.rowTop}>
                          <div className={styles.rowLeft}>
                            <div className={styles.rowName}>{row.name}</div>
                            <div className={styles.rowMeta}>{Math.round(row.amount)}g</div>
                          </div>
                          <div className={styles.rowRight}>
                            <div className={styles.rowValue}>{formatValue(row.value)}</div>
                            <div className={styles.rowPct}>{Math.round(pct)}%</div>
                          </div>
                        </div>
                        <div className={styles.barTrack}>
                          <div
                            className={styles.barFill}
                            style={{ width: `${Math.max(2, pct)}%`, background: color }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </GlassCardSimple>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
