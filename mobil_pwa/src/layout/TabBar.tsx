import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TAB_ICONS } from '../components/ui/Icons';
import styles from './TabBar.module.css';

const TABS = [
  { to: '/home', iconKey: 'home' as const, labelKey: 'home' },
  { to: '/food-library', iconKey: 'diary' as const, labelKey: 'foodLibrary' },
  { to: '/body', iconKey: 'body' as const, labelKey: 'bodyTab' },
  { to: '/fitness', iconKey: 'fitness' as const, labelKey: 'fitnessTab' },
  { to: '/menu', iconKey: 'menu' as const, labelKey: 'menuTab' },
];

function isMenuSection(pathname: string) {
  return (
    pathname === '/menu' ||
    pathname.startsWith('/menu/') ||
    pathname === '/recipes' ||
    pathname.startsWith('/recipes/')
  );
}

export default function TabBar() {
  const { t } = useTranslation();
  const location = useLocation();

  return (
    <nav className={styles.root} data-vitascan-tabbar="1">
      <div className={styles.bar}>
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) => {
              const active = tab.to === '/menu' ? isMenuSection(location.pathname) : isActive;
              return `${styles.tab} ${active ? styles.active : ''}`;
            }}
          >
            {({ isActive }) => {
              const active = tab.to === '/menu' ? isMenuSection(location.pathname) : isActive;
              const Icon = active ? TAB_ICONS[tab.iconKey].filled : TAB_ICONS[tab.iconKey].outline;
              return (
                <span className={styles.visual}>
                  {active && <span className={styles.activeShadow} />}
                  <span className={`${styles.inner} ${active ? styles.activeInner : ''}`}>
                    <Icon size={18} color="currentColor" />
                    <span className={styles.label}>{t(tab.labelKey)}</span>
                  </span>
                </span>
              );
            }}
          </NavLink>
        ))}
      </div>
      <div className={styles.safeFiller} />
    </nav>
  );
}
