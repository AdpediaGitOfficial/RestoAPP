'use client';

import { money } from '@/lib/format';

/**
 * The bar that follows the guest down the menu. Shows what is in the cart and
 * the one action worth taking next. Sits above the home indicator on iOS.
 */
export default function CartBar({ count, subtotal, symbol, onReview, onPeek }: {
  count: number;
  subtotal: number;
  symbol: string;
  onReview: () => void;
  onPeek: () => void;
}) {
  if (count === 0) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-30 animate-slide-up bg-white/95 px-4 pt-3 shadow-bar backdrop-blur-lg"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      <div className="mx-auto flex max-w-2xl items-center gap-3">
        <button
          type="button"
          onClick={onPeek}
          className="flex min-w-0 flex-col items-start rounded-xl px-1 py-0.5 text-left active:opacity-70"
        >
          <span className="flex items-center gap-1 text-xs font-medium text-ink-500">
            You&apos;ve added {count} {count === 1 ? 'item' : 'items'}
            <svg className="h-3 w-3" viewBox="0 0 12 12" fill="currentColor" aria-hidden>
              <path d="M6 8L2 4h8L6 8z" />
            </svg>
          </span>
          <span className="text-lg font-extrabold leading-tight text-ink-900">{money(subtotal, symbol)}</span>
        </button>

        <button type="button" onClick={onReview} className="btn-primary ml-auto flex-1 py-3.5 text-base">
          Continue
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
            <path d="M6.2 3.3a1 1 0 011.4 0l4 4a1 1 0 010 1.4l-4 4a1 1 0 11-1.4-1.4L9.5 8 6.2 4.7a1 1 0 010-1.4z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
