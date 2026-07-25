import 'intl-pluralrules';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import huCommon from './locales/hu/common.json';
import enCommon from './locales/en/common.json';

i18n.use(initReactI18next).init({
  resources: {
    hu: { translation: huCommon },
    en: { translation: enCommon },
  },
  lng: 'hu',
  fallbackLng: 'hu',
  interpolation: { escapeValue: false },
});

export default i18n;
