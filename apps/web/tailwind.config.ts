import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Crimson — the appetite colour, and the one the reference apps lean on.
        brand: {
          50: '#FFF1F2', 100: '#FFE1E4', 200: '#FFC7CD', 300: '#FF9DA8',
          400: '#FA6678', 500: '#E23744', 600: '#CC2136', 700: '#AB182C',
          800: '#8C1828', 900: '#761826',
        },
        ink: {
          50: '#F7F7F8', 100: '#EEEEF1', 200: '#DEDFE3', 300: '#C2C4CB',
          400: '#8E919C', 500: '#6B6E7A', 600: '#4E515C', 700: '#3A3C45',
          800: '#24262C', 900: '#14161A',
        },
      },
      fontFamily: { sans: ['var(--font-sans)', 'system-ui', 'sans-serif'] },
      borderRadius: { '4xl': '2rem', '5xl': '2.5rem' },
      boxShadow: {
        card: '0 1px 2px rgb(20 22 26 / 0.04), 0 4px 16px -4px rgb(20 22 26 / 0.08)',
        lift: '0 2px 4px rgb(20 22 26 / 0.04), 0 12px 32px -8px rgb(20 22 26 / 0.16)',
        bar: '0 -4px 24px -8px rgb(20 22 26 / 0.16)',
        pill: '0 4px 14px -2px rgb(226 55 68 / 0.45)',
      },
      keyframes: {
        'slide-up': { '0%': { transform: 'translateY(100%)' }, '100%': { transform: 'translateY(0)' } },
        'fade-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        'rise-in': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pop: {
          '0%': { transform: 'scale(1)' },
          '45%': { transform: 'scale(1.18)' },
          '100%': { transform: 'scale(1)' },
        },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgb(226 55 68 / 0.45)' },
          '70%': { boxShadow: '0 0 0 14px rgb(226 55 68 / 0)' },
          '100%': { boxShadow: '0 0 0 0 rgb(226 55 68 / 0)' },
        },
        'scan-line': {
          '0%, 100%': { transform: 'translateY(-38px)' },
          '50%': { transform: 'translateY(38px)' },
        },
      },
      animation: {
        'slide-up': 'slide-up 0.28s cubic-bezier(0.22, 1, 0.36, 1)',
        'fade-in': 'fade-in 0.2s ease-out',
        'rise-in': 'rise-in 0.35s cubic-bezier(0.22, 1, 0.36, 1) both',
        pop: 'pop 0.35s ease-out',
        shimmer: 'shimmer 1.6s infinite',
        'pulse-ring': 'pulse-ring 2s infinite',
        'scan-line': 'scan-line 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
