// Hungarian + English basic profanity blacklist
// Ez egy alap lista — éles környezetben bővíteni kell
const BLACKLIST = [
  'szar', 'kurva', 'fasz', 'bazmeg', 'gecí', 'geci', 'picsá', 'picsa',
  'fuck', 'shit', 'bitch', 'cunt', 'nigger', 'faggot',
];

export function containsProfanity(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return BLACKLIST.some((word) => lower.includes(word));
}

export function assertNoProfanity(text: string, fieldName = 'Név'): void {
  if (containsProfanity(text)) {
    throw new Error(`${fieldName} nem tartalmazhat sértő szavakat.`);
  }
}
