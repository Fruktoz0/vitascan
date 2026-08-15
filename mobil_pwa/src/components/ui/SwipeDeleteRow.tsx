import { useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { IconDelete } from './Icons';
import styles from './SwipeDeleteRow.module.css';

const SLOT_W = 72;
const OPEN_THRESHOLD = 36;

type ExtraAction = {
  label: string;
  onClick: () => void;
  icon: ReactNode;
};

type Props = {
  enabled: boolean;
  onDelete: () => void;
  deleteLabel: string;
  extraAction?: ExtraAction;
  /** Revealed by swiping right (opposite of delete). */
  editAction?: ExtraAction;
  children: ReactNode;
};

export function SwipeDeleteRow({
  enabled,
  onDelete,
  deleteLabel,
  extraAction,
  editAction,
  children,
}: Props) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const startOffset = useRef(0);
  const axis = useRef<'h' | 'v' | null>(null);
  const active = useRef(false);
  const rightW = extraAction ? SLOT_W * 2 : SLOT_W;
  const leftW = editAction ? SLOT_W : 0;

  if (!enabled) return <>{children}</>;

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    active.current = true;
    startX.current = e.clientX;
    startY.current = e.clientY;
    startOffset.current = offset;
    axis.current = null;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!active.current) return;
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;
    if (!axis.current) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      axis.current = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
      if (axis.current === 'h') setDragging(true);
    }
    if (axis.current !== 'h') return;
    e.preventDefault();
    const next = Math.min(leftW, Math.max(-rightW, startOffset.current + dx));
    setOffset(next);
  };

  const onPointerEnd = () => {
    if (!active.current) return;
    active.current = false;
    if (axis.current !== 'h') {
      axis.current = null;
      setDragging(false);
      return;
    }
    setOffset((prev) => {
      if (prev <= -OPEN_THRESHOLD) return -rightW;
      if (prev >= OPEN_THRESHOLD && leftW > 0) return leftW;
      return 0;
    });
    axis.current = null;
    setDragging(false);
  };

  return (
    <div className={styles.wrap}>
      {editAction ? (
        <div className={styles.actionsLeft} style={{ width: leftW - 8 }}>
          <button
            type="button"
            className={styles.editBtn}
            aria-label={editAction.label}
            onClick={(e) => {
              e.stopPropagation();
              editAction.onClick();
              setOffset(0);
            }}
          >
            {editAction.icon}
          </button>
        </div>
      ) : null}
      <div className={styles.actions} style={{ width: rightW - 8 }}>
        {extraAction && (
          <button
            type="button"
            className={styles.extraBtn}
            aria-label={extraAction.label}
            onClick={(e) => {
              e.stopPropagation();
              extraAction.onClick();
              setOffset(0);
            }}
          >
            {extraAction.icon}
          </button>
        )}
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
      </div>
      <div
        className={styles.front}
        style={{
          transform: `translateX(${offset}px)`,
          transition: dragging ? 'none' : 'transform 0.16s ease-out',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onClickCapture={(e) => {
          if (Math.abs(offset) > 8) {
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
