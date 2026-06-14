import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Product,
  Order,
  OrderItem,
  FiscalConfig,
  VatRate,
  PaymentMethod,
  StockMovement,
  Expense,
  Supplier,
  CartLine,
  ActivityEntry,
  RefundReason,
  Lot,
  Shift,
  CashMovement,
} from "./types";


const uid = () => crypto.randomUUID();

function calcItem(p: Product, qty: number): Omit<OrderItem, "id" | "order_id"> {
  const total_gross = +(p.price_gross * qty).toFixed(2);
  const net_amount = +(total_gross / (1 + p.vat_rate / 100)).toFixed(2);
  const vat_amount = +(total_gross - net_amount).toFixed(2);
  return {
    product_id: p.id,
    product_name: p.name,
    quantity: qty,
    unit_price_gross: p.price_gross,
    vat_rate: p.vat_rate,
    total_gross,
    net_amount,
    vat_amount,
  };
}

interface CreateOrderOptions {
  payment_method: PaymentMethod;
  lottery_code?: string | null;
  customer_name?: string | null;
  note?: string | null;
  discount?: number;
}

export interface ChatMessage {
  id: string;
  sender: "user" | "bot";
  text: string;
  timestamp: string; // ISO string for serialisation
  data?: any;
  chartType?: "bar" | "pie" | "card" | null;
}

interface State {
  products: Product[];
  orders: Order[];
  movements: StockMovement[];
  expenses: Expense[];
  suppliers: Supplier[];
  activity: ActivityEntry[];
  lots: Lot[];
  shifts: Shift[];
  cashMovements: CashMovement[];
  config: FiscalConfig;
  users: User[];
  currentUser: User;
  timeLogs: TimeLog[];
  locations: Location[];
  currentLocation: Location;
  syncConfig: SyncConfig;
  chatMessages: ChatMessage[];

  // Products
  addProduct: (p: Omit<Product, "id">) => void;
  updateProduct: (id: string, p: Partial<Product>) => void;
  deleteProduct: (id: string) => void;
  toggleFavorite: (id: string) => void;
  adjustStock: (id: string, delta: number, reason: StockMovement["reason"], note?: string) => void;
  importProducts: (rows: Omit<Product, "id">[]) => number;

  // Orders
  createOrder: (cart: CartLine[], opts: CreateOrderOptions) => Order | null;
  deleteOrder: (id: string) => void;
  refundOrder: (
    id: string,
    opts?: { items?: { item_id: string; quantity: number }[]; reason?: RefundReason | string },
  ) => Order | null;
  updateOrderNote: (id: string, note: string) => void;

  // Expenses
  addExpense: (e: Omit<Expense, "id" | "created_at">) => void;
  updateExpense: (id: string, e: Partial<Expense>) => void;
  deleteExpense: (id: string) => void;
  markExpensePaid: (id: string) => void;
  rollRecurringExpenses: () => void;

  // Suppliers
  addSupplier: (s: Omit<Supplier, "id">) => Supplier;
  updateSupplier: (id: string, s: Partial<Supplier>) => void;
  deleteSupplier: (id: string) => void;

  // Lots
  addLot: (lot: Omit<Lot, "id" | "received_at" | "qty_remaining"> & { qty_remaining?: number; received_at?: string }) => Lot;
  updateLot: (id: string, patch: Partial<Lot>) => void;
  deleteLot: (id: string) => void;

  // Activity
  clearActivity: () => void;

  // Shifts / cash drawer
  openShift: (input: { register_name: string; cashier?: string | null; opening_float: number; note?: string | null; cash_denominations?: Record<string, number> | null }) => Shift;
  closeShift: (input: { counted_cash: number; note?: string | null }) => Shift | null;
  addCashMovement: (input: { kind: "paid_in" | "paid_out"; amount: number; reason: string }) => CashMovement | null;
  deleteShift: (id: string) => void;
  updateShiftDenominations: (received: Record<string, number>, change: Record<string, number>) => void;

  // Config
  saveConfig: (c: FiscalConfig) => void;

  // User & Staff Actions
  switchUser: (userId: string, pin?: string) => boolean;
  addUser: (u: Omit<User, "id">) => void;
  updateUser: (id: string, u: Partial<User>) => void;
  deleteUser: (id: string) => void;
  clockIn: (userId: string) => void;
  clockOut: (userId: string) => void;

  // Location Actions
  addLocation: (l: Omit<Location, "id">) => void;
  switchLocation: (id: string) => void;
  transferStock: (productId: string, fromLocId: string, toLocId: string, quantity: number) => void;
  deleteLocation: (id: string) => void;
  updateLocation: (id: string, patch: Partial<Location>) => void;

  // Pricing Suggestions
  getDynamicPricingSuggestions: () => { product_id: string; product_name: string; current_price: number; suggested_price: number; reason: string }[];
  applyPricingSuggestion: (productId: string, suggestedPrice: number) => void;

  // Sync Actions
  setSyncConfig: (cfg: Partial<SyncConfig>) => void;
  triggerSync: () => Promise<void>;

  // Chat
  addChatMessage: (msg: Omit<ChatMessage, "id">) => void;
  clearChat: () => void;

  // Maintenance
  resetAll: () => void;
  importBackup: (data: Partial<State>) => void;
}



// Static seed IDs — must NOT call crypto.randomUUID() at module init
// (Cloudflare Workers disallow random/IO in global scope).
import { User, TimeLog, Location, SyncConfig } from "./types";

const seedUsers: User[] = [
  { id: "user-owner", name: "Proprietario", role: "owner", pin: "1111", hourly_rate: 25, commission_rate: 2, status: "active" },
  { id: "user-manager", name: "Gestore", role: "manager", pin: "2222", hourly_rate: 18, commission_rate: 1, status: "active" },
  { id: "user-cashier", name: "Cassiere", role: "cashier", pin: "3333", hourly_rate: 12, commission_rate: 1, status: "active" },
];

const seedLocations: Location[] = [
  { id: "loc-rome", name: "Roma Centro" },
  { id: "loc-milan", name: "Milano Branch" },
];

const defaultSyncConfig: SyncConfig = {
  enabled: false,
  provider: "firebase",
};

const seedProducts: Product[] = [
  { id: "seed-wal-001", name: "Portafoglio in Pelle", sku: "WAL-001", category: "Accessori", cost_price: 18, price_gross: 49.9, vat_rate: 22, stock_quantity: 12, location_stock: { "loc-rome": 8, "loc-milan": 4 } },
  { id: "seed-bat-aa4", name: "Batterie AA (4pz)", sku: "BAT-AA4", category: "Casa", cost_price: 1.2, price_gross: 4.5, vat_rate: 22, stock_quantity: 48, location_stock: { "loc-rome": 30, "loc-milan": 18 } },
  { id: "seed-pan-001", name: "Pane Fresco", sku: "PAN-001", category: "Alimentari", cost_price: 0.4, price_gross: 1.2, vat_rate: 4, stock_quantity: 0, location_stock: { "loc-rome": 0, "loc-milan": 0 } },
  { id: "seed-oil-evo1", name: "Olio Extra Vergine 1L", sku: "OIL-EVO1", category: "Alimentari", cost_price: 6.5, price_gross: 12.9, vat_rate: 10, stock_quantity: 24, location_stock: { "loc-rome": 15, "loc-milan": 9 } },
  { id: "seed-qdn-a5", name: "Quaderno A5", sku: "QDN-A5", category: "Cartoleria", cost_price: 1.1, price_gross: 3.5, vat_rate: 22, stock_quantity: 3, location_stock: { "loc-rome": 2, "loc-milan": 1 } },
];

const defaultConfig: FiscalConfig = {
  partita_iva: "",
  codice_fiscale: "",
  api_provider: "Openapi.it",
  api_key: "",
  store_name: "",
  address: "",
  phone: "",
  email: "",
  receipt_footer: "Grazie e arrivederci!",
  low_stock_threshold: 3,
  expiry_alert_days: 14,
};

export const useStore = create<State>()(
  persist(
    (set, get) => {
      const log = (e: Omit<ActivityEntry, "id" | "created_at">) =>
        set({
          activity: [
            { ...e, id: uid(), created_at: new Date().toISOString() },
            ...get().activity,
          ].slice(0, 300),
        });

      return {
        products: seedProducts,
        orders: [],
        movements: [],
        expenses: [],
        suppliers: [],
        activity: [],
        lots: [],
        shifts: [],
        cashMovements: [],
        config: defaultConfig,
        users: seedUsers,
        currentUser: seedUsers[0],
        timeLogs: [],
        locations: seedLocations,
        currentLocation: seedLocations[0],
        chatMessages: [],
        syncConfig: defaultSyncConfig,

        addProduct: (p) => {
          const prod = { ...p, id: uid() };
          set({ products: [...get().products, prod] });
          log({ kind: "product", action: "create", summary: prod.name, ref_id: prod.id });
        },
        updateProduct: (id, p) => {
          set({ products: get().products.map((x) => (x.id === id ? { ...x, ...p } : x)) });
          const name = get().products.find((x) => x.id === id)?.name ?? id;
          log({ kind: "product", action: "update", summary: name, ref_id: id });
        },
        deleteProduct: (id) => {
          const name = get().products.find((x) => x.id === id)?.name ?? id;
          set({
            products: get().products.filter((x) => x.id !== id),
            movements: get().movements.filter((m) => m.product_id !== id),
          });
          log({ kind: "product", action: "delete", summary: name, ref_id: id });
        },

        toggleFavorite: (id) => {
          set({
            products: get().products.map((p) =>
              p.id === id ? { ...p, favorite: !p.favorite } : p,
            ),
          });
        },

        adjustStock: (id, delta, reason, note) => {
          const prod = get().products.find((p) => p.id === id);
          if (!prod) return;
          set({
            products: get().products.map((p) =>
              p.id === id ? { ...p, stock_quantity: p.stock_quantity + delta } : p,
            ),
            movements: [
              {
                id: uid(),
                created_at: new Date().toISOString(),
                product_id: id,
                product_name: prod.name,
                delta,
                reason,
                note,
              },
              ...get().movements,
            ].slice(0, 500),
          });
          log({
            kind: "stock",
            action: "adjust",
            summary: `${prod.name} ${delta > 0 ? "+" : ""}${delta} (${reason})`,
            ref_id: id,
          });
        },

        importProducts: (rows) => {
          let count = 0;
          const products = [...get().products];
          for (const r of rows) {
            if (!r.name || !r.sku) continue;
            const existing = products.find((p) => p.sku === r.sku);
            if (existing) {
              Object.assign(existing, r);
            } else {
              products.push({ ...r, id: uid() });
            }
            count++;
          }
          set({ products });
          log({ kind: "product", action: "import", summary: `${count} ${count === 1 ? "row" : "rows"}` });
          return count;
        },

        createOrder: (cart, opts) => {
          const products = get().products;
          const order_id = uid();
          const items: OrderItem[] = [];
          let total_gross = 0, total_net = 0, total_vat = 0, total_cost = 0;
          const activeLocId = get().currentLocation?.id ?? "loc-rome";

          // Stock Check - Block composite orders if components are insufficient
          for (const c of cart) {
            const p = products.find((x) => x.id === c.product_id);
            if (!p) return null;
            if (p.is_composite) {
              if (!p.recipe_items || p.recipe_items.length === 0) return null;
              for (const ri of p.recipe_items) {
                const ingredient = products.find((x) => x.id === ri.product_id);
                if (!ingredient) return null;
                const req = ri.quantity * c.quantity;
                const stock = ingredient.location_stock?.[activeLocId] ?? ingredient.stock_quantity;
                if (stock < req) {
                  return null; // block checkout
                }
              }
            } else {
              const stock = p.location_stock?.[activeLocId] ?? p.stock_quantity;
              if (stock < c.quantity) {
                return null; // block checkout
              }
            }
          }

          for (const c of cart) {
            const p = products.find((x) => x.id === c.product_id);
            if (!p) return null;
            const base = calcItem(p, c.quantity);
            items.push({ id: uid(), order_id, ...base });
            total_gross += base.total_gross;
            total_net += base.net_amount;
            total_vat += base.vat_amount;
            total_cost += p.cost_price * c.quantity;
          }

          const discount = Math.max(0, Math.min(opts.discount ?? 0, total_gross));
          if (discount > 0) {
            const ratio = (total_gross - discount) / total_gross;
            total_gross = +(total_gross - discount).toFixed(2);
            total_net = +(total_net * ratio).toFixed(2);
            total_vat = +(total_gross - total_net).toFixed(2);
          }

          const openShift = get().shifts.find((s) => s.status === "open");
          const order: Order = {
            id: order_id,
            created_at: new Date().toISOString(),
            payment_method: opts.payment_method,
            lottery_code: opts.lottery_code ?? null,
            customer_name: opts.customer_name ?? null,
            note: opts.note ?? null,
            discount: discount || undefined,
            items,
            total_gross: +total_gross.toFixed(2),
            total_net: +total_net.toFixed(2),
            total_vat: +total_vat.toFixed(2),
            total_cost: +total_cost.toFixed(2),
            transmitted: true,
            transmission_id: "AdE-" + Math.random().toString(36).slice(2, 10).toUpperCase(),
            shift_id: openShift?.id ?? null,
            cashier_id: get().currentUser?.id ?? null,
            location_id: activeLocId,
          };

          const movements: StockMovement[] = [];
          const newProducts = products.map((p) => {
            const soldDirect = p.is_composite ? 0 : cart.filter((c) => c.product_id === p.id).reduce((a, b) => a + b.quantity, 0);

            // Deduct recipe items for composite products
            let consumedAsIngredient = 0;
            for (const c of cart) {
              const parent = products.find((x) => x.id === c.product_id);
              if (parent?.is_composite && parent.recipe_items) {
                const match = parent.recipe_items.find((ri) => ri.product_id === p.id);
                if (match) consumedAsIngredient += match.quantity * c.quantity;
              }
            }

            const totalDeducted = soldDirect + consumedAsIngredient;

            if (totalDeducted) {
              movements.push({
                id: uid(),
                created_at: order.created_at,
                product_id: p.id,
                product_name: p.name,
                delta: -totalDeducted,
                reason: "sale",
                note: order.transmission_id,
              });

              const currentLocStock = p.location_stock?.[activeLocId] ?? p.stock_quantity;
              const newLocStock = Math.max(0, currentLocStock - totalDeducted);
              const updatedLocStock = {
                ...(p.location_stock ?? {}),
                [activeLocId]: newLocStock
              };
              const totalStock = Object.values(updatedLocStock).reduce((sum, val) => sum + val, 0);

              return { ...p, stock_quantity: totalStock, location_stock: updatedLocStock };
            }
            return p;
          });

          // FEFO lot consumption for tracked products
          const lots = [...get().lots];
          for (const c of cart) {
            const p = newProducts.find((x) => x.id === c.product_id);
            if (!p?.track_lots) continue;
            let need = c.quantity;
            const eligible = lots
              .filter((l) => l.product_id === p.id && l.qty_remaining > 0)
              .sort((a, b) => {
                const ax = a.expiry_date ?? "9999-12-31";
                const bx = b.expiry_date ?? "9999-12-31";
                if (ax !== bx) return ax < bx ? -1 : 1;
                return a.received_at < b.received_at ? -1 : 1;
              });
            for (const l of eligible) {
              if (need <= 0) break;
              const take = Math.min(need, l.qty_remaining);
              const idx = lots.findIndex((x) => x.id === l.id);
              lots[idx] = { ...l, qty_remaining: l.qty_remaining - take };
              need -= take;
            }
          }

          set({
            orders: [order, ...get().orders],
            products: newProducts,
            movements: [...movements, ...get().movements].slice(0, 500),
            lots,
          });
          log({
            kind: "order",
            action: "create",
            summary: `${order.transmission_id} · ${items.length} ${items.length === 1 ? "item" : "items"}`,
            ref_id: order.id,
            amount: order.total_gross,
          });

          const payload = buildFiscalPayload(order, get().config);
          console.info("[Agenzia delle Entrate — mock transmission]", payload);

          return order;
        },

        deleteOrder: (id) => {
          const order = get().orders.find((o) => o.id === id);
          if (!order) return;
          const linkedRefunds = get().orders.filter((o) => o.refund_of === id);
          const removedIds = new Set<string>([id, ...linkedRefunds.map((r) => r.id)]);
          const removedTxIds = new Set<string>(
            [order, ...linkedRefunds].map((o) => o.transmission_id ?? "").filter(Boolean),
          );

          const hadRefund = linkedRefunds.length > 0;
          const products = get().products.map((p) => {
            if (order.refund_of) return p;
            if (hadRefund) return p;
            const back = order.items
              .filter((i) => i.product_id === p.id)
              .reduce((a, b) => a + b.quantity, 0);
            return back ? { ...p, stock_quantity: p.stock_quantity + back } : p;
          });

          let products2 = products;
          if (order.refund_of) {
            products2 = products.map((p) => {
              const restored = order.items
                .filter((i) => i.product_id === p.id)
                .reduce((a, b) => a + b.quantity, 0);
              return restored ? { ...p, stock_quantity: p.stock_quantity + restored } : p;
            });
          }

          set({
            orders: get()
              .orders.filter((o) => !removedIds.has(o.id))
              .map((o) => (linkedRefunds.some((r) => r.refund_of === o.id) ? { ...o, refunded: false } : o)),
            products: products2,
            movements: get().movements.filter((m) => !m.note || !removedTxIds.has(m.note)),
          });
          log({
            kind: "order",
            action: "delete",
            summary: order.transmission_id ?? id,
            ref_id: id,
            amount: order.total_gross,
          });
        },

        refundOrder: (id, opts) => {
          const order = get().orders.find((o) => o.id === id);
          if (!order || order.refund_of) return null;

          // Determine refund quantities per item. Default = full refund.
          const remaining = computeRemainingPerItem(order, get().orders);
          const requested = (opts?.items ?? order.items.map((i) => ({ item_id: i.id, quantity: remaining.get(i.id) ?? 0 })));

          const refundItems: OrderItem[] = [];
          const refund_id = uid();
          let total_gross = 0, total_net = 0, total_vat = 0, total_cost = 0;

          for (const req of requested) {
            const it = order.items.find((x) => x.id === req.item_id);
            if (!it) continue;
            const left = remaining.get(it.id) ?? 0;
            const qty = Math.max(0, Math.min(req.quantity, left));
            if (qty === 0) continue;
            const ratio = qty / it.quantity;
            const tg = +(it.total_gross * ratio).toFixed(2);
            const tn = +(it.net_amount * ratio).toFixed(2);
            const tv = +(tg - tn).toFixed(2);
            const product = get().products.find((p) => p.id === it.product_id);
            const cost = product ? +(product.cost_price * qty).toFixed(2) : 0;
            refundItems.push({
              ...it,
              id: uid(),
              order_id: refund_id,
              quantity: -qty,
              total_gross: -tg,
              net_amount: -tn,
              vat_amount: -tv,
            });
            total_gross += tg;
            total_net += tn;
            total_vat += tv;
            total_cost += cost;
          }

          if (refundItems.length === 0) return null;

          const currentShiftRefund = get().shifts.find((s) => s.status === "open");
          const refund: Order = {
            ...order,
            id: refund_id,
            created_at: new Date().toISOString(),
            items: refundItems,
            total_gross: -(+total_gross.toFixed(2)),
            total_net: -(+total_net.toFixed(2)),
            total_vat: -(+total_vat.toFixed(2)),
            total_cost: -(+total_cost.toFixed(2)),
            transmission_id: "REF-" + Math.random().toString(36).slice(2, 10).toUpperCase(),
            refund_of: order.id,
            refund_reason: opts?.reason ?? null,
            refund_partial: refundItems.some((ri) => {
              const orig = order.items.find((i) => i.id === ri.id || refundItems.includes(ri));
              return orig ? Math.abs(ri.quantity) < orig.quantity : false;
            }),
            shift_id: currentShiftRefund?.id ?? null,
          };

          // Mark original refunded if the new refund + previous refunds cover everything
          const newRemaining: Map<string, number> = new Map(remaining);
          for (const ri of refundItems) {
            const origId = order.items.find((i) => i.product_id === ri.product_id)?.id ?? "";
            newRemaining.set(origId, (newRemaining.get(origId) ?? 0) - Math.abs(ri.quantity));
          }
          const fullyRefunded = Array.from(newRemaining.values()).every((q: number) => q <= 0);


          const movements: StockMovement[] = [];
          const products = get().products.map((p) => {
            const back = refundItems
              .filter((i) => i.product_id === p.id)
              .reduce((a, b) => a + Math.abs(b.quantity), 0);
            if (back) {
              movements.push({
                id: uid(),
                created_at: refund.created_at,
                product_id: p.id,
                product_name: p.name,
                delta: back,
                reason: "refund",
                note: refund.transmission_id,
              });
              return { ...p, stock_quantity: p.stock_quantity + back };
            }
            return p;
          });
          set({
            orders: [
              refund,
              ...get().orders.map((o) => (o.id === id && fullyRefunded ? { ...o, refunded: true } : o)),
            ],
            products,
            movements: [...movements, ...get().movements].slice(0, 500),
          });
          log({
            kind: "order",
            action: refund.refund_partial ? "partial_refund" : "refund",
            summary: `${refund.transmission_id} ← ${order.transmission_id}${opts?.reason ? ` · ${opts.reason}` : ""}`,
            ref_id: refund.id,
            amount: refund.total_gross,
          });
          return refund;
        },

        updateOrderNote: (id, note) =>
          set({ orders: get().orders.map((o) => (o.id === id ? { ...o, note } : o)) }),

        addExpense: (e) => {
          const exp = {
            ...e,
            id: uid(),
            created_at: new Date().toISOString(),
            location_id: e.location_id || get().currentLocation?.id || "loc-rome"
          };
          set({ expenses: [exp, ...get().expenses] });
          log({ kind: "expense", action: "create", summary: exp.description || exp.category, ref_id: exp.id, amount: exp.amount });
        },
        updateExpense: (id, patch) => {
          set({ expenses: get().expenses.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
          const desc = get().expenses.find((e) => e.id === id)?.description ?? id;
          log({ kind: "expense", action: "update", summary: desc, ref_id: id });
        },
        deleteExpense: (id) => {
          const exp = get().expenses.find((e) => e.id === id);
          set({ expenses: get().expenses.filter((e) => e.id !== id) });
          if (exp) log({ kind: "expense", action: "delete", summary: exp.description || exp.category, ref_id: id, amount: exp.amount });
        },
        markExpensePaid: (id) => {
          set({ expenses: get().expenses.map((e) => (e.id === id ? { ...e, status: "paid" } : e)) });
          log({ kind: "expense", action: "update", summary: "marked paid", ref_id: id });
        },

        rollRecurringExpenses: () => {
          const today = new Date().toISOString().slice(0, 10);
          const list = [...get().expenses];
          const additions: Expense[] = [];
          for (const e of list) {
            if (e.recurrence === "none" || !e.next_due) continue;
            let next = e.next_due;
            let safety = 24;
            while (next <= today && safety-- > 0) {
              const cloneId = uid();
              const due = next;
              const newNext = advanceDate(next, e.recurrence);
              additions.push({
                ...e,
                id: cloneId,
                created_at: new Date().toISOString(),
                date: due,
                due_date: due,
                status: "pending",
                recurrence: "none",
                next_due: null,
              });
              next = newNext;
            }
            e.next_due = next;
          }
          if (additions.length) set({ expenses: [...additions, ...list] });
        },

        addSupplier: (s) => {
          const sup: Supplier = { ...s, id: uid() };
          set({ suppliers: [sup, ...get().suppliers] });
          return sup;
        },
        updateSupplier: (id, patch) =>
          set({ suppliers: get().suppliers.map((s) => (s.id === id ? { ...s, ...patch } : s)) }),
        deleteSupplier: (id) => set({ suppliers: get().suppliers.filter((s) => s.id !== id) }),

        addLot: (input) => {
          const qty = input.qty_received;
          const lot: Lot = {
            id: uid(),
            product_id: input.product_id,
            lot_code: input.lot_code,
            expiry_date: input.expiry_date ?? null,
            qty_received: qty,
            qty_remaining: input.qty_remaining ?? qty,
            supplier_id: input.supplier_id ?? null,
            supplier_name: input.supplier_name ?? null,
            cost_price: input.cost_price ?? null,
            received_at: input.received_at ?? new Date().toISOString(),
            note: input.note ?? null,
          };
          const prod = get().products.find((p) => p.id === lot.product_id);
          set({
            lots: [lot, ...get().lots],
            products: get().products.map((p) =>
              p.id === lot.product_id
                ? {
                    ...p,
                    stock_quantity: p.stock_quantity + qty,
                    track_lots: true,
                    ...(lot.cost_price != null && lot.cost_price > 0 ? { cost_price: lot.cost_price } : {}),
                  }
                : p,
            ),
            movements: [
              {
                id: uid(),
                created_at: lot.received_at,
                product_id: lot.product_id,
                product_name: prod?.name ?? "",
                delta: qty,
                reason: "restock" as const,
                note: `Lot ${lot.lot_code}${lot.expiry_date ? ` · exp ${lot.expiry_date}` : ""}`,
              },
              ...get().movements,
            ].slice(0, 500),
          });
          log({
            kind: "stock",
            action: "create",
            summary: `${prod?.name ?? ""} · lot ${lot.lot_code} (+${qty})`,
            ref_id: lot.id,
          });
          return lot;
        },
        updateLot: (id, patch) => {
          const before = get().lots.find((l) => l.id === id);
          if (!before) return;
          set({ lots: get().lots.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
          // If qty_remaining changed manually, reflect on product stock
          if (patch.qty_remaining != null && patch.qty_remaining !== before.qty_remaining) {
            const delta = (patch.qty_remaining as number) - before.qty_remaining;
            const prod = get().products.find((p) => p.id === before.product_id);
            if (prod) {
              set({
                products: get().products.map((p) =>
                  p.id === before.product_id ? { ...p, stock_quantity: p.stock_quantity + delta } : p,
                ),
                movements: [
                  {
                    id: uid(),
                    created_at: new Date().toISOString(),
                    product_id: before.product_id,
                    product_name: prod.name,
                    delta,
                    reason: "adjustment" as const,
                    note: `Lot ${before.lot_code} adj`,
                  },
                  ...get().movements,
                ].slice(0, 500),
              });
            }
          }
          log({ kind: "stock", action: "update", summary: `lot ${before.lot_code}`, ref_id: id });
        },
        deleteLot: (id) => {
          const lot = get().lots.find((l) => l.id === id);
          if (!lot) return;
          const prod = get().products.find((p) => p.id === lot.product_id);
          set({
            lots: get().lots.filter((l) => l.id !== id),
            products: get().products.map((p) =>
              p.id === lot.product_id
                ? { ...p, stock_quantity: Math.max(0, p.stock_quantity - lot.qty_remaining) }
                : p,
            ),
            movements: lot.qty_remaining
              ? [
                  {
                    id: uid(),
                    created_at: new Date().toISOString(),
                    product_id: lot.product_id,
                    product_name: prod?.name ?? "",
                    delta: -lot.qty_remaining,
                    reason: "loss" as const,
                    note: `Lot ${lot.lot_code} removed`,
                  },
                  ...get().movements,
                ].slice(0, 500)
              : get().movements,
          });
          log({ kind: "stock", action: "delete", summary: `lot ${lot.lot_code}`, ref_id: id });
        },

        clearActivity: () => set({ activity: [] }),

        openShift: ({ register_name, cashier, opening_float, note, cash_denominations }) => {
          const activeLocId = get().currentLocation?.id ?? "loc-rome";
          const existing = get().shifts.find((s) => s.status === "open" && s.location_id === activeLocId);
          if (existing) return existing;
          const shift: Shift = {
            id: uid(),
            register_name: (register_name || "Cassa 1").trim(),
            cashier: cashier ?? null,
            opened_at: new Date().toISOString(),
            closed_at: null,
            opening_float: +Math.max(0, opening_float || 0).toFixed(2),
            counted_cash: null,
            status: "open",
            open_note: note ?? null,
            close_note: null,
            location_id: activeLocId,
            cash_denominations: cash_denominations ?? null,
          };
          set({ shifts: [shift, ...get().shifts] });
          log({
            kind: "system",
            action: "create",
            summary: `Shift opened · ${shift.register_name} · ${formatEUR(shift.opening_float)}`,
            ref_id: shift.id,
          });
          return shift;
        },

        closeShift: ({ counted_cash, note }) => {
          const activeLocId = get().currentLocation?.id ?? "loc-rome";
          const shift = get().shifts.find((s) => s.status === "open" && s.location_id === activeLocId);
          if (!shift) return null;
          const closed: Shift = {
            ...shift,
            status: "closed",
            closed_at: new Date().toISOString(),
            counted_cash: +Math.max(0, counted_cash || 0).toFixed(2),
            close_note: note ?? null,
          };
          set({ shifts: get().shifts.map((s) => (s.id === shift.id ? closed : s)) });
          const summary = computeShiftSummary(closed, get().orders, get().cashMovements);
          log({
            kind: "system",
            action: "update",
            summary: `Shift closed · ${closed.register_name} · variance ${formatEUR(summary.variance)}`,
            ref_id: closed.id,
            amount: summary.variance,
          });
          return closed;
        },

        addCashMovement: ({ kind, amount, reason }) => {
          const activeLocId = get().currentLocation?.id ?? "loc-rome";
          const shift = get().shifts.find((s) => s.status === "open" && s.location_id === activeLocId);
          if (!shift) return null;
          const amt = +Math.max(0, amount || 0).toFixed(2);
          if (amt <= 0) return null;
          const mov: CashMovement = {
            id: uid(),
            shift_id: shift.id,
            created_at: new Date().toISOString(),
            kind,
            amount: amt,
            reason: reason?.trim() || (kind === "paid_in" ? "Paid in" : "Paid out"),
          };
          set({ cashMovements: [mov, ...get().cashMovements] });
          log({
            kind: "system",
            action: "update",
            summary: `${kind === "paid_in" ? "Paid in" : "Paid out"} ${formatEUR(amt)} · ${mov.reason}`,
            ref_id: mov.id,
            amount: kind === "paid_in" ? amt : -amt,
          });
          return mov;
        },

        updateShiftDenominations: (received, change) => {
          const activeLocId = get().currentLocation?.id ?? "loc-rome";
          const shift = get().shifts.find((s) => s.status === "open" && s.location_id === activeLocId);
          if (!shift) return;

          const currentDenoms = { ...(shift.cash_denominations ?? {}) };
          for (const [key, qty] of Object.entries(received)) {
            currentDenoms[key] = (currentDenoms[key] || 0) + qty;
          }
          for (const [key, qty] of Object.entries(change)) {
            currentDenoms[key] = Math.max(0, (currentDenoms[key] || 0) - qty);
          }

          const newShifts = get().shifts.map((s) =>
            s.id === shift.id ? { ...s, cash_denominations: currentDenoms } : s
          );
          set({ shifts: newShifts });
          log({ kind: "system", action: "update", summary: `Shift denominations updated on cash sale` });
        },

        deleteShift: (id) => {
          const shift = get().shifts.find((s) => s.id === id);
          if (!shift) return;
          set({
            shifts: get().shifts.filter((s) => s.id !== id),
            cashMovements: get().cashMovements.filter((m) => m.shift_id !== id),
            orders: get().orders.map((o) => (o.shift_id === id ? { ...o, shift_id: null } : o)),
          });
          log({ kind: "system", action: "delete", summary: `Shift ${shift.register_name}`, ref_id: id });
        },

        saveConfig: (c) => {
          set({ config: { ...get().config, ...c } });
          log({ kind: "system", action: "config", summary: "settings updated" });
        },

        switchUser: (userId, pin) => {
          const user = get().users.find((u) => u.id === userId);
          if (!user) return false;
          if (user.pin && user.pin !== pin) return false;
          set({ currentUser: user });
          log({ kind: "system", action: "config", summary: `User switched to ${user.name}` });
          return true;
        },
        addUser: (u) => {
          const newUser = { ...u, id: uid() };
          set({ users: [...get().users, newUser] });
          log({ kind: "system", action: "create", summary: `Added user ${newUser.name}` });
        },
        updateUser: (id, patch) => {
          set({ users: get().users.map((u) => (u.id === id ? { ...u, ...patch } : u)) });
          const name = get().users.find((u) => u.id === id)?.name ?? id;
          log({ kind: "system", action: "update", summary: `Updated user ${name}` });
          const activeUser = get().currentUser;
          if (activeUser.id === id) {
            set({ currentUser: { ...activeUser, ...patch } });
          }
        },
        deleteUser: (id) => {
          const name = get().users.find((u) => u.id === id)?.name ?? id;
          set({ users: get().users.filter((u) => u.id !== id) });
          log({ kind: "system", action: "delete", summary: `Deleted user ${name}` });
        },
        clockIn: (userId) => {
          const logs = get().timeLogs;
          const openLog = logs.find((l) => l.user_id === userId && !l.clock_out);
          if (openLog) return;
          const newLog = { id: uid(), user_id: userId, clock_in: new Date().toISOString(), clock_out: null };
          set({ timeLogs: [newLog, ...logs] });
          const userName = get().users.find((u) => u.id === userId)?.name ?? userId;
          log({ kind: "system", action: "create", summary: `${userName} clocked in` });
        },
        clockOut: (userId) => {
          const logs = get().timeLogs;
          const openLog = logs.find((l) => l.user_id === userId && !l.clock_out);
          if (!openLog) return;
          const closedLog = { ...openLog, clock_out: new Date().toISOString() };
          set({ timeLogs: logs.map((l) => (l.id === openLog.id ? closedLog : l)) });
          const userName = get().users.find((u) => u.id === userId)?.name ?? userId;
          log({ kind: "system", action: "update", summary: `${userName} clocked out` });
        },
        addLocation: (l) => {
          const newLoc = { ...l, id: uid() };
          set({ locations: [...get().locations, newLoc] });
          log({ kind: "system", action: "create", summary: `Added location ${newLoc.name}` });
        },
        switchLocation: (id) => {
          const loc = get().locations.find((x) => x.id === id);
          if (loc) {
            set({ currentLocation: loc });
            log({ kind: "system", action: "config", summary: `Switched active location to ${loc.name}` });
          }
        },
        deleteLocation: (id) => {
          if (id === get().currentLocation?.id) return;
          const locName = get().locations.find((l) => l.id === id)?.name ?? id;
          set({
            locations: get().locations.filter((l) => l.id !== id),
          });
          log({ kind: "system", action: "delete", summary: `Deleted location ${locName}` });
        },
        updateLocation: (id, patch) => {
          const updated = get().locations.map((l) => (l.id === id ? { ...l, ...patch } : l));
          const current = get().currentLocation?.id === id ? updated.find((l) => l.id === id) : get().currentLocation;
          set({
            locations: updated,
            currentLocation: current ?? get().currentLocation,
          });
          log({ kind: "system", action: "update", summary: `Updated location ${id}` });
        },
        transferStock: (productId, fromLocId, toLocId, qty) => {
          const products = get().products;
          const p = products.find((x) => x.id === productId);
          if (!p) return;
          const fromStock = p.location_stock?.[fromLocId] ?? p.stock_quantity;
          const actualQty = Math.min(qty, fromStock);
          if (actualQty <= 0) return;

          const updatedLocStock = {
            ...(p.location_stock ?? {}),
            [fromLocId]: Math.max(0, fromStock - actualQty),
            [toLocId]: (p.location_stock?.[toLocId] ?? 0) + actualQty,
          };
          const totalStock = Object.values(updatedLocStock).reduce((sum, val) => sum + val, 0);

          const newProducts = products.map((x) =>
            x.id === productId
              ? { ...x, stock_quantity: totalStock, location_stock: updatedLocStock }
              : x
          );

          const fromLocName = get().locations.find((l) => l.id === fromLocId)?.name ?? fromLocId;
          const toLocName = get().locations.find((l) => l.id === toLocId)?.name ?? toLocId;

          set({
            products: newProducts,
            movements: [
              {
                id: uid(),
                created_at: new Date().toISOString(),
                product_id: productId,
                product_name: p.name,
                delta: -actualQty,
                reason: "adjustment",
                note: `Transfer to ${toLocName}`,
              },
              {
                id: uid(),
                created_at: new Date().toISOString(),
                product_id: productId,
                product_name: p.name,
                delta: actualQty,
                reason: "adjustment",
                note: `Transfer from ${fromLocName}`,
              },
              ...get().movements,
            ].slice(0, 500),
          });

          log({
            kind: "stock",
            action: "adjust",
            summary: `Stock transfer: ${p.name} (${actualQty} pz: ${fromLocName} → ${toLocName})`,
            ref_id: productId,
          });
        },
        getDynamicPricingSuggestions: () => {
          const suggestions = [];
          const products = get().products;
          const orders = get().orders;
          const lots = get().lots;
          const today = new Date();
          const cutoff7d = today.getTime() - 7 * 24 * 60 * 60 * 1000;
          const cutoff30d = today.getTime() - 30 * 24 * 60 * 60 * 1000;

          // 1. Expiring items (markdown 30%)
          const alertLots = lots.filter(
            (l) => l.qty_remaining > 0 && l.expiry_date &&
            new Date(l.expiry_date + "T00:00:00").getTime() - today.getTime() <= 10 * 24 * 60 * 60 * 1000 &&
            new Date(l.expiry_date + "T00:00:00").getTime() >= today.getTime()
          );

          const expiringProductIds = new Set(alertLots.map((l) => l.product_id));
          for (const pid of expiringProductIds) {
            const p = products.find((x) => x.id === pid);
            if (p) {
              const suggested = +(p.price_gross * 0.7).toFixed(2);
              suggestions.push({
                product_id: p.id,
                product_name: p.name,
                current_price: p.price_gross,
                suggested_price: suggested,
                reason: "suggest.reason.expiry"
              });
            }
          }

          // 2. High velocity items (+5% markup)
          const recentOrders = orders.filter((o) => new Date(o.created_at).getTime() >= cutoff7d);
          const salesMap = new Map();
          for (const o of recentOrders) {
            for (const it of o.items) {
              salesMap.set(it.product_id, (salesMap.get(it.product_id) ?? 0) + it.quantity);
            }
          }

          for (const [pid, qty] of salesMap.entries()) {
            if (qty >= 5 && !expiringProductIds.has(pid)) {
              const p = products.find((x) => x.id === pid);
              if (p) {
                const suggested = +(p.price_gross * 1.05).toFixed(2);
                suggestions.push({
                  product_id: p.id,
                  product_name: p.name,
                  current_price: p.price_gross,
                  suggested_price: suggested,
                  reason: "suggest.reason.high_velocity"
                });
              }
            }
          }

          // 3. Dead stock items (-15% discount)
          const orders30d = orders.filter((o) => new Date(o.created_at).getTime() >= cutoff30d);
          const sold30dIds = new Set(orders30d.flatMap((o) => o.items.map((i) => i.product_id)));
          for (const p of products) {
            if (p.stock_quantity > 0 && !sold30dIds.has(p.id) && !expiringProductIds.has(p.id)) {
              const suggested = +(p.price_gross * 0.85).toFixed(2);
              suggestions.push({
                product_id: p.id,
                product_name: p.name,
                current_price: p.price_gross,
                suggested_price: suggested,
                reason: "suggest.reason.dead_stock"
              });
            }
          }

          return suggestions;
        },
        applyPricingSuggestion: (productId, suggestedPrice) => {
          get().updateProduct(productId, { price_gross: suggestedPrice });
          log({ kind: "product", action: "update", summary: `Pricing suggestion applied to product ${productId}` });
        },
        setSyncConfig: (cfg) => {
          set({ syncConfig: { ...get().syncConfig, ...cfg } });
          log({ kind: "system", action: "config", summary: "Cloud sync settings updated" });
        },
        triggerSync: async () => {
          const cfg = get().syncConfig;
          if (!cfg.enabled) return;
          await new Promise((resolve) => setTimeout(resolve, 800));
          set({
            syncConfig: {
              ...cfg,
              lastSynced: new Date().toISOString(),
            },
          });
          log({ kind: "system", action: "config", summary: "Cloud synchronization successful" });
        },
        addChatMessage: (msg) => {
          const message = { ...msg, id: uid() };
          set({ chatMessages: [...get().chatMessages, message].slice(-200) });
        },
        clearChat: () => set({ chatMessages: [] }),
        resetAll: () => {
          set({
            products: seedProducts,
            orders: [],
            movements: [],
            expenses: [],
            suppliers: [],
            activity: [],
            lots: [],
            shifts: [],
            cashMovements: [],
            config: defaultConfig,
            users: seedUsers,
            currentUser: seedUsers[0],
            timeLogs: [],
            locations: seedLocations,
            currentLocation: seedLocations[0],
            syncConfig: defaultSyncConfig,
            chatMessages: [],
          });
        },
        importBackup: (data) =>
          set({
            products: data.products ?? get().products,
            orders: data.orders ?? get().orders,
            movements: data.movements ?? get().movements,
            expenses: data.expenses ?? get().expenses,
            suppliers: data.suppliers ?? get().suppliers,
            activity: data.activity ?? get().activity,
            lots: data.lots ?? get().lots,
            shifts: data.shifts ?? get().shifts,
            cashMovements: data.cashMovements ?? get().cashMovements,
            config: data.config ?? get().config,
            users: data.users ?? get().users,
            currentUser: data.currentUser ?? get().currentUser,
            timeLogs: data.timeLogs ?? get().timeLogs,
            locations: data.locations ?? get().locations,
            currentLocation: data.currentLocation ?? get().currentLocation,
            syncConfig: data.syncConfig ?? get().syncConfig,
            chatMessages: data.chatMessages ?? get().chatMessages,
          }),
      };
    },

    {
      name: "italia-erp-store",
      version: 5,
      migrate: (persisted: any) => {
        if (!persisted) return persisted;
        if (Array.isArray(persisted.expenses)) {
          persisted.expenses = persisted.expenses.map((e: any) => ({
            cost_type: e.cost_type ?? "indirect",
            status: e.status ?? "paid",
            recurrence: e.recurrence ?? "none",
            supplier_id: e.supplier_id ?? null,
            supplier_name: e.supplier_name ?? null,
            reference: e.reference ?? null,
            due_date: e.due_date ?? null,
            next_due: e.next_due ?? null,
            ...e,
          }));
        }
        if (!persisted.suppliers) persisted.suppliers = [];
        if (!persisted.lots) persisted.lots = [];
        if (!persisted.shifts) persisted.shifts = [];
        if (!persisted.cashMovements) persisted.cashMovements = [];
        if (persisted.config && persisted.config.expiry_alert_days == null) {
          persisted.config.expiry_alert_days = 14;
        }
        if (!persisted.users) persisted.users = seedUsers;
        if (!persisted.currentUser) persisted.currentUser = seedUsers[0];
        if (!persisted.timeLogs) persisted.timeLogs = [];
        if (!persisted.locations) persisted.locations = seedLocations;
        if (!persisted.currentLocation) persisted.currentLocation = seedLocations[0];
        if (!persisted.syncConfig) persisted.syncConfig = defaultSyncConfig;
        if (!persisted.chatMessages) persisted.chatMessages = [];
        return persisted;
      },
    },
  ),
);

export interface ShiftSummary {
  shift: Shift;
  sales_cash: number;
  sales_card: number;
  refunds_cash: number;
  refunds_card: number;
  paid_in: number;
  paid_out: number;
  expected_cash: number;
  variance: number;
  order_count: number;
  refund_count: number;
  net_sales: number;
}

export function computeShiftSummary(
  shift: Shift,
  orders: Order[],
  cashMovements: CashMovement[],
): ShiftSummary {
  const own = orders.filter((o) => o.shift_id === shift.id);
  const movs = cashMovements.filter((m) => m.shift_id === shift.id);
  let sales_cash = 0, sales_card = 0, refunds_cash = 0, refunds_card = 0;
  let order_count = 0, refund_count = 0;
  for (const o of own) {
    if (o.refund_of) {
      refund_count++;
      const abs = Math.abs(o.total_gross);
      if (o.payment_method === "contanti") refunds_cash += abs;
      else refunds_card += abs;
    } else {
      order_count++;
      if (o.payment_method === "contanti") sales_cash += o.total_gross;
      else sales_card += o.total_gross;
    }
  }
  const paid_in = movs.filter((m) => m.kind === "paid_in").reduce((a, b) => a + b.amount, 0);
  const paid_out = movs.filter((m) => m.kind === "paid_out").reduce((a, b) => a + b.amount, 0);
  const expected_cash = +(shift.opening_float + sales_cash - refunds_cash + paid_in - paid_out).toFixed(2);
  const variance = shift.counted_cash == null ? 0 : +(shift.counted_cash - expected_cash).toFixed(2);
  return {
    shift,
    sales_cash: +sales_cash.toFixed(2),
    sales_card: +sales_card.toFixed(2),
    refunds_cash: +refunds_cash.toFixed(2),
    refunds_card: +refunds_card.toFixed(2),
    paid_in: +paid_in.toFixed(2),
    paid_out: +paid_out.toFixed(2),
    expected_cash,
    variance,
    order_count,
    refund_count,
    net_sales: +(sales_cash + sales_card - refunds_cash - refunds_card).toFixed(2),
  };
}

/**
 * Compute how many units remain refundable per item_id on an order,
 * accounting for any previous (partial) refunds.
 */
export function computeRemainingPerItem(order: Order, allOrders: Order[]): Map<string, number> {
  const remaining = new Map<string, number>();
  for (const it of order.items) remaining.set(it.id, it.quantity);
  const refunds = allOrders.filter((o) => o.refund_of === order.id);
  for (const r of refunds) {
    for (const ri of r.items) {
      // Refund items reference product, not original item id; map by product
      const orig = order.items.find((i) => i.product_id === ri.product_id);
      if (!orig) continue;
      const cur = remaining.get(orig.id) ?? 0;
      remaining.set(orig.id, Math.max(0, cur - Math.abs(ri.quantity)));
    }
  }
  return remaining;
}


export function buildFiscalPayload(order: Order, config: FiscalConfig) {
  return {
    company: { partita_iva: config.partita_iva, codice_fiscale: config.codice_fiscale, name: config.store_name },
    provider: config.api_provider,
    transmission_id: order.transmission_id,
    items: order.items.map((i) => ({
      description: i.product_name,
      unit_price: i.unit_price_gross,
      quantity: i.quantity,
      vat_rate: i.vat_rate,
      net_amount: i.net_amount,
      vat_amount: i.vat_amount,
    })),
    payments: [{ amount: order.total_gross, type: order.payment_method }],
    lottery_code: order.lottery_code,
    timestamp: order.created_at,
  };
}

export const VAT_RATES: VatRate[] = [22, 10, 5, 4, 0];

// Comprehensive expense categories for any business (retail, restaurant, service).
// `direct` = COGS / variable cost tied to producing or delivering the sale.
// `indirect` = OpEx / overhead, not tied to a specific sale.
export const EXPENSE_CATEGORY_DEFS: { name: string; cost_type: "direct" | "indirect" }[] = [
  // Direct costs
  { name: "Materie prime", cost_type: "direct" },
  { name: "Acquisto merci", cost_type: "direct" },
  { name: "Imballaggio", cost_type: "direct" },
  { name: "Commissioni POS", cost_type: "direct" },
  { name: "Spedizioni", cost_type: "direct" },
  { name: "Consumabili produzione", cost_type: "direct" },
  // Indirect / overhead
  { name: "Affitto", cost_type: "indirect" },
  { name: "Utenze (Luce/Gas/Acqua)", cost_type: "indirect" },
  { name: "Internet & Telefono", cost_type: "indirect" },
  { name: "Stipendi", cost_type: "indirect" },
  { name: "Contributi INPS", cost_type: "indirect" },
  { name: "Assicurazioni", cost_type: "indirect" },
  { name: "Tasse e imposte", cost_type: "indirect" },
  { name: "Commercialista", cost_type: "indirect" },
  { name: "Consulenze legali", cost_type: "indirect" },
  { name: "Marketing & Pubblicità", cost_type: "indirect" },
  { name: "Software & SaaS", cost_type: "indirect" },
  { name: "Licenze & Permessi", cost_type: "indirect" },
  { name: "Manutenzione", cost_type: "indirect" },
  { name: "Pulizie", cost_type: "indirect" },
  { name: "Cancelleria", cost_type: "indirect" },
  { name: "Carburante & Trasporti", cost_type: "indirect" },
  { name: "Attrezzature", cost_type: "indirect" },
  { name: "Arredamento", cost_type: "indirect" },
  { name: "Formazione", cost_type: "indirect" },
  { name: "Commissioni bancarie", cost_type: "indirect" },
  { name: "Interessi su prestiti", cost_type: "indirect" },
  { name: "Smaltimento rifiuti", cost_type: "indirect" },
  { name: "Abbonamenti", cost_type: "indirect" },
  { name: "Altro", cost_type: "indirect" },
];

export const EXPENSE_CATEGORIES = EXPENSE_CATEGORY_DEFS.map((c) => c.name);

export function categoryCostType(name: string): "direct" | "indirect" {
  return EXPENSE_CATEGORY_DEFS.find((c) => c.name === name)?.cost_type ?? "indirect";
}

function advanceDate(yyyyMmDd: string, rec: "weekly" | "monthly" | "quarterly" | "yearly"): string {
  const d = new Date(yyyyMmDd + "T00:00:00");
  if (rec === "weekly") d.setDate(d.getDate() + 7);
  else if (rec === "monthly") d.setMonth(d.getMonth() + 1);
  else if (rec === "quarterly") d.setMonth(d.getMonth() + 3);
  else if (rec === "yearly") d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

export function formatEUR(n: number): string {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
}

export function downloadCsv(filename: string, header: string[], rows: (string | number)[][]) {
  const escape = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [header.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export type ExpiryStatus = "expired" | "soon" | "ok" | "none";

export function expiryStatus(date: string | null | undefined, alertDays: number): ExpiryStatus {
  if (!date) return "none";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(date + "T00:00:00");
  const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (diff < 0) return "expired";
  if (diff <= alertDays) return "soon";
  return "ok";
}

export function daysUntil(date: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(date + "T00:00:00");
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}
