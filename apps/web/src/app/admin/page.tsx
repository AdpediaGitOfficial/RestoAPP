'use client';

import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import StaffShell from '@/components/staff/StaffShell';
import { BarChart, HourlyChart, StatTile, TrendChart } from '@/components/staff/Charts';
import { adminApi } from '@/lib/api';
import { money, plural, todayIso } from '@/lib/format';
import { useRealtime } from '@/lib/socket';
import { LoadingScreen } from '@/components/ui';

function Dashboard() {
  const [date, setDate] = useState(todayIso());
  const isToday = date === todayIso();

  const { data, mutate, isLoading } = useSWR(
    ['metrics', date],
    () => adminApi.dailyMetrics(date),
    { refreshInterval: isToday ? 60_000 : 0 },
  );
  const { data: trendData } = useSWR('trend', () => adminApi.trend(14));

  useRealtime({ 'bill:settled': () => isToday && mutate() }, { staff: true });

  if (isLoading || !data) return <LoadingScreen label="Crunching today's numbers…" />;

  const { summary, live, hourly, topItems, categories, payments, staff } = data;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Daily metrics</h2>
          <p className="text-sm text-slate-500">
            {isToday ? 'Today, updating live' : new Date(date).toLocaleDateString('en-IN', { dateStyle: 'full' })}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <input
            type="date"
            className="input w-auto"
            value={date}
            max={todayIso()}
            onChange={(e) => setDate(e.target.value)}
            aria-label="Choose a date"
          />
          {!isToday && (
            <button type="button" onClick={() => setDate(todayIso())} className="btn-secondary btn-sm">Today</button>
          )}
        </div>
      </div>

      {/* Live floor state — only meaningful for today. */}
      {isToday && (
        <section className="card p-4" aria-label="Right now">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Right now</p>
              <p className="text-sm text-slate-600">Live across the floor</p>
            </div>
            <div className="flex flex-wrap gap-6">
              <div><p className="text-xl font-bold text-slate-900">{live.open_tables}</p><p className="text-xs text-slate-500">tables seated</p></div>
              <div><p className={`text-xl font-bold ${live.bill_requests ? 'text-brand-700' : 'text-slate-900'}`}>{live.bill_requests}</p><p className="text-xs text-slate-500">bill requests</p></div>
              <div><p className="text-xl font-bold text-slate-900">{live.orders_in_kitchen}</p><p className="text-xs text-slate-500">in the kitchen</p></div>
              <div><p className="text-xl font-bold text-slate-900">{money(live.open_table_value)}</p><p className="text-xs text-slate-500">on open tables</p></div>
            </div>
            <Link href="/supervisor" className="btn-secondary btn-sm ml-auto">Open floor view</Link>
          </div>
        </section>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Revenue collected" value={money(summary.revenue)} sub={`${plural(summary.bills_settled, "bill")} settled`} tone="good" />
        <StatTile label="Average bill" value={money(summary.average_bill)} sub={`${plural(summary.guests, "guest")} served`} />
        <StatTile label="Orders" value={summary.orders_placed} sub={`${summary.orders_cancelled} cancelled · ~${summary.avg_prep_minutes} min to ready`} />
        <StatTile label="Discounts given" value={money(summary.discounts)} sub={`${money(summary.tax_collected)} tax collected`} tone={summary.discounts > 0 ? 'warn' : 'default'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-4" aria-label="Revenue by hour">
          <h3 className="mb-3 text-sm font-bold text-slate-900">Revenue by hour</h3>
          <HourlyChart data={hourly} />
        </section>

        <section className="card p-4" aria-label="Revenue trend">
          <h3 className="mb-1 text-sm font-bold text-slate-900">Last 14 days</h3>
          <p className="mb-2 text-xs text-slate-500">
            {trendData ? `${money(trendData.trend.reduce((s, d) => s + d.revenue, 0))} total` : '—'}
          </p>
          {trendData && <TrendChart data={trendData.trend} />}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-4" aria-label="Best sellers">
          <h3 className="mb-3 text-sm font-bold text-slate-900">Best sellers</h3>
          {topItems.length === 0 ? (
            <p className="text-sm text-slate-500">Nothing sold on this day.</p>
          ) : (
            <ul className="space-y-2">
              {topItems.map((item, i) => (
                <li key={item.item_name} className="flex items-center gap-3 text-sm">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-600">{i + 1}</span>
                  <span className="flex-1 truncate text-slate-800">{item.item_name}</span>
                  <span className="text-slate-500">{item.quantity} sold</span>
                  <span className="w-20 text-right font-semibold text-slate-900">{money(item.revenue)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-4" aria-label="Sales by category">
          <h3 className="mb-3 text-sm font-bold text-slate-900">Sales by category</h3>
          {categories.length === 0 ? (
            <p className="text-sm text-slate-500">No sales recorded.</p>
          ) : (
            <BarChart label="Sales by category" data={categories.map((c) => ({ label: c.category, value: c.revenue }))} />
          )}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-4" aria-label="Payment mix">
          <h3 className="mb-3 text-sm font-bold text-slate-900">How guests paid</h3>
          {payments.length === 0 ? (
            <p className="text-sm text-slate-500">No payments recorded.</p>
          ) : (
            <ul className="space-y-2">
              {payments.map((p) => (
                <li key={p.method} className="flex items-center justify-between text-sm">
                  <span className="capitalize text-slate-700">{p.method.toLowerCase()}</span>
                  <span className="text-slate-500">{plural(p.bills, 'bill')}</span>
                  <span className="font-semibold text-slate-900">{money(p.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-4" aria-label="Takings by staff">
          <h3 className="mb-3 text-sm font-bold text-slate-900">Takings by staff</h3>
          {staff.length === 0 ? (
            <p className="text-sm text-slate-500">No bills settled.</p>
          ) : (
            <ul className="space-y-2">
              {staff.map((s) => (
                <li key={s.staff} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700">{s.staff}</span>
                  <span className="text-slate-500">{plural(s.bills, 'bill')}</span>
                  <span className="font-semibold text-slate-900">{money(s.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

export default function AdminDashboardPage() {
  return (
    <StaffShell requires={['ADMIN']} title="Admin dashboard">
      {() => <Dashboard />}
    </StaffShell>
  );
}
