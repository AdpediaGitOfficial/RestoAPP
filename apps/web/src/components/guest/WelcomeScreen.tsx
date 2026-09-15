'use client';

import { useState } from 'react';
import Icon, { type IconName } from '@/components/Icon';

/**
 * The first thing a guest sees after scanning. Confirms they are at the right
 * table before they start ordering — the one mistake that is expensive to
 * unwind later — and takes a name so staff can address them properly.
 */
export default function WelcomeScreen({ restaurantName, tableLabel, zone, onStart }: {
  restaurantName: string;
  tableLabel: string;
  zone: string;
  onStart: (guestName: string) => void;
}) {
  const [name, setName] = useState('');

  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-ink-900 px-6 text-white">
      {/* Warm ambient wash behind the content. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-brand-600/40 blur-3xl" />
        <div className="absolute -bottom-32 -right-20 h-80 w-80 rounded-full bg-amber-500/20 blur-3xl" />
      </div>

      <div className="relative z-10 flex flex-1 flex-col justify-center py-14">
        <span className="animate-rise-in text-[12px] font-semibold uppercase tracking-[0.22em] text-brand-300">
          {restaurantName}
        </span>

        <h1 className="mt-3 animate-rise-in text-[33px] font-bold leading-[1.08] tracking-[-0.03em]" style={{ animationDelay: '60ms' }}>
          You&apos;re all set.<br />Let&apos;s eat.
        </h1>

        <p className="mt-3 animate-rise-in text-[15px] leading-relaxed text-white/70" style={{ animationDelay: '120ms' }}>
          Order straight from your table — no app, no queue. Add as you go and
          settle it all on one bill when you&apos;re ready.
        </p>

        <div
          className="mt-8 flex animate-rise-in items-center gap-3 rounded-3xl bg-white/10 p-4 ring-1 ring-white/15 backdrop-blur"
          style={{ animationDelay: '180ms' }}
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500 text-white shadow-pill">
            <Icon name="table" className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-white/45">You&apos;re seated at</p>
            <p className="truncate text-[19px] font-bold tracking-[-0.015em]">{tableLabel}</p>
            <p className="text-[12px] text-white/55">{zone}</p>
          </div>
        </div>

        <ol className="mt-7 animate-rise-in space-y-3" style={{ animationDelay: '240ms' }}>
          {([
            ['tray', 'Browse and add', 'Order as many times as you like.'],
            ['flame', 'We start cooking', 'It reaches the kitchen the moment you send it.'],
            ['receipt', 'Pay when you\u2019re ready', 'Ask for the bill right here — one bill for the table.'],
          ] as [IconName, string, string][]).map(([icon, title, body], i) => (
            <li key={title} className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white/70 ring-1 ring-white/10">
                <Icon name={icon} className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="text-[13.5px] font-semibold leading-tight tracking-[-0.01em]">
                  <span className="mr-1.5 text-white/35 tabular-nums">{i + 1}</span>{title}
                </p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-white/50">{body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-7 animate-rise-in" style={{ animationDelay: '280ms' }}>
          <label htmlFor="guest-name" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-white/50">
            Your name <span className="font-medium normal-case tracking-normal text-white/40">(optional)</span>
          </label>
          <input
            id="guest-name"
            className="w-full rounded-2xl border-0 bg-white/10 px-4 py-3.5 text-sm text-white ring-1 ring-white/20 placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-brand-400"
            placeholder="So we know who to look for"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onStart(name.trim())}
          />
        </div>
      </div>

      <div
        className="relative z-10 animate-rise-in pb-6"
        style={{ animationDelay: '300ms', paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
      >
        <button type="button" onClick={() => onStart(name.trim())} className="btn-primary w-full py-4 text-base">
          View the menu
        </button>
        <p className="mt-3 text-center text-xs text-white/40">
          Not your table? Ask a member of staff before ordering.
        </p>
      </div>
    </main>
  );
}
