'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authApi, setToken } from '@/lib/api';
import { Spinner } from '@/components/ui';
import Icon, { type IconName } from '@/components/Icon';

/**
 * Staff sign-in. Two panels: the product's face on the left, the form on the
 * right. On a phone the brand panel shrinks to a header strip so the password
 * field is never pushed below the fold — staff sign in at the start of every
 * shift and should not have to scroll to do it.
 */

/** What the app actually does — each one is a screen that exists. */
const FEATURES: { icon: IconName; title: string; note: string }[] = [
  { icon: 'qr', title: 'QR table ordering', note: 'Guests order from the table' },
  { icon: 'flame', title: 'Kitchen display', note: 'Live order tickets' },
  { icon: 'receipt', title: 'Billing', note: 'Bill requests and payment' },
  { icon: 'chart', title: 'Daily metrics', note: 'Covers, sales, top sellers' },
];

/**
 * The hero photograph is optional. It layers under two scrims, so if
 * public/login-hero.jpg is absent the request 404s, the layer is dropped and
 * the gradient below carries the panel on its own — drop the file in and it
 * appears, with no code change.
 */
const HERO: React.CSSProperties = {
  backgroundImage: [
    'linear-gradient(100deg, rgb(20 20 24 / 0.92) 12%, rgb(20 20 24 / 0.55) 62%, rgb(20 20 24 / 0.78) 100%)',
    'radial-gradient(120% 90% at 8% 100%, rgb(217 43 60 / 0.34), transparent 58%)',
    "url('/login-hero.jpg')",
    'linear-gradient(155deg, #26262C, #131317)',
  ].join(','),
  backgroundSize: 'cover',
  backgroundPosition: 'center',
};

function BrandPanel() {
  return (
    <section
      style={HERO}
      className="relative flex items-center overflow-hidden px-6 py-9 text-white lg:px-[7vw] lg:py-16"
    >
      <div className="relative z-10 w-full max-w-[620px]">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-500 shadow-pill">
            <Icon name="plate" className="h-5 w-5 text-white" strokeWidth={1.8} />
          </span>
          <span className="text-[22px] font-bold tracking-[-0.03em]">RestoApp</span>
        </div>

        {/* The story appears from tablet width up. On a phone the panel is
            just a header strip so the form starts immediately. */}
        <div className="hidden md:block">
          <p className="mt-12 text-[12px] font-bold uppercase tracking-[0.22em] text-brand-300 lg:mt-20">
            Restaurant management system
          </p>
          <h1 className="mt-4 text-[clamp(2.25rem,4.6vw,4.5rem)] font-bold leading-[1.02] tracking-[-0.035em]">
            Run your restaurant.
            <br />
            <span className="text-brand-300">Simply.</span>
          </h1>
          <p className="mt-6 max-w-[34rem] text-[17px] leading-relaxed text-white/75">
            Table sessions, kitchen tickets, billing and the day&rsquo;s numbers — connected in
            one system.
          </p>

          <ul className="mt-10 hidden grid-cols-2 gap-3 lg:grid">
            {FEATURES.map((f) => (
              <li
                key={f.title}
                className="rounded-2xl bg-white/[0.07] px-4 py-3.5 ring-1 ring-white/15"
              >
                <span className="mb-2.5 grid h-8 w-8 place-items-center rounded-lg bg-white/10">
                  <Icon name={f.icon} className="h-4 w-4 text-white" />
                </span>
                <p className="text-[13px] font-semibold">{f.title}</p>
                <p className="mt-0.5 text-[11px] text-white/70">{f.note}</p>
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-1.5 text-sm text-white/70 md:hidden">
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

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [hint, setHint] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const landingFor = (role: string) =>
    role === 'KITCHEN' ? '/kitchen' : role === 'SUPERVISOR' ? '/supervisor' : '/admin';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { token, user } = await authApi.login(email.trim(), password);
      setToken(token);
      // The role on the token decides where you land — never a client choice.
      router.replace(next && next !== '/login' ? next : landingFor(user.role));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign you in');
      setBusy(false);
    }
  };

  return (
    <section className="flex items-start justify-center bg-ink-50 px-5 py-10 lg:items-center lg:px-10 lg:py-12">
      <div className="card w-full max-w-[30rem] p-6 sm:p-9">
        <h2 className="text-[28px] font-bold tracking-[-0.03em] text-ink-800 sm:text-[32px]">
          Welcome back
        </h2>
        <p className="mt-1.5 text-sm text-ink-500">Sign in to continue</p>

        <form onSubmit={submit} className="mt-7 space-y-4">
          <div>
            <label className="label" htmlFor="email">Email</label>
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
                placeholder="you@cafe.com"
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="password">Password</label>
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
                placeholder="••••••••"
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

          <div className="flex justify-end pt-0.5">
            <button
              type="button"
              onClick={() => setHint((v) => !v)}
              aria-expanded={hint}
              className="text-[13px] font-semibold text-brand-600 hover:text-brand-700"
            >
              Forgot password?
            </button>
          </div>
          {hint && (
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
          RestoApp · Restaurant management system
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
