import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import DoodleCharacter from './DoodleCharacter';
import {
  doodleAriaI18nKey,
  doodleTipsI18nKey,
  type DoodleMoodResult,
} from '../../utils/doodleMood';
import styles from './DoodleMascot.module.css';

const FIRST_OPEN_MS = 8000;
const NEXT_OPEN_MS = 30000;
const SHOW_MS = 4000;

type Props = {
  doodle: DoodleMoodResult;
};

function readTips(
  t: TFunction,
  hintKey: DoodleMoodResult['hintKey'],
  mealLabel: string,
): string[] {
  const base = doodleTipsI18nKey(hintKey);
  const raw = t(base, { returnObjects: true });
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.map((_, i) => t(`${base}.${i}`, { meal: mealLabel }));
  }
  const fallback = t(doodleAriaI18nKey(hintKey), { meal: mealLabel });
  return fallback ? [fallback] : [];
}

export default function DoodleMascot({ doodle }: Props) {
  const { t } = useTranslation();
  const bubbleId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const openedOnceRef = useRef(false);
  const hintKeyRef = useRef(doodle.hintKey);
  const [open, setOpen] = useState(false);
  const [tipIndex, setTipIndex] = useState(0);

  const mealLabel = doodle.meal ? t(`food.${doodle.meal.toLowerCase()}`) : '';
  const tips = useMemo(
    () => readTips(t, doodle.hintKey, mealLabel),
    [t, doodle.hintKey, mealLabel],
  );
  const ariaLabel = t(doodleAriaI18nKey(doodle.hintKey), { meal: mealLabel });
  const text = tips.length > 0 ? tips[tipIndex % tips.length]! : ariaLabel;

  useEffect(() => {
    if (hintKeyRef.current === doodle.hintKey) return;
    hintKeyRef.current = doodle.hintKey;
    setTipIndex(0);
  }, [doodle.hintKey]);

  const show = useCallback((cycle: boolean) => {
    openedOnceRef.current = true;
    if (cycle) setTipIndex((i) => i + 1);
    setOpen(true);
  }, []);

  const hide = useCallback(() => {
    setOpen(false);
  }, []);

  const onToggle = () => {
    if (open) show(true);
    else show(false);
  };

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(hide, SHOW_MS);
    return () => window.clearTimeout(id);
  }, [open, hide, tipIndex]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) hide();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hide();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, hide]);

  useEffect(() => {
    if (open) return;
    let remaining = openedOnceRef.current ? NEXT_OPEN_MS : FIRST_OPEN_MS;
    let lastTick = Date.now();
    let timeoutId = 0;

    const start = () => {
      lastTick = Date.now();
      timeoutId = window.setTimeout(() => {
        show(openedOnceRef.current);
      }, remaining);
    };

    const pause = () => {
      window.clearTimeout(timeoutId);
      remaining = Math.max(0, remaining - (Date.now() - lastTick));
    };

    const onVisibility = () => {
      if (document.hidden) pause();
      else start();
    };

    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [open, show]);

  const moodClass =
    doodle.mood === 'warn'
      ? styles.warn
      : doodle.mood === 'celebrate'
        ? styles.celebrate
        : doodle.mood === 'curious'
          ? styles.curious
          : '';

  return (
    <div
      ref={rootRef}
      className={`${styles.wrap} ${moodClass} ${open ? styles.open : ''}`}
    >
      <button
        type="button"
        className={styles.btn}
        onClick={onToggle}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={open ? bubbleId : undefined}
      >
        <span className={styles.shadow} />
        <span className={styles.face}>
          <DoodleCharacter size={46} mood={doodle.mood} />
        </span>
      </button>
      {open ? (
        <p id={bubbleId} className={styles.bubble} role="status">
          {text}
        </p>
      ) : null}
    </div>
  );
}
