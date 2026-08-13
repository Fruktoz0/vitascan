import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Colors } from '../design/tokens';
import { IconArrowBack } from '../components/ui/Icons';
import { PrimaryButton } from '../components/ui/Button';
import { ApiError, getErrorMessage, recipesApi, type RecipeDraft } from '../services/api';
import { saveRecipeDraftSession } from '../utils/recipeDraftSession';
import styles from './RecipeCreatePage.module.css';

export default function RecipeImportPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [fallback, setFallback] = useState(false);
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

  const onImport = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setBusy(true);
    setError('');
    setFallback(false);
    try {
      const res = await recipesApi.importFromUrl(trimmed, locale);
      if (res.needsFallback) {
        setFallback(true);
        if (res.tempImageKey || res.draft?.title) {
          saveRecipeDraftSession({
            draft: res.draft,
            tempImageKey: res.tempImageKey,
          });
        }
        return;
      }
      saveRecipeDraftSession({ draft: res.draft, tempImageKey: res.tempImageKey });
      navigate('/recipes/review');
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const recipeId = typeof err.payload?.recipeId === 'string' ? err.payload.recipeId : null;
        setError(t('recipes.duplicateFound'));
        if (recipeId) {
          navigate(`/recipes/${recipeId}`, { replace: true });
          return;
        }
      }
      const fallbackMsg = err instanceof ApiError && err.status === 429 ? t('recipes.quotaReached') : t('recipes.importError');
      setError(getErrorMessage(err, fallbackMsg));
      setFallback(true);
    } finally {
      setBusy(false);
    }
  };

  const onPickVideo = async (file: File) => {
    setBusy(true);
    setError('');
    try {
      const res = await recipesApi.importFromVideo(file, locale);
      saveRecipeDraftSession({ draft: { ...res.draft, sourceType: 'VIDEO' } });
      navigate('/recipes/review');
    } catch (err) {
      setError(getErrorMessage(err, t('recipes.importError')));
    } finally {
      setBusy(false);
    }
  };

  const onPickImage = async (file: File) => {
    setBusy(true);
    setError('');
    try {
      const res = await recipesApi.importFromImage(file, locale);
      saveRecipeDraftSession({ draft: { ...res.draft, sourceType: 'IMAGE' }, tempImageKey: res.tempImageKey });
      navigate('/recipes/review');
    } catch (err) {
      setError(getErrorMessage(err, t('recipes.importError')));
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
        <h1 className={styles.pageTitle}>{t('recipes.importUrlTitle')}</h1>
        <span style={{ width: 40 }} />
      </header>

      <label className={styles.subtitle} htmlFor="recipe-url">{t('recipes.importUrlHint')}</label>
      <input
        id="recipe-url"
        className={styles.urlInput}
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder={t('recipes.importUrlPlaceholder')}
        inputMode="url"
        autoCapitalize="none"
      />
      <div style={{ marginTop: 14 }}>
        <PrimaryButton
          label={busy ? t('recipes.importingUrl') : t('recipes.importUrlAction')}
          onClick={() => void onImport()}
          loading={busy}
          disabled={busy || !url.trim()}
        />
      </div>

      {error && <p className={styles.subtitle}>{error}</p>}
      {fallback && (
        <>
          <p className={styles.subtitle}>{t('recipes.importFallback')}</p>
          <div className={styles.listWrap} style={{ marginTop: 8 }}>
            <span className={styles.cardShadow} />
            <div className={styles.listInner}>
              <button type="button" className={styles.row} onClick={() => fileRef.current?.click()} disabled={busy}>
                <span className={styles.rowText}>
                  <span className={styles.rowTitle}>{t('recipes.importImage')}</span>
                </span>
              </button>
              <button type="button" className={styles.row} onClick={() => videoRef.current?.click()} disabled={busy}>
                <span className={styles.rowText}>
                  <span className={styles.rowTitle}>{t('recipes.importVideo')}</span>
                </span>
              </button>
              <button type="button" className={styles.row} onClick={goManual} disabled={busy}>
                <span className={styles.rowText}>
                  <span className={styles.rowTitle}>{t('recipes.manual')}</span>
                </span>
              </button>
            </div>
          </div>
        </>
      )}

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
          <span>{t('recipes.importingUrl')}</span>
        </div>
      )}
    </div>
  );
}
