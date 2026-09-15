'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import StaffShell from '@/components/staff/StaffShell';
import { staffApi } from '@/lib/api';
import { dateTime, elapsed, money, ORDER_STATUS_LABEL, ORDER_STATUS_STYLE, time } from '@/lib/format';
import { useRealtime } from '@/lib/socket';
import type { PaymentMethod } from '@/lib/types';
import { LoadingScreen, Sheet, Spinner, Toast, useToast } from '@/components/ui';

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'CASH', label: '💵 Cash' },
  { value: 'UPI', label: '📱 UPI' },
  { value: 'CARD', label: '💳 Card' },
  { value: 'WALLET', label: '👛 Wallet' },
  { value: 'OTHER', label: '🤝 Other' },
];

function TableDetail({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const toast = useToast();

  const [billOpen, setBillOpen] = useState(false);
  const [discount, setDiscount] = useState('');
  const [discountReason, setDiscountReason] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('UPI');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);

  const { data, mutate, isLoading, error } = useSWR(
    ['session', sessionId],
    () => staffApi.session(sessionId),
    { refreshInterval: 20_000 },
  );

  useRealtime(
    {
      'order:created': () => mutate(),
      'order:updated': () => mutate(),
      'bill:generated': () => mutate(),
      'bill:settled': () => mutate(),
    },
    { staff: true, sessionId },
  );

  if (isLoading) return <LoadingScreen label="Loading the table…" />;
  if (error || !data) {
    return (
      <div className="card p-8 text-center">
        <p className="text-slate-700">This table session is no longer open.</p>
        <button type="button" onClick={() => router.push('/supervisor')} className="btn-primary mt-4">Back to the floor</button>
      </div>
    );
  }

  const { session, orders, bill, totals, settings } = data;
  const symbol = settings.currency_symbol;
  const settled = bill?.status === 'SETTLED';
  const liveOrders = orders.filter((o) => o.status !== 'CANCELLED');

  /** Re-price the draft: picks up any order placed since the last preview. */
  const generate = async () => {
    setBusy(true);
    try {
      const amount = Math.round(Number(discount || 0) * 100);
      await staffApi.generateBill(sessionId, { discountAmount: amount, discountReason });
      await mutate();
      toast.show('Bill ready — check the amount before taking payment.');
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Could not prepare the bill', 'error');
    } finally {
      setBusy(false);
    }
  };

  const settle = async () => {
    if (!bill) return;
    setBusy(true);
    try {
      await staffApi.settleBill(bill.id, { paymentMethod: method, paymentReference: reference || undefined });
      toast.show('Payment recorded — the receipt has been sent to the printer.');
      setBillOpen(false);
      await mutate();
      setTimeout(() => router.push('/supervisor'), 1200);
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Could not settle the bill', 'error');
    } finally {
      setBusy(false);
    }
  };

  const pendingInKitchen = orders.filter((o) => ['PLACED', 'ACCEPTED', 'PREPARING'].includes(o.status)).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <button type="button" onClick={() => router.push('/supervisor')} className="btn-ghost btn-sm -ml-2 mb-1">
            ← Floor
          </button>
          <h2 className="text-xl font-bold text-slate-900">{session.table_label}</h2>
          <p className="text-sm text-slate-500">
            Session #{session.code} · {session.guest_count} {session.guest_count === 1 ? 'guest' : 'guests'} ·
            seated {elapsed(session.opened_at)}
          </p>
        </div>

        <div className="ml-auto flex flex-wrap gap-2">
          {!settled && (
            <button type="button" onClick={generate} disabled={busy} className="btn-secondary">
              {bill ? 'Refresh bill' : 'Prepare bill'}
            </button>
          )}
          {bill && !settled && (
            <button type="button" onClick={() => setBillOpen(true)} className="btn-primary">
              Take payment · {money(bill.total, symbol)}
            </button>
          )}
          {settled && (
            <>
              <a href={`/print/bill/${bill!.id}`} target="_blank" rel="noreferrer" className="btn-secondary">🖨️ Print receipt</a>
              <button type="button" onClick={() => router.push('/supervisor')} className="btn-primary">Done</button>
            </>
          )}
        </div>
      </div>

      {session.status === 'BILL_REQUESTED' && !settled && (
        <div className="flex items-center gap-2 rounded-xl bg-brand-50 px-4 py-3 text-sm font-medium text-brand-900 ring-1 ring-brand-200">
          <span className="h-2 w-2 animate-pulse rounded-full bg-brand-600" />
          The guest has asked for the bill
          {data.session.payment_preference ? ` and would like to pay by ${String(data.session.payment_preference)}.` : '.'}
        </div>
      )}

      {pendingInKitchen > 0 && !settled && (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          {pendingInKitchen} {pendingInKitchen === 1 ? 'order is' : 'orders are'} still in the kitchen. They are included in the total.
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        {/* -------------------------------------------------------- orders */}
        <section className="space-y-3" aria-label="Orders">
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">
            Orders ({liveOrders.length})
          </h3>

          {orders.length === 0 && <p className="card p-6 text-center text-sm text-slate-500">No orders yet.</p>}

          {orders.map((order) => (
            <article key={order.id} className={`card overflow-hidden ${order.status === 'CANCELLED' ? 'opacity-60' : ''}`}>
              <header className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
                <div>
                  <p className="font-semibold text-slate-900">Order #{order.order_number}</p>
                  <p className="text-xs text-slate-500">
                    {time(order.created_at)} · {order.channel === 'QR' ? 'from the guest' : `by ${order.placed_by_name ?? 'staff'}`}
                  </p>
                </div>
                <span className={`chip ml-auto ${ORDER_STATUS_STYLE[order.status]}`}>
                  {ORDER_STATUS_LABEL[order.status]}
                </span>
                <span className="font-semibold text-slate-900">{money(order.subtotal, symbol)}</span>
              </header>

              <ul className="divide-y divide-slate-100">
                {order.items.map((item) => (
                  <li key={item.id} className="flex items-start justify-between gap-3 px-4 py-2.5 text-sm">
                    <div>
                      <p className="text-slate-800">
                        <span className="font-semibold">{item.quantity}×</span> {item.item_name}
                        {item.variant_name && <span className="text-slate-500"> ({item.variant_name})</span>}
                      </p>
                      {item.addons?.length > 0 && (
                        <p className="text-xs text-slate-500">+ {item.addons.map((a) => a.name).join(', ')}</p>
                      )}
                      {item.note && <p className="text-xs italic text-brand-700">“{item.note}”</p>}
                    </div>
                    <span className="shrink-0 text-slate-600">{money(item.line_total, symbol)}</span>
                  </li>
                ))}
              </ul>

              {order.note && (
                <p className="border-t border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-600">Note: {order.note}</p>
              )}

              {!settled && !['SERVED', 'CANCELLED'].includes(order.status) && (
                <div className="flex gap-2 border-t border-slate-100 px-4 py-2.5">
                  {order.status === 'READY' && (
                    <button
                      type="button"
                      onClick={async () => { await staffApi.setOrderStatus(order.id, 'SERVED'); mutate(); }}
                      className="btn-secondary btn-sm"
                    >
                      Mark served
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={async () => { await staffApi.reprintKot(order.id); toast.show('Ticket reprinted'); }}
                    className="btn-ghost btn-sm"
                  >
                    🖨️ Reprint
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const reason = prompt('Why is this order being cancelled?');
                      if (reason === null) return;
                      try {
                        await staffApi.setOrderStatus(order.id, 'CANCELLED', reason);
                        mutate();
                      } catch (err) {
                        toast.show(err instanceof Error ? err.message : 'Could not cancel', 'error');
                      }
                    }}
                    className="btn-ghost btn-sm ml-auto text-rose-600"
                  >
                    Cancel order
                  </button>
                </div>
              )}
            </article>
          ))}
        </section>

        {/* ---------------------------------------------------------- bill */}
        <aside className="space-y-4">
          <section className="card p-4" aria-label="Bill summary">
            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">
              {bill ? `Bill ${bill.bill_number}` : 'Running total'}
            </h3>

            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Subtotal</dt>
                <dd className="text-slate-800">{money(bill?.subtotal ?? totals.subtotal, symbol)}</dd>
              </div>
              {(bill?.discount_amount ?? 0) > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <dt>Discount {bill?.discount_reason && `(${bill.discount_reason})`}</dt>
                  <dd>−{money(bill!.discount_amount, symbol)}</dd>
                </div>
              )}
              {(bill?.service_charge_amount ?? totals.service_charge_amount) > 0 && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Service charge</dt>
                  <dd className="text-slate-800">{money(bill?.service_charge_amount ?? totals.service_charge_amount, symbol)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-slate-500">{settings.tax_label} ({bill?.tax_percent ?? totals.tax_percent}%)</dt>
                <dd className="text-slate-800">{money(bill?.tax_amount ?? totals.tax_amount, symbol)}</dd>
              </div>
              {(bill?.rounding_adjustment ?? totals.rounding_adjustment) !== 0 && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Rounding</dt>
                  <dd className="text-slate-800">{money(bill?.rounding_adjustment ?? totals.rounding_adjustment, symbol)}</dd>
                </div>
              )}
              <div className="flex justify-between border-t border-slate-200 pt-2 text-lg font-bold">
                <dt>Total</dt>
                <dd>{money(bill?.total ?? totals.total, symbol)}</dd>
              </div>
            </dl>

            {settled ? (
              <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 ring-1 ring-emerald-200">
                Settled by {bill!.payment_method} at {dateTime(bill!.settled_at)}
                {bill!.payment_reference && <> · ref {bill!.payment_reference}</>}
              </p>
            ) : (
              <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                <div>
                  <label className="label" htmlFor="discount">Discount ({symbol})</label>
                  <input
                    id="discount" type="number" min="0" step="1" className="input"
                    value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="discount-reason">Reason</label>
                  <input
                    id="discount-reason" className="input" value={discountReason}
                    onChange={(e) => setDiscountReason(e.target.value)} placeholder="Loyalty card, manager approval…"
                  />
                </div>
                <button type="button" onClick={generate} disabled={busy} className="btn-secondary w-full">
                  {busy ? <Spinner className="h-4 w-4" /> : bill ? 'Apply and refresh bill' : 'Prepare the bill'}
                </button>
              </div>
            )}
          </section>

          {!settled && (
            <section className="card p-4" aria-label="Session actions">
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Session</h3>
              <div className="mt-3 space-y-2">
                {bill && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (!confirm('Void this draft bill? The table stays open.')) return;
                      await staffApi.voidBill(bill.id, 'Voided by supervisor');
                      mutate();
                    }}
                    className="btn-secondary w-full"
                  >
                    Void draft bill
                  </button>
                )}
                <button
                  type="button"
                  onClick={async () => {
                    if (!confirm('Close this table without billing? Use this only for walk-outs or test orders.')) return;
                    await staffApi.closeSession(sessionId);
                    router.push('/supervisor');
                  }}
                  className="btn-secondary w-full text-rose-600"
                >
                  Close without billing
                </button>
              </div>
            </section>
          )}
        </aside>
      </div>

      {/* ----------------------------------------------------- payment sheet */}
      <Sheet
        open={billOpen && !!bill}
        onClose={() => setBillOpen(false)}
        title="Take payment"
        footer={
          <button type="button" onClick={settle} disabled={busy} className="btn-primary w-full py-3.5 text-base">
            {busy ? <><Spinner className="h-4 w-4 text-white" /> Recording…</> : `Mark paid · ${money(bill?.total ?? 0, symbol)}`}
          </button>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl bg-slate-50 p-4 text-center">
            <p className="text-sm text-slate-500">Amount to collect</p>
            <p className="text-3xl font-bold text-slate-900">{money(bill?.total ?? 0, symbol)}</p>
            <p className="mt-1 text-xs text-slate-500">{session.table_label} · bill {bill?.bill_number}</p>
          </div>

          <fieldset>
            <legend className="label">Payment method</legend>
            <div className="grid grid-cols-2 gap-2">
              {METHODS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMethod(m.value)}
                  className={`rounded-xl px-4 py-3 text-sm font-semibold ring-1 transition ${
                    method === m.value ? 'bg-brand-50 text-brand-800 ring-brand-400' : 'bg-white text-slate-700 ring-slate-200'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </fieldset>

          <div>
            <label className="label" htmlFor="reference">Reference (optional)</label>
            <input
              id="reference" className="input" value={reference}
              onChange={(e) => setReference(e.target.value)} placeholder="UPI txn id, last 4 digits…"
            />
          </div>

          <p className="text-xs text-slate-500">
            Settling closes the table, prints the receipt and adds the amount to today&apos;s takings.
          </p>
        </div>
      </Sheet>

      {toast.toast && <Toast message={toast.toast.message} tone={toast.toast.tone} onDone={toast.clear} />}
    </div>
  );
}

export default function TableSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <StaffShell requires={['SUPERVISOR', 'ADMIN']} title="Table detail">
      {() => <TableDetail sessionId={id} />}
    </StaffShell>
  );
}
