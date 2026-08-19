import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Colors } from '../design/tokens';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import {
  IconArrowBack,
  IconChevronRight,
  IconTimer,
  IconTrophy,
  IconWaterDrop,
} from '../components/ui/Icons';
import { getErrorMessage } from '../services/api';
import { useProfileStore } from '../stores/profileStore';
import styles from './HomeCardsPage.module.css';

type CardKey = 'showHomeWaterCard' | 'showHomeStreakCard' | 'showHomeFastingCard';

export default function HomeCardsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const showHomeWaterCard = useProfileStore((s) => s.showHomeWaterCard);
  const showHomeStreakCard = useProfileStore((s) => s.showHomeStreakCard);
  const showHomeFastingCard = useProfileStore((s) => s.showHomeFastingCard);
  const setHomeCard = useProfileStore((s) => s.setHomeCard);
  const [saving, setSaving] = useState(false);
  const [dialog, setDialog] = useState<{ title: string; message: string } | null>(null);

  const toggle = async (key: CardKey, value: boolean) => {
    setSaving(true);
    try {
      await setHomeCard(key, value);
    } catch (e) {
      setDialog({
        title: t('food.errorTitle'),
        message: getErrorMessage(e, t('notificationsScreen.saveFailed')),
      });
    } finally {
      setSaving(false);
    }
  };

  const rows: Array<{
    key: CardKey;
    on: boolean;
    title: string;
    hint: string;
    Icon: typeof IconWaterDrop;
    iconColor: string;
    iconBg: string;
    href?: string;
  }> = [
    {
      key: 'showHomeWaterCard',
      on: showHomeWaterCard,
      title: t('homeCards.water'),
      hint: t('homeCards.waterHint'),
      Icon: IconWaterDrop,
      iconColor: '#0277BD',
      iconBg: '#e1f5fe',
      href: '/water',
    },
    {
      key: 'showHomeStreakCard',
      on: showHomeStreakCard,
      title: t('homeCards.streak'),
      hint: t('homeCards.streakHint'),
      Icon: IconTrophy,
      iconColor: '#E65100',
      iconBg: '#fff3e0',
    },
    {
      key: 'showHomeFastingCard',
      on: showHomeFastingCard,
      title: t('homeCards.fasting'),
      hint: t('homeCards.fastingHint'),
      Icon: IconTimer,
      iconColor: '#5D4037',
      iconBg: '#f6efe6',
      href: '/fasting',
    },
  ];

  return (
    <div className={`${styles.screen} page-scroll`}>
      <div className={`${styles.blob} ${styles.blobMint}`} />
      <div className={`${styles.blob} ${styles.blobPeach}`} />

      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={() => navigate('/menu')}>
          <IconArrowBack size={22} color={Colors.dashboard.stroke} />
        </button>
        <h1>{t('homeCards.title')}</h1>
        <span className={styles.headerSpacer} />
      </header>

      <div className={styles.content}>
        <p className={styles.hint}>{t('homeCards.hint')}</p>

        {rows.map((row) => (
          <div key={row.key} className={styles.card}>
            <div className={styles.cardMain}>
              <span className={styles.rowIcon} style={{ background: row.iconBg }}>
                <row.Icon size={22} color={row.iconColor} />
              </span>
              <div className={styles.rowText}>
                <span className={styles.rowTitle}>{row.title}</span>
                <span className={styles.rowHint}>{row.hint}</span>
              </div>
              <button
                type="button"
                className={styles.toggleHit}
                disabled={saving}
                aria-pressed={row.on}
                onClick={() => void toggle(row.key, !row.on)}
              >
                <span className={`${styles.toggle} ${row.on ? styles.toggleOn : ''}`}>
                  <span className={styles.knob} />
                </span>
              </button>
            </div>
            {row.href ? (
              <button type="button" className={styles.openRow} onClick={() => navigate(row.href!)}>
                <span>
                  {row.key === 'showHomeWaterCard' ? t('homeCards.openWater') : t('homeCards.openFasting')}
                </span>
                <IconChevronRight size={18} color="#B0BEC5" />
              </button>
            ) : null}
          </div>
        ))}
      </div>

      <ConfirmDialog
        visible={!!dialog}
        title={dialog?.title ?? ''}
        message={dialog?.message ?? ''}
        onClose={() => setDialog(null)}
      />
    </div>
  );
}
