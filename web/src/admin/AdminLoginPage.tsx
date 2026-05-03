import { useState, type FormEvent } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/useAuth';
import { ApiError } from '../api/client';

export function AdminLoginPage() {
  const { user, ready, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!ready) {
    return (
      <div className="admin-boot">
        <div className="admin-spinner" aria-hidden />
      </div>
    );
  }

  if (user?.role === 'ADMIN') {
    return <Navigate to="/admin" replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Bejelentkezés sikertelen.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="admin-login-bg">
      <div className="admin-login-card">
        <div className="admin-login-brand">
          <span className="admin-login-logo">VS</span>
          <div>
            <h1>VitaScan Admin</h1>
            <p className="admin-muted">Moderáció és felületkezelés</p>
          </div>
        </div>

        <form className="admin-form" onSubmit={onSubmit}>
          <label className="admin-label">
            Email
            <input
              type="email"
              autoComplete="username"
              className="admin-input"
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              required
            />
          </label>
          <label className="admin-label">
            Jelszó
            <input
              type="password"
              autoComplete="current-password"
              className="admin-input"
              value={password}
              onChange={(ev) => setPassword(ev.target.value)}
              required
            />
          </label>

          {error && <div className="admin-alert admin-alert-error">{error}</div>}

          <button type="submit" className="admin-btn admin-btn-primary" disabled={submitting}>
            {submitting ? 'Belépés…' : 'Belépés'}
          </button>
        </form>

        <Link to="/" className="admin-link-muted">
          ← Vissza a főoldalra
        </Link>
      </div>
    </div>
  );
}
