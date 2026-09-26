'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import StaffShell from '@/components/staff/StaffShell';
import { adminApi } from '@/lib/api';
import type { Settings } from '@/lib/types';
import { LoadingScreen, Spinner, Toast, useToast } from '@/components/ui';

function SettingsForm() {
  const toast = useToast();
  const [form, setForm] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);

  const { data, mutate, isLoading } = useSWR('settings', () => adminApi.settings());
  useEffect(() => { if (data?.settings) setForm(data.settings); }, [data]);

  if (isLoading || !form) return <LoadingScreen label="Loading settings…" />;

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setForm({ ...form, [key]: value });

  const save = async () => {
    setBusy(true);
    try {
      await adminApi.updateSettings({
        ...form,
        tax_percent: Number(form.tax_percent),
        service_charge_percent: Number(form.service_charge_percent),
        auto_close_empty_minutes: Number(form.auto_close_empty_minutes),
        auto_close_idle_minutes: Number(form.auto_close_idle_minutes),
      });
      mutate();
      toast.show('Settings saved — they apply to new bills straight away.');
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Could not save', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Restaurant settings</h2>
        <p className="text-sm text-slate-500">Name, taxes and how bills are printed</p>
      </div>

      <section className="card space-y-4 p-5">
        <h3 className="text-sm font-bold text-slate-900">Identity</h3>
        <div>
          <label className="label" htmlFor="c-name">Restaurant name</label>
          <input id="c-name" className="input" value={form.name} onChange={(e) => set('name', e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="c-address">Address (printed on the bill)</label>
          <textarea id="c-address" rows={2} className="input" value={form.address} onChange={(e) => set('address', e.target.value)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="c-phone">Phone</label>
            <input id="c-phone" className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="c-symbol">Currency symbol</label>
            <input id="c-symbol" className="input" value={form.currency_symbol} onChange={(e) => set('currency_symbol', e.target.value)} />
          </div>
        </div>
      </section>

      <section className="card space-y-4 p-5">
        <h3 className="text-sm font-bold text-slate-900">Taxes and charges</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="c-taxlabel">Tax label</label>
            <input id="c-taxlabel" className="input" value={form.tax_label} onChange={(e) => set('tax_label', e.target.value)} placeholder="GST, VAT…" />
          </div>
          <div>
            <label className="label" htmlFor="c-tax">Tax %</label>
            <input id="c-tax" type="number" min="0" max="100" step="0.01" className="input" value={form.tax_percent} onChange={(e) => set('tax_percent', Number(e.target.value))} />
          </div>
          <div>
            <label className="label" htmlFor="c-sc">Service charge %</label>
            <input id="c-sc" type="number" min="0" max="100" step="0.01" className="input" value={form.service_charge_percent} onChange={(e) => set('service_charge_percent', Number(e.target.value))} />
          </div>
        </div>

        <label className="flex items-start gap-3 rounded-xl bg-slate-50 p-3 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4 rounded accent-brand-600" checked={form.tax_inclusive} onChange={(e) => set('tax_inclusive', e.target.checked)} />
          <span>
            <span className="font-medium text-slate-800">Menu prices already include tax</span>
            <span className="block text-xs text-slate-500">
              The bill shows the tax as a breakdown instead of adding it on top.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3 rounded-xl bg-slate-50 p-3 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4 rounded accent-brand-600" checked={form.round_bill_total} onChange={(e) => set('round_bill_total', e.target.checked)} />
          <span>
            <span className="font-medium text-slate-800">Round the bill total</span>
            <span className="block text-xs text-slate-500">Rounds to the nearest whole {form.currency_symbol}1 and shows the adjustment.</span>
          </span>
        </label>
      </section>

      <section className="card space-y-4 p-5">
        <h3 className="text-sm font-bold text-slate-900">Service</h3>
        <label className="flex items-start gap-3 rounded-xl bg-slate-50 p-3 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4 rounded accent-brand-600" checked={form.accept_orders} onChange={(e) => set('accept_orders', e.target.checked)} />
          <span>
            <span className="font-medium text-slate-800">Accepting orders from QR codes</span>
            <span className="block text-xs text-slate-500">
              Turn this off at closing time — guests see a notice instead of the order button.
            </span>
          </span>
        </label>
        <div>
          <label className="label" htmlFor="c-footer">Bill footer note</label>
          <input id="c-footer" className="input" value={form.bill_footer_note} onChange={(e) => set('bill_footer_note', e.target.value)} />
        </div>
      </section>

      <section className="card space-y-4 p-5">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Closing abandoned tables</h3>
          <p className="mt-1 text-xs text-slate-500">
            A table nobody closed stays occupied for ever: it blocks the floor board, keeps its
            orders on the kitchen display and counts as full in your reports. This sweeps them shut.
            Time is measured from the table&rsquo;s last order, so a long meal is never cut short.
          </p>
        </div>

        <label className="flex items-start gap-3 rounded-xl bg-slate-50 p-3 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4 rounded accent-brand-600"
                 checked={form.auto_close_enabled}
                 onChange={(e) => set('auto_close_enabled', e.target.checked)} />
          <span>
            <span className="font-medium text-slate-800">Close abandoned tables automatically</span>
            <span className="block text-xs text-slate-500">
              Runs every 15 minutes. Anything still unpaid is recorded against the table and the
              floor is notified, so nothing is written off silently.
            </span>
          </span>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="c-empty">Scanned but never ordered</label>
            <div className="flex items-center gap-2">
              <input id="c-empty" type="number" min={15} step={15} className="input"
                     value={form.auto_close_empty_minutes}
                     onChange={(e) => set('auto_close_empty_minutes', Number(e.target.value))} />
              <span className="shrink-0 text-sm text-slate-500">minutes</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">Someone opened the QR and left. Nothing is owed.</p>
          </div>
          <div>
            <label className="label" htmlFor="c-idle">Ordered, then went quiet</label>
            <div className="flex items-center gap-2">
              <input id="c-idle" type="number" min={60} step={30} className="input"
                     value={form.auto_close_idle_minutes}
                     onChange={(e) => set('auto_close_idle_minutes', Number(e.target.value))} />
              <span className="shrink-0 text-sm text-slate-500">minutes</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Keep this well past your longest sitting — {Math.round(form.auto_close_idle_minutes / 60)}h
              covers overnight without touching today.
            </p>
          </div>
        </div>
      </section>

      <button type="button" onClick={save} disabled={busy} className="btn-primary w-full py-3 sm:w-auto sm:px-8">
        {busy ? <Spinner className="h-4 w-4 text-white" /> : 'Save settings'}
      </button>

      {toast.toast && <Toast message={toast.toast.message} tone={toast.toast.tone} onDone={toast.clear} />}
    </div>
  );
}

export default function AdminSettingsPage() {
  return (
    <StaffShell requires={['ADMIN']} title="Settings">
      {() => <SettingsForm />}
    </StaffShell>
  );
}
