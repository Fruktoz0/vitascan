import type { CSSProperties, ReactNode } from 'react';
import styles from './BentoCard.module.css';

interface BentoCardProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  backgroundColor?: string;
  padding?: number;
}

export function BentoCard({
  children,
  className,
  style,
  backgroundColor = '#ffffff',
  padding = 20,
}: BentoCardProps) {
  return (
    <div className={`${styles.container} ${className ?? ''}`} style={style}>
      <div className={styles.shadow} />
      <div className={styles.inner} style={{ backgroundColor, padding }}>
        {children}
      </div>
    </div>
  );
}
