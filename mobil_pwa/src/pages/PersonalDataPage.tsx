import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Colors } from '../design/tokens';
import { IconArrowBack, IconHeight, IconPersonOutlineIo } from '../components/ui/Icons';
import { profileApi } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import styles from './StackPage.module.css';

type Gender = 'MALE' | 'FEMALE';
type ActivityKey = 'SEDENTARY' | 'ACTIVE' | 'VERY_ACTIVE';

export default function PersonalDataPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(user?.username ?? '');
  const [birthYear, setBirthYear] = useState('1990');
  const [heightCm, setHeightCm] = useState('175');
  const [gender, setGender] = useState<Gender>('MALE');
  const [activity, setActivity] = useState<ActivityKey>('ACTIVE');
  const [message, setMessage] = useState('');

  useEffect(() => {
    profileApi
      .getMe()
      .then((p: any) => {
        const prof = p?.profile;
        if (p?.username) setName(p.username);
        if (prof?.heightCm) setHeightCm(String(prof.heightCm));
        if (prof?.birthYear) setBirthYear(String(prof.birthYear));
        if (prof?.gender === 'FEMALE') setGender('FEMALE');
        if (prof?.activityLevel === 'SEDENTARY' || prof?.activityLevel === 'LIGHT') setActivity('SEDENTARY');
        else if (prof?.activityLevel === 'VERY_ACTIVE') setActivity('VERY_ACTIVE');
        else setActivity('ACTIVE');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const activityOptions = useMemo(
    () => [
      { key: 'SEDENTARY' as const, label: t('personalData.activitySedentary') },
      { key: 'ACTIVE' as const, label: t('personalData.activityActive') },
      { key: 'VERY_ACTIVE' as const, label: t('personalData.activityVery') },
    ],
    [t],
  );

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      const heightNum = Number(heightCm);
      const yearNum = Number(birthYear);
      const activityLevel = activity === 'SEDENTARY' ? 'LIGHT' : activity === 'VERY_ACTIVE' ? 'VERY_ACTIVE' : 'ACTIVE';
      await profileApi.update({
        heightCm: Number.isFinite(heightNum) ? heightNum : undefined,
        birthYear: Number.isFinite(yearNum) ? yearNum : undefined,
        gender,
        activityLevel,
      });
      setMessage(t('personalData.saved'));
      setTimeout(() => navigate(-1), 600);
    } catch (e: any) {
      setMessage(e?.message ?? t('personalData.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.screen}>
        <div className={styles.center}>
          <div className="spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.screen} page-scroll no-tab`}>
      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={() => navigate(-1)}>
          <IconArrowBack size={22} color={Colors.dashboard.stroke} />
        </button>
        <h1>{t('personalData.screenTitle')}</h1>
        <span style={{ width: 40 }} />
      </header>

      <div className={styles.content}>
        <div className={styles.fieldCard}>
          <div className={styles.fieldLabel}>
            <IconPersonOutlineIo size={16} color={Colors.dashboard.stroke} /> {t('username')}
          </div>
          <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} disabled />
        </div>

        <div className={styles.fieldCard}>
          <div className={styles.fieldLabel}>
            <IconHeight size={16} color={Colors.dashboard.stroke} /> {t('personalData.height')}
          </div>
          <input className={styles.input} value={heightCm} onChange={(e) => setHeightCm(e.target.value)} inputMode="numeric" />
        </div>

        <div className={styles.fieldCard}>
          <div className={styles.fieldLabel}>{t('personalData.birthDate')}</div>
          <input className={styles.input} value={birthYear} onChange={(e) => setBirthYear(e.target.value)} inputMode="numeric" />
        </div>

        <div className={styles.fieldCard}>
          <div className={styles.fieldLabel}>{t('personalData.gender')}</div>
          <div className={styles.chips}>
            {(['MALE', 'FEMALE'] as Gender[]).map((g) => (
              <button
                key={g}
                type="button"
                className={`${styles.chip} ${gender === g ? styles.chipActive : ''}`}
                onClick={() => setGender(g)}
              >
                {g === 'MALE' ? t('personalData.genderMale') : t('personalData.genderFemale')}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.fieldCard}>
          <div className={styles.fieldLabel}>{t('personalData.activityLevel')}</div>
          <div className={styles.chips}>
            {activityOptions.map((o) => (
              <button
                key={o.key}
                type="button"
                className={`${styles.chip} ${activity === o.key ? styles.chipActive : ''}`}
                onClick={() => setActivity(o.key)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {message && <p className={styles.message}>{message}</p>}

        <button type="button" className={styles.saveBtn} onClick={handleSave} disabled={saving}>
          {saving ? <span className="spinner" style={{ width: 22, height: 22 }} /> : t('personalData.save')}
        </button>
      </div>
    </div>
  );
}
