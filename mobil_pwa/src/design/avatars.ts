/** Ingyenes DiceBear avatárok — csak seed tárolása a DB-ben. */
export const AVATAR_OPTIONS = [
  'Felix',
  'Aneka',
  'Midnight',
  'Sophia',
  'Leo',
  'Maya',
  'Kai',
  'Nova',
  'Remy',
  'Zoe',
  'Atlas',
  'Luna',
  'Hugo',
  'Ivy',
  'Owen',
  'Clara',
] as const;

export type AvatarKey = (typeof AVATAR_OPTIONS)[number] | string;

export function avatarUrl(key?: string | null): string {
  const seed = encodeURIComponent(key?.trim() || 'Felix');
  return `https://api.dicebear.com/9.x/avataaars/svg?seed=${seed}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;
}
