import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { Colors } from '../design/tokens';
import {
  IconAdd,
  IconArrowBack,
  IconCalendarToday,
  IconEvent,
  IconWaterDrop,
} from '../components/ui/Icons';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { ApiError, getErrorMessage, waterApi } from '../services/api';
import styles from './BodyMeasurements.module.css';

type HistoryItem = {
  id: string;
  totalMl: number;
  loggedDate: string;
  deltaMl: number | null;
};

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function formatLiters(ml: number) {
  return `${(ml / 1000).toFixed(1)} L`;
}

export default function WaterLogPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dateInputRef = useRef<HTMLInputElement>(null);

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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await waterApi.history();
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
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const locale = i18n.language === 'hu' ? 'hu-HU' : 'en-US';

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
        <span className={styles.headerSpacer} />
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
        </div>

        {items.length === 0 ? (
          <p className={styles.emptyHint}>{t('waterLog.noHistory')}</p>
        ) : (
          items.map((item, idx) => (
            <div key={item.id} className={styles.cardWrap}>
              <span className={styles.cardShadow} />
              <button
                type="button"
                className={styles.historyCardBtn}
                onClick={() => openEdit(item)}
              >
                <span
                  className={styles.historyIcon}
                  style={{ background: idx === 0 ? '#d2e6ef' : '#E8E8E8' }}
                >
                  {idx === 0 ? (
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
          ))
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
              max={todayStr()}
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
