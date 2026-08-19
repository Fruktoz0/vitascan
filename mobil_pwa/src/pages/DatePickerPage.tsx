import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Colors } from '../design/tokens';
import { IconArrowBack, IconChevronLeft, IconChevronRight, IconDownload } from '../components/ui/Icons';
import { exportApi, getAccessToken, statsApi, weightApi, bodyApi, bodyFatApi, waterApi, fastingApi } from '../services/api';
import { toLocalDateStr, useDateStore } from '../stores/dateStore';
import { useTierStore } from '../stores/tierStore';
import { kcalGoalTone } from '../utils/kcalGoalTone';
import { isBodyPart } from '../utils/bodyMeta';
import { sessionDayKey } from '../utils/fasting';
import styles from './DatePickerPage.module.css';

const DAY_LABELS = ['H', 'K', 'Sz', 'Cs', 'P', 'Szo', 'V'];
const HU_MONTHS = [
  'Január', 'Február', 'Március', 'Április', 'Május', 'Június',
  'Július', 'Augusztus', 'Szeptember', 'Október', 'November', 'December',
];

function buildCalendarGrid(year: number, month: number): (number | null)[][] {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const jsDay = new Date(year, month, 1).getDay();
  const firstWeekday = (jsDay + 6) % 7;
  const cells: (number | null)[] = Array(firstWeekday).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

function mondayOf(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const dow = x.getDay();
  x.setDate(x.getDate() + (dow === 0 ? -6 : 1 - dow));
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export default function DatePickerPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isWeightMode = searchParams.get('mode') === 'weight';
  const bodyPartParam = searchParams.get('part');
  const isBodyMode = searchParams.get('mode') === 'body' && isBodyPart(bodyPartParam);
  const isBodyFatMode = searchParams.get('mode') === 'bodyfat';
  const isWaterMode = searchParams.get('mode') === 'water';
  const isFastingMode = searchParams.get('mode') === 'fasting';
  const isMeasureMode = isWeightMode || isBodyMode || isBodyFatMode || isWaterMode || isFastingMode;
  const { selectedDate, setDate } = useDateStore();
  const { fetch: fetchTier, isPremium } = useTierStore();
  const [viewYear, setViewYear] = useState(selectedDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(selectedDate.getMonth());
  const [streak, setStreak] = useState<number | null>(null);
  const [weightDelta, setWeightDelta] = useState<number | null>(null);
  const [loggedByDate, setLoggedByDate] = useState<Map<string, number>>(new Map());
  const [measureByDate, setMeasureByDate] = useState<Map<string, number>>(new Map());
  const [dailyKcalGoal, setDailyKcalGoal] = useState(2000);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFrom, setExportFrom] = useState(() => toLocalDateStr(addDays(new Date(), -30)));
  const [exportTo, setExportTo] = useState(() => toLocalDateStr(new Date()));
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetchTier();
    statsApi.streak().then((r) => setStreak(r.streak)).catch(() => setStreak(0));
    const todayStr = toLocalDateStr(new Date());
    weightApi.getByDate(todayStr).then((res) => setWeightDelta(res.deltaKg)).catch(() => setWeightDelta(null));
  }, [fetchTier]);

  useEffect(() => {
    let cancelled = false;
    if (isWeightMode || isBodyMode || isBodyFatMode || isWaterMode || isFastingMode) {
      const from = toLocalDateStr(new Date(viewYear, viewMonth, 1));
      const to = toLocalDateStr(new Date(viewYear, viewMonth + 1, 0));
      const req =
        isFastingMode
          ? fastingApi.history(from, to).then((r) => {
              const map = new Map<string, number>();
              for (const item of r.items ?? []) {
                const key = sessionDayKey(item.endedAt ?? item.startedAt);
                if (!map.has(key)) map.set(key, item.elapsedMinutes / 60);
              }
              return map;
            })
          : isWaterMode
          ? waterApi.history({ from, to }).then((r) =>
              new Map((r.items ?? []).map((item) => [item.loggedDate, item.totalMl / 1000])),
            )
          : isBodyFatMode
          ? bodyFatApi.history({ from, to }).then((r) =>
              new Map((r.items ?? []).map((item) => [item.loggedDate, item.fatPercent])),
            )
          : isBodyMode && isBodyPart(bodyPartParam)
            ? bodyApi.history(bodyPartParam, { from, to }).then((r) =>
                new Map((r.items ?? []).map((item) => [item.loggedDate, item.valueCm])),
              )
            : weightApi.history({ from, to }).then((r) =>
                new Map((r.items ?? []).map((item) => [item.loggedDate, item.weightKg])),
              );
      req
        .then((map) => {
          if (!cancelled) setMeasureByDate(map);
        })
        .catch(() => {
          if (!cancelled) setMeasureByDate(new Map());
        });
      return () => {
        cancelled = true;
      };
    }
    statsApi
      .loggedDays(viewYear, viewMonth + 1)
      .then((r) => {
        if (cancelled) return;
        setDailyKcalGoal(r.dailyKcalGoal ?? 2000);
        setLoggedByDate(new Map((r.days ?? []).map((d) => [d.date, d.kcal])));
      })
      .catch(() => {
        if (!cancelled) setLoggedByDate(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, [viewYear, viewMonth, isWeightMode, isBodyMode, isBodyFatMode, isWaterMode, isFastingMode, bodyPartParam]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sel = new Date(selectedDate);
  sel.setHours(0, 0, 0, 0);
  const weeks = buildCalendarGrid(viewYear, viewMonth);

  const selectDay = (day: number) => {
    const target = new Date(viewYear, viewMonth, day);
    target.setHours(12, 0, 0, 0);
    if (!isMeasureMode) setDate(target);
    if (isWeightMode) {
      sessionStorage.setItem('weightLogScrollDate', toLocalDateStr(target));
    }
    if (isBodyMode && isBodyPart(bodyPartParam)) {
      sessionStorage.setItem('bodyLogScrollDate', toLocalDateStr(target));
      sessionStorage.setItem('bodyLogScrollPart', bodyPartParam);
    }
    if (isBodyFatMode) {
      sessionStorage.setItem('bodyFatLogScrollDate', toLocalDateStr(target));
    }
    if (isWaterMode) {
      sessionStorage.setItem('waterLogScrollDate', toLocalDateStr(target));
    }
    if (isFastingMode) {
      sessionStorage.setItem('fastingLogScrollDate', toLocalDateStr(target));
    }
    navigate(-1);
  };

  const applyPreset = (key: string) => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    let from = new Date(now);
    let to = new Date(now);
    if (key === 'thisWeek') {
      from = mondayOf(now);
      to = addDays(from, 6);
    } else if (key === 'thisMonth') {
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    } else if (key === 'last7') {
      from = addDays(now, -6);
    } else if (key === 'last30') {
      from = addDays(now, -29);
    } else if (key === 'last90') {
      from = addDays(now, -89);
    } else if (key === 'thisYear') {
      from = new Date(now.getFullYear(), 0, 1);
    } else if (key === 'lastYear') {
      from = new Date(now.getFullYear() - 1, 0, 1);
      to = new Date(now.getFullYear() - 1, 11, 31);
    }
    setExportFrom(toLocalDateStr(from));
    setExportTo(toLocalDateStr(to));
  };

  const handleExport = async () => {
    if (!isPremium()) {
      alert(t('premiumMeta.exportDesc'));
      return;
    }
    setExporting(true);
    const url = exportApi.getDownloadUrl(exportFrom, exportTo);
    const token = getAccessToken();
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `vitascan_export_${exportFrom}_${exportTo}.xlsx`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      alert(t('export.downloadErrorTitle'));
    } finally {
      setExporting(false);
    }
  };

  const weightText =
    weightDelta === null ? '-' : weightDelta === 0 ? '0.0 kg' : `${weightDelta > 0 ? '+' : ''}${weightDelta.toFixed(1)} kg`;

  const presets = useMemo(
    () =>
      [
        ['thisWeek', t('export.presets.thisWeek')],
        ['thisMonth', t('export.presets.thisMonth')],
        ['last7', t('export.presets.last7')],
        ['last30', t('export.presets.last30')],
        ['last90', t('export.presets.last90')],
      ] as const,
    [t],
  );

  return (
    <div className={`${styles.screen} page-scroll`}>
      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={() => navigate(-1)}>
          <IconArrowBack size={22} color={Colors.dashboard.stroke} />
        </button>
        <h1>{t('date.calendar')}</h1>
        <span style={{ width: 40 }} />
      </header>

      <div className={styles.stats}>
        <div className={styles.statBox}>
          <div className={styles.statValue}>{streak ?? '-'}</div>
          <div className={styles.statLabel}>{t('date.streak')}</div>
        </div>
        <div className={styles.statBox}>
          <div className={styles.statValue}>{weightText}</div>
          <div className={styles.statLabel}>{t('date.weightChange')}</div>
        </div>
      </div>

      <div className={styles.calendar}>
        <div className={styles.monthRow}>
          <button
            type="button"
            onClick={() => {
              if (viewMonth === 0) {
                setViewYear((y) => y - 1);
                setViewMonth(11);
              } else setViewMonth((m) => m - 1);
            }}
          >
            <IconChevronLeft size={24} color={Colors.dashboard.stroke} />
          </button>
          <h2>
            {HU_MONTHS[viewMonth]} {viewYear}
          </h2>
          <button
            type="button"
            onClick={() => {
              if (viewMonth === 11) {
                setViewYear((y) => y + 1);
                setViewMonth(0);
              } else setViewMonth((m) => m + 1);
            }}
          >
            <IconChevronRight size={24} color={Colors.dashboard.stroke} />
          </button>
        </div>

        <div className={styles.weekHead}>
          {DAY_LABELS.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>

        {weeks.map((week, wi) => (
          <div key={wi} className={styles.week}>
            {week.map((day, di) => {
              if (day == null) {
                return (
                  <span
                    key={di}
                    className={`${styles.dayEmpty} ${isMeasureMode ? styles.dayEmptyWeight : ''}`}
                  />
                );
              }
              const d = new Date(viewYear, viewMonth, day);
              d.setHours(0, 0, 0, 0);
              const isToday = d.getTime() === today.getTime();
              const isSelected = d.getTime() === sel.getTime();
              const isFuture = d.getTime() > today.getTime();
              const dateStr = toLocalDateStr(d);
              const dayKcal = loggedByDate.get(dateStr);
              const tone = dayKcal != null ? kcalGoalTone(dayKcal, dailyKcalGoal) : null;
              const dayMeasure = measureByDate.get(dateStr);
              return (
                <button
                  key={di}
                  type="button"
                  className={`${styles.day} ${isMeasureMode ? styles.dayWeightMode : ''} ${isToday ? styles.today : ''} ${isSelected ? styles.selected : ''} ${isFuture && !isSelected ? styles.future : ''}`}
                  onClick={() => selectDay(day)}
                >
                  {day}
                  {isMeasureMode ? (
                    dayMeasure != null ? (
                      <span className={styles.dayWeightBadge} aria-hidden>
                        {dayMeasure.toFixed(1)}
                      </span>
                    ) : (
                      <span className={styles.dayWeightBadgeSpacer} aria-hidden />
                    )
                  ) : tone ? (
                    <span
                      className={`${styles.loggedDot} ${
                        tone === 'green' ? styles.dotGreen : tone === 'yellow' ? styles.dotYellow : styles.dotRed
                      }`}
                      aria-hidden
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className={styles.exportWrap}>
        <button
          type="button"
          className={styles.exportToggle}
          onClick={() => setExportOpen((v) => !v)}
        >
          <IconDownload size={18} color={Colors.dashboard.stroke} />
          {t('export.downloadXlsx')}
        </button>

        {exportOpen && (
          <div className={styles.exportPanel}>
            <p className={styles.exportLabel}>{t('export.selectRange')}</p>
            <div className={styles.presetRow}>
              {presets.map(([key, label]) => (
                <button key={key} type="button" className={styles.preset} onClick={() => applyPreset(key)}>
                  {label}
                </button>
              ))}
            </div>
            <div className={styles.rangeRow}>
              <label className={styles.rangeField}>
                <span>{t('export.from')}</span>
                <input
                  type="date"
                  value={exportFrom}
                  max={exportTo}
                  onChange={(e) => setExportFrom(e.target.value)}
                />
              </label>
              <label className={styles.rangeField}>
                <span>{t('export.to')}</span>
                <input
                  type="date"
                  value={exportTo}
                  min={exportFrom}
                  max={toLocalDateStr(new Date())}
                  onChange={(e) => setExportTo(e.target.value)}
                />
              </label>
            </div>
            <button
              type="button"
              className={styles.exportGo}
              onClick={handleExport}
              disabled={exporting || !exportFrom || !exportTo}
            >
              <IconDownload size={18} color={Colors.dashboard.stroke} />
              {exporting ? t('export.generating') : t('export.downloadXlsx')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
