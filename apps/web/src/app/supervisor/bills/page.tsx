'use client';

import { useState } from 'react';
import useSWR from 'swr';
import StaffShell from '@/components/staff/StaffShell';
import { staffApi } from '@/lib/api';
import { dateTime, money, todayIso } from '@/lib/format';
import type { Bill } from '@/lib/types';
import { LoadingScreen, Toast, useToast } from '@/components/ui';

const STATUS_STYLE: Record<string, string> = {
  SETTLED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  DRAFT: 'bg-amber-50 text-amber-700 ring-amber-200',
  VOID: 'bg-slate-100 text-slate-500 ring-slate-200',
};

/** The billing register: every bill raised, with totals for the period. */
function BillsRegister() {
  const toast = useToast();
  const [from, setFrom] = useState(todayIso());
  const [to, setTo] = useState(todayIso());
  const [status, setStatus] = useState('');

  const { data, mutate, isLoading } = useSWR(
    ['bills', from, to, status],
    () => staffApi.bills({
      from: `${from}T00:00:00`,
      // `to` is exclusive in the API, so cover the whole chosen end day.
      to: `${new Date(new Date(to).getTime() + 86400000).toISOString().slice(0, 10)}T00:00:00`,
      status: status || undefined,
      limit: 300,
    }),
  );

  if (isLoading) return <LoadingScreen label="Loading bills…" />;

  const bills = data?.bills ?? [];
  const settled = bills.filter((b) => b.status === 'SETTLED');
  const collected = settled.reduce((s, b) => s + b.total, 0);
  const discounts = settled.reduce((s, b) => s + b.discount_amount, 0);
  const tax = settled.reduce((s, b) => s + b.tax_amount, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Bills</h2>
          <p className="text-sm text-slate-500">Every bill raised in the period</p>
        </div>
        <div className="ml-auto flex flex-wrap items-end gap-2">
          <div>
            <label className="label" htmlFor="f-from">From</label>
            <input id="f-from" type="date" className="input w-auto" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="f-to">To</label>
            <input id="f-to" type="date" className="input w-auto" value={to} min={from} max={todayIso()} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="f-status">Status</label>
            <select id="f-status" className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              <option value="SETTLED">Settled</option>
              <option value="DRAFT">Draft</option>
              <option value="VOID">Void</option>
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Bills settled', String(settled.length)],
          ['Collected', money(collected)],
          ['Tax collected', money(tax)],
          ['Discounts given', money(discounts)],
        ].map(([label, value]) => (
          <div key={label} className="card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50">
              <tr>
                <th className="table-head">Bill</th>
                <th className="table-head">Table</th>
                <th className="table-head hidden md:table-cell">Settled</th>
                <th className="table-head hidden lg:table-cell">By</th>
                <th className="table-head">Method</th>
                <th className="table-head text-right">Total</th>
                <th className="table-head text-right">Receipt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {bills.map((b: Bill) => (
                <tr key={b.id}>
                  <td className="table-cell">
                    <span className="font-medium text-slate-900">{b.bill_number}</span>
                    <span className={`chip ml-2 ${STATUS_STYLE[b.status]}`}>{b.status.toLowerCase()}</span>
                  </td>
                  <td className="table-cell">{b.table_label}</td>
                  <td className="table-cell hidden md:table-cell">{b.settled_at ? dateTime(b.settled_at) : '—'}</td>
                  <td className="table-cell hidden lg:table-cell">{b.settled_by_name ?? '—'}</td>
                  <td className="table-cell capitalize">{b.payment_method?.toLowerCase() ?? '—'}</td>
                  <td className="table-cell text-right font-semibold">{money(b.total)}</td>
                  <td className="table-cell text-right">
                    <a href={`/print/bill/${b.id}`} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">View</a>
                    {b.status === 'SETTLED' && (
                      <button
                        type="button"
                        onClick={async () => {
                          await staffApi.reprintBill(b.id);
                          toast.show('Receipt sent to the printer');
                          mutate();
                        }}
                        className="btn-ghost btn-sm"
                      >
                        Reprint
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {bills.length === 0 && <p className="px-4 py-10 text-center text-sm text-slate-500">No bills in this period.</p>}
      </div>

      {toast.toast && <Toast message={toast.toast.message} tone={toast.toast.tone} onDone={toast.clear} />}
    </div>
  );
}

export default function BillsPage() {
  return (
    <StaffShell requires={['SUPERVISOR', 'ADMIN']} title="Bills">
      {() => <BillsRegister />}
    </StaffShell>
  );
}
