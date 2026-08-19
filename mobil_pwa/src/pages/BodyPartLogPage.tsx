import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { Colors } from '../design/tokens';
import {
  IconAdd,
  IconArrowBack,
  IconCalendarToday,
  IconEdit,
  IconEvent,
  IconExpandMore,
  IconFilterList,
  IconTarget,
} from '../components/ui/Icons';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { ApiError, bodyApi, getErrorMessage } from '../services/api';
import { toLocalDateStr } from '../stores/dateStore';
import { BODY_PART_META, isBodyPart } from '../utils/bodyMeta';
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
  valueCm: number;
  loggedDate: string;
  deltaCm: number | null;
};

export default function BodyPartLogPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { part } = useParams<{ part: string }>();
  const bodyPart = isBodyPart(part) ? part : null;
  const dateInputRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const monthRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [loading, setLoading] = useState(true);
  const [latest, setLatest] = useState<{ valueCm: number; loggedDate: string } | null>(null);
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [monthlyChangeCm, setMonthlyChangeCm] = useState<number | null>(null);
  const [goalCm, setGoalCm] = useState<number | null>(null);
  const [goalOpen, setGoalOpen] = useState(false);
  const [goalInput, setGoalInput] = useState('');
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
    if (!bodyPart) return;
    try {
      const res = await bodyApi.history(bodyPart, appliedRange ?? undefined);
      setLatest(
        res.latest ? { valueCm: res.latest.valueCm, loggedDate: res.latest.loggedDate } : null,
      );
      setItems(res.items);
      setMonthlyChangeCm(res.monthlyChangeCm);
      setGoalCm(res.goalCm);
    } catch (e) {
      setDialog({
        title: t('food.errorTitle'),
        message: getErrorMessage(e, t('bodyData.loadFailed')),
      });
    } finally {
      setLoading(false);
    }
  }, [appliedRange, bodyPart, t]);

  useEffect(() => {
    if (!bodyPart) {
      navigate('/body', { replace: true });
      return;
    }
    load();
  }, [bodyPart, load, navigate]);

  useEffect(() => {
    if (loading || !bodyPart) return;
    const storedPart = sessionStorage.getItem('bodyLogScrollPart');
    const key = sessionStorage.getItem('bodyLogScrollDate');
    if (!key || storedPart !== bodyPart) return;
    const el = rowRefs.current[key];
    sessionStorage.removeItem('bodyLogScrollDate');
    sessionStorage.removeItem('bodyLogScrollPart');
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightDate(key);
    setSelectedMonthKey(monthKey(key));
    const timer = window.setTimeout(() => setHighlightDate(null), 1600);
    return () => window.clearTimeout(timer);
  }, [loading, items, bodyPart]);

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

  if (!bodyPart) return null;

  const meta = BODY_PART_META[bodyPart];

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
    setEditValue(String(item.valueCm));
    setEditDate(item.loggedDate);
    setConfirmDelete(false);
  };

  const closeEdit = () => {
    setEditItem(null);
    setConfirmDelete(false);
  };

  const openGoal = () => {
    setGoalInput(goalCm != null ? String(goalCm) : '');
    setGoalOpen(true);
  };

  const saveGoal = async () => {
    const n = Number(String(goalInput).replace(',', '.'));
    if (!Number.isFinite(n) || n < 10 || n > 300) {
      setDialog({ title: t('food.errorTitle'), message: t('bodyData.invalidGoal') });
      return;
    }
    try {
      await bodyApi.setGoals([{ bodyPart, goalCm: n }]);
      setGoalCm(n);
      setGoalOpen(false);
    } catch (e) {
      setDialog({
        title: t('food.errorTitle'),
        message: getErrorMessage(e, t('bodyData.saveFailed')),
      });
    }
  };

  const saveEdit = async () => {
    if (!editItem) return;
    const n = Number(String(editValue).replace(',', '.'));
    if (!Number.isFinite(n) || n < 10 || n > 300) {
      setDialog({ title: t('food.errorTitle'), message: t('bodyData.invalidValue') });
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(editDate)) {
      setDialog({ title: t('food.errorTitle'), message: t('bodyData.invalidValue') });
      return;
    }
    setEditBusy(true);
    try {
      await bodyApi.update(editItem.id, {
        valueCm: Math.round(n * 10) / 10,
        date: editDate,
      });
      closeEdit();
      await load();
    } catch (e) {
      setDialog({
        title: t('food.errorTitle'),
        message:
          e instanceof ApiError && e.status === 409
            ? t('bodyData.dateConflict')
            : getErrorMessage(e, t('bodyData.saveFailed')),
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
      await bodyApi.delete(editItem.id);
      closeEdit();
      await load();
    } catch (e) {
      setDialog({
        title: t('food.errorTitle'),
        message: getErrorMessage(e, t('bodyData.saveFailed')),
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
        <h1>{t('bodyData.partLogTitle', { part: t(meta.labelKey) })}</h1>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.calendarBtn}
            onClick={openFilter}
            aria-label={t('bodyData.filterAria')}
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
            onClick={() => navigate(`/date-picker?mode=body&part=${bodyPart}`)}
            aria-label={t('bodyData.calendarAria')}
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
              className={styles.latestEditBtn}
              onClick={openGoal}
              aria-label={t('bodyData.setGoalTitle')}
            >
              <IconEdit size={18} color={Colors.dashboard.stroke} />
            </button>
            <div className={styles.latestLabel}>{t('bodyData.latestMeasurement')}</div>
            <div className={styles.latestValue}>
              {latest ? `${latest.valueCm.toFixed(1)} cm` : '—'}
            </div>
            {latest && <div className={styles.latestDate}>{formatDate(latest.loggedDate)}</div>}
          </div>
        </div>

        <div className={styles.ctaWrap}>
          <span className={styles.ctaShadow} />
          <button
            type="button"
            className={styles.ctaBtn}
            onClick={() => navigate(`/body/new?part=${bodyPart}`)}
          >
            <span className={styles.ctaIcon}>
              <IconAdd size={16} color={Colors.dashboard.stroke} />
            </span>
            <span className={styles.ctaLabel}>{t('bodyData.addMeasurement')}</span>
          </button>
        </div>

        <div className={styles.sectionRow}>
          <h2 className={styles.sectionTitle}>{t('bodyData.previous')}</h2>
          {activeMonthLabel ? (
            <button
              type="button"
              className={styles.monthPickerBtn}
              onClick={() => setMonthPickerOpen(true)}
              aria-label={t('bodyData.monthPickerAria')}
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
            {t('bodyData.filterRange', {
              from: formatShortDate(appliedRange.from),
              to: formatShortDate(appliedRange.to),
            })}
          </p>
        ) : null}

        {items.length === 0 ? (
          <p className={styles.emptyHint}>
            {appliedRange ? t('bodyData.noHistoryInRange') : t('bodyData.noHistory')}
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
                      style={{ background: idx === 0 && !appliedRange ? meta.bg : '#E8E8E8' }}
                    >
                      {idx === 0 && !appliedRange ? (
                        <IconEvent size={20} color={Colors.dashboard.stroke} />
                      ) : (
                        <IconCalendarToday size={18} color={Colors.dashboard.stroke} />
                      )}
                    </span>
                    <div className={styles.historyMid}>
                      <span className={styles.historyDate}>{formatListDate(item.loggedDate)}</span>
                      {item.deltaCm != null && item.deltaCm !== 0 && (
                        <span
                          className={`${styles.deltaBadge} ${
                            item.deltaCm < 0 ? styles.deltaDown : styles.deltaUp
                          }`}
                        >
                          {item.deltaCm > 0 ? '+' : ''}
                          {item.deltaCm.toFixed(1)} cm
                        </span>
                      )}
                    </div>
                    <span className={styles.historyValue}>{item.valueCm.toFixed(1)} cm</span>
                  </button>
                </div>
              </div>
            );
          })
        )}

        <div className={styles.statsRow}>
          <div className={styles.cardWrap}>
            <span className={styles.cardShadow} />
            <div className={styles.statCard}>
              <div className={styles.statLabel}>{t('bodyData.monthlyChange')}</div>
              <div className={styles.statValue}>
                {monthlyChangeCm == null
                  ? '—'
                  : `${monthlyChangeCm > 0 ? '+' : ''}${monthlyChangeCm.toFixed(1)} cm`}
              </div>
            </div>
          </div>
          <div className={styles.cardWrap}>
            <span className={styles.cardShadow} />
            <div className={styles.statCard}>
              <div className={styles.statLabel}>{t('bodyData.goalMeasurement')}</div>
              <div className={styles.statValue}>
                <IconTarget size={16} color={Colors.dashboard.stroke} />
                {goalCm != null ? `${goalCm.toFixed(1)} cm` : '—'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {goalOpen && (
        <div className={styles.goalOverlay} role="presentation" onClick={() => setGoalOpen(false)}>
          <div className={styles.goalDialog} role="dialog" onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.goalDialogTitle}>{t('bodyData.setGoalTitle')}</h3>
            <p className={styles.goalDialogMsg}>{t('bodyData.setGoalMessage')}</p>
            <div className={styles.valueRow}>
              <input
                className={styles.valueInput}
                inputMode="decimal"
                value={goalInput}
                onChange={(e) => setGoalInput(e.target.value)}
                placeholder="34.0"
                autoFocus
              />
              <span className={styles.valueUnit}>cm</span>
            </div>
            <div className={styles.goalActions}>
              <button type="button" className={styles.goalCancel} onClick={() => setGoalOpen(false)}>
                {t('common.cancel')}
              </button>
              <button type="button" className={styles.goalSave} onClick={saveGoal}>
                {t('bodyData.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {editItem && (
        <div className={styles.goalOverlay} role="presentation" onClick={closeEdit}>
          <div className={styles.goalDialog} role="dialog" onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.goalDialogTitle}>{t('bodyData.editMeasurementTitle')}</h3>
            <p className={styles.goalDialogMsg}>{t('bodyData.editMeasurementMessage')}</p>

            <div className={styles.fieldLabel}>{t('bodyData.valueCm')}</div>
            <div className={styles.valueRow}>
              <input
                className={styles.valueInput}
                inputMode="decimal"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                autoFocus
              />
              <span className={styles.valueUnit}>cm</span>
            </div>

            <div className={styles.fieldLabel} style={{ marginTop: 12 }}>
              {t('bodyData.date')}
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
                {editBusy ? '...' : t('bodyData.save')}
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
            aria-label={t('bodyData.monthPickerAria')}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className={styles.goalDialogTitle}>{t('bodyData.monthPickerTitle')}</h3>
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
            aria-labelledby="body-filter-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="body-filter-title" className={styles.goalDialogTitle}>
              {t('bodyData.filterTitle')}
            </h3>
            <p className={styles.goalDialogMsg}>{t('bodyData.filterMessage')}</p>
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
                {t('bodyData.filterClear')}
              </button>
              <button
                type="button"
                className={styles.goalSave}
                disabled={!draftFrom || !draftTo}
                onClick={applyFilter}
              >
                {t('bodyData.filterApply')}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        visible={confirmDelete}
        title={t('common.delete')}
        message={t('bodyData.confirmDeleteMeasurement')}
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
