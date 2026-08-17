import { useCallback, useEffect, useRef, useState } from 'react';
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
  IconTarget,
} from '../components/ui/Icons';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { ApiError, bodyApi, getErrorMessage } from '../services/api';
import { BODY_PART_META, isBodyPart } from '../utils/bodyMeta';
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

  const load = useCallback(async () => {
    if (!bodyPart) return;
    setLoading(true);
    try {
      const res = await bodyApi.history(bodyPart);
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
  }, [bodyPart, t]);

  useEffect(() => {
    if (!bodyPart) {
      navigate('/body', { replace: true });
      return;
    }
    load();
  }, [bodyPart, load, navigate]);

  if (!bodyPart) return null;

  const meta = BODY_PART_META[bodyPart];
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
    setEditValue(String(item.valueCm));
    setEditDate(item.loggedDate);
    setConfirmDelete(false);
  };

  const closeEdit = () => {
    setEditItem(null);
    setConfirmDelete(false);
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
        <button
          type="button"
          className={styles.editBtn}
          onClick={() => {
            setGoalInput(goalCm != null ? String(goalCm) : '');
            setGoalOpen(true);
          }}
        >
          <IconEdit size={18} color={Colors.dashboard.stroke} />
        </button>
      </header>

      <div className={`${styles.content} ${styles.contentStack}`}>
        <div className={styles.cardWrap}>
          <span className={styles.cardShadow} />
          <div className={styles.latestCard}>
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
        </div>

        {items.length === 0 ? (
          <p className={styles.emptyHint}>{t('bodyData.noHistory')}</p>
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
                  style={{ background: idx === 0 ? meta.bg : '#E8E8E8' }}
                >
                  {idx === 0 ? (
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
          ))
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
