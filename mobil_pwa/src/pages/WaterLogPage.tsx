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
  IconWaterDrop,
} from '../components/ui/Icons';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { ApiError, getErrorMessage, waterApi } from '../services/api';
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
  totalMl: number;
  loggedDate: string;
  deltaMl: number | null;
};

function formatLiters(ml: number) {
  return `${(ml / 1000).toFixed(1)} L`;
}

export default function WaterLogPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dateInputRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const monthRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [loading, setLoading] = useState(true);
  const [latest, setLatest] = useState<{ totalMl: number; loggedDate: string } | null>(null);
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [goalMl, setGoalMl] = useState(2000);
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

  const load = useCallback(async () => {
    try {
      const res = await waterApi.history(appliedRange ?? undefined);
      setLatest(
        res.latest ? { totalMl: res.latest.totalMl, loggedDate: res.latest.loggedDate } : null,
      );
      setItems(res.items);
      setGoalMl(res.goalMl);
    } catch (e) {
      setDialog({
        title: t('food.errorTitle'),
        message: getErrorMessage(e, t('waterLog.loadFailed')),
      });
    } finally {
      setLoading(false);
    }
  }, [appliedRange, t]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (loading) return;
    const key = sessionStorage.getItem('waterLogScrollDate');
    if (!key) return;
    const el = rowRefs.current[key];
    sessionStorage.removeItem('waterLogScrollDate');
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
    monthRefs.current[key]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    setEditValue(String(item.totalMl));
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
    if (!Number.isFinite(n) || n < 0 || n > 20000) {
      setDialog({ title: t('food.errorTitle'), message: t('waterLog.invalidValue') });
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(editDate)) {
      setDialog({ title: t('food.errorTitle'), message: t('waterLog.invalidValue') });
      return;
    }
    setEditBusy(true);
    try {
      await waterApi.update(editItem.id, {
        totalMl: Math.round(n),
        date: editDate,
      });
      closeEdit();
      await load();
    } catch (e) {
      setDialog({
        title: t('food.errorTitle'),
        message:
          e instanceof ApiError && e.status === 409
            ? t('waterLog.dateConflict')
            : getErrorMessage(e, t('waterLog.saveFailed')),
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
      await waterApi.delete(editItem.id);
      closeEdit();
      await load();
    } catch (e) {
      setDialog({
        title: t('food.errorTitle'),
        message: getErrorMessage(e, t('waterLog.saveFailed')),
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
        <h1>{t('waterLog.title')}</h1>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.calendarBtn}
            onClick={openFilter}
            aria-label={t('waterLog.filterAria')}
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
            onClick={() => navigate('/date-picker?mode=water')}
            aria-label={t('waterLog.calendarAria')}
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
            <div className={styles.latestLabel}>{t('waterLog.latestMeasurement')}</div>
            <div className={styles.latestValue}>
              {latest ? formatLiters(latest.totalMl) : '—'}
            </div>
            {latest && <div className={styles.latestDate}>{formatDate(latest.loggedDate)}</div>}
            <div className={styles.latestDate}>
              {t('waterLog.dailyGoal', { liters: (goalMl / 1000).toFixed(1) })}
            </div>
          </div>
        </div>

        <div className={styles.ctaWrap}>
          <span className={styles.ctaShadow} />
          <button type="button" className={styles.ctaBtn} onClick={() => navigate('/water/new')}>
            <span className={styles.ctaIcon}>
              <IconAdd size={16} color={Colors.dashboard.stroke} />
            </span>
            <span className={styles.ctaLabel}>{t('waterLog.addMeasurement')}</span>
          </button>
        </div>

        <div className={styles.sectionRow}>
          <h2 className={styles.sectionTitle}>{t('waterLog.previous')}</h2>
          {activeMonthLabel ? (
            <button
              type="button"
              className={styles.monthPickerBtn}
              onClick={() => setMonthPickerOpen(true)}
              aria-label={t('waterLog.monthPickerAria')}
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
            {t('waterLog.filterRange', {
              from: formatShortDate(appliedRange.from),
              to: formatShortDate(appliedRange.to),
            })}
          </p>
        ) : null}

        {items.length === 0 ? (
          <p className={styles.emptyHint}>
            {appliedRange ? t('waterLog.noHistoryInRange') : t('waterLog.noHistory')}
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
                      style={{ background: idx === 0 && !appliedRange ? '#d2e6ef' : '#E8E8E8' }}
                    >
                      {idx === 0 && !appliedRange ? (
                        <IconWaterDrop size={20} color={Colors.dashboard.stroke} />
                      ) : (
                        <IconEvent size={18} color={Colors.dashboard.stroke} />
                      )}
                    </span>
                    <div className={styles.historyMid}>
                      <span className={styles.historyDate}>{formatListDate(item.loggedDate)}</span>
                      {item.deltaMl != null && item.deltaMl !== 0 && (
                        <span
                          className={`${styles.deltaBadge} ${
                            item.deltaMl < 0 ? styles.deltaDown : styles.deltaUp
                          }`}
                        >
                          {item.deltaMl > 0 ? '+' : ''}
                          {item.deltaMl} ml
                        </span>
                      )}
                    </div>
                    <span className={styles.historyValue}>{formatLiters(item.totalMl)}</span>
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
            <h3 className={styles.goalDialogTitle}>{t('waterLog.editTitle')}</h3>
            <p className={styles.goalDialogMsg}>{t('waterLog.editMessage')}</p>

            <div className={styles.fieldLabel}>{t('waterLog.valueMl')}</div>
            <div className={styles.valueRow}>
              <input
                className={styles.valueInput}
                inputMode="numeric"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                autoFocus
              />
              <span className={styles.valueUnit}>ml</span>
            </div>

            <div className={styles.fieldLabel} style={{ marginTop: 12 }}>
              {t('waterLog.date')}
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
                {editBusy ? '...' : t('waterLog.save')}
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
            aria-label={t('waterLog.monthPickerAria')}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className={styles.goalDialogTitle}>{t('waterLog.monthPickerTitle')}</h3>
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
            aria-labelledby="water-filter-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="water-filter-title" className={styles.goalDialogTitle}>
              {t('waterLog.filterTitle')}
            </h3>
            <p className={styles.goalDialogMsg}>{t('waterLog.filterMessage')}</p>
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
                {t('waterLog.filterClear')}
              </button>
              <button
                type="button"
                className={styles.goalSave}
                disabled={!draftFrom || !draftTo}
                onClick={applyFilter}
              >
                {t('waterLog.filterApply')}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        visible={confirmDelete}
        title={t('common.delete')}
        message={t('waterLog.confirmDelete')}
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
