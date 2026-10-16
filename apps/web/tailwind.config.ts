import type { Config } from 'tailwindcss';
import defaultTheme from 'tailwindcss/defaultTheme';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
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
      },
      animation: {
        'fade-in': 'fade-in 120ms ease-out',
        'pop-in': 'pop-in 140ms ease-out',
      },
    },
  },
  plugins: [],
} satisfies Config;
