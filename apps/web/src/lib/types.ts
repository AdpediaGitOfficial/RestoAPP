export type FoodType = 'VEG' | 'NON_VEG' | 'EGG' | 'VEGAN';
export type OrderStatus = 'PLACED' | 'ACCEPTED' | 'PREPARING' | 'READY' | 'SERVED' | 'CANCELLED';
export type SessionStatus = 'OPEN' | 'BILL_REQUESTED' | 'BILLED' | 'CLOSED';
export type BillStatus = 'DRAFT' | 'SETTLED' | 'VOID';
export type PaymentMethod = 'CASH' | 'CARD' | 'UPI' | 'WALLET' | 'OTHER';
export type Role = 'ADMIN' | 'SUPERVISOR' | 'KITCHEN';

export interface Variant { id: string; name: string; price_delta: number; is_default?: boolean }
export interface Addon { id: string; name: string; price: number; is_active?: boolean }

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  image_url: string | null;
  food_type: FoodType;
  is_available: boolean;
  is_active?: boolean;
  is_recommended: boolean;
  spice_level: number;
  prep_minutes: number;
  kitchen_station?: string;
  tags: string[];
  category_id?: string;
  category_name?: string;
  sort_order?: number;
  variants: Variant[];
  addons: Addon[];
}

export interface Category {
  id: string;
  name: string;
  description: string;
  sort_order: number;
  is_active?: boolean;
  item_count?: number;
  items: MenuItem[];
}

export interface OrderItem {
  id: string;
  item_name: string;
  variant_name: string | null;
  unit_price: number;
  quantity: number;
  addons: Addon[];
  addons_total: number;
  line_total: number;
  note: string;
  status: string;
  kitchen_station: string;
}

export interface Order {
  id: string;
  session_id: string;
  table_id: string;
  order_number: number;
  status: OrderStatus;
  channel: 'QR' | 'STAFF';
  note: string;
  subtotal: number;
  created_at: string;
  accepted_at: string | null;
  ready_at: string | null;
  table_label?: string;
  session_code?: string;
  placed_by_name?: string | null;
  items: OrderItem[];
}

export interface Totals {
  subtotal: number;
  discount_amount: number;
  service_charge_percent: number;
  service_charge_amount: number;
  tax_percent: number;
  tax_amount: number;
  tax_inclusive: boolean;
  rounding_adjustment: number;
  total: number;
}

export interface Bill {
  id: string;
  session_id: string;
  bill_number: string;
  status: BillStatus;
  subtotal: number;
  discount_amount: number;
  discount_reason: string;
  tax_percent: number;
  tax_amount: number;
  service_charge_percent: number;
  service_charge_amount: number;
  rounding_adjustment: number;
  total: number;
  amount_paid: number;
  payment_method: PaymentMethod | null;
  payment_reference: string | null;
  settled_at: string | null;
  created_at: string;
  table_label?: string;
  session_code?: string;
  settled_by_name?: string | null;
  guest_count?: number;
}

export interface TableBoardRow {
  id: string;
  code: string;
  label: string;
  seats: number;
  zone: string;
  qr_token: string;
  is_active: boolean;
  session_id: string | null;
  session_code: string | null;
  session_status: SessionStatus | null;
  opened_at: string | null;
  guest_count: number | null;
  bill_requested_at: string | null;
  payment_preference: string | null;
  order_count: number;
  running_subtotal: number;
  pending_orders: number;
  last_order_at: string | null;
  bill_id: string | null;
  bill_number: string | null;
  bill_status: BillStatus | null;
  bill_total: number | null;
  totals: Totals | null;
  url?: string;
}

export interface Settings {
  name: string; address: string; phone: string;
  currency: string; currency_symbol: string;
  tax_label: string; tax_percent: number;
  service_charge_percent: number;
  tax_inclusive: boolean; round_bill_total: boolean;
  accept_orders: boolean; bill_footer_note: string;
}

export interface StaffUser { id: string; name: string; email: string; role: Role; is_active: boolean }

export interface AppNotification {
  id: string;
  type: 'BILL_REQUEST' | 'NEW_ORDER' | 'WAITER_CALL' | 'ORDER_CANCELLED';
  table_id: string | null;
  session_id: string | null;
  order_id: string | null;
  message: string;
  is_read: boolean;
  created_at: string;
  table_label?: string | null;
}

export type MetricPeriod = 'today' | 'yesterday' | '7d' | '30d' | 'custom';

export interface MetricRange {
  period: MetricPeriod;
  tz: string;
  from: string; to: string; end: string;
  previous: { from: string; to: string; end: string };
}

export interface Kpi {
  key: string;
  label: string;
  value: number;
  previous: number | null;
  /** Percent change vs the previous equivalent window; null when there is no base. */
  change: number | null;
  format: 'money' | 'count' | 'percent';
  lowerIsBetter?: boolean;
  live?: boolean;
}

export interface TopItem {
  item_name: string;
  menu_item_id: string | null;
  quantity: number; revenue: number; orders: number;
  previous_quantity: number; previous_revenue: number;
  share_quantity: number; share_revenue: number;
  change: number | null;
  trend: 'up' | 'down' | 'flat' | 'new';
}

export interface ItemProfile {
  range: MetricRange;
  currency_symbol: string;
  item: { key: string; item_name: string | null; quantity: number; revenue: number; orders: number };
  /** Only the hours the restaurant traded in, labelled by the API. */
  hourly: { hour: number; label: string; short_label: string; quantity: number; revenue: number }[];
  weekday: { dow: number; quantity: number }[];
  peak_hour: number | null;
  peak_label: string | null;
}

export interface Dashboard {
  range: MetricRange;
  currency_symbol: string;
  kpis: Kpi[];
  live: {
    open_tables: number; bill_requests: number; pending_bills: number;
    orders_in_kitchen: number; open_table_value: number;
  };
  topItems: TopItem[];
  hourly: { hour: number; label: string; short_label: string; bills: number; revenue: number; covers: number }[];
  categories: { category: string; quantity: number; revenue: number }[];
  payments: { method: string; bills: number; amount: number }[];
  staff: { staff: string; bills: number; amount: number }[];
  trend: { date: string; revenue: number; bills: number }[];
  itemProfile: ItemProfile | null;
}

export interface DailyMetrics {
  date: string;
  summary: {
    bills_settled: number; revenue: number; net_sales: number; tax_collected: number;
    service_charge: number; discounts: number; guests: number; average_bill: number;
    orders_placed: number; orders_cancelled: number; avg_prep_minutes: number;
  };
  live: { open_tables: number; bill_requests: number; orders_in_kitchen: number; open_table_value: number };
  hourly: { hour: number; bills: number; revenue: number }[];
  topItems: { item_name: string; quantity: number; revenue: number }[];
  categories: { category: string; quantity: number; revenue: number }[];
  payments: { method: string; bills: number; amount: number }[];
  staff: { staff: string; bills: number; amount: number }[];
}
