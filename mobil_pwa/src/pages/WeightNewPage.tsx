import { useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { Colors } from '../design/tokens';
import { IconArrowBack, IconCalendarToday, IconCheck } from '../components/ui/Icons';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { ApiError, getErrorMessage, weightApi } from '../services/api';
import { toLocalDateStr, useDateStore } from '../stores/dateStore';
import styles from './BodyMeasurements.module.css';

export default function WeightNewPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const dateInputRef = useRef<HTMLInputElement>(null);

  const prefillDate = params.get('date');
  const [value, setValue] = useState('');
  const [date, setDate] = useState(() =>
    prefillDate && /^\d{4}-\d{2}-\d{2}$/.test(prefillDate)
      ? prefillDate
      : toLocalDateStr(useDateStore.getState().selectedDate),
  );
  const [saving, setSaving] = useState(false);
  const [dialog, setDialog] = useState<{ title: string; message: string; goBack?: boolean } | null>(
    null,
  );

  const dateLabel = useMemo(() => {
    const d = new Date(date + 'T12:00:00');
    return d.toLocaleDateString(i18n.language === 'hu' ? 'hu-HU' : 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }, [date]);

  const handleSave = async () => {
    const n = Number(String(value).replace(',', '.'));
    if (!Number.isFinite(n) || n < 20 || n > 500) {
      setDialog({ title: t('food.errorTitle'), message: t('weightLog.invalidValue') });
      return;
    }
    setSaving(true);
    try {
      await weightApi.setForDate(date, Math.round(n * 10) / 10);
      setDialog({
        title: t('weightLog.savedTitle'),
        message: t('weightLog.saved'),
        goBack: true,
      });
    } catch (e) {
      setDialog({
        title: t('food.errorTitle'),
        message:
          e instanceof ApiError && e.status === 409
            ? t('weightLog.dateConflict')
            : getErrorMessage(e, t('weightLog.saveFailed')),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`${styles.screen} page-scroll no-tab`}>
      <div className={`${styles.blob} ${styles.blobMint}`} />
      <div className={`${styles.blob} ${styles.blobLavender}`} />

      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={() => navigate(-1)}>
          <IconArrowBack size={22} color={Colors.dashboard.stroke} />
        </button>
        <h1>{t('weightLog.newTitle')}</h1>
        <span className={styles.headerSpacer} />
      </header>

      <div className={`${styles.content} ${styles.contentStack}`}>
        <div className={styles.fieldCard}>
          <div className={styles.fieldLabel}>{t('weightLog.valueKg')}</div>
          <div className={styles.valueRow}>
            <input
              className={styles.valueInput}
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={t('weightLog.valuePlaceholder')}
              autoFocus
            />
            <span className={styles.valueUnit}>kg</span>
          </div>
        </div>

        <div className={styles.fieldCard}>
          <div className={styles.fieldLabel}>{t('weightLog.date')}</div>
          <button
            type="button"
            className={styles.dateBtn}
            onClick={() => dateInputRef.current?.showPicker?.() ?? dateInputRef.current?.click()}
          >
            <span>{dateLabel}</span>
            <IconCalendarToday size={18} color={Colors.dashboard.stroke} />
          </button>
          <input
            ref={dateInputRef}
            type="date"
            className={styles.hiddenDate}
            value={date}
            onChange={(e) => setDate(e.target.value || toLocalDateStr())}
          />
        </div>

        <div className={styles.infoBox}>
          <span aria-hidden>ℹ</span>
          <span>{t('weightLog.measureTip')}</span>
        </div>

        <button type="button" className={styles.saveBtn} disabled={saving} onClick={handleSave}>
          {saving ? (
            <span className="spinner" style={{ width: 22, height: 22 }} />
          ) : (
            <>
              <IconCheck size={20} color="#fff" />
              {t('weightLog.save')}
            </>
          )}
        </button>
      </div>

      <ConfirmDialog
        visible={!!dialog}
        title={dialog?.title ?? ''}
        message={dialog?.message ?? ''}
        confirmLabel={t('common.ok', 'OK')}
        onClose={() => {
          const go = dialog?.goBack;
          setDialog(null);
          if (go) navigate(-1);
        }}
      />
    </div>
  );
}
