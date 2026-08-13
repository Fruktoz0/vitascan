import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Colors } from '../design/tokens';
import {
  IconArrowBack,
  IconChevronRight,
  IconEdit,
  IconLink,
  IconPhotoLibrary,
  IconVideocam,
} from '../components/ui/Icons';
import { ApiError, getErrorMessage, recipesApi, type RecipeDraft } from '../services/api';
import { saveRecipeDraftSession } from '../utils/recipeDraftSession';
import styles from './RecipeCreatePage.module.css';

export default function RecipeCreatePage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('');
  const [error, setError] = useState('');

  const locale = i18n.language.startsWith('en') ? 'en' : 'hu';

  const goManual = () => {
    const draft: RecipeDraft = {
      title: '',
      description: '',
      servings: 2,
      category: null,
      ingredients: [{ name: '', amount: null, unit: 'g', sortOrder: 0 }],
      instructions: [''],
      sourceType: 'MANUAL',
    };
    saveRecipeDraftSession({ draft });
    navigate('/recipes/review');
  };

  const onPickImage = async (file: File) => {
    setBusy(true);
    setBusyLabel(t('recipes.importing'));
    setError('');
    try {
      const res = await recipesApi.importFromImage(file, locale);
      saveRecipeDraftSession({ draft: { ...res.draft, sourceType: 'IMAGE' }, tempImageKey: res.tempImageKey });
      navigate('/recipes/review');
    } catch (err) {
      const fallback = err instanceof ApiError && err.status === 429 ? t('recipes.quotaReached') : t('recipes.importError');
      setError(getErrorMessage(err, fallback));
    } finally {
      setBusy(false);
    }
  };

  const onPickVideo = async (file: File) => {
    if (file.size > 50 * 1024 * 1024) {
      setError(t('recipes.videoLimit'));
      return;
    }
    setBusy(true);
    setBusyLabel(t('recipes.importingVideo'));
    setError('');
    try {
      const res = await recipesApi.importFromVideo(file, locale);
      saveRecipeDraftSession({ draft: { ...res.draft, sourceType: 'VIDEO' } });
      navigate('/recipes/review');
    } catch (err) {
      const fallback = err instanceof ApiError && err.status === 429 ? t('recipes.quotaReached') : t('recipes.importError');
      setError(getErrorMessage(err, fallback));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`${styles.screen} page-scroll`}>
      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={() => navigate(-1)}>
          <IconArrowBack size={22} color={Colors.dashboard.stroke} />
        </button>
        <h1 className={styles.pageTitle}>{t('recipes.createTitle')}</h1>
        <span style={{ width: 40 }} />
      </header>
      <p className={styles.subtitle}>{t('recipes.createHow')}</p>

      <div className={styles.listWrap}>
        <span className={styles.cardShadow} />
        <div className={styles.listInner}>
          <button type="button" className={styles.row} onClick={() => navigate('/recipes/import')} disabled={busy}>
            <span className={styles.rowIcon}>
              <IconLink size={22} color="#1565C0" />
            </span>
            <span className={styles.rowText}>
              <span className={styles.rowTitle}>{t('recipes.importUrl')}</span>
              <span className={styles.rowHint}>{t('recipes.importUrlHint')}</span>
            </span>
            <IconChevronRight size={18} color="#B0BEC5" />
          </button>

          <button type="button" className={styles.row} onClick={() => fileRef.current?.click()} disabled={busy}>
            <span className={styles.rowIcon}>
              <IconPhotoLibrary size={22} color="#2E7D32" />
            </span>
            <span className={styles.rowText}>
              <span className={styles.rowTitle}>{t('recipes.importImage')}</span>
              <span className={styles.rowHint}>{t('recipes.importImageHint')}</span>
            </span>
            <IconChevronRight size={18} color="#B0BEC5" />
          </button>

          <button type="button" className={styles.row} onClick={() => videoRef.current?.click()} disabled={busy}>
            <span className={styles.rowIcon}>
              <IconVideocam size={22} color="#6A1B9A" />
            </span>
            <span className={styles.rowText}>
              <span className={styles.rowTitle}>{t('recipes.importVideo')}</span>
              <span className={styles.rowHint}>{t('recipes.videoLimit')}</span>
            </span>
            <IconChevronRight size={18} color="#B0BEC5" />
          </button>

          <button type="button" className={styles.row} onClick={goManual} disabled={busy}>
            <span className={styles.rowIcon}>
              <IconEdit size={22} color="#E65100" />
            </span>
            <span className={styles.rowText}>
              <span className={styles.rowTitle}>{t('recipes.manual')}</span>
              <span className={styles.rowHint}>{t('recipes.manualHint')}</span>
            </span>
            <IconChevronRight size={18} color="#B0BEC5" />
          </button>
        </div>
      </div>

      {error && <p className={styles.subtitle}>{error}</p>}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void onPickImage(file);
        }}
      />
      <input
        ref={videoRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void onPickVideo(file);
        }}
      />

      {busy && (
        <div className={styles.overlay}>
          <div className="spinner" />
          <span>{busyLabel || t('recipes.importing')}</span>
        </div>
      )}
    </div>
  );
}
