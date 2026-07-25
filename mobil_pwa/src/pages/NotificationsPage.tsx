import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Colors } from '../design/tokens';
import { IconArrowBack } from '../components/ui/Icons';
import styles from './StackPage.module.css';

export default function NotificationsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [mealReminders, setMealReminders] = useState(true);
  const [waterReminders, setWaterReminders] = useState(true);
  const [weeklySummary, setWeeklySummary] = useState(false);

  return (
    <div className={`${styles.screen} page-scroll no-tab`}>
      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={() => navigate(-1)}>
          <IconArrowBack size={22} color={Colors.dashboard.stroke} />
        </button>
        <h1>{t('notificationsScreen.screenTitle')}</h1>
        <span style={{ width: 40 }} />
      </header>

      <div className={styles.content}>
        {[
          {
            key: 'meal',
            label: t('notificationsScreen.mealRemindersTitle'),
            value: mealReminders,
            set: setMealReminders,
          },
          {
            key: 'water',
            label: t('notificationsScreen.waterTitle'),
            value: waterReminders,
            set: setWaterReminders,
          },
          {
            key: 'weekly',
            label: t('notificationsScreen.dailyTitle'),
            value: weeklySummary,
            set: setWeeklySummary,
          },
        ].map((row) => (
          <button key={row.key} type="button" className={styles.toggleRow} onClick={() => row.set(!row.value)}>
            <span>{row.label}</span>
            <span className={`${styles.toggle} ${row.value ? styles.toggleOn : ''}`}>
              <span className={styles.knob} />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
