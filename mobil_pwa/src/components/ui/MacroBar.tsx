import { useTranslation } from 'react-i18next';
import { Colors } from '../../design/tokens';
import { GlassCardSimple } from './GlassCard';
import { IconBakeryDining, IconEggAlt, IconOpacity } from './Icons';
import styles from './MacroBar.module.css';

type MacroType = 'protein' | 'carbs' | 'fat';

const CONFIG: Record<
  MacroType,
  {
    fill: string;
    radii: {
      borderTopLeftRadius: number;
      borderTopRightRadius: number;
      borderBottomRightRadius: number;
      borderBottomLeftRadius: number;
    };
    Icon: typeof IconEggAlt;
  }
> = {
  protein: {
    fill: Colors.dashboard.proteinFill,
    radii: { borderTopLeftRadius: 16, borderTopRightRadius: 16, borderBottomRightRadius: 16, borderBottomLeftRadius: 16 },
    Icon: IconEggAlt,
  },
  carbs: {
    fill: Colors.dashboard.carbsFill,
    radii: { borderTopLeftRadius: 24, borderTopRightRadius: 16, borderBottomRightRadius: 16, borderBottomLeftRadius: 24 },
    Icon: IconBakeryDining,
  },
  fat: {
    fill: Colors.dashboard.fatFill,
    radii: { borderTopLeftRadius: 16, borderTopRightRadius: 24, borderBottomRightRadius: 24, borderBottomLeftRadius: 16 },
    Icon: IconOpacity,
  },
};

export function MacroChip({ type, value, goal }: { type: MacroType; value: number; goal?: number }) {
  const { t } = useTranslation();
  const cfg = CONFIG[type];
  const pct = goal && goal > 0 ? Math.min(value / goal, 1) : 0;
  const label =
    type === 'protein' ? t('food.protein') : type === 'carbs' ? t('food.carbs') : t('food.fat');

  return (
    <GlassCardSimple
      className={styles.chip}
      padding={12}
      shadowOffset={3}
      customRadius={cfg.radii}
      style={{ flex: 1, minHeight: 110 }}
    >
      <div className={styles.header}>
        <span className={styles.label}>{label}</span>
        <cfg.Icon size={16} color={Colors.dashboard.stroke} />
      </div>
      <div className={styles.value}>{Math.round(value)}g</div>
      <div className={styles.track}>
        <div className={styles.fill} style={{ width: `${pct * 100}%`, background: cfg.fill }} />
      </div>
      {goal != null && <div className={styles.goal}>/ {goal} g</div>}
    </GlassCardSimple>
  );
}
