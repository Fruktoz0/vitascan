import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/useAuth';
import './admin.css';

const nav = [
  { to: '/admin', end: true, label: 'Áttekintés' },
  { to: '/admin/foods', end: false, label: 'Ételek' },
  { to: '/admin/recipes', end: false, label: 'Receptek' },
  { to: '/admin/users', end: false, label: 'Felhasználók' },
  { to: '/admin/token-cleanup', end: false, label: 'Token takarítás' },
  { to: '/admin/database', end: false, label: 'Adatbázis' },
];

export function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/admin/login', { replace: true });
  }

  return (
    <div className="admin-app">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-brand">
          <span className="admin-sidebar-logo">VS</span>
          <div>
            <div className="admin-sidebar-title">VitaScan</div>
            <div className="admin-sidebar-sub">Admin</div>
          </div>
        </div>

        <nav className="admin-nav">
          {nav.map(({ to, end, label }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `admin-nav-link${isActive ? ' admin-nav-link-active' : ''}`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="admin-sidebar-footer">
          <div className="admin-user-pill">
            <span className="admin-user-dot" />
            <span className="admin-user-name">{user?.username}</span>
          </div>
          <button type="button" className="admin-btn admin-btn-ghost admin-btn-block" onClick={handleLogout}>
            Kijelentkezés
          </button>
        </div>
      </aside>

      <div className="admin-main">
        <Outlet />
      </div>
    </div>
  );
}
