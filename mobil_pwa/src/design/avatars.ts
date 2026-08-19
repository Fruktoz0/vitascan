export const DEFAULT_AVATAR_KEY = 'mint';

export type AvatarAccessory = 'sprout' | 'leaf' | 'drop' | 'apple' | 'flame' | 'spark';
export type AvatarMood = 'curious' | 'calm' | 'celebrate';

export type AvatarDef = {
  key: string;
  mood: AvatarMood;
  accessory: AvatarAccessory;
  body: string;
  belly: string;
  accent: string;
  spark: string;
  bg: string;
};

export const AVATAR_OPTIONS: readonly AvatarDef[] = [
  {
    key: 'mint',
    mood: 'calm',
    accessory: 'sprout',
    body: '#eef7ef',
    belly: '#c8f2d3',
    accent: '#5f9f72',
    spark: '#a8d4b4',
    bg: '#e8f5e9',
  },
  {
    key: 'peach',
    mood: 'curious',
    accessory: 'sprout',
    body: '#fff4ea',
    belly: '#ffdad6',
    accent: '#e07a5f',
    spark: '#ffb77d',
    bg: '#ffdad6',
  },
  {
    key: 'lavender',
    mood: 'calm',
    accessory: 'sprout',
    body: '#faf6ee',
    belly: '#eadecc',
    accent: '#8a7a5c',
    spark: '#d0c5b3',
    bg: '#eadecc',
  },
  {
    key: 'sky',
    mood: 'calm',
    accessory: 'drop',
    body: '#eef7fb',
    belly: '#d2e6ef',
    accent: '#3f86cf',
    spark: '#b6cad2',
    bg: '#d8e6f2',
  },
  {
    key: 'sprout',
    mood: 'curious',
    accessory: 'leaf',
    body: '#eef7ef',
    belly: '#d7ebd2',
    accent: '#2e7d32',
    spark: '#c8f2d3',
    bg: '#d9e6da',
  },
  {
    key: 'apple',
    mood: 'celebrate',
    accessory: 'apple',
    body: '#fff4ea',
    belly: '#fce2c8',
    accent: '#c44b3a',
    spark: '#ffb39f',
    bg: '#ffe8d6',
  },
  {
    key: 'ember',
    mood: 'curious',
    accessory: 'flame',
    body: '#fff7ea',
    belly: '#f4e5c2',
    accent: '#e65100',
    spark: '#ffb77d',
    bg: '#eadecc',
  },
  {
    key: 'berry',
    mood: 'celebrate',
    accessory: 'spark',
    body: '#f7f1ff',
    belly: '#e7ddff',
    accent: '#6a1b9a',
    spark: '#c7b3ee',
    bg: '#e7ddff',
  },
  {
    key: 'sun',
    mood: 'celebrate',
    accessory: 'spark',
    body: '#fff8ec',
    belly: '#fcd34d',
    accent: '#b45309',
    spark: '#ffd56b',
    bg: '#f4e5c2',
  },
  {
    key: 'wave',
    mood: 'calm',
    accessory: 'drop',
    body: '#eef8f8',
    belly: '#c8eef2',
    accent: '#0b6e7a',
    spark: '#7ec8d1',
    bg: '#d2e6ef',
  },
] as const;

export type AvatarKey = (typeof AVATAR_OPTIONS)[number]['key'];

const KEYS = new Set<string>(AVATAR_OPTIONS.map((a) => a.key));

export function isAvatarKey(key: string | null | undefined): key is AvatarKey {
  return Boolean(key && KEYS.has(key));
}

export function resolveAvatarKey(key?: string | null): AvatarKey {
  return isAvatarKey(key) ? key : DEFAULT_AVATAR_KEY;
}

export function getAvatarDef(key?: string | null): AvatarDef {
  const resolved = resolveAvatarKey(key);
  return AVATAR_OPTIONS.find((a) => a.key === resolved) ?? AVATAR_OPTIONS[0];
}
