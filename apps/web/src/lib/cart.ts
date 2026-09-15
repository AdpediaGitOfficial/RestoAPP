'use client';

/**
 * The guest's cart. Kept in localStorage per table so a refresh (or an
 * accidental back-swipe) never loses what they picked. Prices here are
 * for display only — the server re-prices everything on submit.
 */
import { useCallback, useEffect, useState } from 'react';
import type { Addon, MenuItem, Variant } from './types';

export interface CartEntry {
  key: string;            // item + variant + addons, so identical picks stack
  menuItemId: string;
  name: string;
  variantId: string | null;
  variantName: string | null;
  addons: Addon[];
  unitPrice: number;      // item + variant + addons, per unit
  quantity: number;
  note: string;
  imageUrl: string | null;
}

const keyFor = (itemId: string, variantId: string | null, addonIds: string[], note: string) =>
  [itemId, variantId ?? '-', [...addonIds].sort().join('.'), note].join('|');

export function buildEntry(item: MenuItem, variant: Variant | null, addons: Addon[], note = ''): CartEntry {
  const unitPrice = item.price + (variant?.price_delta ?? 0) + addons.reduce((s, a) => s + a.price, 0);
  return {
    key: keyFor(item.id, variant?.id ?? null, addons.map((a) => a.id), note),
    menuItemId: item.id,
    name: item.name,
    variantId: variant?.id ?? null,
    variantName: variant?.name ?? null,
    addons,
    unitPrice,
    quantity: 1,
    note,
    imageUrl: item.image_url,
  };
}

export function useCart(tableToken: string) {
  const storageKey = `resto.cart.${tableToken}`;
  const [entries, setEntries] = useState<CartEntry[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setEntries(JSON.parse(raw));
    } catch {
      /* corrupt or unavailable storage — start with an empty cart */
    }
    setHydrated(true);
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(entries));
    } catch { /* private mode: the cart just won't survive a refresh */ }
  }, [entries, storageKey, hydrated]);

  const add = useCallback((entry: CartEntry) => {
    setEntries((prev) => {
      const found = prev.find((e) => e.key === entry.key);
      if (found) return prev.map((e) => (e.key === entry.key ? { ...e, quantity: e.quantity + entry.quantity } : e));
      return [...prev, entry];
    });
  }, []);

  const setQuantity = useCallback((key: string, quantity: number) => {
    setEntries((prev) => (quantity <= 0
      ? prev.filter((e) => e.key !== key)
      : prev.map((e) => (e.key === key ? { ...e, quantity } : e))));
  }, []);

  const clear = useCallback(() => setEntries([]), []);

  const count = entries.reduce((s, e) => s + e.quantity, 0);
  const subtotal = entries.reduce((s, e) => s + e.unitPrice * e.quantity, 0);

  /** Quantity of a given menu item across all its variants — for the menu badges. */
  const quantityOf = useCallback(
    (menuItemId: string) => entries.filter((e) => e.menuItemId === menuItemId).reduce((s, e) => s + e.quantity, 0),
    [entries],
  );

  return { entries, add, setQuantity, clear, count, subtotal, quantityOf, hydrated };
}

/** A stable anonymous id for this device, so staff can see "same guest, second order". */
export function deviceId() {
  const key = 'resto.device';
  try {
    let id = localStorage.getItem(key);
    if (!id) {
      id = `dev_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return 'dev_anon';
  }
}
