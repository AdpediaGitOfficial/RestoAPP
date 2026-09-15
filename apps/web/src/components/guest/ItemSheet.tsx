'use client';

import { useEffect, useMemo, useState } from 'react';
import FoodTile from './FoodTile';
import QtyStepper from './QtyStepper';
import { money } from '@/lib/format';
import Icon from '@/components/Icon';
import { buildEntry, type CartEntry } from '@/lib/cart';
import type { Addon, MenuItem, Variant } from '@/lib/types';

/** Size, add-ons and a note for the kitchen, then into the cart. */
export default function ItemSheet({ item, symbol, onClose, onAdd }: {
  item: MenuItem | null;
  symbol: string;
  onClose: () => void;
  onAdd: (entry: CartEntry) => void;
}) {
  const [variant, setVariant] = useState<Variant | null>(null);
  const [addonIds, setAddonIds] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [lastId, setLastId] = useState<string | null>(null);

  // Without this the page behind the sheet scrolls under the guest's finger.
  const open = Boolean(item);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  // A different item means a fresh form.
  if (item && item.id !== lastId) {
    setLastId(item.id);
    setVariant(item.variants?.find((v) => v.is_default) ?? item.variants?.[0] ?? null);
    setAddonIds([]);
    setNote('');
    setQuantity(1);
  }

  const chosenAddons: Addon[] = useMemo(
    () => (item?.addons ?? []).filter((a) => addonIds.includes(a.id)),
    [item, addonIds],
  );

  if (!item) return null;

  const unitPrice = item.price + (variant?.price_delta ?? 0) + chosenAddons.reduce((s, a) => s + a.price, 0);

  const submit = () => {
    onAdd({ ...buildEntry(item, variant, chosenAddons, note.trim()), quantity });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 animate-fade-in bg-ink-900/50 backdrop-blur-[2px]" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={item.name}
        className="relative flex max-h-[92vh] w-full animate-slide-up flex-col overflow-hidden rounded-t-4xl bg-white sm:max-w-lg sm:rounded-4xl"
      >
        {/* Hero, with the close control floating over it. */}
        <div className="relative h-40 w-full shrink-0">
          <FoodTile name={item.name} foodType={item.food_type} imageUrl={item.image_url} size="lg" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-ink-600 shadow-sm backdrop-blur active:scale-90"
          >
            <Icon name="close" className="h-4.5 w-4.5" strokeWidth={2} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-4 pt-4">
          <h2 className="text-[21px] font-bold leading-tight tracking-[-0.02em] text-ink-900">{item.name}</h2>
          {item.description && <p className="mt-2 text-[13.5px] leading-[1.55] text-ink-500">{item.description}</p>}
          <div className="mt-3 flex items-center gap-3 text-[11.5px] font-medium text-ink-400">
            <span className="inline-flex items-center gap-1.5">
              <Icon name="clock" className="h-3.5 w-3.5" />
              about {item.prep_minutes} min
            </span>
            {item.spice_level > 0 && (
              <span className="inline-flex items-center gap-0.5 text-brand-500">
                {Array.from({ length: item.spice_level }).map((_, i) => (
                  <Icon key={i} name="flame" className="h-3 w-3" />
                ))}
              </span>
            )}
          </div>

          {item.variants?.length > 0 && (
            <fieldset className="mt-5">
              <legend className="label">Choose a size</legend>
              <div className="grid gap-2">
                {item.variants.map((v) => (
                  <label
                    key={v.id}
                    className={`flex cursor-pointer items-center justify-between rounded-2xl px-4 py-3.5 ring-1 transition ${
                      variant?.id === v.id ? 'bg-brand-50 ring-2 ring-brand-500' : 'bg-white ring-ink-200'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <input type="radio" name="variant" className="h-4 w-4 accent-brand-500" checked={variant?.id === v.id} onChange={() => setVariant(v)} />
                      <span className="text-[13.5px] font-medium text-ink-800">{v.name}</span>
                    </span>
                    <span className="text-[13.5px] font-semibold tabular-nums text-ink-600">
                      {v.price_delta === 0 ? money(item.price, symbol) : `+${money(v.price_delta, symbol)}`}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {item.addons?.length > 0 && (
            <fieldset className="mt-5">
              <legend className="label">Add something extra</legend>
              <div className="grid gap-2">
                {item.addons.map((a) => {
                  const on = addonIds.includes(a.id);
                  return (
                    <label
                      key={a.id}
                      className={`flex cursor-pointer items-center justify-between rounded-2xl px-4 py-3.5 ring-1 transition ${
                        on ? 'bg-brand-50 ring-2 ring-brand-500' : 'bg-white ring-ink-200'
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded accent-brand-500"
                          checked={on}
                          onChange={(e) => setAddonIds((prev) => (e.target.checked ? [...prev, a.id] : prev.filter((id) => id !== a.id)))}
                        />
                        <span className="text-[13.5px] font-medium text-ink-800">{a.name}</span>
                      </span>
                      <span className="text-[13.5px] font-semibold tabular-nums text-ink-600">+{money(a.price, symbol)}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}

          <div className="mt-5">
            <label className="label" htmlFor="item-note">Anything for the kitchen?</label>
            <input
              id="item-note"
              className="input"
              placeholder="e.g. less spicy, no onions"
              value={note}
              maxLength={200}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <div
          className="flex items-center gap-3 border-t border-ink-100 px-5 py-4"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          <QtyStepper value={quantity} onChange={setQuantity} min={1} max={30} />
          <button type="button" onClick={submit} className="btn-primary flex-1 py-3.5 text-base">
            Add · {money(unitPrice * quantity, symbol)}
          </button>
        </div>
      </div>
    </div>
  );
}
