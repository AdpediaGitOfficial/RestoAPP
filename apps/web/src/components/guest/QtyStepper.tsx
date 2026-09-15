'use client';

import Icon from '@/components/Icon';

export default function QtyStepper({ value, onChange, min = 0, max = 30, tone = 'soft' }: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  tone?: 'soft' | 'solid';
}) {
  const shell = tone === 'solid'
    ? 'bg-brand-500 text-white'
    : 'bg-brand-50 text-brand-700 ring-1 ring-brand-200';

  return (
    <div className={`inline-flex items-center rounded-xl ${shell}`}>
      <button
        type="button"
        aria-label="Decrease quantity"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="flex h-9 w-9 items-center justify-center transition active:scale-90 disabled:opacity-40"
      >
        <Icon name="minus" className="h-3.5 w-3.5" strokeWidth={2.4} />
      </button>
      <span className="min-w-[1.5rem] text-center text-[13.5px] font-bold tabular-nums" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        aria-label="Increase quantity"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="flex h-9 w-9 items-center justify-center transition active:scale-90 disabled:opacity-40"
      >
        <Icon name="plus" className="h-3.5 w-3.5" strokeWidth={2.4} />
      </button>
    </div>
  );
}
