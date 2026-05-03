// VitaScan Design System — Vibrant Glassmorphism
// Minden szín, árnék, gradient egy helyen

export const Colors = {
  // Brand
  primary: '#ff8c00',
  primaryLight: '#ffb77d',
  primarySoft: '#fff4ea',
  ink: '#1a1a1a',
  snow: '#fcf8f8',
  mint: '#c8f2d3',
  peach: '#ffd9bf',
  lavender: '#e7ddff',
  sky: '#d9f1ff',

  // Mesh gradient alap-színek
  meshPeach: '#ffd9bf',
  meshMint: '#c8f2d3',
  meshBlue: '#d9f1ff',
  meshLavender: '#e7ddff',

  // Makró szín-kódok
  macro: {
    protein: '#3f86cf',      // Királyskék
    proteinLight: '#edf5ff',
    proteinGrad: ['#3f86cf', '#88bee8'] as [string, string],

    carbs: '#f2a83b',        // Narancssárga
    carbsLight: '#fff7ea',
    carbsGrad: ['#f2a83b', '#ffd69e'] as [string, string],

    fat: '#48b76a',          // Smaragdzöld
    fatLight: '#effcf3',
    fatGrad: ['#48b76a', '#9de1b1'] as [string, string],

    fiber: '#9464c7',        // Lila
    fiberLight: '#f7f1ff',
    fiberGrad: ['#9464c7', '#c7b3ee'] as [string, string],

    sugar: '#de5b4f',        // Piros
    sugarLight: '#fff1ef',
    sugarGrad: ['#de5b4f', '#ffb39f'] as [string, string],

    kcal: '#ff8c00',         // Brand narancssárga
    kcalLight: '#fff4ea',
    kcalGrad: ['#ff8c00', '#ffb77d'] as [string, string],
  },

  // Glassmorphism
  glass: {
    white: '#ffffff',
    whiteSoft: 'rgba(255, 255, 255, 0.88)',
    whiteStrong: '#ffffff',
    border: 'rgba(26, 26, 26, 0.16)',
    borderSoft: 'rgba(26, 26, 26, 0.1)',
    shadow: 'rgba(26, 26, 26, 0.08)',
  },

  // Szöveg
  text: {
    primary: '#1a1a1a',
    secondary: '#3f3f46',
    muted: '#76767c',
    white: '#FFFFFF',
    whiteAlpha: 'rgba(255,255,255,0.88)',
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
    light: '#fcf8f8',
    card: '#FFFFFF',
  },

  dashboard: {
    page: '#fcf9f8', // background
    card: '#ffffff', // surface-container-lowest
    stroke: '#1c1b1b', // on-background
    strokeSoft: 'rgba(28,27,27,0.1)',
    shadowHard: '#1c1b1b', // rgba(28,27,27,1)
    shadowHardSoft: 'rgba(28,27,27,0.1)',

    // Pastel blobs
    blobMint: '#e8f5e9', // primary-container
    blobPeach: '#ffdad6', // error-container
    blobLavender: '#eadecc', // secondary-container
    softGreen: '#e8f5e9',
    softOrange: '#eadecc',
    softBlue: '#e1f5fe',

    // UI elements from HTML
    kcalTrack: '#f1edec', // surface-container
    kcalFill: '#ffb77d', // tertiary-fixed-dim

    proteinBg: '#ffffff',
    proteinTrack: '#f0eded',
    proteinFill: '#d0c5b3', // secondary-fixed-dim

    carbsBg: '#ffffff',
    carbsTrack: '#f0eded',
    carbsFill: '#b6cad2', // tertiary-fixed-dim

    fatBg: '#ffffff',
    fatTrack: '#f0eded',
    fatFill: '#fcd34d', // custom yellow from HTML

    nutritionIcon: '#556158', // primary
    waterBg: '#e1f5fe', // tertiary-container
    waterIcon: '#b6cad2', // tertiary-fixed-dim
    waterFill: '#0b1e24', // on-tertiary-fixed

    tabBg: '#fcf9f8', // surface
    tabActive: '#eadecc', // secondary-container
    tabInactive: '#434844', // on-surface-variant

    // Bento specific
    surfaceContainerLow: '#f6f3f2',
    surfaceContainer: '#f0eded',
    surfaceContainerHigh: '#eae7e7',
    surfaceContainerHighest: '#e5e2e1',
    onSurfaceVariant: '#434844',
    outlineVariant: '#c3c8c2',
    tertiaryFixed: '#d2e6ef',
    primaryFixed: '#d9e6da',
    errorContainer: '#ffdad6',
    secondaryContainer: '#eadecc',
  },
} as const;

export const Gradients = {
  // Fő mesh gradiens — app háttér
  meshMain: ['#ffe7d5', '#fff3ea', '#effbef', '#eef8ff'] as string[],
  meshHome: ['#fff0e4', '#fff8f2', '#f3fcf4'] as string[],
  meshScanner: ['#1A1A2E', '#2D2D4E'] as string[],
  meshVault: ['#d9f1ff', '#e7ddff', '#fcf8f8'] as string[],

  // Makró gradiensek
  protein: Colors.macro.proteinGrad,
  carbs: Colors.macro.carbsGrad,
  fat: Colors.macro.fatGrad,
  fiber: Colors.macro.fiberGrad,

  // Kártya gradiensek
  cardOrange: ['#ff8c00', '#ffb77d'] as string[],
  cardMint: ['#48b76a', '#9de1b1'] as string[],
  cardBlue: ['#3f86cf', '#88bee8'] as string[],
  cardPurple: ['#9464c7', '#c7b3ee'] as string[],
  cardDark: ['#1A1A2E', '#2D2D4E'] as string[],
} as const;

export const Shadows = {
  // Üveg árnyékok
  glass: {
    shadowColor: Colors.glass.shadow,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 3,
  },
  glassSoft: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  card: {
    shadowColor: '#1a1a1a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  /** Profil és hasonló fehér kártyák: ugyanaz a színrendszer, enyhébb intenzitás */
  profileCard: {
    shadowColor: '#1a1a1a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  // Brand árnyék (narancssárga gomboknál)
  primary: {
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 5,
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
  '5xl': 48,
  '6xl': 64,
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
