export type VatRate = 0 | 4 | 5 | 10 | 22;
export type PaymentMethod = "elettronico" | "contanti";

export interface Product {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  category?: string;
  cost_price: number;
  price_gross: number;
  vat_rate: VatRate;
  stock_quantity: number;
  favorite?: boolean;
  track_lots?: boolean;
  expiry_alert_days?: number;
  is_variant_parent?: boolean;
  parent_id?: string;
  variant_attributes?: { name: string; value: string }[];
  is_composite?: boolean;
  recipe_items?: { product_id: string; quantity: number }[];
  location_stock?: Record<string, number>;
}

export interface Lot {
  id: string;
  product_id: string;
  lot_code: string;
  expiry_date: string | null;
  qty_received: number;
  qty_remaining: number;
  supplier_id?: string | null;
  supplier_name?: string | null;
  cost_price?: number | null;
  received_at: string;
  note?: string | null;
}


export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price_gross: number;
  vat_rate: VatRate;
  total_gross: number;
  net_amount: number;
  vat_amount: number;
}

export interface Order {
  id: string;
  created_at: string;
  payment_method: PaymentMethod;
  lottery_code: string | null;
  customer_name?: string | null;
  note?: string | null;
  discount?: number; // gross EUR off the total
  items: OrderItem[];
  total_gross: number;
  total_net: number;
  total_vat: number;
  total_cost: number;
  transmitted: boolean;
  transmission_id?: string;
  refunded?: boolean;
  refund_of?: string | null; // id of original order if this is a refund
  refund_reason?: string | null;
  refund_partial?: boolean;
  shift_id?: string | null;
  cashier_id?: string | null;
  location_id?: string | null;
}

export type ShiftStatus = "open" | "closed";

export interface CashMovement {
  id: string;
  shift_id: string;
  created_at: string;
  kind: "paid_in" | "paid_out";
  amount: number; // always positive EUR
  reason: string;
}

export interface Shift {
  id: string;
  register_name: string;
  cashier?: string | null;
  opened_at: string;
  closed_at?: string | null;
  opening_float: number; // cash in drawer at open
  counted_cash?: number | null; // cash counted at close
  status: ShiftStatus;
  open_note?: string | null;
  close_note?: string | null;
  location_id?: string | null;
  cash_denominations?: Record<string, number> | null;
}

export type RefundReason =
  | "defective"
  | "wrong_item"
  | "customer_changed_mind"
  | "expired"
  | "price_error"
  | "duplicate"
  | "other";

export interface ActivityEntry {
  id: string;
  created_at: string;
  kind: "product" | "order" | "expense" | "stock" | "system";
  action: string; // create | update | delete | refund | partial_refund | adjust | config | reset
  summary: string;
  ref_id?: string;
  amount?: number;
}


export interface StockMovement {
  id: string;
  created_at: string;
  product_id: string;
  product_name: string;
  delta: number;
  reason: "sale" | "refund" | "restock" | "adjustment" | "loss" | "import";
  note?: string;
}

export type ExpenseCostType = "direct" | "indirect";
export type ExpenseRecurrence = "none" | "weekly" | "monthly" | "quarterly" | "yearly";
export type ExpenseStatus = "paid" | "pending" | "overdue";

export interface Supplier {
  id: string;
  name: string;
  vat_number?: string;
  email?: string;
  phone?: string;
  note?: string;
}

export interface Expense {
  id: string;
  created_at: string;
  date: string; // yyyy-mm-dd (incurred date)
  due_date?: string | null;
  category: string;
  cost_type: ExpenseCostType; // direct (COGS-like) vs indirect (OpEx)
  description: string;
  amount: number; // gross
  vat_rate: VatRate;
  payment_method: PaymentMethod;
  supplier_id?: string | null;
  supplier_name?: string | null;
  reference?: string | null; // invoice / document #
  status: ExpenseStatus;
  recurrence: ExpenseRecurrence;
  next_due?: string | null;
  tags?: string[];
  location_id?: string | null;
}

export interface FiscalConfig {
  partita_iva: string;
  codice_fiscale: string;
  api_provider: "Openapi.it" | "Effatta" | "A-Cube";
  api_key: string;
  store_name?: string;
  address?: string;
  phone?: string;
  email?: string;
  receipt_footer?: string;
  low_stock_threshold?: number;
  expiry_alert_days?: number; // global default for expiry warnings
}

export interface ParsedVoiceItem {
  product_name: string;
  quantity: number;
}

export interface ParsedVoiceOrder {
  items: ParsedVoiceItem[];
  payment_method: PaymentMethod;
  lottery_code: string | null;
}

export interface CartLine {
  product_id: string;
  quantity: number;
}

export type UserRole = "owner" | "manager" | "cashier";

export interface User {
  id: string;
  name: string;
  role: UserRole;
  pin?: string;
  hourly_rate: number;
  commission_rate: number;
  status: "active" | "inactive";
}

export interface TimeLog {
  id: string;
  user_id: string;
  clock_in: string;
  clock_out?: string | null;
}

export interface Location {
  id: string;
  name: string;
  address?: string | null;
}

export interface SyncConfig {
  enabled: boolean;
  provider: "firebase";
  projectId?: string;
  apiKey?: string;
  lastSynced?: string | null;
}

