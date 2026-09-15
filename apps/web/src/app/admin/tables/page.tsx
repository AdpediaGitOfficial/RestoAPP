'use client';

import { useState } from 'react';
import useSWR from 'swr';
import StaffShell from '@/components/staff/StaffShell';
import { adminApi } from '@/lib/api';
import { LoadingScreen, Sheet, Spinner, Toast, useToast } from '@/components/ui';

function TablesManager() {
  const toast = useToast();
  const [bulkOpen, setBulkOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [bulk, setBulk] = useState({ count: '5', prefix: 'T', startAt: '1', seats: '4', zone: 'Indoor' });
  const [busy, setBusy] = useState(false);

  const { data, mutate, isLoading } = useSWR('admin-tables', () => adminApi.tables());
  const { data: qrData, isLoading: qrLoading } = useSWR(qrOpen ? 'all-qr' : null, () => adminApi.allQr());

  const tables = data?.tables ?? [];

  const createBulk = async () => {
    setBusy(true);
    try {
      const res = await adminApi.bulkTables({
        count: Number(bulk.count),
        prefix: bulk.prefix,
        startAt: Number(bulk.startAt),
        seats: Number(bulk.seats),
        zone: bulk.zone,
      });
      mutate();
      setBulkOpen(false);
      toast.show(`${res.tables.length} tables created${res.skipped ? `, ${res.skipped} skipped (codes already exist)` : ''}`);
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Could not create the tables', 'error');
    } finally {
      setBusy(false);
    }
  };

  const rotate = async (id: string, label: string) => {
    if (!confirm(`Issue a new QR code for ${label}? The printed code will stop working.`)) return;
    await adminApi.rotateQr(id);
    mutate();
    toast.show('New QR issued — reprint the table tent.');
  };

  if (isLoading) return <LoadingScreen label="Loading tables…" />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Tables & QR codes</h2>
          <p className="text-sm text-slate-500">{tables.length} tables · guests scan these to order</p>
        </div>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={() => setQrOpen(true)} className="btn-secondary">🖨️ Print all QR codes</button>
          <button type="button" onClick={() => setBulkOpen(true)} className="btn-primary">+ Add tables</button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50">
              <tr>
                <th className="table-head">Table</th>
                <th className="table-head">Zone</th>
                <th className="table-head">Seats</th>
                <th className="table-head hidden md:table-cell">Guest link</th>
                <th className="table-head">Status</th>
                <th className="table-head text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tables.map((t) => (
                <tr key={t.id} className={t.is_active ? '' : 'opacity-50'}>
                  <td className="table-cell font-semibold text-slate-900">{t.label} <span className="text-xs font-normal text-slate-400">({t.code})</span></td>
                  <td className="table-cell">{t.zone}</td>
                  <td className="table-cell">{t.seats}</td>
                  <td className="table-cell hidden md:table-cell">
                    <a href={t.url} target="_blank" rel="noreferrer" className="text-xs text-brand-700 underline underline-offset-2">
                      {t.url?.replace(/^https?:\/\//, '')}
                    </a>
                  </td>
                  <td className="table-cell">
                    <button
                      type="button"
                      onClick={async () => { await adminApi.updateTable(t.id, { is_active: !t.is_active }); mutate(); }}
                      className={`chip ${t.is_active ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-slate-100 text-slate-600 ring-slate-200'}`}
                    >
                      {t.is_active ? 'In service' : 'Out of service'}
                    </button>
                  </td>
                  <td className="table-cell space-x-1 text-right">
                    <a href={`/print/qr/${t.id}`} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">QR</a>
                    <button type="button" onClick={() => rotate(t.id, t.label)} className="btn-ghost btn-sm">Rotate</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Sheet
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        title="Add tables"
        footer={
          <button type="button" onClick={createBulk} disabled={busy} className="btn-primary w-full py-3">
            {busy ? <Spinner className="h-4 w-4 text-white" /> : `Create ${bulk.count} tables`}
          </button>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Creates a run of tables with their own QR codes — for example T1 to T10. Existing codes are skipped.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="b-count">How many</label>
              <input id="b-count" type="number" min="1" max="100" className="input" value={bulk.count} onChange={(e) => setBulk({ ...bulk, count: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="b-start">Start numbering at</label>
              <input id="b-start" type="number" min="1" className="input" value={bulk.startAt} onChange={(e) => setBulk({ ...bulk, startAt: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="b-prefix">Code prefix</label>
              <input id="b-prefix" className="input" value={bulk.prefix} onChange={(e) => setBulk({ ...bulk, prefix: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="b-seats">Seats per table</label>
              <input id="b-seats" type="number" min="1" className="input" value={bulk.seats} onChange={(e) => setBulk({ ...bulk, seats: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="b-zone">Zone</label>
            <input id="b-zone" className="input" value={bulk.zone} onChange={(e) => setBulk({ ...bulk, zone: e.target.value })} placeholder="Indoor, Patio, Rooftop…" />
          </div>
        </div>
      </Sheet>

      {/* All QR codes, laid out for printing as table tents. */}
      <Sheet open={qrOpen} onClose={() => setQrOpen(false)} title="QR codes for every table">
        {qrLoading ? (
          <div className="flex justify-center py-8"><Spinner className="h-6 w-6" /></div>
        ) : (
          <div className="space-y-4">
            <button type="button" onClick={() => window.print()} className="btn-primary no-print w-full">🖨️ Print this sheet</button>
            <div className="grid grid-cols-2 gap-4">
              {(qrData?.tables ?? []).map((t) => (
                <div key={t.id} className="rounded-xl border border-slate-200 p-3 text-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={t.qr} alt={`QR code for ${t.label}`} className="mx-auto w-full max-w-[160px]" />
                  <p className="mt-2 font-bold text-slate-900">{t.label}</p>
                  <p className="text-xs text-slate-500">{t.zone} · scan to order</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </Sheet>

      {toast.toast && <Toast message={toast.toast.message} tone={toast.toast.tone} onDone={toast.clear} />}
    </div>
  );
}

export default function AdminTablesPage() {
  return (
    <StaffShell requires={['ADMIN']} title="Tables and QR codes">
      {() => <TablesManager />}
    </StaffShell>
  );
}
