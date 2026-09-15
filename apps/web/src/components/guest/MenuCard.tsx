'use client';

import FoodTile from './FoodTile';
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
  const hasOptions = item.variants?.length > 0 || item.addons?.length > 0;

  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={soldOut}
      aria-label={`${item.name}, ${money(item.price, symbol)}${soldOut ? ', sold out' : ''}`}
      className={`card group relative flex animate-rise-in flex-col text-left transition-all duration-200 ${
        soldOut ? 'opacity-60' : 'active:scale-[0.98] hover:shadow-lift'
      }`}
      style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
    >
      <div className="relative aspect-[4/3] w-full">
        <FoodTile name={item.name} foodType={item.food_type} imageUrl={item.image_url} className="rounded-t-3xl" />

        {item.is_recommended && !soldOut && (
          <span className="absolute left-2 top-2 rounded-full bg-white/95 px-2 py-1 text-[10px] font-bold text-brand-600 shadow-sm backdrop-blur">
            ★ Popular
          </span>
        )}

        {soldOut && (
          <span className="absolute inset-0 flex items-center justify-center rounded-t-3xl bg-white/70 text-xs font-bold uppercase tracking-wider text-ink-600 backdrop-blur-[1px]">
            Sold out today
          </span>
        )}

        {!soldOut && (
          <span
            className={`absolute -bottom-3 right-2 flex h-9 min-w-9 items-center justify-center rounded-full px-2.5 text-lg font-bold shadow-pill transition-transform group-active:scale-90 ${
              inCart > 0 ? 'bg-white text-brand-600 ring-2 ring-brand-500' : 'bg-brand-500 text-white'
            }`}
          >
            {inCart > 0 ? <span className="text-sm font-extrabold">{inCart}</span> : '+'}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3 pt-4">
        <div className="flex items-start gap-1.5">
          <span className="mt-0.5"><VegMark type={item.food_type} /></span>
          <h3 className="line-clamp-2 flex-1 text-[15px] font-bold leading-snug text-ink-900">{item.name}</h3>
        </div>

        {item.description && (
          <p className="line-clamp-2 text-xs leading-relaxed text-ink-500">{item.description}</p>
        )}

        <div className="mt-auto flex items-center gap-2 pt-1.5">
          <span className="text-[15px] font-extrabold text-brand-600">{money(item.price, symbol)}</span>
          {hasOptions && <span className="text-[10px] font-medium text-ink-400">customisable</span>}
          {item.spice_level > 0 && <span className="text-[10px]">{'🌶️'.repeat(item.spice_level)}</span>}
        </div>
      </div>
    </button>
  );
}
