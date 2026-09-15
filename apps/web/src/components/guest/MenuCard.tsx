'use client';

import FoodTile from './FoodTile';
import Icon from '@/components/Icon';
import { money } from '@/lib/format';
import type { MenuItem } from '@/lib/types';

function VegMark({ type }: { type: string }) {
  const color = type === 'NON_VEG' ? 'border-red-600' : type === 'EGG' ? 'border-amber-500' : 'border-emerald-600';
  const dot = type === 'NON_VEG' ? 'bg-red-600' : type === 'EGG' ? 'bg-amber-500' : 'bg-emerald-600';
  return (
    <span className={`inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border-[1.5px] bg-white ${color}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
    </span>
  );
}

/**
 * One tile in the menu grid: image, badge, name, blurb, price and an add
 * button that sits on the image — the thumb never has to travel far.
 */
export default function MenuCard({ item, symbol, inCart, onOpen, index = 0 }: {
  item: MenuItem;
  symbol: string;
  inCart: number;
  onOpen: () => void;
  index?: number;
}) {
  const soldOut = !item.is_available;
  // The "onwards" price already signals sizes, so only mention add-ons when
  // they are the only choice on offer.
  const showOptionHint = !item.variants?.length && item.addons?.length > 0;

  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={soldOut}
      aria-label={`${item.name}, ${money(item.price, symbol)}${soldOut ? ', sold out' : ''}`}
      className={`card group relative flex flex-col text-left transition-all duration-200 ${
        index >= 0 ? 'animate-rise-in' : ''
      } ${soldOut ? 'opacity-60' : 'active:scale-[0.98] hover:shadow-lift'}`}
      style={index >= 0 ? { animationDelay: `${Math.min(index, 8) * 35}ms` } : undefined}
    >
      <div className="relative aspect-[4/3] w-full">
        <FoodTile name={item.name} foodType={item.food_type} imageUrl={item.image_url} className="rounded-t-3xl" />

        {item.is_recommended && !soldOut && (
          <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-brand-600 shadow-sm backdrop-blur">
            <Icon name="star" className="h-2.5 w-2.5" />
            Popular
          </span>
        )}

        {soldOut && (
          <span className="absolute inset-0 flex items-center justify-center rounded-t-3xl bg-white/75 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-600 backdrop-blur-[2px]">
            Sold out
          </span>
        )}

        {!soldOut && (
          <span
            className={`absolute -bottom-3.5 right-2.5 flex h-9 min-w-9 items-center justify-center rounded-full px-2.5 shadow-pill transition-transform group-active:scale-90 ${
              inCart > 0 ? 'bg-white text-brand-600 ring-[1.5px] ring-brand-500' : 'bg-brand-500 text-white'
            }`}
          >
            {inCart > 0
              ? <span className="text-sm font-bold tabular-nums">{inCart}</span>
              : <Icon name="plus" className="h-4 w-4" strokeWidth={2.4} />}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-3.5 pt-4">
        <div className="flex items-start gap-1.5">
          <span className="mt-[3px]"><VegMark type={item.food_type} /></span>
          <h3 className="line-clamp-2 flex-1 text-[14.5px] font-normal leading-[1.3] tracking-[-0.01em] text-ink-800">
            {item.name}
          </h3>
        </div>

        {item.description && (
          <p className="mt-1 line-clamp-2 text-[12px] leading-[1.45] text-ink-600">{item.description}</p>
        )}

        {/* Metadata sits above the price so every card's price shares a
            baseline, however much copy the dish above it has. */}
        {(showOptionHint || item.spice_level > 0) && (
          <div className="mt-1.5 flex items-center gap-2 text-[10.5px] font-normal text-ink-500">
            {showOptionHint && <span>Choose extras</span>}
            {item.spice_level > 0 && (
              <span className="inline-flex items-center gap-0.5 text-brand-500">
                {Array.from({ length: item.spice_level }).map((_, i) => (
                  <Icon key={i} name="flame" className="h-2.5 w-2.5" />
                ))}
              </span>
            )}
          </div>
        )}

        <div className="mt-auto flex items-baseline gap-1.5 pt-2.5">
          <span className="text-[15px] font-bold tabular-nums tracking-tight text-ink-800">
            {money(item.price, symbol)}
          </span>
          {item.variants?.length > 0 && <span className="text-[11px] text-ink-500">onwards</span>}
        </div>
      </div>
    </button>
  );
}
