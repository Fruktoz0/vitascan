import { useState } from 'react';
import type { ComponentType } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  IconArrowForward,
  IconCheck,
  IconEmailOutline,
  IconLockOutline,
  IconPersonOutline,
  type AppIconProps,
} from '../components/ui/Icons';
import { CharacterIcon, SparkleIcon } from '../components/ui/DoodleCharacter';
import { GlassCardSimple } from '../components/ui/GlassCard';
import { getErrorMessage } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { Colors, Spacing } from '../design/tokens';
import styles from './Auth.module.css';

function Field({
  label,
  value,
  onChange,
  placeholder,
  icon: Icon,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  icon: ComponentType<AppIconProps>;
  type?: string;
}) {
  return (
    <div className={styles.fieldWrap}>
      <label className={styles.fieldLabel}>{label}</label>
      <div className={styles.field}>
        <Icon size={18} className={styles.fieldIcon} color="#4f5d77" />
        <input
          className={styles.input}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          type={type}
          autoCapitalize="none"
        />
      </div>
    </div>
  );
}

export default function RegisterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const register = useAuthStore((s) => s.register);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);
  const [error, setError] = useState('');

  const doShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 300);
  };

  const handleRegister = async () => {
    if (!username.trim() || !email.trim() || !password) {
      doShake();
      setError(t('auth.registerMissingData'));
      return;
    }
    if (password !== password2) {
      doShake();
      setError(t('auth.passwordMismatch'));
      return;
    }
    if (password.length < 8) {
      doShake();
      setError(t('auth.weakPasswordMessage'));
      return;
    }
    if (!accepted) {
      doShake();
      setError(t('auth.gdprRequired'));
      return;
    }
    setLoading(true);
    setError('');
    try {
      await register(username.trim(), email.trim().toLowerCase(), password);
      navigate('/home', { replace: true });
    } catch (err) {
      doShake();
      setError(
        getErrorMessage(
          err,
          t('auth.registerFailedGeneric', 'Regisztráció sikertelen. Próbáld újra.'),
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`${styles.screen} page-scroll no-tab`}>
      <div className={`${styles.blob} ${styles.blob1}`} />
      <div className={`${styles.blob} ${styles.blob2}`} />
      <div className={`${styles.blob} ${styles.blob3}`} />

      <div className={styles.content}>
        <div className={styles.logoArea}>
          <div className={styles.titleWrap}>
            <h1 className={styles.appName}>Vitascan</h1>
            <SparkleIcon className={styles.sparkle} color={Colors.dashboard.stroke} />
          </div>
          <p className={styles.tagline}>{t('auth.joinCommunity')}</p>
          <CharacterIcon size={100} />
        </div>

        <div className={shake ? 'shake' : undefined}>
          <GlassCardSimple
            backgroundColor={Colors.dashboard.card}
            borderWidth={1.2}
            padding={Spacing['3xl']}
            shadowOffset={6}
            customRadius={{
              borderTopLeftRadius: 28,
              borderTopRightRadius: 12,
              borderBottomRightRadius: 32,
              borderBottomLeftRadius: 14,
            }}
          >
            <div className={styles.fields}>
              <Field
                label={t('username')}
                value={username}
                onChange={setUsername}
                placeholder={t('auth.usernamePlaceholder')}
                icon={IconPersonOutline}
              />
              <Field
                label={t('email')}
                value={email}
                onChange={setEmail}
                placeholder={t('auth.emailPlaceholder')}
                icon={IconEmailOutline}
                type="email"
              />
              <Field
                label={t('auth.passwordMin')}
                value={password}
                onChange={setPassword}
                placeholder="••••••••"
                icon={IconLockOutline}
                type="password"
              />
              <Field
                label={t('auth.confirmPassword')}
                value={password2}
                onChange={setPassword2}
                placeholder="••••••••"
                icon={IconLockOutline}
                type="password"
              />
              {password2 !== '' && password !== password2 && (
                <p className={styles.mismatch}>⚠️ {t('auth.passwordMismatchInline')}</p>
              )}
            </div>

            <button type="button" className={styles.checkRow} onClick={() => setAccepted(!accepted)}>
              <span className={`${styles.checkbox} ${accepted ? styles.checkboxOn : ''}`}>
                {accepted && <IconCheck size={16} color={Colors.dashboard.stroke} />}
              </span>
              <span className={styles.checkText}>
                {t('auth.acceptPrefix')} <span className={styles.checkLink}>{t('auth.privacyPolicy')}</span> (GDPR)
              </span>
            </button>

            {error && <p className={styles.error}>{error}</p>}

            <div className={styles.btnOuter}>
              <span className={styles.registerShadow} />
              <button
                type="button"
                className={styles.registerBtn}
                onClick={handleRegister}
                disabled={!accepted || loading}
              >
                {loading ? (
                  <span className="spinner" style={{ width: 22, height: 22 }} />
                ) : (
                  <>
                    <span>{t('auth.registerCta')}</span>
                    <IconArrowForward size={22} color={Colors.dashboard.stroke} />
                  </>
                )}
              </button>
            </div>
          </GlassCardSimple>
        </div>

        <div className={styles.divider}>
          <span className={styles.dividerLine} />
          <span className={styles.dividerLabel}>{t('common.or')}</span>
          <span className={styles.dividerLine} />
        </div>

        <p className={styles.footer}>
          {t('auth.hasAccount')}{' '}
          <Link to="/auth/login" className={styles.footerLink}>
            {t('auth.loginLink')}
          </Link>
        </p>
      </div>
    </div>
  );
}
