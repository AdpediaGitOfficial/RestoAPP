'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import StaffShell from '@/components/staff/StaffShell';
import { staffApi, type PrintJob } from '@/lib/api';
import { duration, minutesSince, time } from '@/lib/format';
import { useRealtime } from '@/lib/socket';
import type { Order } from '@/lib/types';
import { EmptyState, LoadingScreen, Toast, useToast } from '@/components/ui';

const COLUMNS: { status: string; title: string; accent: string; dot: string; next?: string; nextLabel?: string }[] = [
  { status: 'PLACED', title: 'New', accent: 'border-l-amber-400', dot: 'bg-amber-400', next: 'ACCEPTED', nextLabel: 'Accept' },
  { status: 'ACCEPTED', title: 'Accepted', accent: 'border-l-sky-400', dot: 'bg-sky-400', next: 'PREPARING', nextLabel: 'Start cooking' },
  { status: 'PREPARING', title: 'Preparing', accent: 'border-l-indigo-400', dot: 'bg-indigo-400', next: 'READY', nextLabel: 'Mark ready' },
  { status: 'READY', title: 'Ready to serve', accent: 'border-l-emerald-400', dot: 'bg-emerald-400', next: 'SERVED', nextLabel: 'Served' },
];

/** Tickets go amber then red as they age, so nothing is forgotten. */
function ageStyle(order: Order) {
  const mins = minutesSince(order.created_at);
  if (order.status === 'READY') return 'border-emerald-200 dark:border-emerald-800';
  if (mins >= 20) return 'border-rose-300 bg-rose-50/70 dark:border-rose-800 dark:bg-rose-950/30';
  if (mins >= 10) return 'border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/25';
  return 'border-slate-200 dark:border-slate-700';
}

function KitchenBoard() {
  const toast = useToast();
  const [stationFilter, setStationFilter] = useState<string>('ALL');
  const [autoPrint, setAutoPrint] = useState(false);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    try { setDark(localStorage.getItem('resto.kds.dark') === '1'); } catch { /* private mode */ }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (dark) root.setAttribute('data-kds', 'dark');
    else root.removeAttribute('data-kds');
    // Leaving the kitchen must not darken the rest of the app.
    return () => root.removeAttribute('data-kds');
  }, [dark]);

  const toggleDark = () => {
    setDark((on) => {
      const next = !on;
      try { localStorage.setItem('resto.kds.dark', next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  };
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
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Kitchen display</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {visible.length} active {visible.length === 1 ? 'order' : 'orders'}
          </p>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {stations.length > 1 && (
            <div className="flex gap-1 rounded-xl bg-white p-1 ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
              {['ALL', ...stations].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStationFilter(s)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize ${
                    stationFilter === s ? 'bg-brand-500 text-white' : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {s.toLowerCase()}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={toggleDark}
            aria-pressed={dark}
            className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-slate-600 ring-1 ring-slate-200 transition dark:bg-slate-700 dark:text-slate-100 dark:ring-slate-600"
          >
            {dark ? '☀ Light screen' : '☾ Dark screen'}
          </button>

          <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700">
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
        /* Lanes share the width by workload: a lane holding eight tickets gets
           three columns of them, an empty lane steps aside to a strip. The
           board fills the screen instead of stacking everything in column one. */
        <div className="flex flex-col gap-3 md:flex-row md:items-start">
          {COLUMNS.map((col) => {
            const laneOrders = visible.filter((o) => o.status === col.status);
            // Grow in direct proportion to the workload. Capping it flattens
            // the difference between a lane holding nineteen tickets and one
            // holding six, which is exactly the difference worth showing.
            // min-width stops a quiet lane being squeezed below one column.
            const grow = Math.max(1, laneOrders.length);
            return (
              <section
                key={col.status}
                aria-label={`${col.title}, ${laneOrders.length} orders`}
                className="flex min-w-0 flex-col"
                style={laneOrders.length
                  ? { flex: `${grow} 1 0%`, minWidth: '205px' }
                  : { flex: '0 0 150px' }}
              >
                <header className={`mb-2 flex items-center gap-2 rounded-lg bg-white px-2.5 py-1.5 ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700 ${
                  laneOrders.length ? '' : 'opacity-60'
                }`}>
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${col.dot}`} />
                  <h3 className="truncate text-[13px] font-bold text-slate-900 dark:text-slate-100">{col.title}</h3>
                  <span className="ml-auto text-[13px] font-bold tabular-nums text-slate-400 dark:text-slate-500">
                    {laneOrders.length}
                  </span>
                </header>

                <div className="grid items-start content-start gap-2 [grid-template-columns:repeat(auto-fill,minmax(196px,1fr))]">
                  {laneOrders.length === 0 && (
                    <p className="px-1 py-3 text-center text-[11px] leading-snug text-slate-400 dark:text-slate-500">
                      Nothing here yet
                    </p>
                  )}

                  {laneOrders.map((order) => (
                    <article
                      key={order.id}
                      className={`flex flex-col gap-1 rounded-lg border border-l-[3px] bg-white px-2.5 py-2 dark:bg-slate-800 ${col.accent} ${ageStyle(order)}`}
                    >
                      <div className="flex items-baseline gap-1.5">
                        <p className="text-[14px] font-bold leading-tight text-slate-900 dark:text-slate-100">
                          {order.table_label}
                        </p>
                        <span className="text-[10.5px] tabular-nums text-slate-400 dark:text-slate-500">
                          #{order.order_number}
                        </span>
                        <span className={`ml-auto shrink-0 text-[11.5px] font-bold tabular-nums ${
                          minutesSince(order.created_at) >= 20
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-slate-400 dark:text-slate-500'
                        }`}>
                          {duration(order.created_at)}
                        </span>
                      </div>

                      {order.items
                        .filter((i) => stationFilter === 'ALL' || i.kitchen_station === stationFilter)
                        .map((item) => (
                          <div key={item.id}>
                            <p className="text-[12.5px] leading-snug text-slate-800 dark:text-slate-200">
                              <span className="font-bold tabular-nums">{item.quantity}×</span> {item.item_name}
                              {item.variant_name && <span className="text-slate-400 dark:text-slate-500"> ({item.variant_name})</span>}
                            </p>
                            {item.addons?.length > 0 && (
                              <p className="pl-3 text-[10.5px] leading-snug text-slate-400 dark:text-slate-500">
                                + {item.addons.map((a) => a.name).join(', ')}
                              </p>
                            )}
                            {item.note && (
                              <p className="pl-3 text-[10.5px] font-bold leading-snug text-rose-600 dark:text-rose-400">
                                ** {item.note}
                              </p>
                            )}
                          </div>
                        ))}

                      {order.note && (
                        <p className="rounded bg-amber-50 px-1.5 py-1 text-[10.5px] font-medium leading-snug text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                          {order.note}
                        </p>
                      )}

                      <div className="mt-0.5 flex gap-1">
                        {col.next && (
                          <button
                            type="button"
                            onClick={() => advance(order, col.next!)}
                            disabled={busyId === order.id}
                            className="flex-1 truncate rounded-md bg-brand-500 px-1.5 py-1.5 text-[12px] font-bold text-white transition active:scale-[0.97] disabled:opacity-50"
                          >
                            {col.nextLabel}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => reprint(order)}
                          title="Reprint ticket"
                          aria-label={`Reprint ticket for order ${order.order_number}`}
                          className="w-[26px] shrink-0 rounded-md text-[11px] text-slate-500 ring-1 ring-slate-200 transition active:scale-95 dark:text-slate-400 dark:ring-slate-600"
                        >
                          ⎙
                        </button>
                        {order.status !== 'READY' && (
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`Cancel order #${order.order_number}? A void ticket will print.`)) {
                                advance(order, 'CANCELLED');
                              }
                            }}
                            title="Cancel order"
                            aria-label={`Cancel order ${order.order_number}`}
                            className="w-[26px] shrink-0 rounded-md text-[11px] text-rose-500 ring-1 ring-slate-200 transition active:scale-95 dark:ring-slate-600"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
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
    <StaffShell requires={['KITCHEN', 'SUPERVISOR', 'ADMIN']} title="Kitchen display" wide>
      {() => <KitchenBoard />}
    </StaffShell>
  );
}
