import type { ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import './admin.css';

const icons: Record<string, ReactNode> = {
  backup: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <path d="M4 4a1.5 1.5 0 011.5-1.5h5A1.5 1.5 0 0112 4v8a1.5 1.5 0 01-1.5 1.5h-5A1.5 1.5 0 014 12V4z" stroke="currentColor" strokeWidth="1.3" fill="none"/>
      <path d="M6 6.5h4M6 9h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  ),
  restore: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <path d="M2 8a6 6 0 1112 0A6 6 0 012 8z" stroke="currentColor" strokeWidth="1.3" fill="none"/>
      <path d="M8 5v3l2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  ),
  update: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <path d="M8 2v8M5 7l3 3 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M2 12v2h12v-2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
};

const subNav = [
  { to: '/admin/database', end: true, icon: 'backup', label: 'Mentések és ütemezés' },
  { to: '/admin/database/rendszer-visszaallitas', end: false, icon: 'restore', label: 'Rendszer visszaállítás' },
  { to: '/admin/database/frissites', end: false, icon: 'update', label: 'Adatfrissítés' },
];

export function DatabaseLayout() {
  return (
    <div className="admin-page">
      <nav className="admin-subnav" aria-label="Adatbázis almenük">
        {subNav.map(({ to, end, icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `admin-subnav-link${isActive ? ' admin-subnav-link-active' : ''}`
            }
          >
            {icons[icon]}
            {label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
