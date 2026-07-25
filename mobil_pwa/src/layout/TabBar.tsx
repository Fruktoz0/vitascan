import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TAB_ICONS } from '../components/ui/Icons';
import styles from './TabBar.module.css';

const TABS = [
  { to: '/home', iconKey: 'home' as const, labelKey: 'home' },
  { to: '/food-library', iconKey: 'diary' as const, labelKey: 'foodLibrary' },
  { to: '/body', iconKey: 'body' as const, labelKey: 'bodyTab' },
  { to: '/profile', iconKey: 'profile' as const, labelKey: 'profileTab' },
];

export default function TabBar() {
  const { t } = useTranslation();

  return (
    <nav className={styles.root} data-vitascan-tabbar="1">
      <div className={styles.bar}>
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) => `${styles.tab} ${isActive ? styles.active : ''}`}
          >
            {({ isActive }) => {
              const Icon = isActive ? TAB_ICONS[tab.iconKey].filled : TAB_ICONS[tab.iconKey].outline;
              return (
                <span className={styles.visual}>
                  {isActive && <span className={styles.activeShadow} />}
                  <span className={`${styles.inner} ${isActive ? styles.activeInner : ''}`}>
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
