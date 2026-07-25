import type { ReactNode } from 'react';
import styles from './Button.module.css';

interface ButtonProps {
  label: string;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'primary' | 'ghost' | 'glass';
  className?: string;
}

export function PrimaryButton(props: Omit<ButtonProps, 'variant'>) {
  return <AppButton {...props} variant="primary" />;
}

export function GhostButton(props: Omit<ButtonProps, 'variant'>) {
  return <AppButton {...props} variant="ghost" />;
}

export function GlassButton(props: Omit<ButtonProps, 'variant'>) {
  return <AppButton {...props} variant="glass" />;
}

function AppButton({
  label,
  onClick,
  loading,
  disabled,
  icon,
  size = 'md',
  variant = 'primary',
  className,
}: ButtonProps) {
  if (variant === 'primary') {
    return (
      <button
        type="button"
        className={`${styles.wrapper} ${styles[size]} ${className ?? ''}`}
        onClick={onClick}
        disabled={disabled || loading}
      >
        <span className={styles.hardShadow} />
        <span className={styles.btnFace}>
          {loading ? (
            <span className="spinner" style={{ width: 20, height: 20 }} />
          ) : (
            <span className={styles.content}>
              {icon}
              {label}
            </span>
          )}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`${variant === 'ghost' ? styles.ghost : styles.glass} ${styles[size]} ${className ?? ''}`}
      onClick={onClick}
      disabled={disabled || loading}
    >
      {loading ? <span className="spinner" style={{ width: 20, height: 20 }} /> : (
        <span className={styles.content}>
          {icon}
          {label}
        </span>
      )}
    </button>
  );
}
