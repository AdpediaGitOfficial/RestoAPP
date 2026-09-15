'use client';

import { moneyShort } from '@/lib/format';

/**
 * Small dependency-free charts. A whole charting library would be more
 * than these three widgets need, and this keeps the admin bundle light.
 */

export function StatTile({ label, value, sub, tone = 'default' }: {
  label: string; value: string | number; sub?: string; tone?: 'default' | 'good' | 'warn';
}) {
  const toneClass = tone === 'good' ? 'text-emerald-700' : tone === 'warn' ? 'text-brand-700' : 'text-slate-900';
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${toneClass}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

export function BarChart({ data, label }: {
  data: { label: string; value: number }[];
  label: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div role="img" aria-label={label} className="space-y-2">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-3">
          <span className="w-28 shrink-0 truncate text-xs text-slate-600" title={d.label}>{d.label}</span>
          <div className="h-5 flex-1 overflow-hidden rounded-md bg-slate-100">
            <div
              className="h-full rounded-md bg-brand-500 transition-all"
              style={{ width: `${Math.max(2, (d.value / max) * 100)}%` }}
            />
          </div>
          <span className="w-20 shrink-0 text-right text-xs font-semibold text-slate-700">
            {moneyShort(d.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Revenue by hour of the day — shows the lunch and evening peaks. */
export function HourlyChart({ data }: { data: { hour: number; revenue: number; bills: number }[] }) {
  const byHour = new Map(data.map((d) => [d.hour, d]));
  const hours = Array.from({ length: 24 }, (_, h) => byHour.get(h) ?? { hour: h, revenue: 0, bills: 0 });
  const max = Math.max(1, ...hours.map((h) => h.revenue));
  const busiest = hours.reduce((a, b) => (b.revenue > a.revenue ? b : a), hours[0]);

  return (
    <div>
      <div className="flex h-36 items-end gap-[3px]" role="img" aria-label="Revenue by hour">
        {hours.map((h) => (
          <div key={h.hour} className="group relative flex-1">
            <div
              className={`w-full rounded-t transition-all ${h.revenue > 0 ? 'bg-brand-400 group-hover:bg-brand-600' : 'bg-slate-100'}`}
              style={{ height: `${Math.max(3, (h.revenue / max) * 130)}px` }}
            />
            <span className="pointer-events-none absolute -top-7 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-slate-900 px-1.5 py-0.5 text-[10px] text-white group-hover:block">
              {h.hour}:00 · {moneyShort(h.revenue)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-slate-400">
        <span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>11pm</span>
      </div>
      {busiest.revenue > 0 && (
        <p className="mt-2 text-xs text-slate-500">
          Busiest hour: <span className="font-semibold text-slate-700">{busiest.hour}:00–{busiest.hour + 1}:00</span> ({moneyShort(busiest.revenue)})
        </p>
      )}
    </div>
  );
}

/** Revenue over the last N days, as a sparkline with a baseline. */
export function TrendChart({ data }: { data: { date: string; revenue: number; bills: number }[] }) {
  if (data.length === 0) return null;
  const max = Math.max(1, ...data.map((d) => d.revenue));
  const w = 100;
  const h = 34;
  const points = data.map((d, i) => {
    const x = (i / Math.max(1, data.length - 1)) * w;
    const y = h - (d.revenue / max) * (h - 4) - 2;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-28 w-full" role="img" aria-label="Revenue trend">
        <polyline
          points={`0,${h} ${points.join(' ')} ${w},${h}`}
          fill="rgb(212 108 42 / 0.12)"
          stroke="none"
        />
        <polyline
          points={points.join(' ')}
          fill="none"
          stroke="rgb(187 84 31)"
          strokeWidth="1.2"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-slate-400">
        <span>{new Date(data[0].date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
        <span>{new Date(data[data.length - 1].date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
      </div>
    </div>
  );
}
