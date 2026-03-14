import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

const resources = {
  hu: {
    translation: {
      // Auth
      login: 'Bejelentkezés',
      register: 'Regisztráció',
      logout: 'Kijelentkezés',
      email: 'Email cím',
      password: 'Jelszó',
      username: 'Felhasználónév',
      forgotPassword: 'Elfelejtett jelszó',

      // Navigation
      home: 'Főoldal',
      scanner: 'Szkenner',
      foodLibrary: 'Ételek',
      dataVault: 'Adatok',

      // Home
      goodMorning: 'Jó reggelt',
      goodAfternoon: 'Jó napot',
      goodEvening: 'Jó estét',
      todayGoal: 'Mai cél',
      remaining: 'Maradt',
      consumed: 'Elfogyasztva',
      kcalLeft: '{{amount}} kcal maradt',

      // Macros
      protein: 'Fehérje',
      carbs: 'Szénhidrát',
      fat: 'Zsír',
      fiber: 'Rost',
      sugar: 'Cukor',
      kcal: 'kcal',

      // Meals
      breakfast: 'Reggeli',
      lunch: 'Ebéd',
      dinner: 'Vacsora',
      snack: 'Snack',
      other: 'Egyéb',

      // Water
      water: 'Víz',
      waterGoal: 'Napi vízfogyasztás',
      addWater: 'Víz hozzáadása',
      waterLeft: '{{amount}} ml maradt',

      // Scanner
      scanBarcode: 'Vonalkód beolvasása',
      scanNotFound: 'Nem találtuk az ételt',
      scanAddManually: 'Manuális hozzáadás',
      scanSuccess: 'Étel megtalálva!',

      // Food
      addFood: 'Étel hozzáadása',
      amount: 'Mennyiség (g)',
      serving: 'Adag',
      verified: 'Ellenőrzött',
      searchFood: 'Keresés az ételek között...',

      // Profile
      profile: 'Profil',
      settings: 'Beállítások',
      editProfile: 'Profil szerkesztése',
      exportData: 'Adatok exportálása',

      // Premium
      premium: 'Premium',
      upgradeToPremium: 'Válts Premiumra',
      premiumFeature: 'Ez Premium funkció',
      unlockPremium: 'Korlátlan hozzáférésért válts Premiumra!',

      // Errors
      networkError: 'Hálózati hiba. Ellenőrizd a kapcsolatot.',
      unknownError: 'Ismeretlen hiba történt.',

      // Success
      saved: 'Mentve!',
      deleted: 'Törölve.',
      logAdded: 'Bejegyzés hozzáadva!',

      // Streak
      streakDays: '{{count}} napos sorozat 🔥',
      startStreak: 'Kezdj el naplózni ma!',
    },
  },

  en: {
    translation: {
      login: 'Login',
      register: 'Register',
      logout: 'Logout',
      email: 'Email',
      password: 'Password',
      username: 'Username',
      home: 'Home',
      scanner: 'Scanner',
      foodLibrary: 'Foods',
      dataVault: 'Stats',
      goodMorning: 'Good morning',
      goodAfternoon: 'Good afternoon',
      goodEvening: 'Good evening',
      todayGoal: "Today's goal",
      remaining: 'Remaining',
      consumed: 'Consumed',
      kcalLeft: '{{amount}} kcal left',
      protein: 'Protein',
      carbs: 'Carbs',
      fat: 'Fat',
      fiber: 'Fiber',
      sugar: 'Sugar',
      kcal: 'kcal',
      breakfast: 'Breakfast',
      lunch: 'Lunch',
      dinner: 'Dinner',
      snack: 'Snack',
      other: 'Other',
      water: 'Water',
      waterGoal: 'Daily water goal',
      addWater: 'Add water',
      waterLeft: '{{amount}} ml left',
      scanBarcode: 'Scan barcode',
      scanNotFound: 'Food not found',
      scanAddManually: 'Add manually',
      scanSuccess: 'Food found!',
      addFood: 'Add food',
      amount: 'Amount (g)',
      serving: 'Serving',
      verified: 'Verified',
      searchFood: 'Search foods...',
      profile: 'Profile',
      settings: 'Settings',
      editProfile: 'Edit profile',
      exportData: 'Export data',
      premium: 'Premium',
      upgradeToPremium: 'Upgrade to Premium',
      premiumFeature: 'Premium feature',
      unlockPremium: 'Upgrade to Premium for unlimited access!',
      networkError: 'Network error. Check your connection.',
      unknownError: 'An unknown error occurred.',
      saved: 'Saved!',
      deleted: 'Deleted.',
      logAdded: 'Log entry added!',
      streakDays: '{{count}} day streak 🔥',
      startStreak: 'Start logging today!',
    },
  },

  de: {
    translation: {
      login: 'Anmelden',
      register: 'Registrieren',
      logout: 'Abmelden',
      email: 'E-Mail',
      password: 'Passwort',
      username: 'Benutzername',
      home: 'Startseite',
      scanner: 'Scanner',
      foodLibrary: 'Lebensmittel',
      dataVault: 'Statistik',
      goodMorning: 'Guten Morgen',
      goodAfternoon: 'Guten Tag',
      goodEvening: 'Guten Abend',
      protein: 'Protein',
      carbs: 'Kohlenhydrate',
      fat: 'Fett',
      fiber: 'Ballaststoffe',
      sugar: 'Zucker',
      kcal: 'kcal',
      breakfast: 'Frühstück',
      lunch: 'Mittagessen',
      dinner: 'Abendessen',
      snack: 'Snack',
      water: 'Wasser',
      premium: 'Premium',
      saved: 'Gespeichert!',
      deleted: 'Gelöscht.',
    },
  },
};

const languageCode = Localization.getLocales()[0]?.languageCode ?? 'hu';
const supportedLng = ['hu', 'en', 'de'];
const lng = supportedLng.includes(languageCode) ? languageCode : 'hu';

i18n.use(initReactI18next).init({
  resources,
  lng,
  fallbackLng: 'hu',
  interpolation: { escapeValue: false },
});

export default i18n;
