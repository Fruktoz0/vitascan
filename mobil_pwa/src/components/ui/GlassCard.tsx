import type { CSSProperties, ReactNode } from 'react';
import { Colors } from '../../design/tokens';
import styles from './GlassCard.module.css';

type RadiusCorners = {
  borderTopLeftRadius?: number;
  borderTopRightRadius?: number;
  borderBottomRightRadius?: number;
  borderBottomLeftRadius?: number;
};

interface GlassCardSimpleProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  padding?: number;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  noShadow?: boolean;
  shadowOffset?: number;
  customRadius?: RadiusCorners;
  radius?: number;
}

export function GlassCardSimple({
  children,
  className,
  style,
  padding = 24,
  backgroundColor = Colors.dashboard.card,
  borderColor = Colors.dashboard.stroke,
  borderWidth = 1.5,
  noShadow = false,
  shadowOffset = 4,
  customRadius,
  radius = 24,
}: GlassCardSimpleProps) {
  const radiusStyle: CSSProperties = customRadius
    ? {
        borderTopLeftRadius: customRadius.borderTopLeftRadius,
        borderTopRightRadius: customRadius.borderTopRightRadius,
        borderBottomRightRadius: customRadius.borderBottomRightRadius,
        borderBottomLeftRadius: customRadius.borderBottomLeftRadius,
      }
    : { borderRadius: radius };

  return (
    <div
      className={`${styles.wrapper} ${className ?? ''}`}
      style={{
        paddingRight: noShadow ? 0 : shadowOffset,
        paddingBottom: noShadow ? 0 : shadowOffset,
        ...style,
      }}
    >
      {!noShadow && (
        <div className={styles.shadow} style={{ top: shadowOffset, left: shadowOffset, ...radiusStyle }} />
      )}
      <div
        className={styles.inner}
        style={{
          backgroundColor,
          borderColor,
          borderWidth,
          padding,
          ...radiusStyle,
        }}
      >
        {children}
      </div>
    </div>
  );
}

export default GlassCardSimple;
