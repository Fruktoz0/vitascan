import { useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { Colors } from '../design/tokens';
import { IconArrowBack, IconCalendarToday, IconCheck } from '../components/ui/Icons';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { bodyApi, getErrorMessage, type BodyPart } from '../services/api';
import { BODY_PARTS, BODY_PART_META, isBodyPart } from '../utils/bodyMeta';
import styles from './BodyMeasurements.module.css';

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

export default function BodyMeasurementNewPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const prefill = params.get('part');
  const dateInputRef = useRef<HTMLInputElement>(null);

  const [bodyPart, setBodyPart] = useState<BodyPart>(
    isBodyPart(prefill) ? prefill : 'ARM',
  );
  const [value, setValue] = useState('');
  const [date, setDate] = useState(todayStr());
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
    if (!Number.isFinite(n) || n < 10 || n > 300) {
      setDialog({ title: t('food.errorTitle'), message: t('bodyData.invalidValue') });
      return;
    }
    setSaving(true);
    try {
      await bodyApi.create({ bodyPart, valueCm: Math.round(n * 10) / 10, date });
      setDialog({
        title: t('bodyData.savedTitle'),
        message: t('bodyData.saved'),
        goBack: true,
      });
    } catch (e) {
      setDialog({
        title: t('food.errorTitle'),
        message: getErrorMessage(e, t('bodyData.saveFailed')),
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
        <h1>{t('bodyData.newTitle')}</h1>
        <span className={styles.headerSpacer} />
      </header>

      <div className={`${styles.content} ${styles.contentStack}`}>
        <div className={styles.fieldCard}>
          <div className={styles.fieldLabel}>{t('bodyData.selectPart')}</div>
          <div className={styles.partGrid}>
            {BODY_PARTS.map((p) => {
              const meta = BODY_PART_META[p];
              const PartIcon = meta.Icon;
              const active = bodyPart === p;
              return (
                <button
                  key={p}
                  type="button"
                  className={`${styles.partChip} ${active ? styles.partChipActive : ''}`}
                  onClick={() => setBodyPart(p)}
                >
                  <PartIcon size={22} color={Colors.dashboard.stroke} />
                  {t(meta.labelKey)}
                </button>
              );
            })}
          </div>
        </div>

        <div className={styles.fieldCard}>
          <div className={styles.fieldLabel}>{t('bodyData.valueCm')}</div>
          <div className={styles.valueRow}>
            <input
              className={styles.valueInput}
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={t('bodyData.valuePlaceholder')}
            />
            <span className={styles.valueUnit}>cm</span>
          </div>
        </div>

        <div className={styles.fieldCard}>
          <div className={styles.fieldLabel}>{t('bodyData.date')}</div>
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
            max={todayStr()}
            onChange={(e) => setDate(e.target.value || todayStr())}
          />
        </div>

        <div className={styles.infoBox}>
          <span aria-hidden>ℹ</span>
          <span>{t('bodyData.measureTip')}</span>
        </div>

        <button type="button" className={styles.saveBtn} disabled={saving} onClick={handleSave}>
          {saving ? (
            <span className="spinner" style={{ width: 22, height: 22 }} />
          ) : (
            <>
              <IconCheck size={20} color="#fff" />
              {t('bodyData.save')}
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
