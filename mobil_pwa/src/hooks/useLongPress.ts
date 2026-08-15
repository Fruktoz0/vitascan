import { useCallback, useRef } from 'react';

type LongPressEvent = React.PointerEvent<HTMLElement> | React.MouseEvent<HTMLElement>;

type Options = {
  delay?: number;
  moveThreshold?: number;
  disabled?: boolean;
  onLongPress: (e: LongPressEvent) => void;
};

export function useLongPress({
  delay = 500,
  moveThreshold = 10,
  disabled = false,
  onLongPress,
}: Options) {
  const timerRef = useRef<number | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const firedRef = useRef(false);

  const clear = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startRef.current = null;
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (disabled || e.button === 2) return;
      firedRef.current = false;
      startRef.current = { x: e.clientX, y: e.clientY };
      timerRef.current = window.setTimeout(() => {
        firedRef.current = true;
        onLongPress(e);
      }, delay);
    },
    [delay, disabled, onLongPress],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (!startRef.current) return;
      const dx = e.clientX - startRef.current.x;
      const dy = e.clientY - startRef.current.y;
      if (dx * dx + dy * dy > moveThreshold * moveThreshold) clear();
    },
    [clear, moveThreshold],
  );

  const onPointerUp = useCallback(() => {
    clear();
  }, [clear]);

  const onPointerCancel = useCallback(() => {
    clear();
  }, [clear]);

  const onClickCapture = useCallback((e: React.MouseEvent<HTMLElement>) => {
    if (!firedRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    firedRef.current = false;
  }, []);

  const onContextMenu = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      if (disabled) return;
      e.preventDefault();
      firedRef.current = true;
      onLongPress(e);
    },
    [disabled, onLongPress],
  );

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onClickCapture,
    onContextMenu,
  };
}
