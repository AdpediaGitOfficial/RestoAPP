'use client';

import { useState } from 'react';
import { Sheet, Stepper, Spinner } from '@/components/ui';
import { money } from '@/lib/format';
import type { CartEntry } from '@/lib/cart';

export default function CartSheet({ open, entries, symbol, subtotal, taxNote, submitting, onClose, onQuantity, onSubmit }: {
  open: boolean;
  entries: CartEntry[];
  symbol: string;
  subtotal: number;
  taxNote: string;
  submitting: boolean;
  onClose: () => void;
  onQuantity: (key: string, quantity: number) => void;
  onSubmit: (note: string) => void;
}) {
  const [note, setNote] = useState('');

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Your order"
      footer={
        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-slate-500">Items total</span>
            <span className="text-lg font-bold text-slate-900">{money(subtotal, symbol)}</span>
          </div>
          <p className="text-xs text-slate-400">{taxNote}</p>
          <button
            type="button"
            onClick={() => onSubmit(note.trim())}
            disabled={submitting || entries.length === 0}
            className="btn-primary w-full py-3.5 text-base"
          >
            {submitting ? <><Spinner className="h-4 w-4 text-white" /> Sending to kitchen…</> : 'Send to kitchen'}
          </button>
          <p className="text-center text-xs text-slate-400">
            You can keep adding more later — everything goes on one bill.
          </p>
        </div>
      }
    >
      {entries.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">Your order is empty. Pick something tasty!</p>
      ) : (
        <div className="space-y-4">
          <ul className="divide-y divide-slate-100">
            {entries.map((e) => (
              <li key={e.key} className="flex items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900">{e.name}</p>
                  {e.variantName && <p className="text-xs text-slate-500">{e.variantName}</p>}
                  {e.addons.length > 0 && (
                    <p className="text-xs text-slate-500">+ {e.addons.map((a) => a.name).join(', ')}</p>
                  )}
                  {e.note && <p className="mt-0.5 text-xs italic text-brand-700">“{e.note}”</p>}
                  <p className="mt-1 text-sm text-slate-600">{money(e.unitPrice, symbol)} each</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Stepper value={e.quantity} onChange={(n) => onQuantity(e.key, n)} min={0} max={30} />
                  <span className="text-sm font-semibold text-slate-900">{money(e.unitPrice * e.quantity, symbol)}</span>
                </div>
              </li>
            ))}
          </ul>

          <div>
            <label className="label" htmlFor="order-note">Note for this order</label>
            <input
              id="order-note"
              className="input"
              placeholder="e.g. serve the coffee after the mains"
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>
      )}
    </Sheet>
  );
}
