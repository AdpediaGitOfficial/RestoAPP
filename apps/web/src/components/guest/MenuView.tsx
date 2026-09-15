'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FoodTile from './FoodTile';
import Icon from '@/components/Icon';
import MenuCard from './MenuCard';
import { money } from '@/lib/format';
import type { Category, MenuItem } from '@/lib/types';

type Sort = 'recommended' | 'cheapest' | 'priciest';

const SORTS: { key: Sort; label: string }[] = [
  { key: 'recommended', label: 'Recommended' },
  { key: 'cheapest', label: 'Cheapest' },
  { key: 'priciest', label: 'Most expensive' },
];

const DIETS = [
  { key: 'VEG', label: 'Vegetarian', dot: 'bg-emerald-600' },
  { key: 'NON_VEG', label: 'Non-vegetarian', dot: 'bg-red-600' },
] as const;

export default function MenuView({ categories, symbol, quantityOf, onOpenItem, ordersPlaced }: {
  categories: Category[];
  symbol: string;
  quantityOf: (id: string) => number;
  onOpenItem: (item: MenuItem) => void;
  ordersPlaced: number;
}) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('ALL');
  const [sort, setSort] = useState<Sort>('recommended');
  const [diet, setDiet] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [visibleCategory, setVisibleCategory] = useState<string | null>(null);

  const railRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const query = search.trim().toLowerCase();
  const filtering = Boolean(query || diet || sort !== 'recommended' || activeCategory !== 'ALL');

  /** Apply search, diet and sort inside each category. */
  const shaped = useMemo(() => {
    const matches = (i: MenuItem) => {
      if (query && !`${i.name} ${i.description} ${i.tags?.join(' ')}`.toLowerCase().includes(query)) return false;
      if (diet === 'VEG' && !['VEG', 'VEGAN'].includes(i.food_type)) return false;
      if (diet === 'NON_VEG' && i.food_type !== 'NON_VEG') return false;
      return true;
    };

    const order = (items: MenuItem[]) => {
      const copy = [...items];
      if (sort === 'cheapest') copy.sort((a, b) => a.price - b.price);
      if (sort === 'priciest') copy.sort((a, b) => b.price - a.price);
      // "Recommended" keeps the kitchen's own ordering, popular items first.
      if (sort === 'recommended') copy.sort((a, b) => Number(b.is_recommended) - Number(a.is_recommended));
      return copy;
    };

    return categories
      .filter((c) => activeCategory === 'ALL' || c.id === activeCategory)
      .map((c) => ({ ...c, items: order(c.items.filter(matches)) }))
      .filter((c) => c.items.length > 0);
  }, [categories, query, diet, sort, activeCategory]);

  const picks = useMemo(
    () => categories.flatMap((c) => c.items).filter((i) => i.is_recommended && i.is_available).slice(0, 8),
    [categories],
  );

  const resultCount = shaped.reduce((n, c) => n + c.items.length, 0);

  // Track which category the guest has scrolled into, and follow it in the rail.
  //
  // The rail lives inside a sticky header, and scrollIntoView resolves an
  // element against its *static* position — the top of the document — so
  // calling it here drags the whole page back up on every scroll. Setting
  // scrollLeft moves only the rail and leaves the page alone.
  const centreInRail = useCallback((categoryId: string) => {
    const rail = railRef.current;
    const pill = rail?.querySelector<HTMLElement>(`[data-cat="${categoryId}"]`);
    if (!rail || !pill) return;
    const target = pill.offsetLeft - (rail.clientWidth - pill.offsetWidth) / 2;
    rail.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (activeCategory !== 'ALL' || shaped.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const top = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (!top?.target.id) return;
        const id = top.target.id.replace('sec-', '');
        setVisibleCategory(id);
        centreInRail(id);
      },
      { rootMargin: '-180px 0px -70% 0px' },
    );
    Object.values(sectionRefs.current).forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [shaped, activeCategory, centreInRail]);

  const jumpTo = (id: string) => {
    const el = sectionRefs.current[id];
    if (!el) return;
    // Clear the sticky header, which is taller once the tab bar is showing.
    const header = document.querySelector<HTMLElement>('[data-guest-header]');
    const offset = (header?.offsetHeight ?? 120) + 12;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - offset, behavior: 'smooth' });
    setVisibleCategory(id);
    centreInRail(id);
  };

  return (
    <div className="pb-4">
      {/* ------------------------------------------------------- search row */}
      <div className="px-4 pt-1">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400">
              <Icon name="search" className="h-[18px] w-[18px]" />
            </span>
            <input
              type="search"
              className="input pl-10"
              placeholder="Search for a dish or a drink"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search the menu"
            />
          </div>
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            aria-label="Sort and filter"
            className={`flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-2xl transition active:scale-95 ${
              filtersOpen || diet || sort !== 'recommended'
                ? 'bg-brand-500 text-white shadow-pill'
                : 'bg-white text-ink-500 ring-1 ring-ink-200'
            }`}
          >
            <Icon name="sliders" className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>

      {/* --------------------------------------------------- category rail */}
      <div ref={railRef} className="no-scrollbar mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
        <button type="button" data-cat="ALL" onClick={() => setActiveCategory('ALL')} className={activeCategory === 'ALL' ? 'pill-on' : 'pill-off'}>
          All items
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            data-cat={c.id}
            onClick={() => (activeCategory === c.id ? setActiveCategory('ALL') : jumpTo(c.id))}
            className={
              activeCategory === c.id || (activeCategory === 'ALL' && visibleCategory === c.id)
                ? 'pill-on'
                : 'pill-off'
            }
          >
            {c.name}
          </button>
        ))}
      </div>

      {/* --------------------------------------------------- sort & filters */}
      {filtersOpen && (
        <div className="no-scrollbar mt-2 flex animate-rise-in gap-2 overflow-x-auto px-4 pb-1">
          {SORTS.map((s) => (
            <button key={s.key} type="button" onClick={() => setSort(s.key)} className={sort === s.key ? 'pill-on' : 'pill-off'}>
              {s.label}
            </button>
          ))}
          <span className="my-1 w-px shrink-0 bg-ink-200" aria-hidden />
          {DIETS.map((d) => (
            <button
              key={d.key}
              type="button"
              onClick={() => setDiet(diet === d.key ? null : d.key)}
              className={`${diet === d.key ? 'pill-on' : 'pill-off'} inline-flex items-center gap-1.5`}
            >
              <span className={`h-2 w-2 rounded-full ${d.dot}`} />
              {d.label}
            </button>
          ))}
        </div>
      )}

      {/* ------------------------------------------------------ chef's picks */}
      {!filtering && picks.length > 0 && (
        <section className="mt-5" aria-label="Popular right now">
          <div className="flex items-baseline justify-between px-4">
            <h2 className="text-[17px] font-bold tracking-[-0.015em] text-ink-900">Popular right now</h2>
            <span className="text-xs font-medium text-ink-400">{picks.length} picks</span>
          </div>

          <div className="no-scrollbar mt-3 flex gap-3 overflow-x-auto px-4 pb-2">
            {picks.map((item, i) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onOpenItem(item)}
                className="card group relative w-[152px] shrink-0 animate-rise-in text-left active:scale-[0.98]"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <div className="relative aspect-[5/4] w-full">
                  <FoodTile name={item.name} foodType={item.food_type} imageUrl={item.image_url} className="rounded-t-3xl" />
                  <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-brand-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white shadow-sm">
                    <Icon name="star" className="h-2.5 w-2.5" />
                    Popular
                  </span>
                  <span className="absolute -bottom-3.5 right-2.5 flex h-8 w-8 items-center justify-center rounded-full bg-brand-500 text-white shadow-pill">
                    <Icon name="plus" className="h-4 w-4" strokeWidth={2.4} />
                  </span>
                </div>
                <div className="p-3 pt-4">
                  <p className="line-clamp-1 text-[13.5px] font-semibold tracking-[-0.01em] text-ink-900">{item.name}</p>
                  <p className="mt-0.5 text-[13.5px] font-bold tabular-nums text-ink-900">{money(item.price, symbol)}</p>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ---------------------------------------------------------- the grid */}
      <div className="mt-5 space-y-7">
        {filtering && (
          <p className="px-4 text-sm text-ink-500">
            <span className="font-bold text-ink-900">{resultCount}</span> {resultCount === 1 ? 'dish' : 'dishes'}
            {query && <> matching “{search.trim()}”</>}
          </p>
        )}

        {shaped.length === 0 ? (
          <div className="px-4 py-14 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-ink-100 text-ink-400">
              <Icon name="search" className="h-6 w-6" />
            </span>
            <p className="mt-4 font-semibold text-ink-800">Nothing matched that</p>
            <p className="mt-1 text-sm text-ink-500">Try another dish, or clear the filters.</p>
            <button
              type="button"
              onClick={() => { setSearch(''); setDiet(null); setSort('recommended'); setActiveCategory('ALL'); }}
              className="btn-secondary mt-4"
            >
              Clear filters
            </button>
          </div>
        ) : (
          shaped.map((category) => (
            <section
              key={category.id}
              id={`sec-${category.id}`}
              ref={(el) => { sectionRefs.current[category.id] = el; }}
              aria-labelledby={`h-${category.id}`}
            >
              <div className="px-4">
                <h2 id={`h-${category.id}`} className="text-[17px] font-bold tracking-[-0.015em] text-ink-900">
                  {category.name}
                </h2>
                {category.description && <p className="mt-0.5 text-[13px] text-ink-500">{category.description}</p>}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 px-4">
                {category.items.map((item, i) => (
                  <MenuCard
                    key={item.id}
                    item={item}
                    symbol={symbol}
                    index={i}
                    inCart={quantityOf(item.id)}
                    onOpen={() => onOpenItem(item)}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      {ordersPlaced > 0 && (
        <p className="mt-8 px-4 text-center text-xs text-ink-400">
          Already ordered {ordersPlaced} {ordersPlaced === 1 ? 'round' : 'rounds'} — everything lands on one bill.
        </p>
      )}
    </div>
  );
}
