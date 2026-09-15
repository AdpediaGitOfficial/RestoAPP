import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Crimson — the appetite colour, and the one the reference apps lean on.
        brand: {
          50: '#FFF1F2', 100: '#FFE1E4', 200: '#FFC7CD', 300: '#FF9DA8',
          // 500 is the fill behind white text on buttons, badges and the
          // active pill. #E23744 gave 4.32:1 — just under the 4.5 AA needs —
          // so it steps down to a shade that clears it at 4.8 and is
          // indistinguishable side by side.
          400: '#FA6678', 500: '#D92B3C', 600: '#C01F32', 700: '#A3182A',
          800: '#8C1828', 900: '#761826',
        },
        // Text never reaches pure black: the darkest step used for type is
        // ink-800 (#2F2F35, ~13:1 on white), which keeps headings authoritative
        // without the harshness of #000 on a phone screen in a lit room.
        // ink-900 is reserved for dark surfaces.
        ink: {
          50: '#F7F7F8', 100: '#EEEEF1', 200: '#E2E2E6', 300: '#C9C9D0',
          400: '#8B8B94', 500: '#6A6A73', 600: '#53535B', 700: '#414147',
          800: '#2F2F35', 900: '#1E1E23',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        // The guest app; falls back to the system stack before Lato loads.
        guest: ['var(--font-guest)', 'var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      borderRadius: { '4xl': '2rem', '5xl': '2.5rem' },
      boxShadow: {
        card: '0 1px 2px rgb(20 22 26 / 0.04), 0 4px 16px -4px rgb(20 22 26 / 0.08)',
        lift: '0 2px 4px rgb(20 22 26 / 0.04), 0 12px 32px -8px rgb(20 22 26 / 0.16)',
        bar: '0 -4px 24px -8px rgb(20 22 26 / 0.16)',
        pill: '0 4px 14px -2px rgb(217 43 60 / 0.42)',
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
          '0%': { boxShadow: '0 0 0 0 rgb(217 43 60 / 0.45)' },
          '70%': { boxShadow: '0 0 0 14px rgb(217 43 60 / 0)' },
          '100%': { boxShadow: '0 0 0 0 rgb(217 43 60 / 0)' },
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
