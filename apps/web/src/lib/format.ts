export const money = (minor: number | null | undefined, symbol = '₹') =>
  `${symbol}${((minor ?? 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Compact form for dashboard tiles: ₹1.2L, ₹45.6k */
export const moneyShort = (minor: number, symbol = '₹') => {
  const major = (minor ?? 0) / 100;
  if (major >= 100000) return `${symbol}${(major / 100000).toFixed(1)}L`;
  if (major >= 1000) return `${symbol}${(major / 1000).toFixed(1)}k`;
  return `${symbol}${major.toFixed(0)}`;
};

export const time = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—';

export const dateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

/** "3m ago", "1h 20m" — used all over the kitchen and floor screens. */
export function elapsed(iso: string | null | undefined) {
  if (!iso) return '—';
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
}

/** Bare duration without the "ago" suffix — for ticket age badges. */
export function duration(iso: string | null | undefined) {
  if (!iso) return '—';
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return '<1m';
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export const minutesSince = (iso: string | null | undefined) =>
  iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 60000) : 0;

/** "1 bill" / "3 bills" — avoids the "1 bills" that reads as a bug. */
export const plural = (count: number, singular: string, pluralForm = `${singular}s`) =>
  `${count} ${count === 1 ? singular : pluralForm}`;

export const todayIso = () => new Date().toISOString().slice(0, 10);

export const FOOD_TYPE_LABEL: Record<string, string> = {
  VEG: 'Veg', NON_VEG: 'Non-veg', EGG: 'Egg', VEGAN: 'Vegan',
};

export const ORDER_STATUS_LABEL: Record<string, string> = {
  PLACED: 'Sent to kitchen', ACCEPTED: 'Accepted', PREPARING: 'Being prepared',
  READY: 'Ready', SERVED: 'Served', CANCELLED: 'Cancelled',
};

export const ORDER_STATUS_STYLE: Record<string, string> = {
  PLACED: 'bg-amber-100 text-amber-800 ring-amber-200',
  ACCEPTED: 'bg-sky-100 text-sky-800 ring-sky-200',
  PREPARING: 'bg-indigo-100 text-indigo-800 ring-indigo-200',
  READY: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  SERVED: 'bg-slate-100 text-slate-700 ring-slate-200',
  CANCELLED: 'bg-rose-100 text-rose-800 ring-rose-200',
};
