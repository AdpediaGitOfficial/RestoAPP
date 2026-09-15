import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fdf6ef', 100: '#f9e8d6', 200: '#f1cdab', 300: '#e7ab77',
          400: '#dd8748', 500: '#d46c2a', 600: '#bb541f', 700: '#9a3f1c',
          800: '#7c341d', 900: '#652d1b',
        },
      },
      fontFamily: { sans: ['var(--font-sans)', 'system-ui', 'sans-serif'] },
      keyframes: {
        'slide-up': { '0%': { transform: 'translateY(100%)' }, '100%': { transform: 'translateY(0)' } },
        'fade-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        pulseRing: {
          '0%': { boxShadow: '0 0 0 0 rgba(212,108,42,0.5)' },
          '70%': { boxShadow: '0 0 0 12px rgba(212,108,42,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(212,108,42,0)' },
        },
      },
      animation: {
        'slide-up': 'slide-up 0.25s ease-out',
        'fade-in': 'fade-in 0.2s ease-out',
        'pulse-ring': 'pulseRing 2s infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
