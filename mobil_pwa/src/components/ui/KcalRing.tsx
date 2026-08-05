import { Colors } from '../../design/tokens';
import { IconLocalFire } from './Icons';
import styles from './KcalRing.module.css';

interface KcalRingProps {
  consumed: number;
  goal: number;
  size?: number;
  strokeWidth?: number;
  /** Hide center icon (compact meal cells). */
  showLabel?: boolean;
}

export default function KcalRing({
  consumed,
  goal,
  size = 100,
  strokeWidth = 8,
  showLabel = true,
}: KcalRingProps) {
  const pct = goal > 0 ? Math.min(consumed / goal, 1) : 0;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct);
  const center = size / 2;
  const fillColor = Colors.dashboard.kcalFill;
  const innerR = Math.max(0, radius - strokeWidth - 2);

  return (
    <div className={styles.container} style={{ width: size, height: size }}>
      <svg width={size} height={size} className={styles.svg}>
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={Colors.dashboard.kcalTrack}
          strokeWidth={strokeWidth}
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={fillColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${center} ${center})`}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
        {innerR > 2 && (
          <circle
            cx={center}
            cy={center}
            r={innerR}
            fill="none"
            stroke={Colors.dashboard.stroke}
            strokeWidth={1}
            strokeDasharray="4 4"
            opacity={0.25}
          />
        )}
      </svg>
      {showLabel && (
        <div className={styles.center}>
          <IconLocalFire size={Math.round(size * 0.32)} color={fillColor} />
        </div>
      )}
    </div>
  );
}
