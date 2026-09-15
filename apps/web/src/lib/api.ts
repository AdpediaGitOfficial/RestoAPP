/**
 * Thin fetch wrapper around the API. Staff calls carry a bearer token
 * kept in localStorage; guest calls carry the table's QR token instead.
 */
import type {
  Bill, Category, DailyMetrics, MenuItem, Order, Settings,
  StaffUser, TableBoardRow, AppNotification, Totals,
} from './types';

declare global {
  interface Window { __RESTO_API_URL__?: string }
}

/**
 * Where the API lives. Resolved per call, in this order:
 *
 *   1. window.__RESTO_API_URL__  — served by /env.js at request time, so the
 *      server's API_URL wins even against a stale build
 *   2. NEXT_PUBLIC_API_URL       — compiled in at build time
 *   3. localhost                 — local development
 */
export function apiUrl(): string {
  if (typeof window !== 'undefined' && window.__RESTO_API_URL__) {
    return window.__RESTO_API_URL__.replace(/\/$/, '');
  }
  return (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '');
}

/** @deprecated read at module load, so it misses the runtime value — call apiUrl(). */
export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

const TOKEN_KEY = 'resto.staff.token';

export const getToken = () => (typeof window === 'undefined' ? null : localStorage.getItem(TOKEN_KEY));
export const setToken = (t: string) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request<T>(path: string, options: RequestInit & { auth?: boolean } = {}): Promise<T> {
  const { auth = true, headers, ...rest } = options;
  const token = auth ? getToken() : null;

  const res = await fetch(`${apiUrl()}${path}`, {
    ...rest,
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = body?.error || {};
    // A stale token should bounce the user back to the login screen.
    if (res.status === 401 && auth && typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      clearToken();
    }
    throw new ApiError(res.status, err.code || 'ERROR', err.message || 'Something went wrong', err.details);
  }
  return body as T;
}

const get = <T,>(p: string, auth = true) => request<T>(p, { method: 'GET', auth });
const post = <T,>(p: string, body?: unknown, auth = true) =>
  request<T>(p, { method: 'POST', body: JSON.stringify(body ?? {}), auth });
const patch = <T,>(p: string, body: unknown, auth = true) =>
  request<T>(p, { method: 'PATCH', body: JSON.stringify(body), auth });
const del = <T,>(p: string) => request<T>(p, { method: 'DELETE' });

// ------------------------------------------------------------------ guest
export interface CartLine {
  menuItemId: string;
  variantId?: string | null;
  addonIds?: string[];
  quantity: number;
  note?: string;
}

export interface TableInfo {
  table: { id: string; code: string; label: string; seats: number; zone: string };
  session: { id: string; code: string; status: string; guest_count: number; opened_at: string } | null;
  restaurant: {
    name: string; currency_symbol: string; tax_label: string; tax_percent: number;
    service_charge_percent: number; tax_inclusive: boolean; accept_orders: boolean;
  };
}

export interface GuestSession {
  session: { id: string; code: string; status: string; guest_count: number; opened_at: string; table_label: string };
  orders: Order[];
  subtotal: number;
  totals: Totals;
  bill: Bill | null;
  currency_symbol: string;
}

export const guestApi = {
  table: (token: string) => get<TableInfo>(`/api/public/tables/${token}`, false),
  menu: () => get<{ categories: Category[] }>('/api/public/menu', false),
  placeOrder: (body: { token: string; items: CartLine[]; note?: string; guestDevice?: string; guestCount?: number }) =>
    post<{ order: Order }>('/api/public/orders', body, false),
  session: (id: string, token: string) => get<GuestSession>(`/api/public/sessions/${id}?token=${token}`, false),
  requestBill: (id: string, token: string, paymentPreference?: string) =>
    post<{ session: { id: string; status: string } }>(`/api/public/sessions/${id}/request-bill`, { token, paymentPreference }, false),
  callWaiter: (id: string, token: string, message?: string) =>
    post<{ ok: boolean }>(`/api/public/sessions/${id}/call-waiter`, { token, message }, false),
  updateSession: (id: string, token: string, body: { guestCount?: number; guestName?: string }) =>
    patch<{ session: { id: string } }>(`/api/public/sessions/${id}`, { token, ...body }, false),
};

// ------------------------------------------------------------------ staff
export const authApi = {
  login: (email: string, password: string) =>
    post<{ token: string; user: StaffUser }>('/api/auth/login', { email, password }, false),
  logout: () => post<{ ok: boolean }>('/api/auth/logout'),
  me: () => get<{ user: StaffUser }>('/api/auth/me'),
  changePassword: (currentPassword: string, newPassword: string) =>
    post<{ ok: boolean }>('/api/auth/change-password', { currentPassword, newPassword }),
  users: () => get<{ users: StaffUser[] }>('/api/auth/users'),
  createUser: (body: { name: string; email: string; password: string; role: string }) =>
    post<{ user: StaffUser }>('/api/auth/users', body),
  updateUser: (id: string, body: Partial<{ name: string; role: string; is_active: boolean; password: string }>) =>
    patch<{ user: StaffUser }>(`/api/auth/users/${id}`, body),
};

export const staffApi = {
  tables: () => get<{ tables: TableBoardRow[] }>('/api/staff/tables'),
  session: (id: string) => get<{
    session: Record<string, unknown> & { id: string; code: string; status: string; table_label: string; guest_count: number; opened_at: string };
    orders: Order[]; bill: Bill | null; subtotal: number; totals: Totals; settings: Settings;
  }>(`/api/staff/sessions/${id}`),
  closeSession: (id: string) => post<{ session: unknown }>(`/api/staff/sessions/${id}/close`),
  updateSession: (id: string, body: { guestCount?: number; guestName?: string }) =>
    patch<{ session: unknown }>(`/api/staff/sessions/${id}`, body),

  orders: (params: { active?: boolean; sessionId?: string; status?: string; limit?: number } = {}) => {
    const q = new URLSearchParams();
    if (params.active) q.set('active', 'true');
    if (params.sessionId) q.set('sessionId', params.sessionId);
    if (params.status) q.set('status', params.status);
    if (params.limit) q.set('limit', String(params.limit));
    return get<{ orders: Order[] }>(`/api/staff/orders?${q}`);
  },
  placeOrder: (body: { tableId: string; items: CartLine[]; note?: string; guestCount?: number }) =>
    post<{ order: Order }>('/api/staff/orders', body),
  setOrderStatus: (id: string, status: string, reason?: string) =>
    post<{ order: Order }>(`/api/staff/orders/${id}/status`, { status, reason }),
  setItemStatus: (id: string, status: string) =>
    post<{ order: Order }>(`/api/staff/order-items/${id}/status`, { status }),
  reprintKot: (id: string) => post<{ job: unknown }>(`/api/staff/orders/${id}/reprint`),

  generateBill: (sessionId: string, body: { discountAmount?: number; discountReason?: string } = {}) =>
    post<{ bill: Bill }>(`/api/staff/sessions/${sessionId}/bill`, body),
  bills: (params: { from?: string; to?: string; status?: string; limit?: number } = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null) as [string, string][]);
    return get<{ bills: Bill[] }>(`/api/staff/bills?${q}`);
  },
  bill: (id: string) => get<{ bill: Bill; items: OrderItemLike[]; settings: Settings }>(`/api/staff/bills/${id}`),
  settleBill: (id: string, body: { paymentMethod: string; paymentReference?: string; amountPaid?: number }) =>
    post<{ bill: Bill }>(`/api/staff/bills/${id}/settle`, body),
  voidBill: (id: string, reason?: string) => post<{ bill: Bill }>(`/api/staff/bills/${id}/void`, { reason }),
  reprintBill: (id: string) => post<{ job: unknown }>(`/api/staff/bills/${id}/reprint`),

  printJobs: (status = 'QUEUED') => get<{ jobs: PrintJob[] }>(`/api/staff/print-jobs?status=${status}`),
  printJob: (id: string) => get<{ job: PrintJob }>(`/api/staff/print-jobs/${id}`),
  markPrinted: (id: string) => post<{ job: PrintJob }>(`/api/staff/print-jobs/${id}/printed`),

  notifications: (all = false) => get<{ notifications: AppNotification[] }>(`/api/staff/notifications?all=${all}`),
  readNotification: (id: string) => post<{ notification: AppNotification }>(`/api/staff/notifications/${id}/read`),
};

export interface PrintJob {
  id: string; type: 'KOT' | 'BILL' | 'KOT_VOID'; station: string;
  order_id: string | null; bill_id: string | null; copy_number: number;
  content: string; status: 'QUEUED' | 'PRINTED' | 'FAILED';
  created_at: string; order_number?: number; table_label?: string;
}
export interface OrderItemLike {
  id: string; item_name: string; variant_name: string | null; unit_price: number;
  quantity: number; addons: { name: string; price: number }[]; addons_total: number; line_total: number;
}

export const adminApi = {
  categories: () => get<{ categories: Category[] }>('/api/admin/categories'),
  createCategory: (body: { name: string; description?: string; sort_order?: number }) =>
    post<{ category: Category }>('/api/admin/categories', body),
  updateCategory: (id: string, body: Partial<Category>) =>
    patch<{ category: Category }>(`/api/admin/categories/${id}`, body),
  deleteCategory: (id: string) => del<{ ok: boolean }>(`/api/admin/categories/${id}`),

  menuItems: (categoryId?: string) =>
    get<{ items: MenuItem[] }>(`/api/admin/menu-items${categoryId ? `?categoryId=${categoryId}` : ''}`),
  createMenuItem: (body: Record<string, unknown>) => post<{ item: MenuItem }>('/api/admin/menu-items', body),
  updateMenuItem: (id: string, body: Record<string, unknown>) =>
    patch<{ item: MenuItem }>(`/api/admin/menu-items/${id}`, body),
  setAvailability: (id: string, is_available: boolean) =>
    post<{ item: MenuItem }>(`/api/admin/menu-items/${id}/availability`, { is_available }),
  deleteMenuItem: (id: string) => del<{ ok: boolean; archived: boolean }>(`/api/admin/menu-items/${id}`),

  tables: () => get<{ tables: TableBoardRow[] }>('/api/admin/tables'),
  createTable: (body: { code: string; label: string; seats?: number; zone?: string }) =>
    post<{ table: TableBoardRow }>('/api/admin/tables', body),
  bulkTables: (body: { count: number; prefix?: string; startAt?: number; seats?: number; zone?: string }) =>
    post<{ tables: TableBoardRow[]; skipped: number }>('/api/admin/tables/bulk', body),
  updateTable: (id: string, body: Record<string, unknown>) =>
    patch<{ table: TableBoardRow }>(`/api/admin/tables/${id}`, body),
  rotateQr: (id: string) => post<{ table: TableBoardRow }>(`/api/admin/tables/${id}/rotate-qr`),
  deleteTable: (id: string) => del<{ ok: boolean; archived: boolean }>(`/api/admin/tables/${id}`),
  tableQr: (id: string) => get<{ table: TableBoardRow; url: string; qr: string }>(`/api/admin/tables/${id}/qr`),
  allQr: () => get<{ tables: { id: string; code: string; label: string; zone: string; url: string; qr: string }[] }>('/api/admin/tables/qr/all'),

  settings: () => get<{ settings: Settings }>('/api/admin/settings'),
  updateSettings: (body: Partial<Settings>) => patch<{ settings: Settings }>('/api/admin/settings', body),

  dailyMetrics: (date?: string) => get<DailyMetrics>(`/api/admin/metrics/daily${date ? `?date=${date}` : ''}`),
  trend: (days = 14) => get<{ trend: { date: string; revenue: number; bills: number }[] }>(`/api/admin/metrics/trend?days=${days}`),
};
