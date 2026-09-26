'use client';

/**
 * Charts for the owner's dashboard.
 *
 * House rules, applied to every mark here:
 *  - One series, one colour. Bar length already encodes magnitude; shading the
 *    bars by value too would spend the only free channel restating it.
 *  - Marks carry the brand hue; all text wears ink tokens. A red number on a
 *    white card reads as an alert, which is not what a Tuesday lunch is.
 *  - Labels are selective — the peak and the ends, never every point. The
 *    tooltip and the table carry the rest.
 *  - Every mark is hoverable AND focusable, with a hit target larger than the
 *    paint, so the values are reachable by keyboard as well as pointer.
 */

import { useId, useState } from 'react';
import Icon from '@/components/Icon';

const BRAND = '#D92B3C';          // validated as a chart mark: 4.9:1 on white
const BRAND_SOFT = '#FFD7DB';     // the same hue, receded — context, not data
const GRID = '#E2E2E6';           // ink-200, one step off the surface

const compact = (n: number) =>
  n >= 1e7 ? `${(n / 1e7).toFixed(1)}Cr` : n >= 1e5 ? `${(n / 1e5).toFixed(1)}L` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : `${n}`;

/** Money arrives in paise; show it the way a bill does. */
export const rupees = (paise: number, symbol = '₹', short = false) =>
  short ? `${symbol}${compact(Math.round(paise / 100))}` : `${symbol}${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

// ---------------------------------------------------------------- stat tile

/**
 * A headline number with its change against the previous equivalent window.
 * `change` is null when there is nothing to compare against — shown as "new",
 * never as an infinite percentage.
 */
export function Kpi({
  label, value, change, lowerIsBetter = false, live = false, comparedTo, hero = false,
}: {
  label: string;
  value: string;
  change: number | null;
  lowerIsBetter?: boolean;
  live?: boolean;
  comparedTo?: string;
  hero?: boolean;
}) {
  const flat = change !== null && Math.abs(change) < 0.05;
  const good = change === null ? null : flat ? null : lowerIsBetter ? change < 0 : change > 0;

  return (
    <div className="card-flat p-4">
      <p className="text-xs font-semibold text-ink-500">{label}</p>
      {/* Proportional figures: tabular-nums makes a display-size number look loose. */}
      <p className={`mt-1.5 font-bold tracking-[-0.03em] text-ink-800 ${hero ? 'text-[2.5rem] leading-none' : 'text-2xl'}`}>
        {value}
      </p>
      <div className="mt-1.5 flex h-4 items-center gap-1 text-xs">
        {live ? (
          <span className="text-ink-500">right now</span>
        ) : change === null ? (
          <span className="font-semibold text-ink-500">new</span>
        ) : (
          <>
            <span
              className={`inline-flex items-center gap-0.5 font-semibold ${
                good === null ? 'text-ink-500' : good ? 'text-emerald-700' : 'text-brand-700'
              }`}
            >
              {!flat && (
                <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden="true">
                  <path
                    d={change > 0 ? 'M6 10V2M2.5 5.5 6 2l3.5 3.5' : 'M6 2v8M2.5 6.5 6 10l3.5-3.5'}
                    fill="none" stroke="currentColor" strokeWidth="1.8"
                    strokeLinecap="round" strokeLinejoin="round"
                  />
                </svg>
              )}
              {flat ? 'no change' : `${Math.abs(change)}%`}
            </span>
            {comparedTo && <span className="text-ink-400">vs {comparedTo}</span>}
          </>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------- hour columns

/** The API sends only the hours the restaurant traded in, already labelled,
 *  so the chart and any printed report read the day the same way. */
type HourDatum = {
  hour: number; label: string; short_label: string;
  quantity?: number; revenue?: number; bills?: number;
};

/**
 * When something sells, hour by hour. Hours with no trade still occupy their
 * slot — a gap in the axis would read as "closed" rather than "sold none".
 *
 * Only the hours the restaurant actually trades in are drawn: an all-24 axis
 * on a café that opens at 8 spends a third of the width on empty night.
 */
export function HourColumns({
  data, valueOf, format, caption,
}: {
  data: HourDatum[];
  valueOf: (d: HourDatum) => number;
  format: (n: number) => string;
  caption: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const labelId = useId();

  if (!data.length) {
    return <p className="py-10 text-center text-sm text-ink-500">Nothing sold in this period.</p>;
  }
  const max = Math.max(...data.map(valueOf), 1);
  const shown = data;
  const peak = data.reduce((a, b) => (valueOf(b) > valueOf(a) ? b : a));

  return (
    <figure className="m-0">
      <figcaption id={labelId} className="sr-only">{caption}</figcaption>
      <div className="relative flex h-52 items-end gap-[2px]" role="group" aria-labelledby={labelId}>
        {shown.map((d) => {
          const v = valueOf(d);
          const pct = (v / max) * 100;
          const isPeak = d.hour === peak.hour;
          const on = active === d.hour;
          return (
            <button
              key={d.hour}
              type="button"
              // The hit target is the whole column, not the painted bar.
              className="group relative flex h-full flex-1 cursor-default flex-col justify-end rounded-t focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              onMouseEnter={() => setActive(d.hour)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(d.hour)}
              onBlur={() => setActive(null)}
              aria-label={`${d.label}: ${format(v)}`}
            >
              {on && (
                <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink-900 px-2 py-1 text-[11px] text-white shadow-lift">
                  <span className="font-bold">{format(v)}</span>
                  <span className="ml-1.5 text-white/70">{d.label}</span>
                </span>
              )}
              <span
                // Square at the baseline, 4px rounded at the data end.
                className="mx-auto w-full max-w-[24px] rounded-t-[4px] transition-[filter] group-hover:brightness-110"
                style={{
                  height: `${Math.max(pct, v > 0 ? 1.5 : 0)}%`,
                  background: isPeak || on ? BRAND : BRAND_SOFT,
                }}
              />
            </button>
          );
        })}
      </div>

      {/* Axis. Every third hour keeps the ticks from colliding at this width. */}
      <div className="mt-1.5 flex gap-[2px] border-t border-ink-200 pt-1.5">
        {shown.map((d, i) => (
          <span key={d.hour} className="flex-1 text-center text-[10px] tabular-nums text-ink-500">
            {i === 0 || i === shown.length - 1 || d.hour % 3 === 0 ? d.short_label : ''}
          </span>
        ))}
      </div>

      <p className="mt-2 text-xs text-ink-500">
        Busiest at <strong className="font-semibold text-ink-700">{peak.label}</strong>
        {' · '}{format(valueOf(peak))}
      </p>
    </figure>
  );
}

// ---------------------------------------------------------------- trend line

/** Revenue per day. One series, so the caption names it and there is no legend. */
export function TrendLine({ data, symbol }: {
  data: { date: string; revenue: number; bills: number }[];
  symbol: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  if (data.length < 2) return null;

  const W = 720, H = 160, PAD = 6;
  const max = Math.max(...data.map((d) => d.revenue), 1);
  const x = (i: number) => PAD + (i / (data.length - 1)) * (W - PAD * 2);
  const y = (v: number) => H - PAD - (v / max) * (H - PAD * 2);
  const path = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(d.revenue).toFixed(1)}`).join(' ');
  const area = `${path} L${x(data.length - 1).toFixed(1)} ${H} L${x(0).toFixed(1)} ${H} Z`;
  const cur = active === null ? data.length - 1 : active;
  const day = (s: string) => new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

  return (
    <figure className="m-0">
      {/* The readout sits above the plot. Putting it in the axis row let it
          collide with the last date label whenever the pointer was at the end. */}
      <p className="mb-1 text-sm text-ink-700">
        <strong className="font-bold tabular-nums">{rupees(data[cur].revenue, symbol)}</strong>
        <span className="ml-1.5 text-ink-500">
          {day(data[cur].date)}{active === null && ' · latest'}
        </span>
      </p>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
             aria-label={`Revenue per day, ${day(data[0].date)} to ${day(data[data.length - 1].date)}`}>
          {/* Recessive gridlines: hairline, solid, one step off the surface. */}
          {[0, 0.5, 1].map((f) => (
            <line key={f} x1={0} x2={W} y1={y(max * f)} y2={y(max * f)} stroke={GRID} strokeWidth={1} />
          ))}
          <path d={area} fill={BRAND} fillOpacity={0.1} />
          <path d={path} fill="none" stroke={BRAND} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          {/* End marker, ringed in the surface colour so it clears the line. */}
          <circle cx={x(cur)} cy={y(data[cur].revenue)} r={5} fill={BRAND} stroke="#fff" strokeWidth={2} />
          {/* Invisible hit bands — the reader aims at a day, not at a 2px line. */}
          {data.map((d, i) => (
            <rect
              key={d.date} x={x(i) - (W / data.length) / 2} y={0}
              width={W / data.length} height={H} fill="transparent"
              onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}
            />
          ))}
        </svg>
      </div>
      <div className="mt-1 flex items-baseline justify-between text-xs text-ink-500">
        <span>{day(data[0].date)}</span>
        <span>{day(data[data.length - 1].date)}</span>
      </div>
    </figure>
  );
}

// -------------------------------------------------------------- period picker

export type Period = 'today' | 'yesterday' | '7d' | '30d' | 'custom';

export const PERIOD_LABEL: Record<Period, string> = {
  today: 'Today', yesterday: 'Yesterday', '7d': '7 days', '30d': '30 days', custom: 'Custom',
};

/** What each window is measured against, so the deltas can name it. */
export const COMPARED_TO: Record<Period, string> = {
  today: 'yesterday', yesterday: 'the day before', '7d': 'the previous 7 days',
  '30d': 'the previous 30 days', custom: 'the preceding period',
};

export function PeriodPicker({ value, onChange, from, to, onCustom }: {
  value: Period;
  onChange: (p: Period) => void;
  from: string;
  to: string;
  onCustom: (from: string, to: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="radiogroup" aria-label="Reporting period" className="flex flex-wrap gap-1.5">
        {(Object.keys(PERIOD_LABEL) as Period[]).map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={value === p}
            onClick={() => onChange(p)}
            className={value === p ? 'pill-on' : 'pill-off'}
          >
            {PERIOD_LABEL[p]}
          </button>
        ))}
      </div>
      {value === 'custom' && (
        <div className="flex items-center gap-1.5">
          <input type="date" value={from} max={to} onChange={(e) => onCustom(e.target.value, to)}
                 className="input w-auto py-2 text-xs" aria-label="From date" />
          <Icon name="arrowLeft" className="h-3 w-3 rotate-180 text-ink-400" />
          <input type="date" value={to} min={from} onChange={(e) => onCustom(from, e.target.value)}
                 className="input w-auto py-2 text-xs" aria-label="To date" />
        </div>
      )}
    </div>
  );
}
