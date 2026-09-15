'use client';

import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import StaffShell from '@/components/staff/StaffShell';
import { staffApi } from '@/lib/api';
import { elapsed, money } from '@/lib/format';
import { useRealtime } from '@/lib/socket';
import type { AppNotification, TableBoardRow } from '@/lib/types';
import { LoadingScreen, Toast, useToast } from '@/components/ui';

const STATUS_STYLE: Record<string, { ring: string; badge: string; label: string }> = {
  FREE: { ring: 'ring-slate-200', badge: 'bg-slate-100 text-slate-600 ring-slate-200', label: 'Free' },
  OPEN: { ring: 'ring-sky-300', badge: 'bg-sky-100 text-sky-800 ring-sky-200', label: 'Dining' },
  BILL_REQUESTED: { ring: 'ring-brand-400', badge: 'bg-brand-100 text-brand-800 ring-brand-300', label: 'Bill requested' },
  BILLED: { ring: 'ring-emerald-300', badge: 'bg-emerald-100 text-emerald-800 ring-emerald-200', label: 'Billed' },
};

function FloorView() {
  const toast = useToast();
  const [zone, setZone] = useState('ALL');

  const { data, mutate, isLoading } = useSWR('floor', () => staffApi.tables(), { refreshInterval: 20_000 });
  const { data: notes, mutate: refreshNotes } = useSWR('notifications', () => staffApi.notifications(), { refreshInterval: 30_000 });

  useRealtime(
    {
      'order:created': () => { mutate(); refreshNotes(); },
      'order:updated': () => mutate(),
      'bill:requested': (p: { tableLabel: string }) => {
        mutate(); refreshNotes();
        toast.show(`🔔 ${p.tableLabel} has requested the bill`);
      },
      'waiter:called': (p: { tableLabel: string }) => {
        refreshNotes();
        toast.show(`🔔 ${p.tableLabel} needs assistance`);
      },
      'bill:generated': () => mutate(),
      'bill:settled': () => { mutate(); refreshNotes(); },
      'session:closed': () => mutate(),
    },
    { staff: true },
  );

  if (isLoading) return <LoadingScreen label="Loading the floor…" />;

  const tables = data?.tables ?? [];
  const zones = ['ALL', ...new Set(tables.map((t) => t.zone))];
  const visible = zone === 'ALL' ? tables : tables.filter((t) => t.zone === zone);

  const occupied = tables.filter((t) => t.session_id);
  const billRequests = tables.filter((t) => t.session_status === 'BILL_REQUESTED');
  const openValue = occupied.reduce((sum, t) => sum + (t.totals?.total ?? 0), 0);
  const unread = (notes?.notifications ?? []).filter((n: AppNotification) => !n.is_read);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Tables seated', value: `${occupied.length}/${tables.length}`, tone: 'text-slate-900' },
          { label: 'Bill requests', value: billRequests.length, tone: billRequests.length ? 'text-brand-700' : 'text-slate-900' },
          { label: 'Orders in kitchen', value: occupied.reduce((s, t) => s + t.pending_orders, 0), tone: 'text-slate-900' },
          { label: 'Open table value', value: money(openValue), tone: 'text-slate-900' },
        ].map((stat) => (
          <div key={stat.label} className="card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{stat.label}</p>
            <p className={`mt-1 text-2xl font-bold ${stat.tone}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {unread.length > 0 && (
        <section className="card overflow-hidden" aria-label="Alerts">
          <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-bold text-slate-900">Needs attention</h2>
            <span className="chip bg-brand-100 text-brand-800 ring-brand-200">{unread.length}</span>
          </header>
          <ul className="divide-y divide-slate-100">
            {unread.slice(0, 6).map((n: AppNotification) => (
              <li key={n.id} className="flex items-center gap-3 px-4 py-2.5">
                <span aria-hidden>{n.type === 'BILL_REQUEST' ? '🧾' : n.type === 'WAITER_CALL' ? '🔔' : '🍽️'}</span>
                <p className="flex-1 text-sm text-slate-700">{n.message}</p>
                <span className="text-xs text-slate-400">{elapsed(n.created_at)}</span>
                <button
                  type="button"
                  onClick={async () => { await staffApi.readNotification(n.id); refreshNotes(); }}
                  className="btn-ghost btn-sm"
                >
                  Done
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-bold text-slate-900">Tables</h2>
        {zones.length > 2 && (
          <div className="ml-auto flex gap-1 rounded-xl bg-white p-1 ring-1 ring-slate-200">
            {zones.map((z) => (
              <button
                key={z}
                type="button"
                onClick={() => setZone(z)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${zone === z ? 'bg-brand-600 text-white' : 'text-slate-600'}`}
              >
                {z === 'ALL' ? 'All zones' : z}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {visible.map((t: TableBoardRow) => {
          const key = t.session_status ?? 'FREE';
          const style = STATUS_STYLE[key] ?? STATUS_STYLE.FREE;
          const href = t.session_id ? `/supervisor/table/${t.session_id}` : '#';

          const card = (
            <div
              className={`card h-full p-4 ring-1 transition ${style.ring} ${
                t.session_id ? 'hover:ring-brand-400' : 'opacity-80'
              } ${key === 'BILL_REQUESTED' ? 'animate-pulse-ring' : ''}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-base font-bold text-slate-900">{t.label}</p>
                  <p className="text-xs text-slate-500">{t.zone} · {t.seats} seats</p>
                </div>
                <span className={`chip ${style.badge}`}>{style.label}</span>
              </div>

              {t.session_id ? (
                <>
                  <dl className="mt-3 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Seated</dt>
                      <dd className="text-slate-700">{elapsed(t.opened_at)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Orders</dt>
                      <dd className="text-slate-700">
                        {t.order_count}
                        {t.pending_orders > 0 && <span className="ml-1 text-amber-600">({t.pending_orders} cooking)</span>}
                      </dd>
                    </div>
                    <div className="flex justify-between border-t border-slate-100 pt-1.5">
                      <dt className="font-semibold text-slate-700">Amount due</dt>
                      <dd className="font-bold text-slate-900">{money(t.totals?.total ?? 0)}</dd>
                    </div>
                  </dl>

                  {t.payment_preference && (
                    <p className="mt-2 text-xs text-brand-700">Guest prefers {t.payment_preference}</p>
                  )}
                  {t.bill_status === 'DRAFT' && (
                    <p className="mt-2 text-xs font-semibold text-sky-700">Bill {t.bill_number} ready to settle</p>
                  )}
                </>
              ) : (
                <p className="mt-6 text-sm text-slate-400">No guests seated</p>
              )}
            </div>
          );

          return t.session_id ? <Link key={t.id} href={href}>{card}</Link> : <div key={t.id}>{card}</div>;
        })}
      </div>

      {toast.toast && <Toast message={toast.toast.message} tone={toast.toast.tone} onDone={toast.clear} />}
    </div>
  );
}

export default function SupervisorPage() {
  return (
    <StaffShell requires={['SUPERVISOR', 'ADMIN']} title="Floor view">
      {() => <FloorView />}
    </StaffShell>
  );
}
