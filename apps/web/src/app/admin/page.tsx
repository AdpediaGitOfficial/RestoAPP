'use client';

import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import StaffShell from '@/components/staff/StaffShell';
import {
  COMPARED_TO, HourColumns, Kpi, PERIOD_LABEL, PeriodPicker, TrendLine, rupees,
  type Period,
} from '@/components/staff/Analytics';
import Icon from '@/components/Icon';
import { adminApi } from '@/lib/api';
import { money, todayIso } from '@/lib/format';
import { useRealtime } from '@/lib/socket';
import { LoadingScreen } from '@/components/ui';
import type { Kpi as KpiData, TopItem } from '@/lib/types';

/** Format a KPI for display; the API says which kind of number it is. */
const show = (k: KpiData, symbol: string) =>
  k.format === 'money' ? rupees(k.value, symbol)
  : k.format === 'percent' ? `${k.value}%`
  : k.value.toLocaleString('en-IN');

const TREND_MARK: Record<TopItem['trend'], { d: string; className: string; label: string }> = {
  up: { d: 'M6 10V2M2.5 5.5 6 2l3.5 3.5', className: 'text-emerald-700', label: 'up on the previous period' },
  down: { d: 'M6 2v8M2.5 6.5 6 10l3.5-3.5', className: 'text-brand-700', label: 'down on the previous period' },
  flat: { d: 'M2 6h8M7.5 3.5 10 6 7.5 8.5', className: 'text-ink-400', label: 'steady' },
  new: { d: '', className: 'text-ink-500', label: 'new this period' },
};

function TrendMark({ trend }: { trend: TopItem['trend'] }) {
  const m = TREND_MARK[trend];
  if (trend === 'new') return <span className="text-[11px] font-semibold text-ink-500">new</span>;
  return (
    <svg viewBox="0 0 12 12" className={`h-3.5 w-3.5 ${m.className}`} role="img" aria-label={m.label}>
      <path d={m.d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Dashboard() {
  const [period, setPeriod] = useState<Period>('today');
  const [custom, setCustom] = useState({ from: todayIso(), to: todayIso() });
  const [item, setItem] = useState<string | null>(null);

  const q = { period, ...(period === 'custom' ? custom : {}), item };
  const { data, mutate, isLoading } = useSWR(
    ['dashboard', period, custom.from, custom.to, item],
    () => adminApi.dashboard(q),
    { refreshInterval: period === 'today' ? 60_000 : 0, keepPreviousData: true },
  );

  useRealtime({ 'bill:settled': () => period === 'today' && mutate() }, { staff: true });

  if (isLoading || !data) return <LoadingScreen label="Crunching the numbers…" />;

  const { kpis, topItems, itemProfile, trend, categories, payments, staff, live } = data;
  const symbol = data.currency_symbol;
  const vs = COMPARED_TO[period];
  // Pending bills is live state, not a figure for the chosen window, so it
  // sits with the rest of the floor rather than among the period tiles.
  const periodKpis = kpis.filter((k) => !k.live);
  const [headline, ...rest] = periodKpis;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink-800">Analytics</h2>
          <p className="text-sm text-ink-500">
            {PERIOD_LABEL[period]} · compared with {vs}
            <span className="text-ink-400"> · times in {data.range.tz.replace('_', ' ')}</span>
          </p>
        </div>
        <PeriodPicker
          value={period} onChange={setPeriod}
          from={custom.from} to={custom.to}
          onCustom={(from, to) => setCustom({ from, to })}
        />
      </header>

      {/* The one number the dashboard leads with, then the supporting row. */}
      <section aria-label="Headline figures" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-1">
          <Kpi hero label={headline.label} value={show(headline, symbol)}
               change={headline.change} comparedTo={vs} />
        </div>
        {rest.map((k) => (
          <Kpi key={k.key} label={k.label} value={show(k, symbol)} change={k.change}
               lowerIsBetter={k.lowerIsBetter} live={k.live} comparedTo={vs} />
        ))}
      </section>

      {/* ---------------------------------------- the item × time panel */}
      <section className="card p-5" aria-label="When an item sells">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h3 className="font-bold text-ink-800">
              {itemProfile?.item.item_name ?? 'Sales'} <span className="font-normal text-ink-500">by hour</span>
            </h3>
            <p className="text-sm text-ink-500">
              {itemProfile
                ? `${itemProfile.item.quantity} sold across ${itemProfile.item.orders} orders`
                : 'Pick an item below'}
            </p>
          </div>
          {item && (
            <button type="button" onClick={() => setItem(null)} className="btn-ghost btn-sm">
              Back to best seller
            </button>
          )}
        </div>
        <div className="mt-4">
          {itemProfile && (
            <HourColumns
              data={itemProfile.hourly}
              valueOf={(d) => d.quantity ?? 0}
              format={(n) => `${n} sold`}
              caption={`Units of ${itemProfile.item.item_name} sold in each hour of the day`}
            />
          )}
        </div>
        {itemProfile?.peak_hour !== null && itemProfile && (
          <p className="mt-3 rounded-xl bg-ink-100 px-3.5 py-2.5 text-[13px] leading-relaxed text-ink-600">
            <Icon name="info" className="mr-1 inline h-3.5 w-3.5 -translate-y-px" />
            Demand concentrates around <strong className="font-semibold">{itemProfile.peak_label}</strong>.
            Prep for this one against that peak rather than spreading it across the day.
          </p>
        )}
      </section>

      {/* ---------------------------------------- top sellers */}
      <section className="card overflow-hidden" aria-label="Top selling items">
        <div className="flex items-baseline justify-between px-5 pt-5">
          <h3 className="font-bold text-ink-800">Top sellers</h3>
          <p className="text-xs text-ink-500">Select a row to see its hours</p>
        </div>
        <div className="px-5 pt-1">
          <p className="text-xs text-ink-400">
            Revenue here is what was <strong className="font-semibold text-ink-500">ordered</strong>,
            including tables still open. Gross sales above counts money
            <strong className="font-semibold text-ink-500"> collected</strong> on settled bills.
          </p>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[34rem]">
            <thead>
              <tr className="border-y border-ink-100 bg-ink-50">
                <th className="table-head">Item</th>
                <th className="table-head text-right">Qty</th>
                <th className="table-head text-right">Revenue</th>
                <th className="table-head text-right">Share</th>
                <th className="table-head text-center">Trend</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {topItems.map((t) => {
                const key = t.menu_item_id ?? t.item_name;
                const fallback = topItems[0] ? topItems[0].menu_item_id ?? topItems[0].item_name : null;
                const on = (item ?? fallback) === key;
                return (
                  <tr
                    key={key}
                    onClick={() => setItem(key)}
                    className={`cursor-pointer transition-colors hover:bg-brand-50 ${on ? 'bg-brand-50' : ''}`}
                  >
                    <td className="table-cell">
                      <button type="button" className="text-left font-semibold text-ink-800 focus:outline-none focus-visible:underline">
                        {t.item_name}
                      </button>
                    </td>
                    <td className="table-cell text-right tabular-nums">{t.quantity}</td>
                    <td className="table-cell text-right tabular-nums">{money(t.revenue, symbol)}</td>
                    <td className="table-cell">
                      <div className="flex items-center justify-end gap-2">
                        <span className="tabular-nums">{t.share_quantity}%</span>
                        {/* A reading aid for the number beside it, kept recessive
                            so it never competes with the value itself. */}
                        <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-ink-100 sm:block">
                          <span className="block h-full rounded-full bg-brand-500"
                                style={{ width: `${Math.max(t.share_quantity, 2)}%` }} />
                        </span>
                      </div>
                    </td>
                    <td className="table-cell">
                      <span className="flex items-center justify-center gap-1">
                        <TrendMark trend={t.trend} />
                        {t.change !== null && t.trend !== 'flat' && (
                          <span className="text-[11px] tabular-nums text-ink-500">{Math.abs(t.change)}%</span>
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {!topItems.length && (
                <tr><td colSpan={5} className="table-cell py-8 text-center text-ink-500">Nothing sold in this period.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------------------------------------- trade shape + trend */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-5" aria-label="Takings by hour">
          <h3 className="font-bold text-ink-800">Takings <span className="font-normal text-ink-500">by hour</span></h3>
          <p className="mb-4 text-sm text-ink-500">When the money comes in, across the whole menu</p>
          <HourColumns
            data={data.hourly}
            valueOf={(d) => d.revenue ?? 0}
            format={(n) => rupees(n, symbol)}
            caption="Revenue settled in each hour of the day"
          />
        </section>

        <section className="card p-5" aria-label="Revenue per day">
          <h3 className="font-bold text-ink-800">Revenue <span className="font-normal text-ink-500">per day</span></h3>
          <p className="mb-4 text-sm text-ink-500">Each day in the selected period</p>
          {trend.length > 1
            ? <TrendLine data={trend} symbol={symbol} />
            : <p className="py-10 text-center text-sm text-ink-500">Pick a longer period to see a trend.</p>}
        </section>
      </div>

      {/* ---------------------------------------- splits */}
      <div className="grid gap-4 lg:grid-cols-3">
        {([
          ['Categories', categories.map((c) => [c.category, money(c.revenue, symbol)] as const)],
          ['Payment methods', payments.map((p) => [p.method, money(p.amount, symbol)] as const)],
          ['Settled by', staff.map((s) => [s.staff, money(s.amount, symbol)] as const)],
        ] as const).map(([title, rows]) => (
          <section key={title} className="card p-5">
            <h3 className="mb-3 font-bold text-ink-800">{title}</h3>
            {rows.length ? (
              <dl className="space-y-2 text-sm">
                {rows.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3">
                    <dt className="truncate text-ink-600">{k}</dt>
                    <dd className="shrink-0 font-semibold tabular-nums text-ink-800">{v}</dd>
                  </div>
                ))}
              </dl>
            ) : <p className="text-sm text-ink-500">Nothing yet.</p>}
          </section>
        ))}
      </div>

      {/* ---------------------------------------- live floor */}
      <section className="card p-5" aria-label="Right now">
        <h3 className="mb-3 font-bold text-ink-800">Right now</h3>
        <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
          {([
            ['Open tables', live.open_tables],
            ['Bill requests', live.bill_requests],
            ['In the kitchen', live.orders_in_kitchen],
            ['Pending bills', live.pending_bills],
            ['Unbilled value', money(live.open_table_value, symbol)],
          ] as const).map(([k, v]) => (
            <div key={k}>
              <p className="text-xs text-ink-500">{k}</p>
              <p className="text-lg font-bold tabular-nums text-ink-800">{v}</p>
            </div>
          ))}
          <Link href="/supervisor" className="btn-secondary btn-sm ml-auto self-center">Open the floor</Link>
        </div>
      </section>
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
