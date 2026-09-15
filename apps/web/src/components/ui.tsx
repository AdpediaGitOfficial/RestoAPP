'use client';

import { useEffect, useState } from 'react';

export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={`animate-spin text-brand-600 ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

export function LoadingScreen({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-slate-500">
      <Spinner className="h-8 w-8" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function EmptyState({ icon = '🍽️', title, hint, action }: {
  icon?: string; title: string; hint?: string; action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-12 text-center">
      <span className="text-3xl" aria-hidden>{icon}</span>
      <p className="font-semibold text-slate-700">{title}</p>
      {hint && <p className="max-w-sm text-sm text-slate-500">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-rose-50 p-4 text-sm text-rose-800 ring-1 ring-rose-200">
      <span aria-hidden>⚠️</span>
      <div className="flex-1">
        <p>{message}</p>
        {onRetry && (
          <button type="button" onClick={onRetry} className="mt-2 font-semibold underline underline-offset-2">
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

/** Small transient confirmation, bottom-centre so it clears the thumb zone. */
export function Toast({ message, tone = 'success', onDone }: {
  message: string; tone?: 'success' | 'error'; onDone: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDone, 3200);
    return () => clearTimeout(t);
  }, [onDone, message]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-24 left-1/2 z-50 w-[min(92vw,26rem)] -translate-x-1/2 animate-slide-up rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg ${
        tone === 'success' ? 'bg-slate-900' : 'bg-rose-600'
      }`}
    >
      {message}
    </div>
  );
}

export function useToast() {
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);
  return {
    toast,
    show: (message: string, tone: 'success' | 'error' = 'success') => setToast({ message, tone }),
    clear: () => setToast(null),
  };
}

/** Bottom sheet on phones, centred dialog from `sm` up. */
export function Sheet({ open, onClose, title, children, footer }: {
  open: boolean; onClose: () => void; title: string;
  children: React.ReactNode; footer?: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 animate-fade-in bg-slate-900/40 backdrop-blur-[2px]" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex max-h-[92vh] w-full animate-slide-up flex-col rounded-t-3xl bg-white shadow-xl sm:max-w-lg sm:rounded-3xl"
      >
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Close">
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" /></svg>
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-slate-100 px-5 py-4" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>{footer}</div>}
      </div>
    </div>
  );
}

export function StatusChip({ label, className }: { label: string; className: string }) {
  return <span className={`chip ${className}`}>{label}</span>;
}

/** Veg / non-veg marker, the way Indian menus show it. */
export function FoodTypeMark({ type }: { type: string }) {
  const color = type === 'NON_VEG' ? 'border-rose-600' : type === 'EGG' ? 'border-amber-500' : 'border-emerald-600';
  const dot = type === 'NON_VEG' ? 'bg-rose-600' : type === 'EGG' ? 'bg-amber-500' : 'bg-emerald-600';
  return (
    <span className={`inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border ${color}`} title={type}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
    </span>
  );
}

export function Stepper({ value, onChange, min = 0, max = 50 }: {
  value: number; onChange: (n: number) => void; min?: number; max?: number;
}) {
  return (
    <div className="inline-flex items-center rounded-xl bg-brand-50 ring-1 ring-brand-200">
      <button
        type="button"
        aria-label="Decrease quantity"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="px-3 py-1.5 text-lg font-semibold leading-none text-brand-700 disabled:opacity-40"
      >
        −
      </button>
      <span className="min-w-[2rem] text-center text-sm font-bold text-brand-800" aria-live="polite">{value}</span>
      <button
        type="button"
        aria-label="Increase quantity"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="px-3 py-1.5 text-lg font-semibold leading-none text-brand-700 disabled:opacity-40"
      >
        +
      </button>
    </div>
  );
}
