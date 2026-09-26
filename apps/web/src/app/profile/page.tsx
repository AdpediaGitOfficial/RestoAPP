'use client';

import { useState } from 'react';
import StaffShell from '@/components/staff/StaffShell';
import { authApi } from '@/lib/api';
import { Spinner, Toast, useToast } from '@/components/ui';
import type { StaffUser } from '@/lib/types';

/**
 * The signed-in person's own account.
 *
 * Every role reaches this, unlike everything else under the account menu —
 * a kitchen login is still somebody's login, and changing your own password
 * should not need an admin. Who may do what is a separate screen
 * (Staff, admin only); this one is only ever about you.
 */
function Profile({ user }: { user: StaffUser }) {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const mismatch = confirm.length > 0 && next !== confirm;
  const tooShort = next.length > 0 && next.length < 8;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (next !== confirm) return setError('The two new passwords do not match.');
    if (next.length < 8) return setError('Use at least 8 characters.');
    setBusy(true);
    try {
      await authApi.changePassword(current, next);
      setCurrent(''); setNext(''); setConfirm('');
      toast.show('Password changed. It applies the next time you sign in.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change your password');
    } finally {
      setBusy(false);
    }
  };

  const ROLE_NOTE: Record<string, string> = {
    ADMIN: 'Full access, including the menu, tables, staff and settings.',
    SUPERVISOR: 'The floor, bills and the kitchen board.',
    KITCHEN: 'The kitchen board only.',
  };

  return (
    <div className="max-w-2xl space-y-5">
      <section className="card p-5">
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-xl font-bold text-brand-700">
            {user.name.trim().charAt(0).toUpperCase() || '?'}
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-ink-800">{user.name}</h2>
            <p className="truncate text-sm text-ink-500">{user.email}</p>
          </div>
        </div>
        <dl className="mt-5 grid gap-3 border-t border-ink-100 pt-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold text-ink-500">Role</dt>
            <dd className="mt-0.5 font-semibold capitalize text-ink-800">{user.role.toLowerCase()}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-ink-500">What this account can reach</dt>
            <dd className="mt-0.5 text-ink-600">{ROLE_NOTE[user.role] ?? '—'}</dd>
          </div>
        </dl>
        <p className="mt-4 rounded-xl bg-ink-100 px-3.5 py-2.5 text-[13px] text-ink-600">
          Your name, email and role are managed by an admin under
          {' '}<strong className="font-semibold">Staff</strong>. Ask whoever runs the account to change them.
        </p>
      </section>

      <section className="card p-5">
        <h3 className="text-sm font-bold text-ink-800">Change your password</h3>
        <p className="mt-1 text-xs text-ink-500">
          You need your current one. If you have forgotten it, an admin can set a new one for you.
        </p>

        <form onSubmit={submit} className="mt-4 space-y-4">
          <div>
            <label className="label" htmlFor="p-current">Current password</label>
            <input
              id="p-current" type="password" required autoComplete="current-password"
              className="input" value={current} onChange={(e) => setCurrent(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="p-new">New password</label>
            <input
              id="p-new" type="password" required autoComplete="new-password" minLength={8}
              className="input" value={next} onChange={(e) => setNext(e.target.value)}
              aria-describedby="p-new-hint"
            />
            <p id="p-new-hint" className={`mt-1 text-xs ${tooShort ? 'text-brand-700' : 'text-ink-500'}`}>
              At least 8 characters.
            </p>
          </div>
          <div>
            <label className="label" htmlFor="p-confirm">Repeat the new password</label>
            <input
              id="p-confirm" type="password" required autoComplete="new-password"
              className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)}
            />
            {mismatch && <p className="mt-1 text-xs text-brand-700">These do not match.</p>}
          </div>

          {error && (
            <p role="alert" className="rounded-xl bg-brand-50 px-3.5 py-2.5 text-sm text-brand-700 ring-1 ring-brand-200">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || !current || !next || mismatch || tooShort}
            className="btn-primary w-full py-3 sm:w-auto sm:px-8"
          >
            {busy ? <Spinner className="h-4 w-4 text-white" /> : 'Change password'}
          </button>
        </form>
      </section>

      {toast.toast && <Toast message={toast.toast.message} tone={toast.toast.tone} onDone={toast.clear} />}
    </div>
  );
}

export default function ProfilePage() {
  return (
    <StaffShell requires={['KITCHEN', 'SUPERVISOR', 'ADMIN']} title="Your profile">
      {(user) => <Profile user={user} />}
    </StaffShell>
  );
}
