'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import StaffShell from '@/components/staff/StaffShell';
import { staffApi, type PrintJob } from '@/lib/api';
import { duration, minutesSince, time } from '@/lib/format';
import { useRealtime } from '@/lib/socket';
import type { Order } from '@/lib/types';
import { EmptyState, LoadingScreen, Toast, useToast } from '@/components/ui';

const COLUMNS: { status: string; title: string; accent: string; next?: string; nextLabel?: string }[] = [
  { status: 'PLACED', title: 'New', accent: 'border-amber-400', next: 'ACCEPTED', nextLabel: 'Accept' },
  { status: 'ACCEPTED', title: 'Accepted', accent: 'border-sky-400', next: 'PREPARING', nextLabel: 'Start cooking' },
  { status: 'PREPARING', title: 'Preparing', accent: 'border-indigo-400', next: 'READY', nextLabel: 'Mark ready' },
  { status: 'READY', title: 'Ready to serve', accent: 'border-emerald-400', next: 'SERVED', nextLabel: 'Served' },
];

/** Tickets go amber then red as they age, so nothing is forgotten. */
function ageStyle(order: Order) {
  const mins = minutesSince(order.created_at);
  if (order.status === 'READY') return 'ring-emerald-200';
  if (mins >= 20) return 'ring-rose-300 bg-rose-50/60';
  if (mins >= 10) return 'ring-amber-300 bg-amber-50/50';
  return 'ring-slate-200';
}

function KitchenBoard() {
  const toast = useToast();
  const [stationFilter, setStationFilter] = useState<string>('ALL');
  const [autoPrint, setAutoPrint] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, forceTick] = useState(0);

  const { data, mutate, isLoading } = useSWR(
    'kitchen-orders',
    () => staffApi.orders({ active: true, limit: 200 }),
    { refreshInterval: 20_000 },
  );

  // Keep the "waiting 7m" labels honest without re-fetching.
  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const printedJobs = useRef<Set<string>>(new Set());

  /** Open the printable ticket in a hidden iframe and fire the browser print dialog. */
  const printJob = useCallback(async (job: PrintJob) => {
    if (printedJobs.current.has(job.id)) return;
    printedJobs.current.add(job.id);

    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(`<pre style="font-family:ui-monospace,Menlo,monospace;font-size:12px;white-space:pre">${
      job.content.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] as string))
    }</pre>`);
    doc.close();
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    await staffApi.markPrinted(job.id).catch(() => {});
    setTimeout(() => frame.remove(), 1500);
  }, []);

  const drainPrintQueue = useCallback(async () => {
    if (!autoPrint) return;
    try {
      const { jobs } = await staffApi.printJobs('QUEUED');
      for (const job of jobs) await printJob(job);
    } catch { /* the queue will be retried on the next event */ }
  }, [autoPrint, printJob]);

  useRealtime(
    {
      'order:created': (order: Order) => {
        mutate();
        toast.show(`New order #${order.order_number} · ${order.table_label}`);
        drainPrintQueue();
      },
      'order:updated': () => mutate(),
      'print:job': () => drainPrintQueue(),
    },
    { staff: true },
  );

  useEffect(() => { drainPrintQueue(); }, [drainPrintQueue]);

  const advance = async (order: Order, status: string) => {
    setBusyId(order.id);
    try {
      await staffApi.setOrderStatus(order.id, status);
      mutate();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Could not update the order', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const reprint = async (order: Order) => {
    try {
      await staffApi.reprintKot(order.id);
      toast.show(`Ticket for #${order.order_number} sent to the printer`);
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Could not reprint', 'error');
    }
  };

  if (isLoading) return <LoadingScreen label="Loading the kitchen board…" />;

  const orders = data?.orders ?? [];
  const stations = [...new Set(orders.flatMap((o) => o.items.map((i) => i.kitchen_station)))].sort();
  const visible = stationFilter === 'ALL'
    ? orders
    : orders.filter((o) => o.items.some((i) => i.kitchen_station === stationFilter));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Kitchen display</h2>
          <p className="text-sm text-slate-500">{visible.length} active {visible.length === 1 ? 'order' : 'orders'}</p>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {stations.length > 1 && (
            <div className="flex gap-1 rounded-xl bg-white p-1 ring-1 ring-slate-200">
              {['ALL', ...stations].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStationFilter(s)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize ${
                    stationFilter === s ? 'bg-brand-600 text-white' : 'text-slate-600'
                  }`}
                >
                  {s.toLowerCase()}
                </button>
              ))}
            </div>
          )}
          <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-slate-200">
            <input
              type="checkbox"
              className="h-4 w-4 rounded accent-brand-600"
              checked={autoPrint}
              onChange={(e) => setAutoPrint(e.target.checked)}
            />
            Auto-print tickets
          </label>
        </div>
      </div>

      {autoPrint && (
        <p className="rounded-xl bg-sky-50 px-4 py-2 text-xs text-sky-800 ring-1 ring-sky-200">
          New tickets will open your browser&apos;s print dialog. For a thermal printer on the network,
          set <code>PRINTER_DRIVER=escpos</code> on the API instead and leave this off.
        </p>
      )}

      {visible.length === 0 ? (
        <EmptyState icon="✅" title="All caught up" hint="New orders appear here the moment a guest sends them." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((col) => {
            const columnOrders = visible.filter((o) => o.status === col.status);
            return (
              <section key={col.status} aria-label={col.title} className="space-y-3">
                <header className="flex items-center justify-between rounded-xl bg-white px-3 py-2 ring-1 ring-slate-200">
                  <h3 className="text-sm font-bold text-slate-900">{col.title}</h3>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                    {columnOrders.length}
                  </span>
                </header>

                {columnOrders.map((order) => (
                  <article key={order.id} className={`card border-l-4 p-3 ring-1 ${col.accent} ${ageStyle(order)}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-slate-900">{order.table_label}</p>
                        <p className="text-xs text-slate-500">
                          #{order.order_number} · {time(order.created_at)} · {order.channel === 'QR' ? 'guest' : order.placed_by_name || 'staff'}
                        </p>
                      </div>
                      <span className={`chip ${minutesSince(order.created_at) >= 20 ? 'bg-rose-100 text-rose-700 ring-rose-200' : 'bg-slate-100 text-slate-600 ring-slate-200'}`}>
                        {duration(order.created_at)}
                      </span>
                    </div>

                    <ul className="mt-3 space-y-1.5">
                      {order.items
                        .filter((i) => stationFilter === 'ALL' || i.kitchen_station === stationFilter)
                        .map((item) => (
                          <li key={item.id} className="text-sm">
                            <span className="font-bold text-slate-900">{item.quantity}×</span>{' '}
                            <span className="text-slate-800">{item.item_name}</span>
                            {item.variant_name && <span className="text-slate-500"> ({item.variant_name})</span>}
                            {item.addons?.length > 0 && (
                              <span className="block pl-5 text-xs text-slate-500">+ {item.addons.map((a) => a.name).join(', ')}</span>
                            )}
                            {item.note && (
                              <span className="block pl-5 text-xs font-semibold text-rose-700">** {item.note}</span>
                            )}
                          </li>
                        ))}
                    </ul>

                    {order.note && (
                      <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-900">
                        {order.note}
                      </p>
                    )}

                    <div className="mt-3 flex gap-2">
                      {col.next && (
                        <button
                          type="button"
                          onClick={() => advance(order, col.next!)}
                          disabled={busyId === order.id}
                          className="btn-primary btn-sm flex-1"
                        >
                          {col.nextLabel}
                        </button>
                      )}
                      <button type="button" onClick={() => reprint(order)} className="btn-secondary btn-sm" title="Reprint ticket">
                        🖨️
                      </button>
                      {order.status !== 'READY' && (
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(`Cancel order #${order.order_number}? A void ticket will print.`)) {
                              advance(order, 'CANCELLED');
                            }
                          }}
                          className="btn-secondary btn-sm text-rose-600"
                          title="Cancel order"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </section>
            );
          })}
        </div>
      )}

      {toast.toast && <Toast message={toast.toast.message} tone={toast.toast.tone} onDone={toast.clear} />}
    </div>
  );
}

export default function KitchenPage() {
  return (
    <StaffShell requires={['KITCHEN', 'SUPERVISOR', 'ADMIN']} title="Kitchen display">
      {() => <KitchenBoard />}
    </StaffShell>
  );
}
