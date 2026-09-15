'use client';

import { useMemo, useState } from 'react';
import { Sheet, Stepper, FoodTypeMark } from '@/components/ui';
import { money } from '@/lib/format';
import { buildEntry, type CartEntry } from '@/lib/cart';
import type { Addon, MenuItem, Variant } from '@/lib/types';

/** Choose a size, add-ons and a note before the item goes in the cart. */
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

  // Reset the form whenever a different item opens the sheet.
  const [lastId, setLastId] = useState<string | null>(null);
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
    const entry = buildEntry(item, variant, chosenAddons, note.trim());
    onAdd({ ...entry, quantity });
    onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={item.name}
      footer={
        <div className="flex items-center gap-3">
          <Stepper value={quantity} onChange={setQuantity} min={1} max={30} />
          <button type="button" onClick={submit} className="btn-primary flex-1 py-3">
            Add · {money(unitPrice * quantity, symbol)}
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="flex items-start gap-3">
          <FoodTypeMark type={item.food_type} />
          <div className="flex-1">
            {item.description && <p className="text-sm leading-relaxed text-slate-600">{item.description}</p>}
            <p className="mt-1.5 text-xs text-slate-400">Ready in about {item.prep_minutes} min</p>
          </div>
        </div>

        {item.variants?.length > 0 && (
          <fieldset>
            <legend className="label">Choose a size</legend>
            <div className="space-y-2">
              {item.variants.map((v) => (
                <label
                  key={v.id}
                  className={`flex cursor-pointer items-center justify-between rounded-xl px-4 py-3 ring-1 transition ${
                    variant?.id === v.id ? 'bg-brand-50 ring-brand-400' : 'bg-white ring-slate-200'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="variant"
                      className="h-4 w-4 accent-brand-600"
                      checked={variant?.id === v.id}
                      onChange={() => setVariant(v)}
                    />
                    <span className="text-sm font-medium text-slate-800">{v.name}</span>
                  </span>
                  <span className="text-sm text-slate-500">
                    {v.price_delta === 0 ? money(item.price, symbol) : `+${money(v.price_delta, symbol)}`}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {item.addons?.length > 0 && (
          <fieldset>
            <legend className="label">Add something extra</legend>
            <div className="space-y-2">
              {item.addons.map((a) => (
                <label
                  key={a.id}
                  className={`flex cursor-pointer items-center justify-between rounded-xl px-4 py-3 ring-1 transition ${
                    addonIds.includes(a.id) ? 'bg-brand-50 ring-brand-400' : 'bg-white ring-slate-200'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded accent-brand-600"
                      checked={addonIds.includes(a.id)}
                      onChange={(e) =>
                        setAddonIds((prev) => (e.target.checked ? [...prev, a.id] : prev.filter((id) => id !== a.id)))
                      }
                    />
                    <span className="text-sm font-medium text-slate-800">{a.name}</span>
                  </span>
                  <span className="text-sm text-slate-500">+{money(a.price, symbol)}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <div>
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
    </Sheet>
  );
}
