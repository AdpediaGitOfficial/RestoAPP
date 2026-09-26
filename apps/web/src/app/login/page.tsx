'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authApi, setToken } from '@/lib/api';
import { Spinner } from '@/components/ui';
import Icon, { type IconName } from '@/components/Icon';
import type { Role } from '@/lib/types';

/**
 * Staff sign-in. Two panels: the product's face on the left, the form on the
 * right. On a phone the brand panel shrinks to a header strip so the password
 * field is never pushed below the fold — staff sign in at the start of every
 * shift and should not have to scroll to do it.
 */

/** The mockup sets its field labels in sentence case; the shared .label
 *  class uppercases them for the dense staff tables, so this screen uses
 *  its own rather than changing that everywhere. */
const LABEL = 'mb-2.5 block text-xs font-bold text-ink-700';

/** What the app actually does — each one is a screen that exists. */
const FEATURES: { icon: IconName; title: string; note: string }[] = [
  { icon: 'qr', title: 'QR Ordering', note: 'Tables & orders' },
  { icon: 'flame', title: 'Kitchen', note: 'Live order tickets' },
  { icon: 'receipt', title: 'Billing', note: 'Fast payments' },
  { icon: 'chart', title: 'Analytics', note: 'Daily performance' },
];

/**
 * Where the tiles take you. This is a destination, not a permission: the role
 * on the token is what actually grants access, and StaffShell turns away
 * anyone who reaches a screen their role does not cover. Asking for a screen
 * you are not entitled to simply lands you on your own, so a wrong tap can
 * never lock anyone out.
 */
const DESTINATIONS: {
  key: string;
  icon: IconName;
  label: string;
  note: string;
  href: string;
  roles: Role[];
}[] = [
  { key: 'staff', icon: 'user', label: 'Staff', note: 'Orders & Billing', href: '/supervisor', roles: ['SUPERVISOR', 'ADMIN'] },
  { key: 'kitchen', icon: 'flame', label: 'Kitchen', note: 'View Orders', href: '/kitchen', roles: ['KITCHEN', 'SUPERVISOR', 'ADMIN'] },
  { key: 'manager', icon: 'chart', label: 'Manager', note: 'Reports & Menu', href: '/admin', roles: ['ADMIN'] },
  { key: 'admin', icon: 'sliders', label: 'Admin', note: 'All Settings', href: '/admin/settings', roles: ['ADMIN'] },
];

/** Where a role lands when the tile it chose is not open to it. */
const homeFor = (role: Role) =>
  role === 'KITCHEN' ? '/kitchen' : role === 'SUPERVISOR' ? '/supervisor' : '/admin';

/**
 * The hero photograph sits under two scrims: one that darkens the left third
 * so the headline stays readable over whatever is in the shot, and a crimson
 * glow at the bottom. The gradient underneath is not redundant — if the image
 * ever fails to load the browser drops that layer and the panel still reads.
 */
const HERO: React.CSSProperties = {
  backgroundImage: [
    // Horizontal: darkest under the headline on the left.
    'linear-gradient(100deg, rgb(20 20 24 / 0.90) 10%, rgb(20 20 24 / 0.58) 58%, rgb(20 20 24 / 0.78) 100%)',
    // Vertical: the body copy and the tiles sit low, where the room is
    // brightest, so the bottom needs more cover than the top.
    'linear-gradient(180deg, rgb(20 20 24 / 0.20) 0%, rgb(20 20 24 / 0.20) 30%, rgb(20 20 24 / 0.64) 100%)',
    'radial-gradient(120% 90% at 8% 100%, rgb(217 43 60 / 0.30), transparent 58%)',
    "url('/login-hero.webp')",
    'linear-gradient(155deg, #26262C, #131317)',
  ].join(','),
  backgroundSize: 'cover',
  backgroundPosition: 'center',
};

function BrandPanel() {
  return (
    <section
      style={HERO}
      className="relative flex items-center overflow-hidden px-6 py-9 text-white lg:px-[6vw] lg:py-16"
    >
      <div className="relative z-10 w-full max-w-[640px]">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand-500 shadow-pill">
            <Icon name="plate" className="h-5 w-5 text-white" strokeWidth={1.8} />
          </span>
          <span className="text-[26px] font-bold tracking-[-0.03em]">RestoApp</span>
        </div>

        {/* The story appears from tablet width up. On a phone the panel is
            just a header strip so the form starts immediately. */}
        <div className="hidden md:block">
          <p className="mt-12 text-[12px] font-bold uppercase tracking-[0.22em] text-brand-200 lg:mt-20">
            Restaurant management system
          </p>
          <h1 className="mt-4 text-[clamp(2.25rem,4.6vw,4.5rem)] font-bold leading-[1.02] tracking-[-0.035em]">
            Run your restaurant.
            <br />
            <span className="text-brand-300">Simply.</span>
          </h1>
          <p className="mt-6 max-w-[34rem] text-[17px] leading-relaxed text-white/75">
            Table sessions, kitchen orders, billing and restaurant operations — connected in one
            simple system.
          </p>

          <ul className="mt-10 hidden gap-3 lg:grid lg:grid-cols-4">
            {FEATURES.map((f) => (
              <li
                key={f.title}
                className="rounded-2xl bg-white/[0.07] px-4 py-3.5 ring-1 ring-white/15"
              >
                <span className="mb-2.5 grid h-8 w-8 place-items-center rounded-lg bg-white/10">
                  <Icon name={f.icon} className="h-4 w-4 text-white" />
                </span>
                <p className="text-[13px] font-semibold">{f.title}</p>
                <p className="mt-0.5 text-[11px] text-white/85">{f.note}</p>
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-1.5 text-sm text-white/85 md:hidden">
          Kitchen, floor supervisors and admins
        </p>
      </div>
    </section>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next');

  const [dest, setDest] = useState(DESTINATIONS[0]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [reveal, setReveal] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { token, user } = await authApi.login(email.trim(), password);
      setToken(token, remember);
      // Arriving here from a protected page wins over the tile: that is where
      // the user was actually trying to go.
      if (next && next !== '/login') return router.replace(next);
      // The role on the token is the authority; the tile is only a request.
      const allowed = user.role === 'ADMIN' || dest.roles.includes(user.role);
      router.replace(allowed ? dest.href : homeFor(user.role));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign you in');
      setBusy(false);
    }
  };

  return (
    <section className="flex items-start justify-center bg-ink-50 px-5 py-10 lg:items-center lg:px-10 lg:py-12">
      <div className="card w-full max-w-[34rem] p-6 sm:p-10">
        <h2 className="text-[28px] font-bold tracking-[-0.04em] text-ink-800 sm:text-[34px]">
          Welcome back
        </h2>
        <p className="mt-1.5 text-sm text-ink-500">Sign in as {dest.label} to continue</p>

        <p className={`${LABEL} mt-7`}>Select your role</p>
        <div
          role="radiogroup"
          aria-label="Select your role"
          className="grid grid-cols-2 gap-2.5 sm:grid-cols-4"
        >
          {DESTINATIONS.map((d) => {
            const on = d.key === dest.key;
            return (
              <button
                key={d.key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setDest(d)}
                className={`rounded-2xl px-2 py-3.5 text-center transition-all duration-150 active:scale-[0.97] ${
                  on
                    ? 'bg-brand-600 text-white shadow-pill'
                    : 'bg-white text-ink-700 ring-1 ring-ink-200 hover:ring-brand-300'
                }`}
              >
                <Icon
                  name={d.icon}
                  className={`mx-auto h-[18px] w-[18px] ${on ? 'text-white' : 'text-ink-500'}`}
                />
                <span className="mt-2 block text-[12px] font-bold">{d.label}</span>
                <span className={`mt-0.5 block text-[10px] ${on ? 'text-white/85' : 'text-ink-500'}`}>
                  {d.note}
                </span>
              </button>
            );
          })}
        </div>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label className={LABEL} htmlFor="email">Email or Username</label>
            <div className="relative">
              <Icon
                name="user"
                className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ink-400"
              />
              <input
                id="email"
                type="email"
                required
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                className="input h-[3.25rem] pl-11"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email or username"
              />
            </div>
          </div>

          <div>
            <label className={LABEL} htmlFor="password">Password</label>
            <div className="relative">
              <Icon
                name="lock"
                className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ink-400"
              />
              <input
                id="password"
                type={reveal ? 'text' : 'password'}
                required
                autoComplete="current-password"
                className="input h-[3.25rem] pl-11 pr-12"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
              />
              <button
                type="button"
                onClick={() => setReveal((v) => !v)}
                aria-label={reveal ? 'Hide password' : 'Show password'}
                aria-pressed={reveal}
                className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center
                           rounded-lg text-ink-400 hover:bg-ink-100 hover:text-ink-600"
              >
                <Icon name={reveal ? 'eyeOff' : 'eye'} className="h-[18px] w-[18px]" />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 pt-0.5">
            <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-ink-600">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-4 w-4 cursor-pointer rounded accent-brand-500"
              />
              Remember me
            </label>
            <button
              type="button"
              onClick={() => setShowReset((v) => !v)}
              aria-expanded={showReset}
              className="text-[13px] font-semibold text-brand-600 hover:text-brand-700"
            >
              Forgot password?
            </button>
          </div>

          {showReset && (
            <p className="rounded-xl bg-ink-100 px-3.5 py-2.5 text-[13px] leading-relaxed text-ink-600">
              Passwords are reset by an admin, under <strong className="font-semibold">Admin
              &rarr; Staff</strong>. Ask whoever manages the account to set you a new one.
            </p>
          )}

          {error && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-xl bg-brand-50 px-3.5 py-2.5 text-sm
                         text-brand-700 ring-1 ring-brand-200"
            >
              <Icon name="alert" className="mt-px h-4 w-4 shrink-0" />
              {error}
            </p>
          )}

          <button type="submit" disabled={busy} className="btn-primary h-[3.375rem] w-full text-[15px]">
            {busy ? (
              <>
                <Spinner className="h-4 w-4 text-white" /> Signing in…
              </>
            ) : (
              <>
                Sign in
                <Icon name="chevronRight" className="h-4 w-4" strokeWidth={2} />
              </>
            )}
          </button>
        </form>

        <p className="mt-7 text-center text-[11px] text-ink-500">
          RestoApp · Restaurant Management System
        </p>
      </div>
    </section>
  );
}

export default function LoginPage() {
  return (
    <main className="grid min-h-[100dvh] grid-rows-[auto_1fr] lg:grid-cols-[1.05fr_0.95fr] lg:grid-rows-1">
      <BrandPanel />
      <Suspense
        fallback={
          <div className="flex items-center justify-center bg-ink-50">
            <Spinner className="h-8 w-8" />
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </main>
  );
}
