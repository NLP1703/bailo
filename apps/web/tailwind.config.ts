import type { Config } from 'tailwindcss';
import defaultTheme from 'tailwindcss/defaultTheme';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Point d'arrêt supplémentaire pour les petits téléphones « plus » (iPhone
      // 15 Plus, Galaxy S24 Ultra en portrait) — passage à 4 colonnes dès 400 px.
      screens: {
        xs: '400px',
      },
      fontFamily: {
        sans: ['"Inter Variable"', ...defaultTheme.fontFamily.sans],
      },
      colors: {
        brand: { DEFAULT: '#0f766e', dark: '#115e59', soft: '#e6f2f1' },
      },
      boxShadow: {
        // Ombre « papier » très légère pour les cartes et menus.
        card: '0 1px 2px 0 rgb(15 23 42 / 0.04)',
        pop: '0 10px 30px -10px rgb(15 23 42 / 0.25), 0 4px 10px -6px rgb(15 23 42 / 0.12)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'pop-in': {
          from: { opacity: '0', transform: 'translateY(-4px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'slide-up': {
          from: { transform: 'translateY(16px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
      },
      animation: {
        'fade-in': 'fade-in 120ms ease-out',
        'pop-in': 'pop-in 140ms ease-out',
        'slide-up': 'slide-up 220ms cubic-bezier(0.2, 0.9, 0.4, 1)',
      },
    },
  },
  plugins: [],
} satisfies Config;
