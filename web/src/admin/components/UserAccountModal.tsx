import { useEffect, useState } from 'react';
import type { AdminUserRow } from '../../api/admin';

type Props = {
  user: AdminUserRow;
  busy: boolean;
  error: string | null;
  success: string | null;
  onClose: () => void;
  onSaveEmail: (email: string) => Promise<void>;
  onSavePassword: (password: string) => Promise<void>;
};

export function UserAccountModal({
  user,
  busy,
  error,
  success,
  onClose,
  onSaveEmail,
  onSavePassword,
}: Props) {
  const [email, setEmail] = useState(user.email);
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setEmail(user.email);
    setPassword('');
    setPassword2('');
    setShowPassword(false);
    setLocalError(null);
  }, [user.id, user.email]);

  const initial = user.username.slice(0, 1).toUpperCase();
  const emailDirty = email.trim().toLowerCase() !== user.email.toLowerCase();

  async function handleEmailSave() {
    setLocalError(null);
    const next = email.trim();
    if (!next || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) {
      setLocalError('Érvényes email címet adj meg.');
      return;
    }
    await onSaveEmail(next);
  }

  async function handlePasswordSave() {
    setLocalError(null);
    if (password.trim().length < 8) {
      setLocalError('A jelszó legalább 8 karakter legyen.');
      return;
    }
    if (password.trim() !== password2.trim()) {
      setLocalError('A két jelszó nem egyezik meg.');
      return;
    }
    await onSavePassword(password.trim());
    setPassword('');
    setPassword2('');
  }

  return (
    <div className="admin-modal-root" role="presentation">
      <button
        type="button"
        className="admin-modal-backdrop"
        aria-label="Bezárás"
        onClick={() => !busy && onClose()}
      />
      <div
        className="admin-modal admin-modal-lg user-account-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-account-title"
      >
        <header className="user-account-header">
          <div className="user-account-avatar" aria-hidden>
            {initial}
          </div>
          <div className="user-account-header-text">
            <h2 id="user-account-title" className="admin-modal-title">
              Fiók kezelése
            </h2>
            <p className="user-account-subtitle">
              <strong>{user.username}</strong>
              <span className="admin-muted"> · {user.role}</span>
            </p>
          </div>
          <button
            type="button"
            className="admin-btn admin-btn-ghost user-account-close"
            disabled={busy}
            onClick={onClose}
          >
            Bezárás
          </button>
        </header>

        {(error || localError) && (
          <div className="admin-alert admin-alert-error">{localError || error}</div>
        )}
        {success && !localError && (
          <div className="admin-alert admin-alert-success">{success}</div>
        )}

        <section className="user-account-panel">
          <div className="user-account-panel-head">
            <h3>Email cím</h3>
            <p className="admin-muted">A bejelentkezéshez használt email módosítása.</p>
          </div>
          <label className="admin-label">
            Új email
            <input
              className="admin-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
              disabled={busy}
            />
          </label>
          <div className="user-account-panel-actions">
            <button
              type="button"
              className="admin-btn admin-btn-primary"
              disabled={busy || !emailDirty}
              onClick={() => void handleEmailSave()}
            >
              Email mentése
            </button>
          </div>
        </section>

        <section className="user-account-panel">
          <div className="user-account-panel-head">
            <h3>Jelszó</h3>
            <p className="admin-muted">
              Új jelszó beállítása. Mentés után a felhasználó aktív sessionjei érvénytelenek lesznek.
            </p>
          </div>
          <label className="admin-label">
            Új jelszó
            <div className="user-account-password-row">
              <input
                className="admin-input admin-input-grow"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                disabled={busy}
                placeholder="Legalább 8 karakter"
              />
              <button
                type="button"
                className="admin-btn admin-btn-secondary"
                disabled={busy}
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? 'Elrejt' : 'Mutat'}
              </button>
            </div>
          </label>
          <label className="admin-label">
            Jelszó megerősítése
            <input
              className="admin-input"
              type={showPassword ? 'text' : 'password'}
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              autoComplete="new-password"
              disabled={busy}
            />
          </label>
          <div className="user-account-panel-actions">
            <button
              type="button"
              className="admin-btn admin-btn-primary"
              disabled={busy || !password.trim()}
              onClick={() => void handlePasswordSave()}
            >
              Jelszó mentése
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
