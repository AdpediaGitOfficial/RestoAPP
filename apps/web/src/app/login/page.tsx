'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authApi, setToken } from '@/lib/api';
import { Spinner } from '@/components/ui';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
      router.replace(next && next !== '/login' ? next : landingFor(user.role));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign you in');
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-xl font-bold text-white">R</span>
          <h1 className="mt-4 text-xl font-bold text-slate-900">Staff sign in</h1>
          <p className="mt-1 text-sm text-slate-500">Kitchen, floor supervisors and admins</p>
        </div>

        <form onSubmit={submit} className="card space-y-4 p-6">
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input
              id="email" type="email" required autoComplete="username" className="input"
              value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@cafe.com"
            />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input
              id="password" type="password" required autoComplete="current-password" className="input"
              value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
            />
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">{error}</p>
          )}

          <button type="submit" disabled={busy} className="btn-primary w-full py-3">
            {busy ? <><Spinner className="h-4 w-4 text-white" /> Signing in…</> : 'Sign in'}
          </button>
        </form>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><Spinner className="h-8 w-8" /></div>}>
      <LoginForm />
    </Suspense>
  );
}
