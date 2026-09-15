'use client';

import { useCallback, useEffect, useState } from 'react';
import useSWR from 'swr';
import { guestApi, type GuestSession, type TableInfo } from '@/lib/api';
import { deviceId, useCart, type CartEntry } from '@/lib/cart';
import { money } from '@/lib/format';
import { useRealtime } from '@/lib/socket';
import type { MenuItem } from '@/lib/types';
import { Sheet, Toast, useToast } from '@/components/ui';
import Icon from '@/components/Icon';
import WelcomeScreen from './WelcomeScreen';
import MenuView from './MenuView';
import ReviewView from './ReviewView';
import OrdersView from './OrdersView';
import ItemSheet from './ItemSheet';
import CartBar from './CartBar';
import { MenuSkeleton } from './Skeletons';

type Step = 'menu' | 'review' | 'orders';

const STEP_META: Record<Step, { title: string; index: number }> = {
  menu: { title: 'Make your selection', index: 0 },
  review: { title: 'Review & order', index: 1 },
  orders: { title: 'Your orders', index: 2 },
};

export default function GuestApp({ token, initialTable = null, initialMenu = null }: {
  token: string;
  initialTable?: TableInfo | null;
  initialMenu?: { categories: import('@/lib/types').Category[] } | null;
}) {
  const toast = useToast();
  const cart = useCart(token);

  const [welcomed, setWelcomed] = useState<boolean | null>(null);
  const [guestName, setGuestName] = useState('');
  const [step, setStep] = useState<Step>('menu');
  const [activeItem, setActiveItem] = useState<MenuItem | null>(null);
  const [billOpen, setBillOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // The welcome screen shows once per table, per device.
  useEffect(() => {
    try {
      setWelcomed(localStorage.getItem(`resto.welcomed.${token}`) === '1');
      setGuestName(localStorage.getItem('resto.guestName') || '');
    } catch {
      setWelcomed(true);
    }
  }, [token]);

  // Seeded from the server render, so there is nothing to wait for on first
  // paint; SWR still revalidates in the background.
  const { data: info, error: infoError, isLoading: infoLoading, mutate: refreshInfo } =
    useSWR<TableInfo>(['table', token], () => guestApi.table(token), {
      fallbackData: initialTable ?? undefined,
      revalidateOnMount: !initialTable,
    });

  const { data: menu, isLoading: menuLoading, mutate: refreshMenu } =
    useSWR<{ categories: import('@/lib/types').Category[] }>('menu', () => guestApi.menu(), {
      fallbackData: initialMenu ?? undefined,
      revalidateOnMount: !initialMenu,
      revalidateOnFocus: false,
    });

  const sessionId = info?.session?.id ?? null;

  const { data: live, mutate: refreshSession } = useSWR<GuestSession>(
    sessionId ? ['session', sessionId, token] : null,
    () => guestApi.session(sessionId!, token),
    { refreshInterval: 30_000 },  // websockets lead; this is the safety net
  );

  useRealtime(
    {
      'order:created': () => refreshSession(),
      'order:updated': () => refreshSession(),
      'session:updated': () => { refreshSession(); refreshInfo(); },
      'session:closed': () => { refreshSession(); refreshInfo(); cart.clear(); },
      'bill:generated': () => refreshSession(),
      'bill:settled': () => { refreshSession(); refreshInfo(); cart.clear(); },
      // Bypass the cache: this fires when an item is 86'd or a price changes.
      'menu:changed': () => refreshMenu(() => guestApi.menu(true), { revalidate: false }),
    },
    { sessionId },
  );

  const symbol = info?.restaurant.currency_symbol ?? '₹';
  const orders = live?.orders ?? [];
  const activeOrders = orders.filter((o) => !['SERVED', 'CANCELLED'].includes(o.status)).length;
  const billRequested = live?.session?.status === 'BILL_REQUESTED';
  const settled = live?.bill?.status === 'SETTLED';
  const ordersClosed = Boolean(info && !info.restaurant.accept_orders);

  const startOrdering = (name: string) => {
    try {
      localStorage.setItem(`resto.welcomed.${token}`, '1');
      if (name) localStorage.setItem('resto.guestName', name);
    } catch { /* private mode — the welcome will simply show again */ }
    setGuestName(name);
    setWelcomed(true);
  };

  const placeOrder = useCallback(async (note: string) => {
    setSubmitting(true);
    try {
      await guestApi.placeOrder({
        token,
        guestDevice: deviceId(),
        note,
        items: cart.entries.map((e) => ({
          menuItemId: e.menuItemId,
          variantId: e.variantId,
          addonIds: e.addons.map((a) => a.id),
          quantity: e.quantity,
          note: e.note,
        })),
      });
      cart.clear();
      setStep('orders');
      toast.show('Sent to the kitchen — we are on it!');
      window.scrollTo({ top: 0 });
      const { session } = await refreshInfo() ?? {};
      // Name the guest on the session so staff see who they are serving.
      if (guestName && session?.id) {
        guestApi.updateSession(session.id, token, { guestName }).catch(() => {});
      }
      await refreshSession();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Could not place the order', 'error');
    } finally {
      setSubmitting(false);
    }
  }, [cart, token, guestName, refreshInfo, refreshSession, toast]);

  const requestBill = async (preference?: string) => {
    if (!sessionId) return;
    try {
      await guestApi.requestBill(sessionId, token, preference);
      setBillOpen(false);
      toast.show('A supervisor is on the way with your bill.');
      refreshSession();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Could not send the request', 'error');
    }
  };

  const callWaiter = async () => {
    if (!sessionId) {
      toast.show('Place an order first and we can call someone over.', 'error');
      return;
    }
    try {
      await guestApi.callWaiter(sessionId, token);
      toast.show('We have let the team know.');
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Could not call for service', 'error');
    }
  };

  const goTo = (next: Step) => { setStep(next); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  // ------------------------------------------------------------- render
  if (infoError) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-8 text-center">
        <p className="text-5xl" aria-hidden>📵</p>
        <h1 className="mt-4 text-xl font-bold text-ink-800">We could not find this table</h1>
        <p className="mt-2 text-sm text-ink-600">
          {infoError instanceof Error ? infoError.message : 'Please ask our staff to help you scan again.'}
        </p>
      </main>
    );
  }

  if (welcomed === null || infoLoading) {
    return (
      <div className="min-h-screen">
        <div className="px-4 pt-6"><div className="skeleton h-8 w-48 rounded-xl" /></div>
        <MenuSkeleton />
      </div>
    );
  }

  if (!welcomed && info) {
    return (
      <WelcomeScreen
        restaurantName={info.restaurant.name}
        tableLabel={info.table.label}
        zone={info.table.zone}
        onStart={startOrdering}
      />
    );
  }

  const meta = STEP_META[step];

  return (
    <div className="min-h-screen pb-28">
      {/* ------------------------------------------------------------ header */}
      <header data-guest-header className="sticky top-0 z-30 bg-ink-50/95 backdrop-blur-xl" style={{ top: 'env(safe-area-inset-top, 0px)' }}>
        <div className="mx-auto max-w-2xl px-4 pb-3 pt-3">
          <div className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2 text-[13.5px] font-normal tracking-[-0.01em] text-ink-800">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-500 text-[11px] font-bold text-white">
                {(info?.restaurant.name ?? 'R')[0]}
              </span>
              <span className="truncate">{info?.restaurant.name}</span>
            </span>

            <span className="flex shrink-0 items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1.5 text-[12px] font-normal text-ink-700 ring-1 ring-ink-200">
                <Icon name="table" className="h-3.5 w-3.5 text-ink-500" />
                {info?.table.label}
              </span>
              <button
                type="button"
                onClick={callWaiter}
                aria-label="Call a member of staff"
                title="Call a member of staff"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-ink-600 ring-1 ring-ink-200 transition active:scale-90 hover:text-brand-600"
              >
                <Icon name="bell" className="h-[17px] w-[17px]" />
              </button>
            </span>
          </div>

          {/* Step rail — where the guest is in the flow. */}
          <div className="mt-3 flex items-center gap-2">
            <h1 className="flex-1 truncate text-[21px] font-bold leading-tight tracking-[-0.022em] text-ink-800">{meta.title}</h1>
            <div className="flex shrink-0 gap-1" aria-hidden>
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === meta.index ? 'w-5 bg-brand-500' : i < meta.index ? 'w-1.5 bg-brand-300' : 'w-1.5 bg-ink-200'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Tabs appear once there is something to track. */}
          {(orders.length > 0 || cart.count > 0) && (
            <nav className="mt-3 flex gap-1 rounded-2xl bg-ink-100 p-1" aria-label="Sections">
              {([
                ['menu', 'Menu'],
                ['review', cart.count > 0 ? `Tray · ${cart.count}` : 'Tray'],
                ['orders', activeOrders > 0 ? `Orders · ${activeOrders}` : 'Orders'],
              ] as [Step, string][]).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => goTo(key)}
                  aria-current={step === key}
                  className={`flex-1 rounded-xl px-3 py-2 text-[12.5px] font-normal transition ${
                    step === key ? 'bg-white text-ink-800 shadow-sm' : 'text-ink-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </nav>
          )}
        </div>
      </header>

      {/* ------------------------------------------------------------ banners */}
      <div className="mx-auto max-w-2xl space-y-2 px-4">
        {ordersClosed && (
          <div className="flex items-start gap-2.5 rounded-2xl bg-amber-50 px-4 py-3 text-[13px] text-amber-900 ring-1 ring-amber-200">
            <Icon name="info" className="mt-px h-4 w-4 shrink-0 text-amber-600" />
            The kitchen has stopped taking orders for now. Please speak to our staff.
          </div>
        )}
        {billRequested && !settled && (
          <div className="flex items-center gap-2.5 rounded-2xl bg-brand-50 px-4 py-3 text-[13px] font-normal text-brand-800 ring-1 ring-brand-200">
            <Icon name="receipt" className="h-4 w-4 shrink-0 text-brand-500" />
            Bill requested — a supervisor is on the way.
          </div>
        )}
      </div>

      {/* --------------------------------------------------------------- body */}
      <main className="mx-auto max-w-2xl">
        {step === 'menu' && (
          menuLoading ? <MenuSkeleton /> : (
            <MenuView
              categories={menu?.categories ?? []}
              symbol={symbol}
              quantityOf={cart.quantityOf}
              onOpenItem={(item) => !ordersClosed && setActiveItem(item)}
              ordersPlaced={orders.length}
            />
          )
        )}

        {step === 'review' && (
          <ReviewView
            entries={cart.entries}
            symbol={symbol}
            subtotal={cart.subtotal}
            taxLabel={info?.restaurant.tax_label ?? 'Tax'}
            taxPercent={info?.restaurant.tax_percent ?? 0}
            serviceChargePercent={info?.restaurant.service_charge_percent ?? 0}
            taxInclusive={info?.restaurant.tax_inclusive ?? false}
            tableLabel={info?.table.label ?? ''}
            guestName={guestName}
            submitting={submitting}
            onQuantity={cart.setQuantity}
            onSubmit={placeOrder}
            onAddMore={() => goTo('menu')}
            onRename={(name) => {
              setGuestName(name);
              try { localStorage.setItem('resto.guestName', name); } catch { /* ignore */ }
            }}
          />
        )}

        {step === 'orders' && (
          <OrdersView
            orders={orders}
            totals={live?.totals ?? {
              subtotal: 0, discount_amount: 0, service_charge_percent: 0, service_charge_amount: 0,
              tax_percent: info?.restaurant.tax_percent ?? 0, tax_amount: 0,
              tax_inclusive: info?.restaurant.tax_inclusive ?? false, rounding_adjustment: 0, total: 0,
            }}
            symbol={symbol}
            taxLabel={info?.restaurant.tax_label ?? 'Tax'}
            bill={live?.bill ?? null}
            billRequested={billRequested}
            settled={settled}
            onRequestBill={() => setBillOpen(true)}
            onAddMore={() => goTo('menu')}
          />
        )}
      </main>

      {step === 'menu' && (
        <CartBar
          count={cart.count}
          subtotal={cart.subtotal}
          symbol={symbol}
          onReview={() => goTo('review')}
          onPeek={() => goTo('review')}
        />
      )}

      {/* When there is a tab bar but nothing in the cart, offer the orders view. */}
      {step === 'menu' && cart.count === 0 && orders.length > 0 && (
        <div
          className="fixed inset-x-0 bottom-0 z-20 border-t border-ink-100 bg-white px-4 pt-3 shadow-bar"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <div className="mx-auto flex max-w-2xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11.5px] font-normal text-ink-600">Running total</p>
              <p className="text-[19px] font-bold leading-tight tabular-nums tracking-tight text-ink-800">{money(live?.totals.total ?? 0, symbol)}</p>
            </div>
            <button type="button" onClick={() => goTo('orders')} className="btn-secondary py-3">Track orders</button>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------- overlays */}
      <ItemSheet item={activeItem} symbol={symbol} onClose={() => setActiveItem(null)} onAdd={(e: CartEntry) => cart.add(e)} />

      <Sheet open={billOpen} onClose={() => setBillOpen(false)} title="Ask for the bill">
        <div className="space-y-4">
          <div className="rounded-2xl bg-ink-50 p-4 text-center">
            <p className="text-[13px] font-normal text-ink-600">Amount due</p>
            <p className="mt-1 text-[30px] font-bold tabular-nums tracking-tight text-ink-800">{money(live?.totals.total ?? 0, symbol)}</p>
            <p className="mt-1 text-xs text-ink-600">
              Includes {info?.restaurant.tax_label} and any charges. A supervisor will bring the final bill.
            </p>
          </div>

          <p className="text-sm font-normal text-ink-700">How would you like to pay?</p>
          <div className="grid grid-cols-2 gap-2">
            {([
              ['UPI', 'UPI', 'phone'],
              ['CARD', 'Card', 'card'],
              ['CASH', 'Cash', 'cash'],
              ['OTHER', 'At the table', 'handshake'],
            ] as const).map(([value, label, icon]) => (
              <button
                key={value}
                type="button"
                onClick={() => requestBill(value)}
                className="btn-secondary flex-col gap-1.5 py-4"
              >
                <Icon name={icon} className="h-5 w-5 text-ink-500" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </Sheet>

      {toast.toast && <Toast message={toast.toast.message} tone={toast.toast.tone} onDone={toast.clear} />}
    </div>
  );
}
