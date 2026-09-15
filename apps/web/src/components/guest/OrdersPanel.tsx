'use client';

import { money, time, ORDER_STATUS_LABEL } from '@/lib/format';
import type { Order, Totals } from '@/lib/types';

const STEPS = ['PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'SERVED'];

function Progress({ status }: { status: string }) {
  if (status === 'CANCELLED') {
    return <span className="chip bg-rose-50 text-rose-700 ring-rose-200">Cancelled</span>;
  }
  const current = STEPS.indexOf(status);
  return (
    <div className="flex items-center gap-1.5" aria-label={`Status: ${ORDER_STATUS_LABEL[status]}`}>
      {STEPS.map((step, i) => (
        <span
          key={step}
          className={`h-1.5 rounded-full transition-all ${
            i <= current ? 'w-6 bg-brand-500' : 'w-3 bg-slate-200'
          }`}
        />
      ))}
      <span className="ml-1.5 text-xs font-medium text-slate-600">{ORDER_STATUS_LABEL[status]}</span>
    </div>
  );
}

/** The guest's running tab: what they ordered, where it is, what it costs. */
export default function OrdersPanel({ orders, totals, symbol, taxLabel }: {
  orders: Order[]; totals: Totals; symbol: string; taxLabel: string;
}) {
  if (orders.length === 0) {
    return (
      <div className="px-4 py-12 text-center">
        <p className="text-4xl" aria-hidden>☕</p>
        <p className="mt-3 font-semibold text-slate-700">Nothing ordered yet</p>
        <p className="mt-1 text-sm text-slate-500">Browse the menu and send your first order to the kitchen.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 px-4 py-4">
      {orders.map((order) => (
        <article key={order.id} className="card overflow-hidden">
          <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Order #{order.order_number}</p>
              <p className="text-xs text-slate-500">{time(order.created_at)}</p>
            </div>
            <span className="text-sm font-semibold text-slate-900">{money(order.subtotal, symbol)}</span>
          </header>

          <div className="px-4 py-3">
            <Progress status={order.status} />
          </div>

          <ul className="divide-y divide-slate-100 border-t border-slate-100">
            {order.items.map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm text-slate-800">
                    <span className="font-medium">{item.quantity}×</span> {item.item_name}
                    {item.variant_name && <span className="text-slate-500"> ({item.variant_name})</span>}
                  </p>
                  {item.addons?.length > 0 && (
                    <p className="text-xs text-slate-500">+ {item.addons.map((a) => a.name).join(', ')}</p>
                  )}
                  {item.note && <p className="text-xs italic text-brand-700">“{item.note}”</p>}
                </div>
                <span className="shrink-0 text-sm text-slate-600">{money(item.line_total, symbol)}</span>
              </li>
            ))}
          </ul>

          {order.note && (
            <p className="border-t border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-600">
              Note: {order.note}
            </p>
          )}
        </article>
      ))}

      <section className="card p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Running total</h3>
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-500">Subtotal</dt>
            <dd className="text-slate-800">{money(totals.subtotal, symbol)}</dd>
          </div>
          {totals.service_charge_amount > 0 && (
            <div className="flex justify-between">
              <dt className="text-slate-500">Service charge ({totals.service_charge_percent}%)</dt>
              <dd className="text-slate-800">{money(totals.service_charge_amount, symbol)}</dd>
            </div>
          )}
          {totals.tax_amount > 0 && (
            <div className="flex justify-between">
              <dt className="text-slate-500">
                {taxLabel} ({totals.tax_percent}%){totals.tax_inclusive ? ' — included' : ''}
              </dt>
              <dd className="text-slate-800">{money(totals.tax_amount, symbol)}</dd>
            </div>
          )}
          {totals.rounding_adjustment !== 0 && (
            <div className="flex justify-between">
              <dt className="text-slate-500">Rounding</dt>
              <dd className="text-slate-800">{money(totals.rounding_adjustment, symbol)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-slate-100 pt-2 text-base font-bold">
            <dt>Total</dt>
            <dd>{money(totals.total, symbol)}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
