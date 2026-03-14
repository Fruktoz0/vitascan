// VitaScan Design System — Vibrant Glassmorphism
// Minden szín, árnék, gradient egy helyen

export const Colors = {
  // Brand
  primary: '#FF6B35',
  primaryLight: '#FF9A6C',
  primarySoft: '#FFF0EA',

  // Mesh gradient alap-színek
  meshPeach: '#FF9A6C',
  meshMint: '#A8EDBC',
  meshBlue: '#7EC8E3',
  meshLavender: '#C9B8FF',

  // Makró szín-kódok
  macro: {
    protein: '#4A90D9',      // Királyskék
    proteinLight: '#EBF4FF',
    proteinGrad: ['#4A90D9', '#7EC8E3'] as [string, string],

    carbs: '#F5A623',        // Narancssárga
    carbsLight: '#FFF8EC',
    carbsGrad: ['#F5A623', '#FFD080'] as [string, string],

    fat: '#2ECC71',          // Smaragdzöld
    fatLight: '#F0FFF4',
    fatGrad: ['#2ECC71', '#A8EDBC'] as [string, string],

    fiber: '#9B59B6',        // Lila
    fiberLight: '#F8F0FF',
    fiberGrad: ['#9B59B6', '#C9B8FF'] as [string, string],

    sugar: '#E74C3C',        // Piros
    sugarLight: '#FFF0F0',
    sugarGrad: ['#E74C3C', '#FF9A6C'] as [string, string],

    kcal: '#FF6B35',         // Brand narancssárga
    kcalLight: '#FFF0EA',
    kcalGrad: ['#FF6B35', '#FF9A6C'] as [string, string],
  },

  // Glassmorphism
  glass: {
    white: 'rgba(255, 255, 255, 0.75)',
    whiteSoft: 'rgba(255, 255, 255, 0.55)',
    whiteStrong: 'rgba(255, 255, 255, 0.90)',
    border: 'rgba(255, 255, 255, 0.60)',
    borderSoft: 'rgba(255, 255, 255, 0.35)',
    shadow: 'rgba(31, 38, 135, 0.12)',
  },

  // Szöveg
  text: {
    primary: '#1A1A2E',
    secondary: '#555577',
    muted: '#9999BB',
    white: '#FFFFFF',
    whiteAlpha: 'rgba(255,255,255,0.85)',
  },

  // Státusz
  status: {
    verified: '#2ECC71',
    verifiedBg: '#F0FFF4',
    banned: '#E74C3C',
    bannedBg: '#FFF0F0',
    unverified: '#F5A623',
    unverifiedBg: '#FFF8EC',
  },

  // Háttér
  bg: {
    light: '#F8F9FF',
    card: '#FFFFFF',
  },
} as const;

export const Gradients = {
  // Fő mesh gradiens — app háttér
  meshMain: ['#FF9A6C', '#FFD4B8', '#A8EDBC', '#7EC8E3'] as string[],
  meshHome: ['#FF9A6C', '#FFD4B8', '#F0FFF4'] as string[],
  meshScanner: ['#1A1A2E', '#2D2D4E'] as string[],
  meshVault: ['#7EC8E3', '#C9B8FF', '#F8F9FF'] as string[],

  // Makró gradiensek
  protein: Colors.macro.proteinGrad,
  carbs: Colors.macro.carbsGrad,
  fat: Colors.macro.fatGrad,
  fiber: Colors.macro.fiberGrad,

  // Kártya gradiensek
  cardOrange: ['#FF6B35', '#FF9A6C'] as string[],
  cardMint: ['#2ECC71', '#A8EDBC'] as string[],
  cardBlue: ['#4A90D9', '#7EC8E3'] as string[],
  cardPurple: ['#9B59B6', '#C9B8FF'] as string[],
  cardDark: ['#1A1A2E', '#2D2D4E'] as string[],
} as const;

export const Shadows = {
  // Üveg árnyékok
  glass: {
    shadowColor: Colors.glass.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 32,
    elevation: 8,
  },
  glassSoft: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  // Brand árnyék (narancssárga gomboknál)
  primary: {
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
} as const;

export const Radius = {
  sm: 10,
  md: 16,
  lg: 20,
  xl: 24,
  '2xl': 28,
  '3xl': 36,
  full: 999,
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
} as const;

export const Typography = {
  hero: { fontSize: 32, fontWeight: '900' as const, letterSpacing: -0.5 },
  title: { fontSize: 24, fontWeight: '800' as const },
  subtitle: { fontSize: 18, fontWeight: '700' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  bodyMedium: { fontSize: 15, fontWeight: '600' as const },
  caption: { fontSize: 12, fontWeight: '500' as const },
  label: { fontSize: 13, fontWeight: '600' as const },
  number: { fontSize: 48, fontWeight: '900' as const, letterSpacing: -1 },
  numberSm: { fontSize: 28, fontWeight: '800' as const },
} as const;
