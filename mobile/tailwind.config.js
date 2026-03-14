/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // VitaScan brand színek
        brand: {
          orange: '#FF6B35',
          peach: '#FF9A6C',
          mint: '#A8EDBC',
          blue: '#7EC8E3',
        },
        macro: {
          protein: '#4A90D9',    // Királyskék
          carbs: '#F5A623',      // Narancssárga
          fat: '#2ECC71',        // Smaragdzöld
          fiber: '#9B59B6',      // Lila
        },
      },
      fontFamily: {
        rounded: ['Nunito', 'System'],
      },
      borderRadius: {
        '2xl': '20px',
        '3xl': '28px',
        '4xl': '36px',
      },
    },
  },
  plugins: [],
};
