'use client';

import { money } from '@/lib/format';
import Icon from '@/components/Icon';

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
      className="fixed inset-x-0 bottom-0 z-30 animate-slide-up border-t border-ink-100 bg-white px-4 pt-3 shadow-bar"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      <div className="mx-auto flex max-w-2xl items-center gap-3">
        <button
          type="button"
          onClick={onPeek}
          className="flex min-w-0 flex-col items-start rounded-xl px-1 py-0.5 text-left active:opacity-70"
        >
          <span className="flex items-center gap-1 text-[11.5px] font-normal text-ink-500">
            {count} {count === 1 ? 'item' : 'items'} added
            <Icon name="chevronDown" className="h-3 w-3" strokeWidth={2.2} />
          </span>
          <span className="text-[19px] font-bold leading-tight tabular-nums tracking-tight text-ink-900">
            {money(subtotal, symbol)}
          </span>
        </button>

        <button type="button" onClick={onReview} className="btn-primary ml-auto flex-1 py-3.5 text-base">
          Continue
          <Icon name="chevronRight" className="h-4 w-4" strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
}
