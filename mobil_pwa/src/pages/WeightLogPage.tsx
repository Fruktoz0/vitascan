import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { Colors } from '../design/tokens';
import {
  IconAdd,
  IconArrowBack,
  IconCalendarToday,
  IconEvent,
  IconExpandMore,
  IconFilterList,
} from '../components/ui/Icons';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import LogTrendSheet from '../components/logs/LogTrendSheet';
import { ApiError, getErrorMessage, weightApi } from '../services/api';
import { toLocalDateStr } from '../stores/dateStore';
import {
  defaultRange,
  matchingPreset,
  monthKey,
  rangeForPreset,
  type DateRange,
  type PresetKey,
} from '../utils/dateRangePresets';
import styles from './BodyMeasurements.module.css';

type HistoryItem = {
  id: string;
  weightKg: number;
  loggedDate: string;
  deltaKg: number | null;
};

export default function WeightLogPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dateInputRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const monthRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [loading, setLoading] = useState(true);
  const [latest, setLatest] = useState<{ weightKg: number; loggedDate: string } | null>(null);
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [monthlyChangeKg, setMonthlyChangeKg] = useState<number | null>(null);
  const [editItem, setEditItem] = useState<HistoryItem | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editBusy, setEditBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dialog, setDialog] = useState<{ title: string; message: string } | null>(null);
  const [highlightDate, setHighlightDate] = useState<string | null>(null);

  const [appliedRange, setAppliedRange] = useState<DateRange | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState('');
  const [draftTo, setDraftTo] = useState('');
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);
  const [statsPeriod, setStatsPeriod] = useState<PresetKey>('thisMonth');
  const [statsPoints, setStatsPoints] = useState<{ date: string; value: number }[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);
  const [targetWeightKg, setTargetWeightKg] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await weightApi.history(appliedRange ?? undefined);
      setLatest(
        res.latest ? { weightKg: res.latest.weightKg, loggedDate: res.latest.loggedDate } : null,
      );
      setItems(res.items);
      setMonthlyChangeKg(res.monthlyChangeKg);
      setTargetWeightKg(res.targetWeightKg ?? null);
    } catch (e) {
      setDialog({
        title: t('food.errorTitle'),
        message: getErrorMessage(e, t('weightLog.loadFailed')),
      });
    } finally {
      setLoading(false);
    }
  }, [appliedRange, t]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!statsOpen) return;
    let cancelled = false;
    setStatsLoading(true);
    weightApi
      .history(rangeForPreset('last90'))
      .then((res) => {
        if (cancelled) return;
        setStatsPoints(
          [...res.items]
            .slice()
            .reverse()
            .map((item) => ({ date: item.loggedDate, value: item.weightKg })),
        );
        setTargetWeightKg(res.targetWeightKg ?? null);
        setMonthlyChangeKg(res.monthlyChangeKg);
      })
      .catch(() => {
        if (!cancelled) setStatsPoints([]);
      })
      .finally(() => {
        if (!cancelled) setStatsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [statsOpen]);

  useEffect(() => {
    if (loading) return;
    const key = sessionStorage.getItem('weightLogScrollDate');
    if (!key) return;
    const el = rowRefs.current[key];
    sessionStorage.removeItem('weightLogScrollDate');
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightDate(key);
    setSelectedMonthKey(monthKey(key));
    const timer = window.setTimeout(() => setHighlightDate(null), 1600);
    return () => window.clearTimeout(timer);
  }, [loading, items]);

  const locale = i18n.language === 'hu' ? 'hu-HU' : 'en-US';

  const monthOptions = useMemo(() => {
    const seen = new Set<string>();
    const opts: { key: string; label: string }[] = [];
    for (const item of items) {
      const key = monthKey(item.loggedDate);
      if (seen.has(key)) continue;
      seen.add(key);
      opts.push({
        key,
        label: new Date(item.loggedDate + 'T12:00:00').toLocaleDateString(locale, {
          month: 'long',
          year: 'numeric',
        }),
      });
    }
    return opts;
  }, [items, locale]);

  const activeMonthLabel =
    monthOptions.find((m) => m.key === selectedMonthKey)?.label ?? monthOptions[0]?.label ?? null;

  const jumpToMonth = (key: string) => {
    setSelectedMonthKey(key);
    setMonthPickerOpen(false);
    const el = monthRefs.current[key];
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const formatDate = (iso: string) =>
    new Date(iso + 'T12:00:00').toLocaleDateString(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

  const formatListDate = (iso: string) =>
    new Date(iso + 'T12:00:00').toLocaleDateString(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'long',
    });

  const formatShortDate = (iso: string) =>
    new Date(iso + 'T12:00:00').toLocaleDateString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

  const openEdit = (item: HistoryItem) => {
    setEditItem(item);
    setEditValue(String(item.weightKg));
    setEditDate(item.loggedDate);
    setConfirmDelete(false);
  };

  const closeEdit = () => {
    setEditItem(null);
    setConfirmDelete(false);
  };

  const saveEdit = async () => {
    if (!editItem) return;
    const n = Number(String(editValue).replace(',', '.'));
    if (!Number.isFinite(n) || n < 20 || n > 500) {
      setDialog({ title: t('food.errorTitle'), message: t('weightLog.invalidValue') });
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(editDate)) {
      setDialog({ title: t('food.errorTitle'), message: t('weightLog.invalidValue') });
      return;
    }
    setEditBusy(true);
    try {
      await weightApi.update(editItem.id, {
        weightKg: Math.round(n * 10) / 10,
        date: editDate,
      });
      closeEdit();
      await load();
    } catch (e) {
      setDialog({
        title: t('food.errorTitle'),
        message:
          e instanceof ApiError && e.status === 409
            ? t('weightLog.dateConflict')
            : getErrorMessage(e, t('weightLog.saveFailed')),
      });
    } finally {
      setEditBusy(false);
    }
  };

  const deleteEdit = async () => {
    if (!editItem) return;
    setConfirmDelete(false);
    setEditBusy(true);
    try {
      await weightApi.delete(editItem.id);
      closeEdit();
      await load();
    } catch (e) {
      setDialog({
        title: t('food.errorTitle'),
        message: getErrorMessage(e, t('weightLog.saveFailed')),
      });
    } finally {
      setEditBusy(false);
    }
  };

  const openFilter = () => {
    const base = appliedRange ?? defaultRange();
    setDraftFrom(base.from);
    setDraftTo(base.to);
    setFilterOpen(true);
  };

  const applyPreset = (key: PresetKey) => {
    const range = rangeForPreset(key);
    setDraftFrom(range.from);
    setDraftTo(range.to);
  };

  const activePreset = matchingPreset(draftFrom, draftTo);

  const applyFilter = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draftFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(draftTo)) return;
    const from = draftFrom <= draftTo ? draftFrom : draftTo;
    const to = draftFrom <= draftTo ? draftTo : draftFrom;
    setAppliedRange({ from, to });
    setFilterOpen(false);
  };

  const clearFilter = () => {
    setAppliedRange(null);
    setFilterOpen(false);
  };

  const presets = useMemo(
    () =>
      [
        ['thisMonth', t('export.presets.thisMonth')],
        ['last7', t('export.presets.last7')],
        ['last30', t('export.presets.last30')],
        ['last90', t('export.presets.last90')],
      ] as const,
    [t],
  );

  if (loading) {
    return (
      <div className={styles.screen}>
        <div className={styles.loadingCenter}>
          <div className="spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.screen} page-scroll no-tab`}>
      <div className={`${styles.blob} ${styles.blobMint}`} />
      <div className={`${styles.blob} ${styles.blobPeach}`} />

      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={() => navigate(-1)}>
          <IconArrowBack size={22} color={Colors.dashboard.stroke} />
        </button>
        <h1>{t('weightLog.title')}</h1>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.calendarBtn}
            onClick={openFilter}
            aria-label={t('weightLog.filterAria')}
          >
            <span className={styles.calendarShadow} />
            <span className={styles.calendarInner}>
              <IconFilterList size={20} color={Colors.dashboard.stroke} />
            </span>
            {appliedRange ? <span className={styles.filterBadge} /> : null}
          </button>
          <button
            type="button"
            className={styles.calendarBtn}
            onClick={() => navigate('/date-picker?mode=weight')}
            aria-label={t('weightLog.calendarAria')}
          >
            <span className={styles.calendarShadow} />
            <span className={styles.calendarInner}>
              <IconCalendarToday size={20} color={Colors.dashboard.stroke} />
            </span>
          </button>
        </div>
      </header>

      <div className={`${styles.content} ${styles.contentStack}`}>
        <div className={styles.cardWrap}>
          <span className={styles.cardShadow} />
          <div className={styles.latestCard}>
            <button
              type="button"
              className={styles.latestStatsHit}
              disabled={!latest}
              onClick={() => setStatsOpen(true)}
              aria-label={t('logStats.aria')}
            >
              <div className={styles.latestLabel}>{t('weightLog.latestMeasurement')}</div>
              <div className={styles.latestValue}>
                {latest ? `${latest.weightKg.toFixed(1)} kg` : '—'}
              </div>
              {latest && <div className={styles.latestDate}>{formatDate(latest.loggedDate)}</div>}
            </button>
          </div>
        </div>

        <div className={styles.ctaWrap}>
          <span className={styles.ctaShadow} />
          <button
            type="button"
            className={styles.ctaBtn}
            onClick={() => navigate('/weight/new')}
          >
            <span className={styles.ctaIcon}>
              <IconAdd size={16} color={Colors.dashboard.stroke} />
            </span>
            <span className={styles.ctaLabel}>{t('weightLog.addMeasurement')}</span>
          </button>
        </div>

        <div className={styles.sectionRow}>
          <h2 className={styles.sectionTitle}>{t('weightLog.previous')}</h2>
          {activeMonthLabel ? (
            <button
              type="button"
              className={styles.monthPickerBtn}
              onClick={() => setMonthPickerOpen(true)}
              aria-label={t('weightLog.monthPickerAria')}
              aria-haspopup="listbox"
              aria-expanded={monthPickerOpen}
            >
              <span>{activeMonthLabel}</span>
              <IconExpandMore size={16} color={Colors.dashboard.stroke} />
            </button>
          ) : null}
        </div>
        {appliedRange ? (
          <p className={styles.filterRangeHint}>
            {t('weightLog.filterRange', {
              from: formatShortDate(appliedRange.from),
              to: formatShortDate(appliedRange.to),
            })}
          </p>
        ) : null}

        {items.length === 0 ? (
          <p className={styles.emptyHint}>
            {appliedRange ? t('weightLog.noHistoryInRange') : t('weightLog.noHistory')}
          </p>
        ) : (
          items.map((item, idx) => {
            const prev = idx > 0 ? items[idx - 1] : null;
            const key = monthKey(item.loggedDate);
            const showMonth = !prev || monthKey(prev.loggedDate) !== key;
            const monthLabel = new Date(item.loggedDate + 'T12:00:00').toLocaleDateString(locale, {
              month: 'long',
              year: 'numeric',
            });
            return (
              <div key={item.id}>
                {showMonth ? (
                  <div
                    className={styles.pickerMonth}
                    ref={(el) => {
                      monthRefs.current[key] = el;
                    }}
                  >
                    <span className={styles.pickerMonthLine} />
                    <span className={styles.pickerMonthLabel}>{monthLabel}</span>
                    <span className={styles.pickerMonthLine} />
                  </div>
                ) : null}
                <div
                  className={styles.cardWrap}
                  ref={(el) => {
                    rowRefs.current[item.loggedDate] = el;
                  }}
                >
                  <span className={styles.cardShadow} />
                  <button
                    type="button"
                    className={`${styles.historyCardBtn} ${
                      highlightDate === item.loggedDate ? styles.historyCardHighlight : ''
                    }`}
                    onClick={() => openEdit(item)}
                  >
                    <span
                      className={styles.historyIcon}
                      style={{ background: idx === 0 && !appliedRange ? '#e6d5c3' : '#E8E8E8' }}
                    >
                      {idx === 0 && !appliedRange ? (
                        <IconEvent size={20} color={Colors.dashboard.stroke} />
                      ) : (
                        <IconCalendarToday size={18} color={Colors.dashboard.stroke} />
                      )}
                    </span>
                    <div className={styles.historyMid}>
                      <span className={styles.historyDate}>{formatListDate(item.loggedDate)}</span>
                      {item.deltaKg != null && item.deltaKg !== 0 && (
                        <span
                          className={`${styles.deltaBadge} ${
                            item.deltaKg < 0 ? styles.deltaDown : styles.deltaUp
                          }`}
                        >
                          {item.deltaKg > 0 ? '+' : ''}
                          {item.deltaKg.toFixed(1)} kg
                        </span>
                      )}
                    </div>
                    <span className={styles.historyValue}>{item.weightKg.toFixed(1)} kg</span>
                  </button>
                </div>
              </div>
            );
          })
        )}

      </div>

      {editItem && (
        <div className={styles.goalOverlay} role="presentation" onClick={closeEdit}>
          <div className={styles.goalDialog} role="dialog" onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.goalDialogTitle}>{t('weightLog.editTitle')}</h3>
            <p className={styles.goalDialogMsg}>{t('weightLog.editMessage')}</p>

            <div className={styles.fieldLabel}>{t('weightLog.valueKg')}</div>
            <div className={styles.valueRow}>
              <input
                className={styles.valueInput}
                inputMode="decimal"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                autoFocus
              />
              <span className={styles.valueUnit}>kg</span>
            </div>

            <div className={styles.fieldLabel} style={{ marginTop: 12 }}>
              {t('weightLog.date')}
            </div>
            <button
              type="button"
              className={styles.dateBtn}
              onClick={() => dateInputRef.current?.showPicker?.() ?? dateInputRef.current?.click()}
            >
              <span>{formatDate(editDate)}</span>
              <IconCalendarToday size={18} color={Colors.dashboard.stroke} />
            </button>
            <input
              ref={dateInputRef}
              type="date"
              className={styles.hiddenDate}
              value={editDate}
              onChange={(e) => setEditDate(e.target.value || editItem.loggedDate)}
            />

            <div className={styles.goalActions}>
              <button
                type="button"
                className={styles.goalDelete}
                disabled={editBusy}
                onClick={() => setConfirmDelete(true)}
              >
                {t('common.delete')}
              </button>
              <button
                type="button"
                className={styles.goalSave}
                disabled={editBusy}
                onClick={saveEdit}
              >
                {editBusy ? '...' : t('weightLog.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {monthPickerOpen && (
        <div className={styles.goalOverlay} role="presentation" onClick={() => setMonthPickerOpen(false)}>
          <div
            className={styles.goalDialog}
            role="listbox"
            aria-label={t('weightLog.monthPickerAria')}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className={styles.goalDialogTitle}>{t('weightLog.monthPickerTitle')}</h3>
            <div className={styles.monthPickerList}>
              {monthOptions.map((opt) => {
                const active = (selectedMonthKey ?? monthOptions[0]?.key) === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={`${styles.monthPickerOption} ${active ? styles.monthPickerOptionActive : ''}`}
                    onClick={() => jumpToMonth(opt.key)}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {filterOpen && (
        <div className={styles.goalOverlay} role="presentation" onClick={() => setFilterOpen(false)}>
          <div
            className={styles.goalDialog}
            role="dialog"
            aria-labelledby="weight-filter-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="weight-filter-title" className={styles.goalDialogTitle}>
              {t('weightLog.filterTitle')}
            </h3>
            <p className={styles.goalDialogMsg}>{t('weightLog.filterMessage')}</p>
            <div className={styles.filterPresetRow}>
              {presets.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`${styles.filterPreset} ${
                    activePreset === key ? styles.filterPresetActive : ''
                  }`}
                  aria-pressed={activePreset === key}
                  onClick={() => applyPreset(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className={styles.filterRangeRow}>
              <label className={styles.filterRangeField}>
                <span>{t('export.from')}</span>
                <input
                  type="date"
                  value={draftFrom}
                  max={draftTo || toLocalDateStr(new Date())}
                  onChange={(e) => setDraftFrom(e.target.value)}
                />
              </label>
              <label className={styles.filterRangeField}>
                <span>{t('export.to')}</span>
                <input
                  type="date"
                  value={draftTo}
                  min={draftFrom}
                  max={toLocalDateStr(new Date())}
                  onChange={(e) => setDraftTo(e.target.value)}
                />
              </label>
            </div>
            <div className={styles.goalActions}>
              <button type="button" className={styles.goalCancel} onClick={clearFilter}>
                {t('weightLog.filterClear')}
              </button>
              <button
                type="button"
                className={styles.goalSave}
                disabled={!draftFrom || !draftTo}
                onClick={applyFilter}
              >
                {t('weightLog.filterApply')}
              </button>
            </div>
          </div>
        </div>
      )}

      <LogTrendSheet
        open={statsOpen}
        onClose={() => setStatsOpen(false)}
        title={t('logStats.title')}
        unit="kg"
        points={statsPoints}
        period={statsPeriod}
        onPeriodChange={setStatsPeriod}
        goal={targetWeightKg}
        monthlyChange={monthlyChangeKg}
        loading={statsLoading}
      />

      <ConfirmDialog
        visible={confirmDelete}
        title={t('common.delete')}
        message={t('weightLog.confirmDelete')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        destructive
        onConfirm={deleteEdit}
        onClose={() => setConfirmDelete(false)}
      />

      <ConfirmDialog
        visible={!!dialog}
        title={dialog?.title ?? ''}
        message={dialog?.message ?? ''}
        confirmLabel={t('common.ok', 'OK')}
        onClose={() => setDialog(null)}
      />
    </div>
  );
}
