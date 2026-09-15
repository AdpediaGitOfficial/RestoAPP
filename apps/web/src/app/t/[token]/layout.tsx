import { guestFont } from '@/lib/fonts';

/**
 * Lato applies to the guest app only. Staff screens keep the system stack:
 * they are dense, data-heavy tables read at a desk, and the native font is
 * both faster and more legible at small sizes there.
 */
export default function GuestLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${guestFont.variable} font-guest`}>{children}</div>;
}
