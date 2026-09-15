'use client';

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
        className="px-2.5 py-1.5 text-lg font-bold leading-none transition active:scale-90 disabled:opacity-40"
      >
        −
      </button>
      <span className="min-w-[1.75rem] text-center text-sm font-extrabold tabular-nums" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        aria-label="Increase quantity"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="px-2.5 py-1.5 text-lg font-bold leading-none transition active:scale-90 disabled:opacity-40"
      >
        +
      </button>
    </div>
  );
}
