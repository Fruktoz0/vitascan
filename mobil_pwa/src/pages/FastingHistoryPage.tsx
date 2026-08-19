import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { Colors } from '../design/tokens';
import {
  IconArrowBack,
  IconBolt,
  IconCalendarToday,
  IconCheck,
  IconEvent,
  IconExpandMore,
  IconFilterList,
  IconFire,
  IconRestaurant,
  IconTarget,
  IconTimer,
} from '../components/ui/Icons';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import LogTrendSheet from '../components/logs/LogTrendSheet';
import { fastingApi, getErrorMessage, type FastSessionDto } from '../services/api';
import { toLocalDateStr } from '../stores/dateStore';
import {
  defaultRange,
  matchingPreset,
  monthKey,
  rangeForPreset,
  type DateRange,
  type PresetKey,
} from '../utils/dateRangePresets';
import { formatMinutesLabel, protocolLabelKey, sessionDayKey } from '../utils/fasting';
import styles from './BodyMeasurements.module.css';
import fasting from './FastingPage.module.css';

function hoursValue(item: FastSessionDto) {
  return Math.round((item.elapsedMinutes / 60) * 10) / 10;
}

const PROTOCOL_META: Record<string, { Icon: typeof IconTimer; color: string; bg: string }> = {
  '16:8': { Icon: IconTimer, color: '#1565C0', bg: '#e3f2fd' },
  '18:6': { Icon: IconBolt, color: '#E65100', bg: '#fff3e0' },
  '20:4': { Icon: IconFire, color: '#c62828', bg: '#ffebee' },
  OMAD: { Icon: IconRestaurant, color: '#6A1B9A', bg: '#f3e5f5' },
  CUSTOM: { Icon: IconTarget, color: '#2e7d32', bg: '#e8f5e9' },
};

export default function FastingHistoryPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const monthRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [loading, setLoading] = useState(true);
  const [latest, setLatest] = useState<FastSessionDto | null>(null);
  const [items, setItems] = useState<FastSessionDto[]>([]);
  const [goalMinutes, setGoalMinutes] = useState(960);
  const [detail, setDetail] = useState<FastSessionDto | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
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

  const dayKeyOf = (item: FastSessionDto) => sessionDayKey(item.endedAt ?? item.startedAt);

  const load = useCallback(async () => {
    try {
      const res = await fastingApi.history(appliedRange?.from, appliedRange?.to);
      setLatest(res.latest);
      setItems(res.items);
      setGoalMinutes(res.goalMinutes);
    } catch (e) {
      setDialog({
        title: t('food.errorTitle'),
        message: getErrorMessage(e, t('fastingLog.loadFailed')),
      });
    } finally {
      setLoading(false);
    }
  }, [appliedRange, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!statsOpen) return;
    let cancelled = false;
    setStatsLoading(true);
    const range = rangeForPreset('last90');
    fastingApi
      .history(range.from, range.to)
      .then((res) => {
        if (cancelled) return;
        const byDate = new Map<string, number>();
        for (const item of [...res.items].reverse()) {
          byDate.set(dayKeyOf(item), hoursValue(item));
        }
        setStatsPoints([...byDate.entries()].map(([date, value]) => ({ date, value })));
        setGoalMinutes(res.goalMinutes);
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
    const key = sessionStorage.getItem('fastingLogScrollDate');
    if (!key) return;
    const el = rowRefs.current[key];
    sessionStorage.removeItem('fastingLogScrollDate');
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
      const key = monthKey(dayKeyOf(item));
      if (seen.has(key)) continue;
      seen.add(key);
      opts.push({
        key,
        label: new Date(`${dayKeyOf(item)}T12:00:00`).toLocaleDateString(locale, {
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

  const formatDate = (isoDay: string) =>
    new Date(`${isoDay}T12:00:00`).toLocaleDateString(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

  const formatListDate = (isoDay: string) =>
    new Date(`${isoDay}T12:00:00`).toLocaleDateString(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'long',
    });

  const formatShortDate = (iso: string) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

  const formatDateTime = (iso: string) =>
    new Date(iso).toLocaleString(locale, {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

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

  const deleteDetail = async () => {
    if (!detail) return;
    setConfirmDelete(false);
    setBusy(true);
    try {
      await fastingApi.delete(detail.id);
      setDetail(null);
      await load();
    } catch (e) {
      setDialog({
        title: t('food.errorTitle'),
        message: getErrorMessage(e, t('fasting.deleteFailed')),
      });
    } finally {
      setBusy(false);
    }
  };

  const monthlyChange = useMemo(() => {
    const range = rangeForPreset('thisMonth');
    const pts = statsPoints.filter((p) => p.date >= range.from && p.date <= range.to);
    if (pts.length < 2) return null;
    return pts[pts.length - 1]!.value - pts[0]!.value;
  }, [statsPoints]);

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

  const latestDay = latest ? dayKeyOf(latest) : null;
  const detailMeta = detail ? (PROTOCOL_META[detail.protocol] ?? PROTOCOL_META.CUSTOM) : PROTOCOL_META.CUSTOM;
  const detailHit = detail ? detail.elapsedMinutes >= detail.goalMinutes : false;
  const detailPct = detail
    ? Math.min(100, Math.round((detail.elapsedMinutes / Math.max(1, detail.goalMinutes)) * 100))
    : 0;
  const DetailProtocolIcon = detailMeta.Icon;

  return (
    <div className={`${styles.screen} page-scroll no-tab`}>
      <div className={`${styles.blob} ${styles.blobMint}`} />
      <div className={`${styles.blob} ${styles.blobPeach}`} />

      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={() => navigate(-1)}>
          <IconArrowBack size={22} color={Colors.dashboard.stroke} />
        </button>
        <h1>{t('fastingLog.title')}</h1>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.calendarBtn}
            onClick={openFilter}
            aria-label={t('fastingLog.filterAria')}
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
            onClick={() => navigate('/date-picker?mode=fasting')}
            aria-label={t('fastingLog.calendarAria')}
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
              <div className={styles.latestLabel}>{t('fastingLog.latest')}</div>
              <div className={styles.latestValue}>
                {latest ? formatMinutesLabel(latest.elapsedMinutes, i18n.language) : '—'}
              </div>
              {latest && latestDay ? (
                <div className={styles.latestDate}>
                  {t(protocolLabelKey(latest.protocol))} · {formatDate(latestDay)}
                </div>
              ) : null}
              <div className={styles.latestStatsHint}>{t('logStats.openHint')}</div>
            </button>
          </div>
        </div>

        <div className={styles.sectionRow}>
          <h2 className={styles.sectionTitle}>{t('fastingLog.previous')}</h2>
          {activeMonthLabel ? (
            <button
              type="button"
              className={styles.monthPickerBtn}
              onClick={() => setMonthPickerOpen(true)}
              aria-label={t('fastingLog.monthPickerAria')}
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
            {t('fastingLog.filterRange', {
              from: formatShortDate(appliedRange.from),
              to: formatShortDate(appliedRange.to),
            })}
          </p>
        ) : null}

        {items.length === 0 ? (
          <p className={styles.emptyHint}>
            {appliedRange ? t('fastingLog.noHistoryInRange') : t('fastingLog.noHistory')}
          </p>
        ) : (
          items.map((item, idx) => {
            const day = dayKeyOf(item);
            const prev = idx > 0 ? items[idx - 1] : null;
            const key = monthKey(day);
            const showMonth = !prev || monthKey(dayKeyOf(prev)) !== key;
            const monthLabel = new Date(`${day}T12:00:00`).toLocaleDateString(locale, {
              month: 'long',
              year: 'numeric',
            });
            const hit = item.elapsedMinutes >= item.goalMinutes;
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
                    const firstOfDay = !prev || dayKeyOf(prev) !== day;
                    if (firstOfDay) rowRefs.current[day] = el;
                  }}
                >
                  <span className={styles.cardShadow} />
                  <button
                    type="button"
                    className={`${styles.historyCardBtn} ${
                      highlightDate === day ? styles.historyCardHighlight : ''
                    }`}
                    onClick={() => setDetail(item)}
                  >
                    <span
                      className={styles.historyIcon}
                      style={{ background: idx === 0 && !appliedRange ? '#e6d5c3' : '#E8E8E8' }}
                    >
                      {idx === 0 && !appliedRange ? (
                        <IconTimer size={20} color={Colors.dashboard.stroke} />
                      ) : (
                        <IconEvent size={18} color={Colors.dashboard.stroke} />
                      )}
                    </span>
                    <div className={styles.historyMid}>
                      <span className={styles.historyDate}>{formatListDate(day)}</span>
                      <span className={`${styles.deltaBadge} ${hit ? styles.deltaUp : styles.deltaDown}`}>
                        {hit ? t('fastingLog.hitGoal') : t('fastingLog.missedGoal')}
                      </span>
                    </div>
                    <span className={styles.historyValue}>
                      {formatMinutesLabel(item.elapsedMinutes, i18n.language)}
                    </span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {detail ? (
        <div className={styles.goalOverlay} role="presentation" onClick={() => setDetail(null)}>
          <div
            className={fasting.detailDialog}
            role="dialog"
            aria-labelledby="fasting-detail-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={fasting.detailHead}>
              <span className={fasting.detailIcon} style={{ background: detailMeta.bg }}>
                <DetailProtocolIcon size={22} color={detailMeta.color} />
              </span>
              <div>
                <div className={fasting.detailKicker}>{t('fastingLog.detailTitle')}</div>
                <h3 id="fasting-detail-title" className={fasting.detailTitle}>
                  {t(protocolLabelKey(detail.protocol))}
                </h3>
              </div>
            </div>

            <div className={fasting.detailHero}>
              <div className={fasting.detailDuration}>
                {formatMinutesLabel(detail.elapsedMinutes, i18n.language)}
              </div>
              <span
                className={`${fasting.detailBadge} ${detailHit ? fasting.detailBadgeHit : fasting.detailBadgeMiss}`}
              >
                {detailHit ? <IconCheck size={14} color="#2e7d32" /> : <IconTarget size={14} color="#c62828" />}
                {detailHit ? t('fastingLog.hitGoal') : t('fastingLog.missedGoal')}
              </span>
              <div className={fasting.detailTrack} aria-hidden>
                <div
                  className={`${fasting.detailFill} ${detailHit ? '' : fasting.detailFillMiss}`}
                  style={{ width: `${detailPct}%` }}
                />
              </div>
            </div>

            <div className={fasting.detailList}>
              <div className={fasting.detailRow}>
                <span className={fasting.detailRowIcon} style={{ background: '#e3f2fd' }}>
                  <IconTimer size={16} color="#1565C0" />
                </span>
                <div className={fasting.detailRowText}>
                  <span className={fasting.detailRowLabel}>{t('fastingLog.started')}</span>
                  <span className={fasting.detailRowValue}>{formatDateTime(detail.startedAt)}</span>
                </div>
              </div>
              <div className={fasting.detailRow}>
                <span className={fasting.detailRowIcon} style={{ background: '#eadecc' }}>
                  <IconEvent size={16} color={Colors.dashboard.stroke} />
                </span>
                <div className={fasting.detailRowText}>
                  <span className={fasting.detailRowLabel}>{t('fastingLog.ended')}</span>
                  <span className={fasting.detailRowValue}>
                    {detail.endedAt ? formatDateTime(detail.endedAt) : '—'}
                  </span>
                </div>
              </div>
              <div className={fasting.detailRow}>
                <span className={fasting.detailRowIcon} style={{ background: '#e8f5e9' }}>
                  <IconTarget size={16} color="#2e7d32" />
                </span>
                <div className={fasting.detailRowText}>
                  <span className={fasting.detailRowLabel}>{t('fastingLog.goal')}</span>
                  <span className={fasting.detailRowValue}>
                    {formatMinutesLabel(detail.goalMinutes, i18n.language)}
                  </span>
                </div>
              </div>
              <div className={fasting.detailRow}>
                <span className={fasting.detailRowIcon} style={{ background: '#f3e5f5' }}>
                  <IconBolt size={16} color="#6A1B9A" />
                </span>
                <div className={fasting.detailRowText}>
                  <span className={fasting.detailRowLabel}>{t('fastingLog.source')}</span>
                  <span className={fasting.detailRowValue}>
                    {detail.source === 'FROM_LAST_MEAL'
                      ? t('fastingLog.sourceFromMeal')
                      : t('fastingLog.sourceManual')}
                  </span>
                </div>
              </div>
            </div>

            <div className={styles.goalActions} style={{ marginTop: 2 }}>
              <button
                type="button"
                className={styles.goalDelete}
                disabled={busy}
                onClick={() => setConfirmDelete(true)}
              >
                {t('common.delete')}
              </button>
              <button type="button" className={styles.goalSave} onClick={() => setDetail(null)}>
                {t('common.ok')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {monthPickerOpen && (
        <div className={styles.goalOverlay} role="presentation" onClick={() => setMonthPickerOpen(false)}>
          <div
            className={styles.goalDialog}
            role="listbox"
            aria-label={t('fastingLog.monthPickerAria')}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className={styles.goalDialogTitle}>{t('fastingLog.monthPickerTitle')}</h3>
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
            aria-labelledby="fasting-filter-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="fasting-filter-title" className={styles.goalDialogTitle}>
              {t('fastingLog.filterTitle')}
            </h3>
            <p className={styles.goalDialogMsg}>{t('fastingLog.filterMessage')}</p>
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
                {t('fastingLog.filterClear')}
              </button>
              <button
                type="button"
                className={styles.goalSave}
                disabled={!draftFrom || !draftTo}
                onClick={applyFilter}
              >
                {t('fastingLog.filterApply')}
              </button>
            </div>
          </div>
        </div>
      )}

      <LogTrendSheet
        open={statsOpen}
        onClose={() => setStatsOpen(false)}
        title={t('logStats.title')}
        unit={t('fastingLog.hoursUnit')}
        points={statsPoints}
        period={statsPeriod}
        onPeriodChange={setStatsPeriod}
        goal={Math.round((goalMinutes / 60) * 10) / 10}
        monthlyChange={monthlyChange}
        formatValue={(n) => n.toFixed(1)}
        loading={statsLoading}
      />

      <ConfirmDialog
        visible={confirmDelete}
        title={t('common.delete')}
        message={t('fasting.deleteMessage')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        destructive
        onConfirm={() => void deleteDetail()}
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
