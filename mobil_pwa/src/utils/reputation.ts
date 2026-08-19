export type ReputationLevelKey = 'Újjonc' | 'Tag' | 'Aktív' | 'Szakértő' | 'Mester' | 'Legenda';

export type ReputationLevel = {
  key: ReputationLevelKey;
  min: number;
  emoji: string;
  tint: string;
  fill: string;
  iconBg: string;
};

/** Matches backend EXPERT_THRESHOLD (Szakértő kitűző). */
export const EXPERT_THRESHOLD = 10;

export const REPUTATION_LEVELS: readonly ReputationLevel[] = [
  { key: 'Újjonc', min: 0, emoji: '🌱', tint: '#E8F5E9', fill: '#5ead65', iconBg: '#d9e6da' },
  { key: 'Tag', min: 5, emoji: '🌿', tint: '#D8E6F2', fill: '#3f86cf', iconBg: '#d2e6ef' },
  { key: 'Aktív', min: 8, emoji: '⭐', tint: '#EDE4C8', fill: '#c9a227', iconBg: '#eadecc' },
  { key: 'Szakértő', min: EXPERT_THRESHOLD, emoji: '🏅', tint: '#FFE8D6', fill: '#e65100', iconBg: '#ffdad6' },
  { key: 'Mester', min: 25, emoji: '🏆', tint: '#E7DDFF', fill: '#6A1B9A', iconBg: '#e7ddff' },
  { key: 'Legenda', min: 50, emoji: '👑', tint: '#F4E5C2', fill: '#b45309', iconBg: '#ffd69e' },
];

export type ReputationProgress = {
  current: ReputationLevel;
  next: ReputationLevel | null;
  index: number;
  levelNumber: number;
  points: number;
  remaining: number;
  ratio: number;
  maxed: boolean;
};

export function getReputationProgress(points: number): ReputationProgress {
  const safe = Math.max(0, Math.floor(points || 0));
  let current = REPUTATION_LEVELS[0];
  let index = 0;
  for (let i = 0; i < REPUTATION_LEVELS.length; i++) {
    if (safe >= REPUTATION_LEVELS[i].min) {
      current = REPUTATION_LEVELS[i];
      index = i;
    }
  }
  const next = REPUTATION_LEVELS[index + 1] ?? null;
  const span = next ? Math.max(1, next.min - current.min) : 1;
  const into = next ? Math.min(span, safe - current.min) : span;
  return {
    current,
    next,
    index,
    levelNumber: index + 1,
    points: safe,
    remaining: next ? Math.max(0, next.min - safe) : 0,
    ratio: next ? into / span : 1,
    maxed: !next,
  };
}
