'use client';

import { useRef, useState } from 'react';
import FoodTile from './FoodTile';
import QtyStepper from './QtyStepper';
import { money } from '@/lib/format';
import type { CartEntry } from '@/lib/cart';
import { Spinner } from '@/components/ui';

/** One cart line. Swipe left (or tap the bin) to remove it. */
function CartRow({ entry, symbol, onQuantity }: {
  entry: CartEntry;
  symbol: string;
  onQuantity: (key: string, quantity: number) => void;
}) {
  const [offset, setOffset] = useState(0);
  const startX = useRef<number | null>(null);

  const options = [entry.variantName, ...entry.addons.map((a) => a.name)].filter(Boolean) as string[];

  return (
    <li className="relative overflow-hidden rounded-3xl">
      {/* Revealed as the row slides away. */}
      <div className="absolute inset-y-0 right-0 flex w-24 items-center justify-center bg-brand-500 text-white">
        <button
          type="button"
          onClick={() => onQuantity(entry.key, 0)}
          className="flex flex-col items-center gap-1 text-[11px] font-bold active:scale-90"
        >
          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
            <path fillRule="evenodd" d="M8.75 1a1 1 0 00-.98.8L7.57 3H4a1 1 0 000 2h12a1 1 0 100-2h-3.57l-.2-1.2a1 1 0 00-.98-.8h-2.5zM5.06 7a1 1 0 011-.94h7.88a1 1 0 011 .94l-.6 9.06A2 2 0 0113.35 18H6.65a2 2 0 01-2-1.94L5.06 7z" clipRule="evenodd" />
          </svg>
          Remove
        </button>
      </div>

      <div
        className="relative flex touch-pan-y items-center gap-3 bg-white p-3 transition-transform duration-200"
        style={{ transform: `translateX(-${offset}px)` }}
        onTouchStart={(e) => { startX.current = e.touches[0].clientX; }}
        onTouchMove={(e) => {
          if (startX.current === null) return;
          const delta = startX.current - e.touches[0].clientX;
          setOffset(Math.max(0, Math.min(96, delta)));
        }}
        onTouchEnd={() => { setOffset((o) => (o > 48 ? 96 : 0)); startX.current = null; }}
      >
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl">
          <FoodTile name={entry.name} imageUrl={entry.imageUrl} size="sm" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-ink-900">{entry.name}</p>

          {options.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {options.map((o) => (
                <span key={o} className="rounded-md bg-ink-100 px-1.5 py-0.5 text-[11px] font-medium text-ink-600">
                  {o}
                </span>
              ))}
            </div>
          )}

          {entry.note && <p className="mt-1 truncate text-[11px] italic text-brand-600">“{entry.note}”</p>}

          <p className="mt-1 text-sm font-extrabold text-ink-900">{money(entry.unitPrice * entry.quantity, symbol)}</p>
        </div>

        <QtyStepper value={entry.quantity} onChange={(n) => onQuantity(entry.key, n)} min={0} max={30} />
      </div>
    </li>
  );
}

export default function ReviewView({
  entries, symbol, subtotal, taxLabel, taxPercent, serviceChargePercent, taxInclusive,
  tableLabel, guestName, submitting, onQuantity, onSubmit, onAddMore, onRename,
}: {
  entries: CartEntry[];
  symbol: string;
  subtotal: number;
  taxLabel: string;
  taxPercent: number;
  serviceChargePercent: number;
  taxInclusive: boolean;
  tableLabel: string;
  guestName: string;
  submitting: boolean;
  onQuantity: (key: string, quantity: number) => void;
  onSubmit: (note: string) => void;
  onAddMore: () => void;
  onRename: (name: string) => void;
}) {
  const [note, setNote] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(guestName);

  const count = entries.reduce((s, e) => s + e.quantity, 0);
  const serviceCharge = Math.round((subtotal * serviceChargePercent) / 100);
  const tax = taxInclusive
    ? Math.round((subtotal + serviceCharge) - (subtotal + serviceCharge) / (1 + taxPercent / 100))
    : Math.round(((subtotal + serviceCharge) * taxPercent) / 100);
  const estimate = taxInclusive ? subtotal + serviceCharge : subtotal + serviceCharge + tax;

  if (entries.length === 0) {
    return (
      <div className="px-4 py-16 text-center">
        <p className="text-5xl" aria-hidden>🛒</p>
        <p className="mt-4 text-lg font-bold text-ink-800">Your tray is empty</p>
        <p className="mt-1 text-sm text-ink-500">Add a few things from the menu and they will show up here.</p>
        <button type="button" onClick={onAddMore} className="btn-primary mt-6">Browse the menu</button>
      </div>
    );
  }

  return (
    <div className="space-y-4 px-4 pb-28 pt-1">
      {/* ------------------------------------------------- table & guest */}
      <div className="card divide-y divide-ink-100">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-sm text-ink-500">You&apos;re at</span>
          <span className="text-sm font-bold text-ink-900">{tableLabel}</span>
        </div>

        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <span className="shrink-0 text-sm text-ink-500">Your name</span>
          {editingName ? (
            <input
              autoFocus
              className="min-w-0 flex-1 rounded-xl bg-ink-50 px-3 py-1.5 text-right text-sm font-bold text-ink-900 ring-1 ring-brand-400 focus:outline-none"
              value={nameDraft}
              maxLength={40}
              placeholder="Add your name"
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={() => { onRename(nameDraft.trim()); setEditingName(false); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { onRename(nameDraft.trim()); setEditingName(false); }
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => { setNameDraft(guestName); setEditingName(true); }}
              className="flex items-center gap-1.5 text-sm font-bold text-ink-900 active:opacity-60"
            >
              {guestName || <span className="font-medium text-ink-400">Add your name</span>}
              <svg className="h-3.5 w-3.5 text-brand-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                <path d="M13.6 2.4a2 2 0 012.8 2.8l-.8.8-2.8-2.8.8-.8zM11.4 4.6l2.8 2.8-7.4 7.4a1 1 0 01-.5.3l-3 .8a.5.5 0 01-.6-.6l.8-3a1 1 0 01.3-.5l7.6-7.2z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* ---------------------------------------------------- order lines */}
      <section aria-label="Your order">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-lg font-extrabold tracking-tight text-ink-900">Your order</h2>
          <span className="text-xs font-medium text-ink-400">{count} {count === 1 ? 'item' : 'items'}</span>
        </div>

        <ul className="space-y-2">
          {entries.map((entry) => (
            <CartRow key={entry.key} entry={entry} symbol={symbol} onQuantity={onQuantity} />
          ))}
        </ul>

        <button
          type="button"
          onClick={onAddMore}
          className="mt-3 w-full rounded-2xl border-2 border-dashed border-ink-200 py-3 text-sm font-bold text-brand-600 active:scale-[0.99]"
        >
          + Add more items
        </button>
      </section>

      {/* ---------------------------------------------------------- note */}
      <div>
        <label className="label" htmlFor="order-note">Note for this order</label>
        <input
          id="order-note"
          className="input"
          placeholder="e.g. bring the coffee after the mains"
          value={note}
          maxLength={500}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      {/* ------------------------------------------------------- details */}
      <section className="card p-4" aria-label="Bill details">
        <h2 className="text-sm font-extrabold text-ink-900">Details</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-500">Total items</dt>
            <dd className="font-semibold text-ink-800">{count}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-500">Subtotal</dt>
            <dd className="font-semibold text-ink-800">{money(subtotal, symbol)}</dd>
          </div>
          {serviceCharge > 0 && (
            <div className="flex justify-between">
              <dt className="text-ink-500">Service charge ({serviceChargePercent}%)</dt>
              <dd className="font-semibold text-ink-800">{money(serviceCharge, symbol)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-ink-500">{taxLabel} ({taxPercent}%){taxInclusive && ' — included'}</dt>
            <dd className="font-semibold text-ink-800">{money(tax, symbol)}</dd>
          </div>
          <div className="flex justify-between border-t border-dashed border-ink-200 pt-2.5">
            <dt className="text-base font-extrabold text-ink-900">This round</dt>
            <dd className="text-base font-extrabold text-ink-900">{money(estimate, symbol)}</dd>
          </div>
        </dl>
        <p className="mt-2.5 text-[11px] leading-relaxed text-ink-400">
          An estimate for what you&apos;re adding now. Your final bill covers every round at this table.
        </p>
      </section>

      {/* -------------------------------------------------------- confirm */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 bg-white/95 px-4 pt-3 shadow-bar backdrop-blur-lg"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <div className="mx-auto max-w-2xl">
          <button
            type="button"
            onClick={() => onSubmit(note.trim())}
            disabled={submitting}
            className="btn-primary w-full py-4 text-base"
          >
            {submitting
              ? <><Spinner className="h-4 w-4 text-white" /> Sending to the kitchen…</>
              : <>Send to kitchen · {money(estimate, symbol)}</>}
          </button>
        </div>
      </div>
    </div>
  );
}
