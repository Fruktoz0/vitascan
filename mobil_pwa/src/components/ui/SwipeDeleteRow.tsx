import { useRef, useState, type ReactNode, type TouchEvent } from 'react';
import { IconDelete } from './Icons';
import styles from './SwipeDeleteRow.module.css';

const ACTION_W = 72;
const OPEN_THRESHOLD = 36;

type Props = {
  enabled: boolean;
  onDelete: () => void;
  deleteLabel: string;
  children: ReactNode;
};

export function SwipeDeleteRow({ enabled, onDelete, deleteLabel, children }: Props) {
  const [offset, setOffset] = useState(0);
  const startX = useRef(0);
  const startY = useRef(0);
  const startOffset = useRef(0);
  const axis = useRef<'h' | 'v' | null>(null);

  if (!enabled) return <>{children}</>;

  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    startX.current = t.clientX;
    startY.current = t.clientY;
    startOffset.current = offset;
    axis.current = null;
  };

  const onTouchMove = (e: TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    const dx = t.clientX - startX.current;
    const dy = t.clientY - startY.current;
    if (!axis.current) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      axis.current = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
    }
    if (axis.current !== 'h') return;
    const next = Math.min(0, Math.max(-ACTION_W, startOffset.current + dx));
    setOffset(next);
  };

  const onTouchEnd = () => {
    if (axis.current !== 'h') {
      axis.current = null;
      return;
    }
    setOffset((prev) => (prev <= -OPEN_THRESHOLD ? -ACTION_W : 0));
    axis.current = null;
  };

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={styles.deleteBtn}
        aria-label={deleteLabel}
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
          setOffset(0);
        }}
      >
        <IconDelete size={22} color="#B83B3B" />
      </button>
      <div
        className={styles.front}
        style={{ transform: `translateX(${offset}px)` }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        onClickCapture={(e) => {
          if (offset < -8) {
            e.preventDefault();
            e.stopPropagation();
            setOffset(0);
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
