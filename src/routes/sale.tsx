import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useSessionState } from "@/hooks/useSessionState";
import {
  Mic,
  MicOff,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShoppingCart,
  Search,
  Plus,
  Minus,
  Trash2,
  X,
  Star,
  ScanLine,
  Wallet,
  Calculator,
} from "lucide-react";

import { PageHeader } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { parseVoiceOrder } from "@/lib/voiceParser";
import { useStore, formatEUR } from "@/lib/store";
import { useT, useCurrentLang } from "@/lib/i18n";
import type { ParsedVoiceOrder, PaymentMethod, CartLine } from "@/lib/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { BarcodeScanner } from "@/components/BarcodeScanner";

function breakdownAmount(amount: number): Record<string, number> {
  const result: Record<string, number> = {};
  let remaining = Math.round(amount * 100);
  const denoms = [
    { key: "500", val: 50000 },
    { key: "200", val: 20000 },
    { key: "100", val: 10000 },
    { key: "50", val: 5000 },
    { key: "20", val: 2000 },
    { key: "10", val: 1000 },
    { key: "5", val: 500 },
    { key: "2", val: 200 },
    { key: "1", val: 100 },
    { key: "0.5", val: 50 },
    { key: "0.2", val: 20 },
    { key: "0.1", val: 10 },
    { key: "0.05", val: 5 },
    { key: "0.02", val: 2 },
    { key: "0.01", val: 1 },
  ];
  for (const d of denoms) {
    const qty = Math.floor(remaining / d.val);
    if (qty > 0) {
      result[d.key] = qty;
      remaining -= qty * d.val;
    }
  }
  return result;
}

export const Route = createFileRoute("/sale")({
  head: () => ({
    meta: [
      { title: "Nuova Vendita — Soldo" },
      {
        name: "description",
        content: "Vendite vocali e manuali con trasmissione automatica all'Agenzia delle Entrate.",
      },
    ],
  }),
  component: SalePage,
});

function SalePage() {
  const t = useT();
  const openShift = useStore((s) => s.shifts.find((x) => x.status === "open"));
  return (
    <>
      <PageHeader title={t("sale.title")} subtitle={t("sale.subtitle")} />
      <div className="flex-1 overflow-y-auto p-4 md:p-8 max-w-5xl w-full mx-auto space-y-4">
        {!openShift && (
          <div className="flex items-center gap-3 rounded-md border border-amber-500/40 bg-amber-50/60 dark:bg-amber-500/10 px-4 py-2.5 text-sm">
            <Wallet className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="flex-1 min-w-0">{t("till.banner.closed")}</span>
            <Link
              to="/till"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 hover:underline whitespace-nowrap"
            >
              {t("till.banner.open")} →
            </Link>
          </div>
        )}
        <Tabs defaultValue="manual" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="manual">
              <ShoppingCart className="h-4 w-4 mr-2" />
              {t("sale.manual")}
            </TabsTrigger>
            <TabsTrigger value="voice">
              <Mic className="h-4 w-4 mr-2" />
              {t("sale.voice")}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="manual">
            <ManualTab />
          </TabsContent>
          <TabsContent value="voice">
            <VoiceTab />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

function VoiceTab() {
  const t = useT();
  const lang = useCurrentLang();
  const { supported, listening, transcript, start, stop, setTranscript, error } =
    useSpeechRecognition(lang === "it" ? "it-IT" : "en-US");
  const products = useStore((s) => s.products);
  const createOrder = useStore((s) => s.createOrder);
  const updateShiftDenominations = useStore((s) => s.updateShiftDenominations);

  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useSessionState<ParsedVoiceOrder | null>("sale-voice-parsed", null);

  async function handleProcess() {
    if (!transcript.trim()) return;
    setParsing(true);
    try {
      const result = await parseVoiceOrder(transcript, products);
      setParsed(result);
    } catch {
      toast.error(t("sale.err.parse"));
    } finally {
      setParsing(false);
    }
  }

  function handleConfirm() {
    if (!parsed) return;
    const lines: { product_id: string; quantity: number; missing?: string }[] = [];
    const missing: string[] = [];
    for (const it of parsed.items) {
      const product =
        products.find((p) => p.name.toLowerCase() === it.product_name.toLowerCase()) ??
        products.find((p) => p.name.toLowerCase().includes(it.product_name.toLowerCase())) ??
        products.find((p) => it.product_name.toLowerCase().includes(p.name.toLowerCase()));
      if (!product) {
        missing.push(it.product_name);
        continue;
      }
      lines.push({ product_id: product.id, quantity: it.quantity });
    }
    if (lines.length === 0) return toast.error(t("sale.err.notfound"));
    if (missing.length) toast.warning(`${t("sale.err.notfound")}: ${missing.join(", ")}`);
    const order = createOrder(lines, {
      payment_method: parsed.payment_method,
      lottery_code: parsed.lottery_code,
    });
    if (order) {
      toast.success(`${t("sale.toast.transmitted")} · ${order.transmission_id}`, {
        description: `${t("sale.toast.total")} ${formatEUR(order.total_gross)}`,
      });
      if (parsed.payment_method === "contanti") {
        const finalRec = breakdownAmount(order.total_gross);
        updateShiftDenominations(finalRec, {});
      }
      setParsed(null);
      setTranscript("");
    } else {
      toast.error(lang === "it" ? "Scorte insufficienti in magazzino per questa sede!" : "Insufficient stock at this location!");
    }
  }

  if (!supported) {
    return (
      <Card>
        <CardContent className="p-8 text-center space-y-3">
          <AlertCircle className="h-10 w-10 mx-auto text-warning" />
          <h3 className="font-semibold">{t("sale.unavailable")}</h3>
          <p className="text-sm text-muted-foreground">{t("sale.unavailable.desc")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-border/60">
        <CardContent className="p-6 md:p-8 flex flex-col items-center text-center">
          <button
            type="button"
            onClick={listening ? stop : start}
            className={cn(
              "h-28 w-28 md:h-40 md:w-40 rounded-full grid place-items-center transition-all",
              listening
                ? "bg-destructive text-destructive-foreground mic-pulse"
                : "bg-primary text-primary-foreground hover:scale-105 shadow-[var(--shadow-elevated)]",
            )}
            aria-label={listening ? "Stop" : "Start"}
          >
            {listening ? <MicOff className="h-10 w-10 md:h-12 md:w-12" /> : <Mic className="h-10 w-10 md:h-12 md:w-12" />}
          </button>
          <p className="mt-5 text-sm text-muted-foreground max-w-sm">
            {listening ? t("sale.listening") : t("sale.idle")}
          </p>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <Label htmlFor="transcript">{t("sale.transcript")}</Label>
        <Textarea
          id="transcript"
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder={t("sale.transcript.ph")}
          rows={3}
        />
        {error && <p className="text-xs text-destructive">Error: {error}</p>}
        <Button onClick={handleProcess} disabled={!transcript.trim() || parsing} className="w-full">
          {parsing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
          {parsing ? t("sale.processing") : t("sale.process")}
        </Button>
      </div>

      {parsed && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">{t("sale.summary")}</h3>
            </div>
            <div className="space-y-2">
              {parsed.items.map((it, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between rounded-md border bg-card p-3 text-sm"
                >
                  <span className="font-medium truncate">{it.product_name}</span>
                  <Badge variant="secondary" className="tabular-nums">× {it.quantity}</Badge>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <SummaryField label={t("sale.field.payment")} value={parsed.payment_method} />
              <SummaryField label={t("sale.field.lottery")} value={parsed.lottery_code ?? "—"} />
            </div>

            <Button onClick={handleConfirm} className="w-full" size="lg">
              {t("sale.confirm")}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SummaryField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium truncate">{value}</div>
    </div>
  );
}

const DENOMINATIONS_LIST = [
  { label: "€500", val: 500 },
  { label: "€200", val: 200 },
  { label: "€100", val: 100 },
  { label: "€50", val: 50 },
  { label: "€20", val: 20 },
  { label: "€10", val: 10 },
  { label: "€5", val: 5 },
  { label: "€2", val: 2 },
  { label: "€1", val: 1 },
  { label: "€0.50", val: 0.5 },
  { label: "€0.20", val: 0.2 },
  { label: "€0.10", val: 0.1 },
  { label: "€0.05", val: 0.05 },
  { label: "€0.02", val: 0.02 },
  { label: "€0.01", val: 0.01 },
];

function ManualTab() {
  const t = useT();
  const lang = useCurrentLang();
  const products = useStore((s) => s.products);
  const createOrder = useStore((s) => s.createOrder);
  const updateShiftDenominations = useStore((s) => s.updateShiftDenominations);
  const activeLocation = useStore((s) => s.currentLocation);
  const activeLocId = activeLocation?.id ?? "loc-rome";
  const locations = useStore((s) => s.locations);
  const openShift = useStore((s) => s.shifts.find((x) => x.status === "open" && x.location_id === activeLocation?.id));

  const [cart, setCart] = useSessionState<CartLine[]>("sale-cart", []);
  const [search, setSearch] = useSessionState("sale-search", "");
  const [payment, setPayment] = useSessionState<PaymentMethod>("sale-payment", "elettronico");
  const [lottery, setLottery] = useSessionState("sale-lottery", "");
  const [customer, setCustomer] = useSessionState("sale-customer", "");
  const [note, setNote] = useSessionState("sale-note", "");
  const [discount, setDiscount] = useSessionState("sale-discount", 0);
  const [received, setReceived] = useSessionState("sale-received", "");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [selectedParent, setSelectedParent] = useState<any | null>(null);

  const [calcOpen, setCalcOpen] = useState(false);
  const [recCounts, setRecCounts] = useSessionState<Record<string, number>>("sale-recCounts", {});
  const [chgCounts, setChgCounts] = useSessionState<Record<string, number>>("sale-chgCounts", {});

  const recTotal = Object.entries(recCounts).reduce((sum, [val, qty]) => sum + parseFloat(val) * qty, 0);
  const chgTotal = Object.entries(chgCounts).reduce((sum, [val, qty]) => sum + parseFloat(val) * qty, 0);

  const favorites = useMemo(
    () => products.filter((p) => p.favorite && !p.parent_id && getProductAvailableStock(p) > 0).slice(0, 12),
    [products, activeLocId],
  );

  function getProductAvailableStock(p: any): number {
    if (p.is_composite) {
      if (!p.recipe_items || p.recipe_items.length === 0) return 0;
      let minStock = Infinity;
      for (const ri of p.recipe_items) {
        const ingredient = products.find((x) => x.id === ri.product_id);
        if (!ingredient) return 0;
        const stock = ingredient.location_stock?.[activeLocId] ?? ingredient.stock_quantity;
        const possible = Math.floor(stock / ri.quantity);
        if (possible < minStock) minStock = possible;
      }
      return minStock === Infinity ? 0 : minStock;
    }
    return p.location_stock?.[activeLocId] ?? p.stock_quantity;
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? products.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.sku.toLowerCase().includes(q) ||
            (p.barcode ?? "").toLowerCase().includes(q),
        )
      : products;
    // Hide variant children from direct listing
    return list.filter((p) => !p.parent_id).slice(0, 30);
  }, [products, search]);

  const lines = cart
    .map((c) => {
      const p = products.find((x) => x.id === c.product_id);
      return p ? { ...c, product: p } : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x);

  const subtotal = lines.reduce((a, l) => a + l.product.price_gross * l.quantity, 0);
  const total = Math.max(0, subtotal - discount);
  const change = payment === "contanti" && received ? Math.max(0, parseFloat(received) - total) : 0;

  function add(productId: string) {
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    if (p.is_variant_parent) {
      setSelectedParent(p);
      return;
    }
    const cartQty = cart.find((x) => x.product_id === productId)?.quantity ?? 0;
    const stockVal = getProductAvailableStock(p);
    if (cartQty >= stockVal) {
      toast.warning(t("sale.cart.outofstock"), { description: p.name });
      return;
    }
    setCart((c) => {
      const existing = c.find((x) => x.product_id === productId);
      if (existing)
        return c.map((x) => (x.product_id === productId ? { ...x, quantity: x.quantity + 1 } : x));
      return [...c, { product_id: productId, quantity: 1 }];
    });
  }

  function setQty(productId: string, qty: number) {
    if (qty <= 0) {
      setCart((c) => c.filter((x) => x.product_id !== productId));
      return;
    }
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    const stockVal = getProductAvailableStock(p);
    if (qty > stockVal) {
      toast.warning(t("sale.cart.outofstock"), { description: p.name });
      return;
    }
    setCart((c) => c.map((x) => (x.product_id === productId ? { ...x, quantity: qty } : x)));
  }

  function clear() {
    setCart([]);
    setDiscount(0);
    setLottery("");
    setCustomer("");
    setNote("");
    setReceived("");
    setRecCounts({});
    setChgCounts({});
  }

  function handleScan(code: string) {
    const term = code.trim().toLowerCase();
    const hit = products.find(
      (p) =>
        (p.barcode ?? "").toLowerCase() === term ||
        p.sku.toLowerCase() === term ||
        p.name.toLowerCase() === term,
    );
    if (!hit) {
      toast.error(t("scan.notfound"), { description: code });
      return;
    }
    const cartQty = cart.find((x) => x.product_id === hit.id)?.quantity ?? 0;
    const stockVal = getProductAvailableStock(hit);
    if (cartQty >= stockVal) {
      toast.warning(t("sale.cart.outofstock"), { description: hit.name });
      return;
    }
    add(hit.id);
    toast.success(t("scan.added"), { description: hit.name });
  }

  function handleComplete() {
    if (lines.length === 0) return;
    const order = createOrder(
      lines.map((l) => ({ product_id: l.product_id, quantity: l.quantity })),
      {
        payment_method: payment,
        lottery_code: lottery || null,
        customer_name: customer || null,
        note: note || null,
        discount,
      },
    );
    if (order) {
      toast.success(`${t("sale.toast.transmitted")} · ${order.transmission_id}`, {
        description: `${t("sale.toast.total")} ${formatEUR(order.total_gross)}`,
      });
      if (payment === "contanti") {
        const hasRecCounts = Object.keys(recCounts).length > 0;
        const finalRecCounts = hasRecCounts ? recCounts : breakdownAmount(parseFloat(received) || total);
        const finalChgCounts = hasRecCounts ? chgCounts : breakdownAmount(change);
        updateShiftDenominations(finalRecCounts, finalChgCounts);
      }
      clear();
    } else {
      toast.error(lang === "it" ? "Vendita bloccata: scorte non disponibili in questa sede!" : "Sale blocked: insufficient stock at this location!");
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr,380px] gap-4">
      {/* Product picker */}
      <Card>
        <CardContent className="p-4 space-y-3">
          {/* Favorites quick-keys */}
          {favorites.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> {t("sale.fav.title")}
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {favorites.map((p) => {
                  const cartQty = cart.find(c => c.product_id === p.id)?.quantity ?? 0;
                  const stockVal = getProductAvailableStock(p) - cartQty;
                  const out = stockVal <= 0;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={out}
                      onClick={() => add(p.id)}
                      className={cn(
                        "text-left rounded-lg border border-amber-400/40 bg-amber-50/40 dark:bg-amber-500/5 p-2.5 transition hover:border-amber-400 hover:shadow-sm flex flex-col justify-between min-h-[72px]",
                        out && "opacity-50 cursor-not-allowed border-muted"
                      )}
                    >
                      <div className="font-medium text-sm leading-tight line-clamp-2">{p.name}</div>
                      <div className="mt-1 flex items-center justify-between w-full">
                        <span className="font-semibold text-sm tabular-nums">{formatEUR(p.price_gross)}</span>
                        <span className="text-[10px] text-muted-foreground font-mono">{stockVal} pz</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t("sale.cart.search")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <Button variant="outline" onClick={() => setScannerOpen(true)} title={t("scan.btn")}>
              <ScanLine className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">{t("scan.btn")}</span>
            </Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[400px] lg:max-h-[520px] overflow-y-auto">
            {filtered.map((p) => {
                  const cartQty = cart.find(c => c.product_id === p.id)?.quantity ?? 0;
                  const stockVal = getProductAvailableStock(p) - cartQty;
                  const out = stockVal <= 0;
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={out && !p.is_variant_parent}
                  onClick={() => add(p.id)}
                  className={cn(
                    "text-left rounded-lg border bg-card p-2.5 transition hover:border-primary hover:shadow-sm relative",
                    out && !p.is_variant_parent && "opacity-50 cursor-not-allowed",
                  )}
                >
                  {p.favorite && (
                    <Star className="absolute top-1.5 right-1.5 h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                  )}
                  <div className="font-medium text-sm leading-tight line-clamp-2 pr-4">{p.name}</div>
                  <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                    {p.sku} {p.is_composite && <span className="text-primary font-bold">({lang === "it" ? "RICETTA" : "BOM"})</span>}
                  </div>
                  <div className="mt-1.5 flex items-center justify-between">
                    <div className="font-semibold text-sm tabular-nums">{formatEUR(p.price_gross)}</div>
                    <Badge variant={out && !p.is_variant_parent ? "destructive" : "outline"} className="text-[10px] h-5 px-1.5">
                      {p.is_variant_parent ? (lang === "it" ? "Varianti" : "Variants") : (out ? t("sale.cart.outofstock") : `${stockVal} pz`)}
                    </Badge>
                  </div>
                  {!p.is_variant_parent && p.location_stock && (
                    <div className="text-[9px] text-muted-foreground/80 mt-1 flex flex-wrap gap-x-1.5 gap-y-0.5 border-t border-border/40 pt-1">
                      {locations.map(loc => {
                        const s = (p.location_stock?.[loc.id] ?? 0) - (loc.id === activeLocId ? cartQty : 0);
                        return (
                          <span key={loc.id} className={cn(loc.id === activeLocId && "font-semibold text-foreground")}>
                            {loc.name.split(" ")[0]}: {Math.max(0, s)}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <BarcodeScanner open={scannerOpen} onClose={() => setScannerOpen(false)} onDecode={handleScan} />

      {/* Cart */}
      <Card className="lg:sticky lg:top-20 self-start">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{t("sale.cart")}</h3>
            {cart.length > 0 && (
              <Button size="sm" variant="ghost" onClick={clear} className="h-7 text-xs">
                <X className="h-3.5 w-3.5 mr-1" /> {t("sale.cart.clear")}
              </Button>
            )}
          </div>

          {lines.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">{t("sale.cart.empty")}</p>
          ) : (
            <div className="space-y-2 max-h-[260px] overflow-y-auto">
              {lines.map((l) => (
                <div key={l.product_id} className="flex items-center gap-2 text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-medium">
                      {l.product.name}
                      {l.product.variant_attributes && (
                        <span className="text-xs text-muted-foreground ml-1 font-semibold">
                          ({l.product.variant_attributes.map((a) => a.value).join(", ")})
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground tabular-nums">
                      {formatEUR(l.product.price_gross)} × {l.quantity}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setQty(l.product_id, l.quantity - 1)}>
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-6 text-center tabular-nums">{l.quantity}</span>
                    <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setQty(l.product_id, l.quantity + 1)}>
                      <Plus className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setQty(l.product_id, 0)}>
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <Separator />

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">{t("sale.discount.label")}</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={discount || ""}
                onChange={(e) => setDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                className="h-9"
              />
            </div>
            <div>
              <Label className="text-xs">{t("common.customer")}</Label>
              <Input value={customer} onChange={(e) => setCustomer(e.target.value)} className="h-9" />
            </div>
          </div>

          <div>
            <Label className="text-xs">{t("sale.payment.label")}</Label>
            <RadioGroup
              value={payment}
              onValueChange={(v) => setPayment(v as PaymentMethod)}
              className="grid grid-cols-2 gap-2 mt-1"
            >
              <label
                className={cn(
                  "flex items-center gap-2 rounded-md border p-2 cursor-pointer text-sm",
                  payment === "elettronico" && "border-primary bg-primary/5",
                )}
              >
                <RadioGroupItem value="elettronico" /> {t("sale.payment.card")}
              </label>
              <label
                className={cn(
                  "flex items-center gap-2 rounded-md border p-2 cursor-pointer text-sm",
                  payment === "contanti" && "border-primary bg-primary/5",
                )}
              >
                <RadioGroupItem value="contanti" /> {t("sale.payment.cash")}
              </label>
            </RadioGroup>
          </div>

          {payment === "contanti" && lines.length > 0 && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">{t("common.received")}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={received}
                    onChange={(e) => {
                      setReceived(e.target.value);
                      setRecCounts({});
                      setChgCounts({});
                    }}
                    className="h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs">{t("common.change")}</Label>
                  <div className="h-9 px-3 flex items-center rounded-md border bg-muted/40 font-semibold tabular-nums">
                    {formatEUR(change)}
                  </div>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full text-xs h-8 flex items-center justify-center gap-1.5"
                onClick={() => setCalcOpen(true)}
              >
                <Calculator className="h-3.5 w-3.5" />
                {lang === "it" ? "Calcolatore Tagli" : "Denomination Calculator"}
              </Button>
            </div>
          )}

          <div>
            <Label className="text-xs">{t("sale.lottery.opt")}</Label>
            <Input
              value={lottery}
              onChange={(e) => setLottery(e.target.value.toUpperCase())}
              maxLength={12}
              placeholder="ABC1234"
              className="h-9"
            />
          </div>

          <div>
            <Label className="text-xs">{t("sale.note.label")}</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>

          <Separator />

          <div className="space-y-1 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>{t("common.subtotal")}</span>
              <span className="tabular-nums">{formatEUR(subtotal)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-destructive">
                <span>{t("common.discount")}</span>
                <span className="tabular-nums">− {formatEUR(discount)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-lg pt-1">
              <span>{t("common.total")}</span>
              <span className="tabular-nums">{formatEUR(total)}</span>
            </div>
          </div>

          <Button onClick={handleComplete} disabled={lines.length === 0} size="lg" className="w-full">
            {t("sale.complete")}
          </Button>
        </CardContent>
      </Card>

      {/* Variant Selector Dialog */}
      {selectedParent && (() => {
        const variants = products.filter((v) => v.parent_id === selectedParent.id);
        return (
          <Dialog open={!!selectedParent} onOpenChange={(o) => !o && setSelectedParent(null)}>
            <DialogContent className="max-w-md rounded-xl">
              <DialogHeader>
                <DialogTitle>{lang === "it" ? "Seleziona Variante" : "Select Variant"}</DialogTitle>
                <p className="text-xs text-muted-foreground">{selectedParent.name}</p>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-2 py-4">
                {variants.map((v) => {
                  const cartQty = cart.find(c => c.product_id === v.id)?.quantity ?? 0;
                  const stockVal = getProductAvailableStock(v) - cartQty;
                  const out = stockVal <= 0;
                  const label = v.variant_attributes?.map((a) => a.value).join(" / ") || v.sku;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      disabled={out}
                      onClick={() => {
                        if (cartQty >= getProductAvailableStock(v)) {
                          toast.warning(t("sale.cart.outofstock"));
                          return;
                        }
                        setCart((c) => {
                          const existing = c.find((x) => x.product_id === v.id);
                          if (existing)
                            return c.map((x) => (x.product_id === v.id ? { ...x, quantity: x.quantity + 1 } : x));
                          return [...c, { product_id: v.id, quantity: 1 }];
                        });
                        toast.success(lang === "it" ? `${selectedParent.name} (${label}) aggiunto` : `${selectedParent.name} (${label}) added`);
                        setSelectedParent(null);
                      }}
                      className={cn(
                        "text-left rounded-lg border bg-card p-3 transition hover:border-primary hover:shadow-sm flex flex-col justify-between min-h-[90px]",
                        out && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      <div className="font-semibold text-xs truncate w-full">{label}</div>
                      <div className="flex items-center justify-between w-full mt-1.5">
                        <div className="font-bold text-xs">{formatEUR(v.price_gross)}</div>
                        <Badge variant={out ? "destructive" : "outline"} className="text-[9px] h-4 px-1.5">
                          {out ? t("sale.cart.outofstock") : `${stockVal} pz`}
                        </Badge>
                      </div>
                      {v.location_stock && (
                        <div className="text-[8px] text-muted-foreground/85 flex flex-wrap gap-x-1.5 border-t border-border/40 pt-1 mt-1 w-full">
                          {locations.map(loc => {
                            const s = (v.location_stock?.[loc.id] ?? 0) - (loc.id === activeLocId ? cartQty : 0);
                            return (
                              <span key={loc.id} className={cn(loc.id === activeLocId && "font-semibold text-foreground")}>
                                {loc.name.split(" ")[0]}: {Math.max(0, s)}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* Denominations Calculator Dialog */}
      <Dialog open={calcOpen} onOpenChange={setCalcOpen}>
        <DialogContent className="max-w-md rounded-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5 text-primary" />
              {lang === "it" ? "Calcolatore Tagli" : "Denomination Calculator"}
            </DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="received" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="received">
                {lang === "it" ? "Ricevuto" : "Received"}
                {recTotal > 0 && <span className="ml-1.5 text-[10px] font-mono px-1 rounded bg-primary text-primary-foreground">{formatEUR(recTotal)}</span>}
              </TabsTrigger>
              <TabsTrigger value="change">
                {lang === "it" ? "Resto" : "Change"}
                {chgTotal > 0 && <span className="ml-1.5 text-[10px] font-mono px-1 rounded bg-destructive text-destructive-foreground">{formatEUR(chgTotal)}</span>}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="received" className="space-y-4">
              <div className="grid grid-cols-2 gap-2 max-h-[300px] overflow-y-auto pr-1">
                {DENOMINATIONS_LIST.map((d) => {
                  const qty = recCounts[d.val.toString()] || 0;
                  return (
                    <div key={`rec-${d.val}`} className="flex items-center justify-between p-1.5 rounded-lg border bg-card text-xs">
                      <span className="font-mono font-medium">{d.label}</span>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-5 w-5 rounded-full"
                          onClick={() => {
                            setRecCounts(prev => ({
                              ...prev,
                              [d.val.toString()]: Math.max(0, qty - 1)
                            }));
                          }}
                        >
                          <Minus className="h-2.5 w-2.5" />
                        </Button>
                        <span className="w-5 text-center font-medium font-mono">{qty}</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-5 w-5 rounded-full"
                          onClick={() => {
                            setRecCounts(prev => ({
                              ...prev,
                              [d.val.toString()]: qty + 1
                            }));
                          }}
                        >
                          <Plus className="h-2.5 w-2.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between items-center bg-muted/40 p-2.5 rounded-lg border text-xs">
                <span>{lang === "it" ? "Totale Ricevuto:" : "Total Received:"}</span>
                <span className="font-mono font-bold text-primary">{formatEUR(recTotal)}</span>
              </div>
            </TabsContent>
            <TabsContent value="change" className="space-y-4">
              <div className="grid grid-cols-2 gap-2 max-h-[300px] overflow-y-auto pr-1">
                {(() => {
                  const drawerDenoms = openShift?.cash_denominations ?? {};
                  const isDrawerTracked = Object.values(drawerDenoms).some(q => q > 0);
                  
                  return DENOMINATIONS_LIST.map((d) => {
                    const qty = chgCounts[d.val.toString()] || 0;
                    const drawerQty = drawerDenoms[d.val.toString()] || 0;
                    const leftInDrawer = isDrawerTracked ? Math.max(0, drawerQty - qty) : null;
                    const disablePlus = leftInDrawer !== null && leftInDrawer <= 0;
                    
                    return (
                      <div key={`chg-${d.val}`} className="flex items-center justify-between p-1.5 rounded-lg border bg-card text-xs">
                        <div className="flex flex-col">
                          <span className="font-mono font-medium">{d.label}</span>
                          {leftInDrawer !== null && (
                            <span className="text-[9px] text-muted-foreground font-mono">
                              {lang === "it" ? `Disp: ${leftInDrawer}` : `Avail: ${leftInDrawer}`}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-5 w-5 rounded-full"
                            onClick={() => {
                              setChgCounts(prev => ({
                                ...prev,
                                [d.val.toString()]: Math.max(0, qty - 1)
                              }));
                            }}
                          >
                            <Minus className="h-2.5 w-2.5" />
                          </Button>
                          <span className="w-5 text-center font-medium font-mono">{qty}</span>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-5 w-5 rounded-full"
                            disabled={disablePlus}
                            onClick={() => {
                              setChgCounts(prev => ({
                                ...prev,
                                [d.val.toString()]: qty + 1
                              }));
                            }}
                          >
                            <Plus className="h-2.5 w-2.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
              <div className="flex justify-between items-center bg-muted/40 p-2.5 rounded-lg border text-xs">
                <div>
                  <span className="font-medium block">{lang === "it" ? "Totale Resto:" : "Total Change:"}</span>
                  {Math.abs(chgTotal - change) > 0.01 && (
                    <span className="text-[10px] text-destructive">
                      {lang === "it" ? `Atteso: ${formatEUR(change)}` : `Expected: ${formatEUR(change)}`}
                    </span>
                  )}
                </div>
                <span className="font-mono font-bold text-destructive">{formatEUR(chgTotal)}</span>
              </div>
            </TabsContent>
          </Tabs>
          <div className="flex justify-end gap-2 border-t pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setRecCounts({});
                setChgCounts({});
              }}
            >
              {lang === "it" ? "Azzera" : "Reset"}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setReceived(recTotal > 0 ? recTotal.toFixed(2) : "");
                setCalcOpen(false);
                toast.success(lang === "it" ? "Tagli applicati" : "Denominations applied");
              }}
            >
              {lang === "it" ? "Applica" : "Apply"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
