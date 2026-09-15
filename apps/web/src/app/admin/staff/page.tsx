'use client';

import { useState } from 'react';
import useSWR from 'swr';
import StaffShell from '@/components/staff/StaffShell';
import { authApi } from '@/lib/api';
import type { Role } from '@/lib/types';
import { LoadingScreen, Sheet, Spinner, Toast, useToast } from '@/components/ui';

const ROLE_HELP: Record<Role, string> = {
  ADMIN: 'Full access: menu, tables, staff, settings and metrics.',
  SUPERVISOR: 'Floor view, takes orders, generates and settles bills.',
  KITCHEN: 'Kitchen display only — sees tickets, never prices.',
};

function StaffManager() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'SUPERVISOR' as Role });

  const { data, mutate, isLoading } = useSWR('staff-users', () => authApi.users());

  const create = async () => {
    setBusy(true);
    try {
      await authApi.createUser(form);
      setOpen(false);
      setForm({ name: '', email: '', password: '', role: 'SUPERVISOR' });
      mutate();
      toast.show('Staff member added');
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Could not add the user', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) return <LoadingScreen label="Loading staff…" />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Staff</h2>
          <p className="text-sm text-slate-500">Who can sign in, and what they can do</p>
        </div>
        <button type="button" onClick={() => setOpen(true)} className="btn-primary ml-auto">+ Add staff</button>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50">
              <tr>
                <th className="table-head">Name</th>
                <th className="table-head">Email</th>
                <th className="table-head">Role</th>
                <th className="table-head">Status</th>
                <th className="table-head text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data?.users ?? []).map((u) => (
                <tr key={u.id} className={u.is_active ? '' : 'opacity-50'}>
                  <td className="table-cell font-medium text-slate-900">{u.name}</td>
                  <td className="table-cell">{u.email}</td>
                  <td className="table-cell">
                    <select
                      className="input w-40 py-1.5 text-xs"
                      value={u.role}
                      onChange={async (e) => {
                        await authApi.updateUser(u.id, { role: e.target.value });
                        mutate();
                        toast.show(`${u.name} is now a ${e.target.value.toLowerCase()}`);
                      }}
                      aria-label={`Role for ${u.name}`}
                    >
                      {(Object.keys(ROLE_HELP) as Role[]).map((r) => (
                        <option key={r} value={r}>{r[0] + r.slice(1).toLowerCase()}</option>
                      ))}
                    </select>
                  </td>
                  <td className="table-cell">
                    <button
                      type="button"
                      onClick={async () => { await authApi.updateUser(u.id, { is_active: !u.is_active }); mutate(); }}
                      className={`chip ${u.is_active ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-slate-100 text-slate-600 ring-slate-200'}`}
                    >
                      {u.is_active ? 'Active' : 'Disabled'}
                    </button>
                  </td>
                  <td className="table-cell text-right">
                    <button
                      type="button"
                      onClick={async () => {
                        const password = prompt(`New password for ${u.name} (at least 8 characters)`);
                        if (!password) return;
                        try {
                          await authApi.updateUser(u.id, { password });
                          toast.show('Password reset');
                        } catch (err) {
                          toast.show(err instanceof Error ? err.message : 'Could not reset', 'error');
                        }
                      }}
                      className="btn-ghost btn-sm"
                    >
                      Reset password
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {(Object.keys(ROLE_HELP) as Role[]).map((r) => (
          <div key={r} className="card p-4">
            <p className="text-sm font-bold capitalize text-slate-900">{r.toLowerCase()}</p>
            <p className="mt-1 text-xs text-slate-500">{ROLE_HELP[r]}</p>
          </div>
        ))}
      </div>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Add a staff member"
        footer={
          <button
            type="button"
            onClick={create}
            disabled={busy || !form.name || !form.email || form.password.length < 8}
            className="btn-primary w-full py-3"
          >
            {busy ? <Spinner className="h-4 w-4 text-white" /> : 'Create account'}
          </button>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="s-name">Name</label>
            <input id="s-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ravi Kumar" />
          </div>
          <div>
            <label className="label" htmlFor="s-email">Email</label>
            <input id="s-email" type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="ravi@cafe.com" />
          </div>
          <div>
            <label className="label" htmlFor="s-pass">Password</label>
            <input id="s-pass" type="text" className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="At least 8 characters" />
            <p className="mt-1 text-xs text-slate-500">Share this with them; they can change it after signing in.</p>
          </div>
          <div>
            <label className="label" htmlFor="s-role">Role</label>
            <select id="s-role" className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              {(Object.keys(ROLE_HELP) as Role[]).map((r) => <option key={r} value={r}>{r[0] + r.slice(1).toLowerCase()}</option>)}
            </select>
            <p className="mt-1 text-xs text-slate-500">{ROLE_HELP[form.role]}</p>
          </div>
        </div>
      </Sheet>

      {toast.toast && <Toast message={toast.toast.message} tone={toast.toast.tone} onDone={toast.clear} />}
    </div>
  );
}

export default function AdminStaffPage() {
  return (
    <StaffShell requires={['ADMIN']} title="Staff management">
      {() => <StaffManager />}
    </StaffShell>
  );
}
