import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import * as SecureStore from 'expo-secure-store';

import huCommon from './locales/hu/common.json';
import enCommon from './locales/en/common.json';

const LANGUAGE_KEY = 'appLanguage';
const supportedLng = ['hu', 'en'];

const languageCode = Localization.getLocales()[0]?.languageCode ?? 'hu';
const lng = supportedLng.includes(languageCode) ? languageCode : 'hu';

i18n.use(initReactI18next).init({
  resources: {
    hu: { translation: huCommon },
    en: { translation: enCommon },
  },
  lng,
  fallbackLng: 'hu',
  interpolation: { escapeValue: false },
});

export async function initializeLanguage() {
  const saved = await SecureStore.getItemAsync(LANGUAGE_KEY);
  if (saved && supportedLng.includes(saved) && saved !== i18n.language) {
    await i18n.changeLanguage(saved);
  }
}

export async function setAppLanguage(language: 'hu' | 'en') {
  await i18n.changeLanguage(language);
  await SecureStore.setItemAsync(LANGUAGE_KEY, language);
}

export default i18n;
