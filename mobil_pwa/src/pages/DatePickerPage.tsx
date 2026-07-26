import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Colors } from '../design/tokens';
import { IconArrowBack, IconChevronLeft, IconChevronRight } from '../components/ui/Icons';
import { statsApi, weightApi } from '../services/api';
import { useDateStore } from '../stores/dateStore';
import styles from './DatePickerPage.module.css';

const DAY_LABELS = ['H', 'K', 'Sz', 'Cs', 'P', 'Szo', 'V'];
const HU_MONTHS = [
  'Január', 'Február', 'Március', 'Április', 'Május', 'Június',
  'Július', 'Augusztus', 'Szeptember', 'Október', 'November', 'December',
];

function buildCalendarGrid(year: number, month: number): (number | null)[][] {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const jsDay = new Date(year, month, 1).getDay();
  const firstWeekday = (jsDay + 6) % 7;
  const cells: (number | null)[] = Array(firstWeekday).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export default function DatePickerPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { selectedDate, setDate } = useDateStore();
  const [viewYear, setViewYear] = useState(selectedDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(selectedDate.getMonth());
  const [streak, setStreak] = useState<number | null>(null);
  const [weightDelta, setWeightDelta] = useState<number | null>(null);

  useEffect(() => {
    statsApi.streak().then((r) => setStreak(r.streak)).catch(() => setStreak(0));
    const todayStr = new Date().toISOString().split('T')[0];
    weightApi.getByDate(todayStr).then((res) => setWeightDelta(res.deltaKg)).catch(() => setWeightDelta(null));
  }, []);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sel = new Date(selectedDate);
  sel.setHours(0, 0, 0, 0);
  const weeks = buildCalendarGrid(viewYear, viewMonth);

  const selectDay = (day: number) => {
    const target = new Date(viewYear, viewMonth, day);
    target.setHours(12, 0, 0, 0);
    setDate(target);
    navigate(-1);
  };

  const weightText =
    weightDelta === null ? '-' : weightDelta === 0 ? '0.0 kg' : `${weightDelta > 0 ? '+' : ''}${weightDelta.toFixed(1)} kg`;

  return (
    <div className={`${styles.screen} page-scroll`}>
      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={() => navigate(-1)}>
          <IconArrowBack size={22} color={Colors.dashboard.stroke} />
        </button>
        <h1>{t('date.calendar')}</h1>
        <span style={{ width: 40 }} />
      </header>

      <div className={styles.stats}>
        <div className={styles.statBox}>
          <div className={styles.statValue}>{streak ?? '-'}</div>
          <div className={styles.statLabel}>{t('date.streak')}</div>
        </div>
        <div className={styles.statBox}>
          <div className={styles.statValue}>{weightText}</div>
          <div className={styles.statLabel}>{t('date.weightChange')}</div>
        </div>
      </div>

      <div className={styles.calendar}>
        <div className={styles.monthRow}>
          <button
            type="button"
            onClick={() => {
              if (viewMonth === 0) {
                setViewYear((y) => y - 1);
                setViewMonth(11);
              } else setViewMonth((m) => m - 1);
            }}
          >
            <IconChevronLeft size={24} color={Colors.dashboard.stroke} />
          </button>
          <h2>
            {HU_MONTHS[viewMonth]} {viewYear}
          </h2>
          <button
            type="button"
            onClick={() => {
              if (viewMonth === 11) {
                setViewYear((y) => y + 1);
                setViewMonth(0);
              } else setViewMonth((m) => m + 1);
            }}
          >
            <IconChevronRight size={24} color={Colors.dashboard.stroke} />
          </button>
        </div>

        <div className={styles.weekHead}>
          {DAY_LABELS.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>

        {weeks.map((week, wi) => (
          <div key={wi} className={styles.week}>
            {week.map((day, di) => {
              if (day == null) return <span key={di} className={styles.dayEmpty} />;
              const d = new Date(viewYear, viewMonth, day);
              d.setHours(0, 0, 0, 0);
              const isToday = d.getTime() === today.getTime();
              const isSelected = d.getTime() === sel.getTime();
              return (
                <button
                  key={di}
                  type="button"
                  className={`${styles.day} ${isToday ? styles.today : ''} ${isSelected ? styles.selected : ''}`}
                  onClick={() => selectDay(day)}
                >
                  {day}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
