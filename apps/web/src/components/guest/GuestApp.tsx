'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { guestApi, type GuestSession, type TableInfo } from '@/lib/api';
import { deviceId, useCart, type CartEntry } from '@/lib/cart';
import { money } from '@/lib/format';
import { useRealtime } from '@/lib/socket';
import type { Category, MenuItem } from '@/lib/types';
import { EmptyState, ErrorNote, FoodTypeMark, LoadingScreen, Sheet, Toast, useToast } from '@/components/ui';
import ItemSheet from './ItemSheet';
import CartSheet from './CartSheet';
import OrdersPanel from './OrdersPanel';

type Tab = 'menu' | 'orders';

export default function GuestApp({ token }: { token: string }) {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('menu');
  const [activeItem, setActiveItem] = useState<MenuItem | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [billOpen, setBillOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const cart = useCart(token);

  const { data: info, error: infoError, isLoading: infoLoading, mutate: refreshInfo } =
    useSWR<TableInfo>(['table', token], () => guestApi.table(token), { revalidateOnFocus: true });

  const { data: menu, error: menuError, isLoading: menuLoading, mutate: refreshMenu } =
    useSWR<{ categories: Category[] }>('menu', () => guestApi.menu(), { revalidateOnFocus: false });

  const sessionId = info?.session?.id ?? null;

  const { data: tab2, mutate: refreshSession } = useSWR<GuestSession>(
    sessionId ? ['session', sessionId, token] : null,
    () => guestApi.session(sessionId!, token),
    { refreshInterval: 30_000 },  // websockets do the heavy lifting; this is the safety net
  );

  // Live updates for this table only.
  useRealtime(
    {
      'order:created': () => refreshSession(),
      'order:updated': () => refreshSession(),
      'session:updated': () => { refreshSession(); refreshInfo(); },
      'session:closed': () => { refreshSession(); refreshInfo(); cart.clear(); },
      'bill:generated': () => refreshSession(),
      'bill:settled': () => { refreshSession(); refreshInfo(); cart.clear(); },
      'menu:changed': () => refreshMenu(),
    },
    { sessionId },
  );

  const symbol = info?.restaurant.currency_symbol ?? '₹';

  const categories = menu?.categories ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return categories;
    return categories
      .map((c) => ({ ...c, items: c.items.filter((i) => `${i.name} ${i.description} ${i.tags?.join(' ')}`.toLowerCase().includes(q)) }))
      .filter((c) => c.items.length > 0);
  }, [categories, search]);

  // Highlight the category the guest has scrolled to.
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  useEffect(() => {
    if (tab !== 'menu' || filtered.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible?.target.id) setActiveCategory(visible.target.id);
      },
      { rootMargin: '-140px 0px -65% 0px', threshold: 0 },
    );
    Object.values(sectionRefs.current).forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [filtered, tab]);

  const scrollToCategory = (id: string) => {
    const el = sectionRefs.current[id];
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 120;
    window.scrollTo({ top, behavior: 'smooth' });
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
      setCartOpen(false);
      setTab('orders');
      toast.show('Sent to the kitchen — we are on it!');
      await refreshInfo();
      await refreshSession();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Could not place the order', 'error');
    } finally {
      setSubmitting(false);
    }
  }, [cart, token, refreshInfo, refreshSession, toast]);

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
    if (!sessionId) return;
    try {
      await guestApi.callWaiter(sessionId, token);
      toast.show('We have let the team know.');
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Could not call for service', 'error');
    }
  };

  if (infoLoading || menuLoading) return <LoadingScreen label="Setting your table…" />;

  if (infoError) {
    return (
      <main className="mx-auto max-w-md px-4 py-16">
        <EmptyState
          icon="📵"
          title="We could not find this table"
          hint={infoError instanceof Error ? infoError.message : 'Please ask our staff to help you scan again.'}
        />
      </main>
    );
  }

  const orders = tab2?.orders ?? [];
  const activeOrders = orders.filter((o) => !['SERVED', 'CANCELLED'].includes(o.status)).length;
  const billRequested = tab2?.session?.status === 'BILL_REQUESTED';
  const settled = tab2?.bill?.status === 'SETTLED';
  const ordersClosed = info && !info.restaurant.accept_orders;

  return (
    <div className="min-h-screen pb-28">
      {/* ---------------------------------------------------------- header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur" style={{ top: 'env(safe-area-inset-top, 0px)' }}>
        <div className="mx-auto max-w-2xl px-4 pb-3 pt-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold text-slate-900">{info?.restaurant.name}</h1>
              <p className="text-sm text-slate-500">
                {info?.table.label} · {info?.table.zone}
                {tab2?.session?.code && <span className="ml-1 text-slate-400">· #{tab2.session.code}</span>}
              </p>
            </div>
            <button type="button" onClick={callWaiter} className="btn-secondary btn-sm shrink-0" disabled={!sessionId}>
              🔔 Call staff
            </button>
          </div>

          <nav className="mt-3 flex gap-1 rounded-xl bg-slate-100 p-1" aria-label="Sections">
            {(['menu', 'orders'] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                aria-current={tab === t}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold capitalize transition ${
                  tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                }`}
              >
                {t === 'orders' ? (
                  <>My orders {activeOrders > 0 && <span className="ml-1 rounded-full bg-brand-600 px-1.5 text-xs text-white">{activeOrders}</span>}</>
                ) : 'Menu'}
              </button>
            ))}
          </nav>

          {tab === 'menu' && (
            <>
              <input
                type="search"
                className="input mt-3"
                placeholder="Search the menu…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search the menu"
              />
              {filtered.length > 0 && (
                <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
                  {filtered.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => scrollToCategory(c.id)}
                      className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 transition ${
                        activeCategory === c.id
                          ? 'bg-brand-600 text-white ring-brand-600'
                          : 'bg-white text-slate-600 ring-slate-200'
                      }`}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </header>

      {ordersClosed && (
        <div className="mx-auto max-w-2xl px-4 pt-3">
          <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
            The kitchen has stopped taking orders for now. Please speak to our staff.
          </div>
        </div>
      )}

      {settled && (
        <div className="mx-auto max-w-2xl px-4 pt-3">
          <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 ring-1 ring-emerald-200">
            Your bill is settled — thank you for visiting! ({tab2?.bill?.bill_number})
          </div>
        </div>
      )}

      {billRequested && !settled && (
        <div className="mx-auto max-w-2xl px-4 pt-3">
          <div className="flex items-center gap-2 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-900 ring-1 ring-brand-200">
            <span className="h-2 w-2 animate-pulse rounded-full bg-brand-600" />
            Bill requested — a supervisor is on the way.
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------ body */}
      <main className="mx-auto max-w-2xl">
        {tab === 'menu' ? (
          menuError ? (
            <div className="px-4 py-6"><ErrorNote message="We could not load the menu." onRetry={() => refreshMenu()} /></div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-10">
              <EmptyState icon="🔍" title="Nothing matched that search" hint="Try a different dish or clear the search." />
            </div>
          ) : (
            <div className="space-y-6 px-4 py-4">
              {filtered.map((category) => (
                <section
                  key={category.id}
                  id={category.id}
                  ref={(el) => { sectionRefs.current[category.id] = el; }}
                  aria-labelledby={`h-${category.id}`}
                >
                  <h2 id={`h-${category.id}`} className="text-base font-bold text-slate-900">{category.name}</h2>
                  {category.description && <p className="mb-3 text-sm text-slate-500">{category.description}</p>}

                  <ul className="mt-3 space-y-3">
                    {category.items.map((item) => {
                      const inCart = cart.quantityOf(item.id);
                      const disabled = !item.is_available || ordersClosed;
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            disabled={disabled}
                            onClick={() => setActiveItem(item)}
                            className={`card flex w-full items-start gap-3 p-3 text-left transition ${
                              disabled ? 'opacity-55' : 'hover:ring-brand-300 active:scale-[0.995]'
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <FoodTypeMark type={item.food_type} />
                                <span className="truncate font-semibold text-slate-900">{item.name}</span>
                                {item.is_recommended && (
                                  <span className="chip bg-amber-50 text-amber-700 ring-amber-200">★ Popular</span>
                                )}
                              </div>
                              <p className="mt-1 text-sm font-semibold text-slate-900">
                                {money(item.price, symbol)}
                                {item.variants?.length > 0 && <span className="font-normal text-slate-400"> onwards</span>}
                              </p>
                              {item.description && (
                                <p className="mt-1 line-clamp-2 text-sm text-slate-500">{item.description}</p>
                              )}
                              <p className="mt-1.5 flex items-center gap-2 text-xs text-slate-400">
                                <span>{item.prep_minutes} min</span>
                                {item.spice_level > 0 && <span>{'🌶️'.repeat(item.spice_level)}</span>}
                                {!item.is_available && <span className="font-semibold text-rose-600">Sold out today</span>}
                              </p>
                            </div>

                            <div className="relative shrink-0">
                              {item.image_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={item.image_url} alt="" className="h-20 w-20 rounded-xl object-cover" />
                              ) : (
                                <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-brand-50 text-2xl" aria-hidden>
                                  🍽️
                                </div>
                              )}
                              {!disabled && (
                                <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-lg bg-white px-3 py-1 text-xs font-bold text-brand-700 shadow ring-1 ring-brand-200">
                                  {inCart > 0 ? `${inCart} added` : 'ADD'}
                                </span>
                              )}
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )
        ) : (
          <OrdersPanel
            orders={orders}
            totals={tab2?.totals ?? {
              subtotal: 0, discount_amount: 0, service_charge_percent: 0, service_charge_amount: 0,
              tax_percent: info?.restaurant.tax_percent ?? 0, tax_amount: 0,
              tax_inclusive: info?.restaurant.tax_inclusive ?? false, rounding_adjustment: 0, total: 0,
            }}
            symbol={symbol}
            taxLabel={info?.restaurant.tax_label ?? 'Tax'}
          />
        )}
      </main>

      {/* ------------------------------------------------- sticky action bar */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          {cart.count > 0 ? (
            <button type="button" onClick={() => setCartOpen(true)} className="btn-primary flex-1 py-3.5 text-base">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/25 text-sm">{cart.count}</span>
              View order
              <span className="ml-auto">{money(cart.subtotal, symbol)}</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setTab(tab === 'menu' ? 'orders' : 'menu')}
                className="btn-secondary flex-1 py-3"
              >
                {tab === 'menu' ? 'My orders' : 'Back to menu'}
              </button>
              {orders.length > 0 && !settled && (
                <button type="button" onClick={() => setBillOpen(true)} className="btn-primary flex-1 py-3" disabled={billRequested}>
                  {billRequested ? 'Bill requested' : 'Request bill'}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* --------------------------------------------------------- overlays */}
      <ItemSheet item={activeItem} symbol={symbol} onClose={() => setActiveItem(null)} onAdd={(e: CartEntry) => cart.add(e)} />

      <CartSheet
        open={cartOpen}
        entries={cart.entries}
        symbol={symbol}
        subtotal={cart.subtotal}
        submitting={submitting}
        taxNote={
          info?.restaurant.tax_inclusive
            ? `${info.restaurant.tax_label} included in the prices shown.`
            : `${info?.restaurant.tax_label ?? 'Tax'} at ${info?.restaurant.tax_percent ?? 0}%${
              info && info.restaurant.service_charge_percent > 0 ? ` and ${info.restaurant.service_charge_percent}% service charge` : ''
            } is added to the final bill.`
        }
        onClose={() => setCartOpen(false)}
        onQuantity={cart.setQuantity}
        onSubmit={placeOrder}
      />

      <Sheet open={billOpen} onClose={() => setBillOpen(false)} title="Request your bill">
        <div className="space-y-4">
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-slate-500">Amount due</span>
              <span className="text-2xl font-bold text-slate-900">{money(tab2?.totals.total ?? 0, symbol)}</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Includes {info?.restaurant.tax_label} and any charges. A supervisor will bring the final bill.
            </p>
          </div>

          <p className="text-sm text-slate-600">How would you like to pay?</p>
          <div className="grid grid-cols-2 gap-2">
            {[['UPI', '📱 UPI'], ['CARD', '💳 Card'], ['CASH', '💵 Cash'], ['OTHER', '🤝 Decide at the table']].map(([value, label]) => (
              <button key={value} type="button" onClick={() => requestBill(value)} className="btn-secondary py-3">
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
