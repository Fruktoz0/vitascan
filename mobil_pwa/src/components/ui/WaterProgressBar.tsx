import { useTranslation } from 'react-i18next';
import { Colors } from '../../design/tokens';
import { GlassCardSimple } from './GlassCard';
import { IconWaterDrop } from './Icons';
import styles from './WaterProgressBar.module.css';

interface WaterProgressBarProps {
  totalMl: number;
  goalMl: number;
  onAdjust: (ml: number) => void;
  onOpenLog?: () => void;
}

export default function WaterProgressBar({
  totalMl,
  goalMl,
  onAdjust,
  onOpenLog,
}: WaterProgressBarProps) {
  const { t } = useTranslation();
  const pct = goalMl > 0 ? Math.min(totalMl / goalMl, 1) : 0;
  const canSubtract = totalMl > 0;

  return (
    <GlassCardSimple
      backgroundColor={Colors.dashboard.waterBg}
      padding={20}
      shadowOffset={3}
      customRadius={{
        borderTopLeftRadius: 24,
        borderTopRightRadius: 32,
        borderBottomRightRadius: 24,
        borderBottomLeftRadius: 32,
      }}
    >
      <button
        type="button"
        className={styles.headerBtn}
        onClick={onOpenLog}
        disabled={!onOpenLog}
      >
        <div className={styles.titleRow}>
          <div className={styles.iconCircle}>
            <span className={styles.iconShadow} />
            <span className={styles.iconInner}>
              <IconWaterDrop size={24} color={Colors.dashboard.waterIcon} />
            </span>
          </div>
          <div>
            <div className={styles.title}>{t('waterScreen.title')}</div>
            <div className={styles.goal}>
              {t('waterScreen.dailyGoal', { liters: (goalMl / 1000).toFixed(1) })}
            </div>
          </div>
        </div>
        <div className={styles.current}>{(totalMl / 1000).toFixed(1)}L</div>
      </button>

      <div className={styles.track}>
        <div className={styles.fillWrapper} style={{ width: `${pct * 100}%` }}>
          <span className={styles.stripes}>//////// //////// //////// //////// //////// ////////</span>
        </div>
      </div>

      <div className={styles.btnRow}>
        <button
          type="button"
          className={styles.btnWrapper}
          disabled={!canSubtract}
          onClick={() => onAdjust(-250)}
        >
          <span className={styles.btnShadow} />
          <span className={styles.btnFace}>
            <span className={styles.btnSign}>−</span>
            <span className={styles.btnText}> 250 ml</span>
          </span>
        </button>
        <button type="button" className={styles.btnWrapper} onClick={() => onAdjust(250)}>
          <span className={styles.btnShadow} />
          <span className={styles.btnFace}>
            <span className={styles.btnSign}>+</span>
            <span className={styles.btnText}> 250 ml</span>
          </span>
        </button>
      </div>
    </GlassCardSimple>
  );
}
