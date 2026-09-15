import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Scan · Order · Pay',
  description: 'Order straight from your table — browse the menu, send it to the kitchen and settle the bill without waiting.',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Order' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#D92B3C',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Runtime API URL — see app/env.js/route.ts. Must run before hydration. */}
        <script src="/env.js" />
      </head>
      <body>{children}</body>
    </html>
  );
}
