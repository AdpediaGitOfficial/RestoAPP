'use client';

import FoodTile from './FoodTile';
import Icon, { type IconName } from '@/components/Icon';
import { money, time } from '@/lib/format';
import type { Bill, Order, Totals } from '@/lib/types';

const STEPS: { key: string; label: string; icon: IconName }[] = [
  { key: 'PLACED', label: 'Sent', icon: 'send' },
  { key: 'ACCEPTED', label: 'Accepted', icon: 'check' },
  { key: 'PREPARING', label: 'Cooking', icon: 'flame' },
  { key: 'READY', label: 'Ready', icon: 'bell' },
  { key: 'SERVED', label: 'Served', icon: 'sparkle' },
];

/** Horizontal tracker — where this round has got to. */
function Tracker({ status }: { status: string }) {
  if (status === 'CANCELLED') {
    return (
      <div className="rounded-2xl bg-brand-50 px-3 py-2 text-xs font-bold text-brand-700 ring-1 ring-brand-200">
        This order was cancelled — please speak to our staff.
      </div>
    );
  }

  const current = STEPS.findIndex((s) => s.key === status);

  return (
    <div className="flex items-start" aria-label={`Status: ${STEPS[current]?.label ?? status}`}>
      {STEPS.map((step, i) => {
        const done = i <= current;
        const active = i === current;
        return (
          <div key={step.key} className="flex flex-1 flex-col items-center">
            <div className="flex w-full items-center">
              <span className={`h-0.5 flex-1 ${i === 0 ? 'bg-transparent' : done ? 'bg-brand-500' : 'bg-ink-200'}`} />
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition ${
                  active ? 'bg-brand-500 text-white animate-pulse-ring'
                    : done ? 'bg-brand-500 text-white'
                    : 'bg-ink-100 text-ink-400'
                }`}
              >
                <Icon name={done && !active ? 'check' : step.icon} className="h-3.5 w-3.5" strokeWidth={2.2} />
              </span>
              <span className={`h-0.5 flex-1 ${i === STEPS.length - 1 ? 'bg-transparent' : i < current ? 'bg-brand-500' : 'bg-ink-200'}`} />
            </div>
            <span className={`mt-1.5 text-[10px] font-normal tracking-tight ${active ? 'text-brand-600' : done ? 'text-ink-600' : 'text-ink-400'}`}>
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function OrdersView({
  orders, totals, symbol, taxLabel, bill, billRequested, settled, onRequestBill, onAddMore,
}: {
  orders: Order[];
  totals: Totals;
  symbol: string;
  taxLabel: string;
  bill: Bill | null;
  billRequested: boolean;
  settled: boolean;
  onRequestBill: () => void;
  onAddMore: () => void;
}) {
  if (orders.length === 0) {
    return (
      <div className="px-4 py-16 text-center">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-ink-100 text-ink-400">
          <Icon name="receipt" className="h-7 w-7" />
        </span>
        <p className="mt-4 text-[17px] font-bold text-ink-800">Nothing ordered yet</p>
        <p className="mt-1 text-sm text-ink-500">Your orders and their progress will appear here.</p>
        <button type="button" onClick={onAddMore} className="btn-primary mt-6">Browse the menu</button>
      </div>
    );
  }

  const live = orders.filter((o) => !['SERVED', 'CANCELLED'].includes(o.status));

  return (
    <div className="space-y-4 px-4 pb-28 pt-1">
      {live.length > 0 && (
        <div className="flex items-center gap-2.5 rounded-2xl bg-brand-50 px-4 py-3 ring-1 ring-brand-200">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand-500" />
          </span>
          <p className="text-[13px] font-bold text-brand-800">
            {live.length} {live.length === 1 ? 'order is' : 'orders are'} with the kitchen
          </p>
        </div>
      )}

      {orders.map((order, i) => (
        <article
          key={order.id}
          className="card animate-rise-in overflow-hidden"
          style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
        >
          <header className="flex items-center justify-between px-4 pb-3 pt-4">
            <div>
              <p className="text-[14px] font-bold tracking-[-0.01em] text-ink-900">Order #{order.order_number}</p>
              <p className="text-[11.5px] text-ink-400">{time(order.created_at)}</p>
            </div>
            <span className="text-[14px] font-bold tabular-nums text-ink-900">{money(order.subtotal, symbol)}</span>
          </header>

          <div className="px-4 pb-4">
            <Tracker status={order.status} />
          </div>

          <ul className="divide-y divide-ink-100 border-t border-ink-100">
            {order.items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="h-11 w-11 shrink-0 overflow-hidden rounded-xl">
                  <FoodTile name={item.item_name} size="sm" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-normal text-ink-800">
                    <span className="font-bold">{item.quantity}×</span> {item.item_name}
                  </p>
                  {(item.variant_name || item.addons?.length > 0) && (
                    <p className="truncate text-[11px] text-ink-400">
                      {[item.variant_name, ...(item.addons ?? []).map((a) => a.name)].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  {item.note && <p className="truncate text-[11px] italic text-brand-600">“{item.note}”</p>}
                </div>
                <span className="shrink-0 text-sm font-normal text-ink-600">{money(item.line_total, symbol)}</span>
              </li>
            ))}
          </ul>

          {order.note && (
            <p className="border-t border-ink-100 bg-ink-50 px-4 py-2 text-xs text-ink-500">Note: {order.note}</p>
          )}
        </article>
      ))}

      {/* ---------------------------------------------------- the running bill */}
      <section className="card overflow-hidden" aria-label="Running bill">
        <div className="flex items-center gap-2 bg-ink-900 px-4 py-3.5">
          <Icon name="receipt" className="h-4 w-4 text-white/60" />
          <h2 className="text-[13.5px] font-bold tracking-[-0.01em] text-white">Your bill so far</h2>
        </div>
        <dl className="space-y-2 p-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-500">Subtotal</dt>
            <dd className="font-normal text-ink-800">{money(totals.subtotal, symbol)}</dd>
          </div>
          {totals.service_charge_amount > 0 && (
            <div className="flex justify-between">
              <dt className="text-ink-500">Service charge ({totals.service_charge_percent}%)</dt>
              <dd className="font-normal text-ink-800">{money(totals.service_charge_amount, symbol)}</dd>
            </div>
          )}
          {totals.tax_amount > 0 && (
            <div className="flex justify-between">
              <dt className="text-ink-500">{taxLabel} ({totals.tax_percent}%){totals.tax_inclusive && ' — included'}</dt>
              <dd className="font-normal text-ink-800">{money(totals.tax_amount, symbol)}</dd>
            </div>
          )}
          {totals.rounding_adjustment !== 0 && (
            <div className="flex justify-between">
              <dt className="text-ink-500">Rounding</dt>
              <dd className="font-normal text-ink-800">{money(totals.rounding_adjustment, symbol)}</dd>
            </div>
          )}
          <div className="flex items-baseline justify-between border-t border-dashed border-ink-200 pt-3">
            <dt className="text-[15px] font-bold text-ink-900">Total</dt>
            <dd className="text-[26px] font-bold tabular-nums tracking-tight text-ink-900">{money(totals.total, symbol)}</dd>
          </div>
        </dl>
      </section>

      {settled && bill && (
        <div className="rounded-2xl bg-emerald-50 px-4 py-5 text-center ring-1 ring-emerald-200">
          <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-white">
            <Icon name="check" className="h-5 w-5" strokeWidth={2.4} />
          </span>
          <p className="mt-2.5 text-[14px] font-bold text-emerald-900">Paid in full — thank you!</p>
          <p className="mt-0.5 text-xs text-emerald-700">Bill {bill.bill_number} · {money(bill.total, symbol)}</p>
        </div>
      )}

      {!settled && (
        <div
          className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-100 bg-white px-4 pt-3 shadow-bar"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <div className="mx-auto flex max-w-2xl gap-2">
            <button type="button" onClick={onAddMore} className="btn-secondary flex-1 py-3.5">Order more</button>
            <button
              type="button"
              onClick={onRequestBill}
              disabled={billRequested}
              className="btn-primary flex-1 py-3.5"
            >
              {billRequested ? <><Icon name="check" className="h-4 w-4" strokeWidth={2.4} /> Bill requested</> : 'Ask for the bill'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
