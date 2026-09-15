'use client';

import { use, useEffect, useState } from 'react';
import { staffApi } from '@/lib/api';
import { money, dateTime } from '@/lib/format';
import type { Bill, Settings } from '@/lib/types';
import { LoadingScreen } from '@/components/ui';

interface Line {
  id: string; item_name: string; variant_name: string | null;
  unit_price: number; quantity: number; addons: { name: string; price: number }[];
  addons_total: number; line_total: number;
}

/** A printable receipt sized for an 80mm thermal roll (and fine on A4). */
export default function PrintBillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<{ bill: Bill; items: Line[]; settings: Settings } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    staffApi.bill(id)
      .then((res) => setData(res as unknown as { bill: Bill; items: Line[]; settings: Settings }))
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load the bill'));
  }, [id]);

  if (error) {
    return (
      <main className="mx-auto max-w-md px-6 py-16 text-center">
        <p className="text-slate-700">{error}</p>
        <p className="mt-2 text-sm text-slate-500">You may need to sign in again.</p>
      </main>
    );
  }
  if (!data) return <LoadingScreen label="Loading the bill…" />;

  const { bill, items, settings } = data;
  const symbol = settings.currency_symbol;

  return (
    <main className="mx-auto max-w-sm bg-white px-5 py-6 text-slate-900">
      <div className="no-print mb-4 flex gap-2">
        <button type="button" onClick={() => window.print()} className="btn-primary flex-1">🖨️ Print</button>
        <button type="button" onClick={() => window.close()} className="btn-secondary">Close</button>
      </div>

      <div className="text-center">
        <h1 className="text-lg font-bold uppercase tracking-wide">{settings.name}</h1>
        {settings.address && <p className="mt-1 text-xs text-slate-600">{settings.address}</p>}
        {settings.phone && <p className="text-xs text-slate-600">Ph: {settings.phone}</p>}
      </div>

      <div className="my-3 border-y border-dashed border-slate-300 py-2 text-xs">
        <div className="flex justify-between"><span>Bill</span><span className="font-semibold">{bill.bill_number}</span></div>
        <div className="flex justify-between"><span>Table</span><span>{bill.table_label}</span></div>
        <div className="flex justify-between"><span>Date</span><span>{dateTime(bill.settled_at || bill.created_at)}</span></div>
        {bill.guest_count != null && <div className="flex justify-between"><span>Guests</span><span>{bill.guest_count}</span></div>}
        {bill.settled_by_name && <div className="flex justify-between"><span>Billed by</span><span>{bill.settled_by_name}</span></div>}
      </div>

      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-300 text-left">
            <th className="py-1">Item</th>
            <th className="py-1 text-center">Qty</th>
            <th className="py-1 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="align-top">
              <td className="py-1">
                {item.item_name}
                {item.variant_name && <span className="text-slate-500"> ({item.variant_name})</span>}
                {item.addons?.length > 0 && (
                  <span className="block pl-2 text-[10px] text-slate-500">+ {item.addons.map((a) => a.name).join(', ')}</span>
                )}
                <span className="block text-[10px] text-slate-500">@ {money(item.unit_price + item.addons_total, symbol)}</span>
              </td>
              <td className="py-1 text-center">{item.quantity}</td>
              <td className="py-1 text-right">{money(item.line_total, symbol)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="mt-3 space-y-1 border-t border-dashed border-slate-300 pt-2 text-xs">
        <div className="flex justify-between"><dt>Subtotal</dt><dd>{money(bill.subtotal, symbol)}</dd></div>
        {bill.discount_amount > 0 && (
          <div className="flex justify-between">
            <dt>Discount{bill.discount_reason && ` (${bill.discount_reason})`}</dt>
            <dd>−{money(bill.discount_amount, symbol)}</dd>
          </div>
        )}
        {bill.service_charge_amount > 0 && (
          <div className="flex justify-between"><dt>Service charge {bill.service_charge_percent}%</dt><dd>{money(bill.service_charge_amount, symbol)}</dd></div>
        )}
        {bill.tax_amount > 0 && (
          <div className="flex justify-between"><dt>{settings.tax_label} {bill.tax_percent}%</dt><dd>{money(bill.tax_amount, symbol)}</dd></div>
        )}
        {bill.rounding_adjustment !== 0 && (
          <div className="flex justify-between"><dt>Rounding</dt><dd>{money(bill.rounding_adjustment, symbol)}</dd></div>
        )}
        <div className="flex justify-between border-t border-slate-400 pt-1.5 text-sm font-bold">
          <dt>TOTAL</dt><dd>{money(bill.total, symbol)}</dd>
        </div>
      </dl>

      {bill.payment_method && (
        <p className="mt-2 text-center text-xs text-slate-600">
          Paid by {bill.payment_method.toLowerCase()}
          {bill.payment_reference && ` · ${bill.payment_reference}`}
        </p>
      )}

      <p className="mt-4 text-center text-xs text-slate-600">{settings.bill_footer_note}</p>
      {bill.status !== 'SETTLED' && (
        <p className="mt-3 text-center text-[10px] font-bold uppercase tracking-widest text-rose-600">
          {bill.status === 'DRAFT' ? 'Draft — not yet paid' : 'Void'}
        </p>
      )}
    </main>
  );
}
