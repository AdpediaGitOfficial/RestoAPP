import { Lato } from 'next/font/google';

/**
 * Lato for the guest app.
 *
 * Loaded through next/font, which downloads the files at build time and
 * serves them from our own domain. A <link> to Google Fonts would put a
 * third-party DNS lookup, TLS handshake and stylesheet in front of the first
 * line of text — exactly the kind of round trip the menu was optimised to
 * avoid.
 *
 * Lato ships 100/300/400/700/900: there is no Medium (500) or Semibold (600).
 * Asking for one silently renders 400 or a synthesised weight, so the app
 * uses the two real weights — 400 for reading, 700 for emphasis — and leans
 * on size, colour and spacing for the rest of the hierarchy.
 */
export const guestFont = Lato({
  subsets: ['latin'],
  weight: ['400', '700'],
  style: ['normal'],
  display: 'swap',
  variable: '--font-guest',
  // Matches the fallback's metrics so text does not shift when Lato arrives.
  adjustFontFallback: true,
  fallback: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
});
