import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useSessionState } from "@/hooks/useSessionState";
import {
  Wallet,
  TrendingUp,
  Receipt,
  Percent,
  Banknote,
  CreditCard,
  Download,
  PiggyBank,
  Plus,
  Trash2,
  Pencil,
  CheckCircle2,
  Clock,
  AlertCircle,
  Repeat,
  Building2,
  CalendarClock,
  Package,
  Boxes,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
  BarChart,
  Bar,
} from "recharts";
import { PageHeader } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  useStore,
  formatEUR,
  downloadCsv,
  VAT_RATES,
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_DEFS,
  categoryCostType,
} from "@/lib/store";
import { useT, useCurrentLang, translateCategory } from "@/lib/i18n";
import type {
  PaymentMethod,
  VatRate,
  Expense,
  ExpenseRecurrence,
  ExpenseStatus,
  Supplier,
} from "@/lib/types";
import { toast } from "sonner";

export const Route = createFileRoute("/accounting")({
  head: () => ({
    meta: [
      { title: "Contabilità — Soldo" },
      { name: "description", content: "Conto economico completo: ricavi, costi diretti e indiretti, IVA, P&L." },
    ],
  }),
  component: AccountingPage,
});

const CHART_COLORS = [
  "oklch(0.55 0.18 145)",
  "oklch(0.65 0.18 45)",
  "oklch(0.6 0.18 250)",
  "oklch(0.62 0.22 27)",
  "oklch(0.7 0.15 300)",
  "oklch(0.58 0.16 200)",
];

function AccountingPage() {
  const t = useT();
  const lang = useCurrentLang();
  const orders = useStore((s) => s.orders);
  const products = useStore((s) => s.products);
  const expenses = useStore((s) => s.expenses);
  const currentLocation = useStore((s) => s.currentLocation);
  const rollRecurring = useStore((s) => s.rollRecurringExpenses);
  const [range, setRange] = useSessionState<7 | 30 | 90 | 365>("acc-range", 30);
  const [activeTab, setActiveTab] = useSessionState<"overview" | "pnl" | "expenses" | "suppliers">("acc-activeTab", "overview");

  useEffect(() => {
    rollRecurring();
  }, [rollRecurring]);

  const data = useMemo(() => {
    const now = Date.now();
    const cutoff = now - range * 24 * 60 * 60 * 1000;
    const locId = currentLocation?.id;

    const filteredOrders = locId ? orders.filter((o) => o.location_id === locId) : orders;
    const filteredExpenses = locId ? expenses.filter((e) => e.location_id === locId) : expenses;

    const inRange = filteredOrders.filter((o) => new Date(o.created_at).getTime() >= cutoff);
    const expRange = filteredExpenses.filter((e) => new Date(e.date + "T00:00:00").getTime() >= cutoff);

    const revenue = inRange.reduce((a, o) => a + o.total_gross, 0);
    const net = inRange.reduce((a, o) => a + o.total_net, 0);
    const vat = inRange.reduce((a, o) => a + o.total_vat, 0);
    const cogsProducts = inRange.reduce((a, o) => a + o.total_cost, 0);

    let directExp = 0;
    let indirectExp = 0;
    for (const e of expRange) {
      if (e.cost_type === "direct") directExp += e.amount;
      else indirectExp += e.amount;
    }
    const totalExp = directExp + indirectExp;
    const grossProfit = revenue - cogsProducts - directExp;
    const ebitda = grossProfit - indirectExp;
    const netProfit = ebitda - vat;
    const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
    const netMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;
    const avg = inRange.length > 0 ? revenue / inRange.length : 0;

    // daily trend
    const days = Math.min(range, 90);
    const dayMap = new Map<string, { date: string; revenue: number; cogs: number; expenses: number }>();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      dayMap.set(key, { date: key, revenue: 0, cogs: 0, expenses: 0 });
    }
    for (const o of inRange) {
      const entry = dayMap.get(o.created_at.slice(0, 10));
      if (entry) {
        entry.revenue += o.total_gross;
        entry.cogs += o.total_cost;
      }
    }
    for (const e of expRange) {
      const entry = dayMap.get(e.date);
      if (entry) entry.expenses += e.amount;
    }
    const trend = Array.from(dayMap.values()).map((d) => ({
      ...d,
      revenue: +d.revenue.toFixed(2),
      cogs: +d.cogs.toFixed(2),
      expenses: +d.expenses.toFixed(2),
      label: new Date(d.date).toLocaleDateString(lang === "it" ? "it-IT" : "en-US", {
        day: "2-digit",
        month: "short",
      }),
    }));

    // vat by rate
    const vatMap: Record<number, { net: number; vat: number }> = {};
    for (const o of inRange)
      for (const it of o.items) {
        const r = vatMap[it.vat_rate] ?? { net: 0, vat: 0 };
        r.net += it.net_amount;
        r.vat += it.vat_amount;
        vatMap[it.vat_rate] = r;
      }
    const vatRows = Object.entries(vatMap)
      .map(([rate, v]) => ({ rate: `${rate}%`, net: +v.net.toFixed(2), vat: +v.vat.toFixed(2) }))
      .sort((a, b) => parseFloat(b.rate) - parseFloat(a.rate));

    let cashTotal = 0;
    let cardTotal = 0;
    for (const o of inRange)
      o.payment_method === "contanti" ? (cashTotal += o.total_gross) : (cardTotal += o.total_gross);
    const paymentMix = [
      { name: t("sale.payment.cash"), value: +cashTotal.toFixed(2) },
      { name: t("sale.payment.card"), value: +cardTotal.toFixed(2) },
    ].filter((p) => p.value > 0);

    const prodMap = new Map<string, { name: string; revenue: number; qty: number }>();
    for (const o of inRange)
      for (const it of o.items) {
        const e = prodMap.get(it.product_id) ?? { name: it.product_name, revenue: 0, qty: 0 };
        e.revenue += it.total_gross;
        e.qty += it.quantity;
        prodMap.set(it.product_id, e);
      }
    const top = Array.from(prodMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)
      .map((p) => ({ ...p, revenue: +p.revenue.toFixed(2) }));

    const ledger = Array.from(dayMap.values())
      .filter((d) => d.revenue > 0 || d.expenses > 0)
      .reverse()
      .slice(0, 14)
      .map((d) => {
        const dayOrders = inRange.filter((o) => o.created_at.slice(0, 10) === d.date);
        const vatDay = dayOrders.reduce((a, o) => a + o.total_vat, 0);
        return {
          date: d.date,
          receipts: dayOrders.length,
          gross: d.revenue,
          expenses: d.expenses,
          vat: +vatDay.toFixed(2),
          delta: +(d.revenue - d.cogs - d.expenses).toFixed(2),
        };
      });

    const stockValue = products.reduce((a, p) => a + p.cost_price * p.stock_quantity, 0);

    return {
      revenue,
      net,
      vat,
      cogsProducts,
      directExp,
      indirectExp,
      totalExp,
      grossProfit,
      ebitda,
      netProfit,
      grossMargin,
      netMargin,
      avg,
      cashTotal,
      cardTotal,
      trend,
      vatRows,
      paymentMix,
      top,
      ledger,
      stockValue,
      count: inRange.length,
    };
  }, [orders, products, expenses, range, lang, t]);

  function exportCsv() {
    downloadCsv(
      `corrispettivi-${new Date().toISOString().slice(0, 10)}.csv`,
      ["date", "receipts", "gross", "expenses", "vat", "delta"],
      data.ledger.map((r) => [r.date, r.receipts, r.gross.toFixed(2), r.expenses.toFixed(2), r.vat.toFixed(2), r.delta.toFixed(2)]),
    );
    toast.success(lang === "it" ? "CSV esportato" : "CSV exported");
  }

  return (
    <>
      <PageHeader
        title={t("acc.title")}
        subtitle={t("acc.subtitle")}
        actions={
          <Tabs value={String(range)} onValueChange={(v) => setRange(Number(v) as 7 | 30 | 90 | 365)}>
            <TabsList className="h-9">
              <TabsTrigger value="7" className="text-xs px-2.5">{t("acc.range.7")}</TabsTrigger>
              <TabsTrigger value="30" className="text-xs px-2.5">{t("acc.range.30")}</TabsTrigger>
              <TabsTrigger value="90" className="text-xs px-2.5">{t("acc.range.90")}</TabsTrigger>
              <TabsTrigger value="365" className="text-xs px-2.5">365</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />
      <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 max-w-7xl">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
          <TabsList className="mb-4 flex-wrap h-auto">
            <TabsTrigger value="overview">{t("acc.tab.overview")}</TabsTrigger>
            <TabsTrigger value="pnl">{t("acc.tab.pnl")}</TabsTrigger>
            <TabsTrigger value="expenses">{t("acc.tab.expenses")}</TabsTrigger>
            <TabsTrigger value="suppliers">{t("acc.tab.suppliers")}</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 md:gap-4">
              <Kpi icon={Wallet} label={t("acc.kpi.revenue")} value={formatEUR(data.revenue)} accent="bg-primary/10 text-primary" />
              <Kpi icon={PiggyBank} label={t("acc.kpi.expenses")} value={formatEUR(data.totalExp)} accent="bg-destructive/10 text-destructive" />
              <Kpi icon={Percent} label={t("acc.kpi.vat")} value={formatEUR(data.vat)} accent="bg-warning/15 text-warning" />
              <Kpi icon={TrendingUp} label={t("acc.kpi.netprofit")} value={formatEUR(data.netProfit)} accent={data.netProfit >= 0 ? "bg-success/15 text-success" : "bg-destructive/10 text-destructive"} />
              <Kpi icon={Percent} label={t("acc.kpi.margin")} value={`${data.netMargin.toFixed(1)}%`} />
              <Kpi icon={Receipt} label={t("acc.kpi.avg")} value={formatEUR(data.avg)} />
            </div>

            <InventoryValueCard />


            {data.count === 0 && data.totalExp === 0 ? (
              <Card>
                <CardContent className="p-10 text-center text-sm text-muted-foreground">{t("acc.empty")}</CardContent>
              </Card>
            ) : (
              <>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{t("acc.chart.trend")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[260px] md:h-[320px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data.trend} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                          <defs>
                            <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={CHART_COLORS[0]} stopOpacity={0.4} />
                              <stop offset="100%" stopColor={CHART_COLORS[0]} stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="cost" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={CHART_COLORS[3]} stopOpacity={0.25} />
                              <stop offset="100%" stopColor={CHART_COLORS[3]} stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="exp" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={CHART_COLORS[1]} stopOpacity={0.3} />
                              <stop offset="100%" stopColor={CHART_COLORS[1]} stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                          <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                          <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" width={50} />
                          <Tooltip
                            contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                            formatter={(v: number) => formatEUR(v)}
                          />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                          <Area type="monotone" dataKey="revenue" stroke={CHART_COLORS[0]} fill="url(#rev)" strokeWidth={2} name={t("acc.kpi.revenue")} />
                          <Area type="monotone" dataKey="cogs" stroke={CHART_COLORS[3]} fill="url(#cost)" strokeWidth={2} name={t("acc.liquidity.cost")} />
                          <Area type="monotone" dataKey="expenses" stroke={CHART_COLORS[1]} fill="url(#exp)" strokeWidth={2} name={t("acc.kpi.expenses")} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-base">{t("acc.chart.vat")}</CardTitle></CardHeader>
                    <CardContent>
                      <div className="h-[240px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={data.vatRows} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                            <XAxis dataKey="rate" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                            <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" width={50} />
                            <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} formatter={(v: number) => formatEUR(v)} />
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                            <Bar dataKey="net" fill={CHART_COLORS[2]} name={t("acc.ledger.net")} radius={[4, 4, 0, 0]} />
                            <Bar dataKey="vat" fill={CHART_COLORS[1]} name={t("acc.ledger.vat")} radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-base">{t("acc.chart.payment")}</CardTitle></CardHeader>
                    <CardContent>
                      <div className="h-[240px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={data.paymentMix} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2}>
                              {data.paymentMix.map((_, i) => (
                                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} formatter={(v: number) => formatEUR(v)} />
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {data.top.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-base">{t("acc.chart.top")}</CardTitle></CardHeader>
                    <CardContent>
                      <div className="h-[260px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={data.top} layout="vertical" margin={{ top: 8, right: 24, bottom: 0, left: 8 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                            <XAxis type="number" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                            <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" width={120} />
                            <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} formatter={(v: number) => formatEUR(v)} />
                            <Bar dataKey="revenue" fill={CHART_COLORS[0]} radius={[0, 6, 6, 0]} name={t("acc.kpi.revenue")} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <LiquidityCard icon={Banknote} label={t("acc.liquidity.cash")} value={formatEUR(data.cashTotal)} accent="bg-success/10 text-success" />
                  <LiquidityCard icon={CreditCard} label={t("acc.liquidity.card")} value={formatEUR(data.cardTotal)} accent="bg-primary/10 text-primary" />
                  <LiquidityCard icon={PiggyBank} label={t("acc.liquidity.cost")} value={formatEUR(data.cogsProducts + data.directExp)} accent="bg-warning/15 text-warning" />
                </div>

                <Card>
                  <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-base">{t("acc.ledger.title")}</CardTitle>
                    <Button size="sm" variant="outline" onClick={exportCsv}>
                      <Download className="h-4 w-4 mr-1.5" /> {t("acc.ledger.export")}
                    </Button>
                  </CardHeader>
                  <CardContent className="p-0">
                    {/* Mobile ledger cards */}
                    <div className="md:hidden divide-y">
                      {data.ledger.map((r) => (
                        <div key={r.date} className="p-3 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-xs font-medium">{r.date}</span>
                            <span className={`font-semibold tabular-nums text-sm ${r.delta >= 0 ? "text-success" : "text-destructive"}`}>
                              Δ {formatEUR(r.delta)}
                            </span>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-xs">
                            <div>
                              <span className="text-muted-foreground block text-[9px] uppercase">{t("acc.ledger.gross")}</span>
                              <span className="font-medium tabular-nums">{formatEUR(r.gross)}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground block text-[9px] uppercase">{t("acc.kpi.expenses")}</span>
                              <span className="text-destructive tabular-nums">−{formatEUR(r.expenses)}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground block text-[9px] uppercase">{t("acc.ledger.vat")}</span>
                              <span className="text-warning tabular-nums">{formatEUR(r.vat)}</span>
                            </div>
                          </div>
                          <div className="text-[10px] text-muted-foreground">{r.receipts} {t("acc.ledger.receipts").toLowerCase()}</div>
                        </div>
                      ))}
                    </div>
                    {/* Desktop ledger table */}
                    <div className="hidden md:block overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t("acc.ledger.date")}</TableHead>
                            <TableHead className="text-right">{t("acc.ledger.receipts")}</TableHead>
                            <TableHead className="text-right">{t("acc.ledger.gross")}</TableHead>
                            <TableHead className="text-right">{t("acc.kpi.expenses")}</TableHead>
                            <TableHead className="text-right">{t("acc.ledger.vat")}</TableHead>
                            <TableHead className="text-right">Δ</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.ledger.map((r) => (
                            <TableRow key={r.date}>
                              <TableCell className="font-mono text-xs">{r.date}</TableCell>
                              <TableCell className="text-right">{r.receipts}</TableCell>
                              <TableCell className="text-right font-medium">{formatEUR(r.gross)}</TableCell>
                              <TableCell className="text-right text-destructive">− {formatEUR(r.expenses)}</TableCell>
                              <TableCell className="text-right text-warning">{formatEUR(r.vat)}</TableCell>
                              <TableCell className={`text-right font-semibold tabular-nums ${r.delta >= 0 ? "text-success" : "text-destructive"}`}>
                                {formatEUR(r.delta)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          <TabsContent value="pnl">
            <PnlTab data={data} />
          </TabsContent>

          <TabsContent value="expenses">
            <ExpensesTab />
          </TabsContent>

          <TabsContent value="suppliers">
            <SuppliersTab />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

function Kpi({ icon: Icon, label, value, accent }: { icon: any; label: string; value: string; accent?: string }) {
  return (
    <Card className="border-border/60">
      <CardContent className="p-3 md:p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] md:text-xs uppercase tracking-wider text-muted-foreground font-medium truncate">{label}</div>
            <div className="mt-1 text-base md:text-xl font-display font-semibold tabular-nums">{value}</div>
          </div>
          <div className={`h-8 w-8 rounded-lg grid place-items-center shrink-0 ${accent ?? "bg-accent text-accent-foreground"}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function LiquidityCard({ icon: Icon, label, value, accent }: { icon: any; label: string; value: string; accent: string }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`h-10 w-10 rounded-lg grid place-items-center ${accent}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="font-display font-semibold text-lg">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function InventoryValueCard() {
  const t = useT();
  const products = useStore((s) => s.products);
  const v = useMemo(() => {
    let cost = 0, retail = 0, units = 0, skus = 0;
    for (const p of products) {
      if (p.stock_quantity > 0) skus++;
      units += Math.max(0, p.stock_quantity);
      cost += p.cost_price * p.stock_quantity;
      retail += p.price_gross * p.stock_quantity;
    }
    const margin = retail - cost;
    return { cost, retail, margin, units, skus };
  }, [products]);
  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Boxes className="h-5 w-5 text-primary" />
          {t("inv.value.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="rounded-lg border bg-card p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("inv.value.cost")}</div>
            <div className="font-display text-lg md:text-xl font-semibold tabular-nums">{formatEUR(v.cost)}</div>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("inv.value.retail")}</div>
            <div className="font-display text-lg md:text-xl font-semibold tabular-nums">{formatEUR(v.retail)}</div>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("inv.value.potential")}</div>
            <div className="font-display text-lg md:text-xl font-semibold tabular-nums text-success">{formatEUR(v.margin)}</div>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("inv.value.units")}</div>
            <div className="font-display text-lg md:text-xl font-semibold tabular-nums">{v.units}</div>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("inv.value.skus")}</div>
            <div className="font-display text-lg md:text-xl font-semibold tabular-nums">{v.skus}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PnlTab({ data }: { data: any }) {
  const t = useT();
  const expenses = useStore((s) => s.expenses);
  const currentLocation = useStore((s) => s.currentLocation);

  // breakdown indirect expenses by category for the same range as `data`
  // (data already filtered: we recompute breakdown from raw via simple recompute)
  const opexByCat = useMemo(() => {
    const m: Record<string, number> = {};
    const locId = currentLocation?.id;
    const list = locId ? expenses.filter((e) => e.location_id === locId) : expenses;
    for (const e of list) {
      if (e.cost_type !== "indirect") continue;
      m[e.category] = (m[e.category] || 0) + e.amount;
    }
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [expenses, currentLocation]);

  const Row = ({ label, value, bold, tone }: { label: string; value: number; bold?: boolean; tone?: "pos" | "neg" | "sub" }) => (
    <div className={`flex items-center justify-between py-2 ${bold ? "border-t font-semibold" : ""}`}>
      <span className={tone === "sub" ? "pl-4 text-sm text-muted-foreground" : "text-sm"}>{label}</span>
      <span className={`tabular-nums ${tone === "pos" ? "text-success" : tone === "neg" ? "text-destructive" : ""}`}>
        {formatEUR(value)}
      </span>
    </div>
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t("acc.pl.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        {data.revenue === 0 && data.totalExp === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">{t("acc.pl.empty")}</p>
        ) : (
          <div className="space-y-0.5">
            <Row label={t("acc.pl.revenue")} value={data.revenue} />
            <Row label={t("acc.pl.cogs")} value={-data.cogsProducts} tone="neg" />
            <Row label={t("acc.pl.directOpex")} value={-data.directExp} tone="neg" />
            <Row label={t("acc.pl.gross")} value={data.grossProfit} bold tone={data.grossProfit >= 0 ? "pos" : "neg"} />
            <Row label={t("acc.pl.opex")} value={-data.indirectExp} tone="neg" />
            {opexByCat.slice(0, 6).map(([c, v]) => (
              <Row key={c} label={translateCategory(t, c)} value={-v} tone="sub" />
            ))}
            <Row label={t("acc.pl.ebitda")} value={data.ebitda} bold tone={data.ebitda >= 0 ? "pos" : "neg"} />
            <Row label={t("acc.pl.vat")} value={-data.vat} tone="neg" />
            <Row label={t("acc.pl.net")} value={data.netProfit} bold tone={data.netProfit >= 0 ? "pos" : "neg"} />
            <div className="mt-4 grid grid-cols-2 gap-3 text-center">
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">{t("acc.kpi.margin")} ({lang === "it" ? "lordo" : "gross"})</div>
                <div className="font-display text-xl font-semibold">{data.grossMargin.toFixed(1)}%</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">{t("acc.kpi.margin")} ({lang === "it" ? "netto" : "net"})</div>
                <div className={`font-display text-xl font-semibold ${data.netMargin >= 0 ? "text-success" : "text-destructive"}`}>
                  {data.netMargin.toFixed(1)}%
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function statusOf(e: Expense): ExpenseStatus {
  if (e.status === "paid") return "paid";
  if (e.due_date && e.due_date < new Date().toISOString().slice(0, 10)) return "overdue";
  return e.status;
}

function ExpensesTab() {
  const t = useT();
  const expenses = useStore((s) => s.expenses);
  const currentLocation = useStore((s) => s.currentLocation);
  const addExpense = useStore((s) => s.addExpense);
  const updateExpense = useStore((s) => s.updateExpense);
  const deleteExpense = useStore((s) => s.deleteExpense);
  const markPaid = useStore((s) => s.markExpensePaid);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterCat, setFilterCat] = useState<string>("all");

  const filtered = useMemo(() => {
    const locId = currentLocation?.id;
    return expenses.filter((e) => {
      if (locId && e.location_id !== locId) return false;
      const st = statusOf(e);
      if (filterStatus !== "all" && st !== filterStatus) return false;
      if (filterCat !== "all" && e.category !== filterCat) return false;
      return true;
    });
  }, [expenses, filterStatus, filterCat, currentLocation]);

  const total = filtered.reduce((a, e) => a + e.amount, 0);
  const thisMonth = useMemo(() => {
    const m = new Date().toISOString().slice(0, 7);
    const locId = currentLocation?.id;
    const list = locId ? expenses.filter((e) => e.location_id === locId) : expenses;
    return list.filter((e) => e.date.startsWith(m)).reduce((a, e) => a + e.amount, 0);
  }, [expenses, currentLocation]);
  const pending = useMemo(() => {
    const locId = currentLocation?.id;
    const list = locId ? expenses.filter((e) => e.location_id === locId) : expenses;
    return list.filter((e) => statusOf(e) !== "paid").reduce((a, e) => a + e.amount, 0);
  }, [expenses, currentLocation]);
  const recurringMonthly = useMemo(() => {
    let s = 0;
    const locId = currentLocation?.id;
    const list = locId ? expenses.filter((e) => e.location_id === locId) : expenses;
    for (const e of list) {
      if (e.recurrence === "monthly") s += e.amount;
      else if (e.recurrence === "weekly") s += e.amount * 4.33;
      else if (e.recurrence === "quarterly") s += e.amount / 3;
      else if (e.recurrence === "yearly") s += e.amount / 12;
    }
    return s;
  }, [expenses, currentLocation]);

  const byCat = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of filtered) m[e.category] = (m[e.category] || 0) + e.amount;
    return Object.entries(m).map(([name, value]) => ({ name: translateCategory(t, name), value: +value.toFixed(2) })).sort((a, b) => b.value - a.value);
  }, [filtered, t]);

  const upcoming = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const locId = currentLocation?.id;
    const list = locId ? expenses.filter((e) => e.location_id === locId) : expenses;
    return list
      .filter((e) => statusOf(e) !== "paid" && e.due_date)
      .sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1))
      .slice(0, 5)
      .map((e) => ({ ...e, _overdue: e.due_date! < today }));
  }, [expenses, currentLocation]);

  function exportCsv() {
    downloadCsv(
      `spese-${new Date().toISOString().slice(0, 10)}.csv`,
      ["date", "due_date", "category", "cost_type", "supplier", "reference", "description", "amount", "vat_rate", "payment_method", "status", "recurrence"],
      filtered.map((e) => [
        e.date,
        e.due_date ?? "",
        e.category,
        e.cost_type,
        e.supplier_name ?? "",
        e.reference ?? "",
        e.description,
        e.amount.toFixed(2),
        e.vat_rate,
        e.payment_method,
        e.status,
        e.recurrence,
      ]),
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi icon={PiggyBank} label={t("acc.exp.kpi.month")} value={formatEUR(thisMonth)} accent="bg-destructive/10 text-destructive" />
        <Kpi icon={Clock} label={t("acc.exp.kpi.pending")} value={formatEUR(pending)} accent="bg-warning/15 text-warning" />
        <Kpi icon={Repeat} label={t("acc.exp.kpi.recurring")} value={formatEUR(recurringMonthly)} />
        <Kpi icon={Receipt} label={t("common.total")} value={formatEUR(total)} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-9 w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all")}</SelectItem>
              <SelectItem value="pending">{t("acc.exp.status.pending")}</SelectItem>
              <SelectItem value="overdue">{t("acc.exp.status.overdue")}</SelectItem>
              <SelectItem value="paid">{t("acc.exp.status.paid")}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterCat} onValueChange={setFilterCat}>
            <SelectTrigger className="h-9 w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all")}</SelectItem>
              {EXPENSE_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>{translateCategory(t, c)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          {filtered.length > 0 && (
            <Button size="sm" variant="outline" onClick={exportCsv}>
              <Download className="h-4 w-4 mr-1.5" /> CSV
            </Button>
          )}
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={() => setEditing(null)}>
                <Plus className="h-4 w-4 mr-1.5" /> {t("acc.exp.add")}
              </Button>
            </DialogTrigger>
            <ExpenseDialog
              initial={editing}
              onSave={(payload, restock) => {
                if (editing) {
                  updateExpense(editing.id, payload);
                  toast.success(t("inv.toast.updated"));
                } else {
                  addExpense(payload);
                  toast.success(t("acc.exp.add"));
                }
                if (restock && restock.product_id && restock.quantity > 0) {
                  useStore.getState().adjustStock(
                    restock.product_id,
                    restock.quantity,
                    "restock",
                    payload.reference || payload.description || payload.supplier_name || undefined,
                  );
                  toast.success(t("acc.exp.restock.toast"));
                }
                setOpen(false);
                setEditing(null);
              }}
            />
          </Dialog>
        </div>
      </div>

      {upcoming.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarClock className="h-4 w-4" /> {t("acc.exp.upcoming")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcoming.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 text-sm border-l-4 pl-3 py-1.5 rounded-r"
                style={{ borderColor: e._overdue ? "var(--destructive)" : "var(--warning)" }}>
                <div className="min-w-0">
                  <div className="font-medium truncate">{e.description || translateCategory(t, e.category)}</div>
                  <div className="text-xs text-muted-foreground">
                    {e.supplier_name ? `${e.supplier_name} · ` : ""}{e.due_date}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-semibold tabular-nums">{formatEUR(e.amount)}</span>
                  <Button size="sm" variant="outline" onClick={() => markPaid(e.id)}>
                    <CheckCircle2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {byCat.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">{t("acc.chart.expense")}</CardTitle></CardHeader>
          <CardContent>
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byCat} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" interval={0} angle={-20} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" width={50} />
                  <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} formatter={(v: number) => formatEUR(v)} />
                  <Bar dataKey="value" fill="oklch(0.62 0.22 27)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground p-8">{t("acc.exp.none")}</p>
          ) : (
            <>
              {/* Mobile expense cards */}
              <div className="md:hidden divide-y">
                {filtered.map((e) => {
                  const st = statusOf(e);
                  return (
                    <div key={e.id} className="p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono text-[10px] text-muted-foreground">{e.date}</span>
                            {e.recurrence !== "none" && <Repeat className="h-3 w-3 text-muted-foreground" />}
                            <Badge variant={st === "paid" ? "secondary" : st === "overdue" ? "destructive" : "outline"} className="text-[9px] px-1.5 py-0">
                              {t(`acc.exp.status.${st}`)}
                            </Badge>
                          </div>
                          <div className="text-sm font-medium mt-0.5 truncate">{e.description || translateCategory(t, e.category)}</div>
                          <div className="text-xs text-muted-foreground">
                            {translateCategory(t, e.category)} · {e.cost_type === "direct" ? t("cost.direct") : t("cost.indirect")}
                            {e.supplier_name && ` · ${e.supplier_name}`}
                          </div>
                        </div>
                        <div className="font-semibold tabular-nums text-destructive text-sm whitespace-nowrap">−{formatEUR(e.amount)}</div>
                      </div>
                      <div className="flex gap-1 justify-end">
                        {st !== "paid" && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => markPaid(e.id)}>
                            <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(e); setOpen(true); }}>
                          <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteExpense(e.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Desktop expense table */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("common.date")}</TableHead>
                      <TableHead>{t("common.category")}</TableHead>
                      <TableHead>{t("acc.exp.supplier")}</TableHead>
                      <TableHead>{t("acc.exp.desc")}</TableHead>
                      <TableHead>{t("acc.exp.status")}</TableHead>
                      <TableHead className="text-right">{t("common.amount")}</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((e) => {
                      const st = statusOf(e);
                      return (
                        <TableRow key={e.id}>
                          <TableCell className="font-mono text-xs whitespace-nowrap">
                            {e.date}
                            {e.recurrence !== "none" && (
                              <Repeat className="inline h-3 w-3 ml-1 text-muted-foreground" />
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">{translateCategory(t, e.category)}</div>
                            <div className="text-[10px] uppercase text-muted-foreground">
                              {e.cost_type === "direct" ? t("cost.direct") : t("cost.indirect")}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{e.supplier_name ?? "—"}</TableCell>
                          <TableCell className="text-sm max-w-[200px] truncate">{e.description}</TableCell>
                          <TableCell>
                            <Badge variant={st === "paid" ? "secondary" : st === "overdue" ? "destructive" : "outline"} className="text-[10px]">
                              {st === "paid" ? <CheckCircle2 className="h-3 w-3 mr-1" /> : st === "overdue" ? <AlertCircle className="h-3 w-3 mr-1" /> : <Clock className="h-3 w-3 mr-1" />}
                              {t(`acc.exp.status.${st}`)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-semibold tabular-nums text-destructive whitespace-nowrap">
                            − {formatEUR(e.amount)}
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-1">
                              {st !== "paid" && (
                                <Button variant="ghost" size="icon" onClick={() => markPaid(e.id)} title={t("acc.exp.markpaid")}>
                                  <CheckCircle2 className="h-4 w-4 text-success" />
                                </Button>
                              )}
                              <Button variant="ghost" size="icon" onClick={() => { setEditing(e); setOpen(true); }}>
                                <Pencil className="h-4 w-4 text-muted-foreground" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => deleteExpense(e.id)}>
                                <Trash2 className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const RESTOCK_CATEGORIES = new Set(["Acquisto merci", "Materie prime"]);
const EMPLOYEE_CATEGORIES = new Set(["Stipendi", "Contributi INPS", "Formazione"]);
const FINANCE_TAX_CATEGORIES = new Set(["Commissioni POS", "Commissioni bancarie", "Interessi su prestiti", "Tasse e imposte"]);

interface RestockLink { product_id: string; quantity: number }

function ExpenseDialog({
  initial,
  onSave,
}: {
  initial?: Expense | null;
  onSave: (e: Omit<Expense, "id" | "created_at">, restock?: RestockLink) => void;
}) {
  const t = useT();
  const lang = useCurrentLang();
  const suppliers = useStore((s) => s.suppliers);
  const addSupplier = useStore((s) => s.addSupplier);
  const products = useStore((s) => s.products);
  const users = useStore((s) => s.users);

  const [form, setForm] = useState(() => ({
    date: initial?.date ?? new Date().toISOString().slice(0, 10),
    due_date: initial?.due_date ?? "",
    category: initial?.category ?? EXPENSE_CATEGORIES[0],
    cost_type: initial?.cost_type ?? categoryCostType(EXPENSE_CATEGORIES[0]),
    description: initial?.description ?? "",
    amount: initial?.amount ?? 0,
    vat_rate: (initial?.vat_rate ?? 22) as VatRate,
    payment_method: (initial?.payment_method ?? "elettronico") as PaymentMethod,
    supplier_id: initial?.supplier_id ?? "",
    supplier_name: initial?.supplier_name ?? "",
    reference: initial?.reference ?? "",
    status: (initial?.status ?? "paid") as ExpenseStatus,
    recurrence: (initial?.recurrence ?? "none") as ExpenseRecurrence,
    next_due: initial?.next_due ?? "",
  }));

  const [newSupplier, setNewSupplier] = useState("");
  const [restockProductId, setRestockProductId] = useState("");
  const [restockQty, setRestockQty] = useState<number>(0);
  const [autoAmount, setAutoAmount] = useState(true);

  const isRestockable = RESTOCK_CATEGORIES.has(form.category) && !initial;
  const selectedProduct = products.find((p) => p.id === restockProductId);

  // auto-derive amount when product/qty change
  useEffect(() => {
    if (isRestockable && autoAmount && selectedProduct && restockQty > 0) {
      const calc = +(selectedProduct.cost_price * restockQty).toFixed(2);
      setForm((f) => ({
        ...f,
        amount: calc,
        description: f.description || `${restockQty}× ${selectedProduct.name}`,
        supplier_name: f.supplier_name,
      }));
    }
  }, [isRestockable, autoAmount, selectedProduct, restockQty]);

  function setCategory(cat: string) {
    let extra = {};
    if (EMPLOYEE_CATEGORIES.has(cat) || FINANCE_TAX_CATEGORIES.has(cat)) {
      extra = { vat_rate: 0 };
    }
    if (FINANCE_TAX_CATEGORIES.has(cat)) {
      extra = { ...extra, supplier_id: "", supplier_name: "" };
    }
    setForm((f) => ({
      ...f,
      category: cat,
      cost_type: categoryCostType(cat),
      ...extra
    }));
  }

  // Clear supplier/employee if category selection switches
  useEffect(() => {
    const isEmployeeCat = EMPLOYEE_CATEGORIES.has(form.category);
    const isSupplierCat = !isEmployeeCat && !FINANCE_TAX_CATEGORIES.has(form.category);
    
    if (isEmployeeCat) {
      // Check if current supplier_id matches a supplier, if so clear it because we need an employee
      const matchesSupplier = suppliers.some((s) => s.id === form.supplier_id);
      if (matchesSupplier) {
        setForm((f) => ({ ...f, supplier_id: "", supplier_name: "" }));
      }
    } else if (isSupplierCat) {
      // Check if current supplier_id matches an employee, if so clear it
      const matchesEmployee = users.some((u) => u.id === form.supplier_id);
      if (matchesEmployee) {
        setForm((f) => ({ ...f, supplier_id: "", supplier_name: "" }));
      }
    }
  }, [form.category, suppliers, users]);

  function pickSupplier(id: string) {
    if (id === "__none") {
      setForm((f) => ({ ...f, supplier_id: "", supplier_name: "" }));
      return;
    }
    const s = suppliers.find((x) => x.id === id);
    if (s) setForm((f) => ({ ...f, supplier_id: s.id, supplier_name: s.name }));
  }

  function pickEmployee(id: string) {
    if (id === "__none") {
      setForm((f) => ({ ...f, supplier_id: "", supplier_name: "" }));
      return;
    }
    const u = users.find((x) => x.id === id);
    if (u) {
      setForm((f) => ({
        ...f,
        supplier_id: u.id,
        supplier_name: u.name,
        description: f.description || (lang === "it" ? `Stipendio: ${u.name}` : `Salary: ${u.name}`),
      }));
    }
  }

  function addSupplierInline() {
    if (!newSupplier.trim()) return;
    const s = addSupplier({ name: newSupplier.trim() });
    setForm((f) => ({ ...f, supplier_id: s.id, supplier_name: s.name }));
    setNewSupplier("");
  }

  function submit() {
    const payload: Omit<Expense, "id" | "created_at"> = {
      date: form.date,
      due_date: form.due_date || null,
      category: form.category,
      cost_type: form.cost_type,
      description: form.description,
      amount: form.amount,
      vat_rate: form.vat_rate,
      payment_method: form.payment_method,
      supplier_id: form.supplier_id || null,
      supplier_name: form.supplier_name || null,
      reference: form.reference || null,
      status: form.status,
      recurrence: form.recurrence,
      next_due: form.recurrence !== "none" ? form.next_due || form.due_date || form.date : null,
    };
    const restock = isRestockable && restockProductId && restockQty > 0
      ? { product_id: restockProductId, quantity: restockQty }
      : undefined;
    onSave(payload, restock);
  }

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>{initial ? t("acc.exp.edit") : t("acc.exp.add")}</DialogTitle>
      </DialogHeader>
      <div className="grid gap-3 max-h-[70vh] overflow-y-auto pr-1">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>{t("common.date")}</Label>
            <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("acc.exp.duedate")}</Label>
            <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>{t("common.category")}</Label>
            <Select value={form.category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORY_DEFS.map((c) => (
                  <SelectItem key={c.name} value={c.name}>
                    {translateCategory(t, c.name)} <span className="text-[10px] text-muted-foreground ml-1">({c.cost_type === "direct" ? t("cost.direct.short") : t("cost.indirect.short")})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("acc.exp.costtype")}</Label>
            <Select value={form.cost_type} onValueChange={(v) => setForm({ ...form, cost_type: v as any })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="direct">{t("acc.exp.cost.direct")}</SelectItem>
                <SelectItem value="indirect">{t("acc.exp.cost.indirect")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {isRestockable && (
          <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Package className="h-4 w-4 text-primary" />
              {t("acc.exp.restock.title")}
            </div>
            <p className="text-xs text-muted-foreground">{t("acc.exp.restock.help")}</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{t("acc.exp.restock.product")}</Label>
                <Select value={restockProductId || "__none"} onValueChange={(v) => setRestockProductId(v === "__none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder={t("common.none")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">{t("common.none")}</SelectItem>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} <span className="text-[10px] text-muted-foreground ml-1">({p.stock_quantity})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("acc.exp.restock.qty")}</Label>
                <Input
                  type="number"
                  min={0}
                  step="1"
                  value={restockQty || ""}
                  onChange={(e) => setRestockQty(parseInt(e.target.value) || 0)}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-primary"
                checked={autoAmount}
                onChange={(e) => setAutoAmount(e.target.checked)}
              />
              {t("acc.exp.restock.autoamount")}
              {selectedProduct && restockQty > 0 && (
                <span className="ml-auto text-muted-foreground tabular-nums">
                  = {formatEUR(selectedProduct.cost_price * restockQty)}
                </span>
              )}
            </label>
          </div>
        )}


        <div className="space-y-1.5">
          <Label>{t("acc.exp.desc")}</Label>
          <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>

        {(() => {
          const isEmployeeCategory = EMPLOYEE_CATEGORIES.has(form.category);
          const isSupplierCategory = !isEmployeeCategory && !FINANCE_TAX_CATEGORIES.has(form.category);

          if (isEmployeeCategory || isSupplierCategory) {
            return (
              <div className="grid grid-cols-2 gap-3">
                {isEmployeeCategory && (
                  <div className="space-y-1.5">
                    <Label>{lang === "it" ? "Dipendente" : "Employee"}</Label>
                    <Select value={form.supplier_id || "__none"} onValueChange={pickEmployee}>
                      <SelectTrigger><SelectValue placeholder={lang === "it" ? "Seleziona dipendente" : "Select employee"} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">{t("common.none")}</SelectItem>
                        {users.map((u) => (
                          <SelectItem key={u.id} value={u.id}>{u.name} ({u.role})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {isSupplierCategory && (
                  <div className="space-y-1.5">
                    <Label>{t("acc.exp.supplier")}</Label>
                    <Select value={form.supplier_id || "__none"} onValueChange={pickSupplier}>
                      <SelectTrigger><SelectValue placeholder={t("common.none")} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">{t("common.none")}</SelectItem>
                        {suppliers.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex gap-2 mt-1">
                      <Input placeholder={t("sup.add")} value={newSupplier} onChange={(e) => setNewSupplier(e.target.value)} className="h-8 text-xs" />
                      <Button type="button" size="sm" variant="outline" onClick={addSupplierInline}>+</Button>
                    </div>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label>{t("acc.exp.reference")}</Label>
                  <Input value={form.reference ?? ""} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="e.g. Doc/Pay ref" />
                </div>
              </div>
            );
          }

          // For Tax and Finance categories, hide recipient selection completely
          return (
            <div className="space-y-1.5">
              <Label>{t("acc.exp.reference")}</Label>
              <Input value={form.reference ?? ""} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="e.g. F24 / Bank TRF" />
            </div>
          );
        })()}

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>{t("common.amount")} (€)</Label>
            <Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("inv.col.vat")}</Label>
            <Select value={String(form.vat_rate)} onValueChange={(v) => setForm({ ...form, vat_rate: Number(v) as VatRate })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {VAT_RATES.map((r) => <SelectItem key={r} value={String(r)}>{r}%</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("sale.field.payment")}</Label>
            <Select value={form.payment_method} onValueChange={(v) => setForm({ ...form, payment_method: v as PaymentMethod })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="elettronico">{t("sale.payment.card")}</SelectItem>
                <SelectItem value="contanti">{t("sale.payment.cash")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>{t("acc.exp.status")}</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as ExpenseStatus })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="paid">{t("acc.exp.status.paid")}</SelectItem>
                <SelectItem value="pending">{t("acc.exp.status.pending")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("acc.exp.recurrence")}</Label>
            <Select value={form.recurrence} onValueChange={(v) => setForm({ ...form, recurrence: v as ExpenseRecurrence })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("acc.exp.rec.none")}</SelectItem>
                <SelectItem value="weekly">{t("acc.exp.rec.weekly")}</SelectItem>
                <SelectItem value="monthly">{t("acc.exp.rec.monthly")}</SelectItem>
                <SelectItem value="quarterly">{t("acc.exp.rec.quarterly")}</SelectItem>
                <SelectItem value="yearly">{t("acc.exp.rec.yearly")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button disabled={form.amount <= 0} onClick={submit}>{t("common.save")}</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function SuppliersTab() {
  const t = useT();
  const suppliers = useStore((s) => s.suppliers);
  const addSupplier = useStore((s) => s.addSupplier);
  const updateSupplier = useStore((s) => s.updateSupplier);
  const deleteSupplier = useStore((s) => s.deleteSupplier);
  const expenses = useStore((s) => s.expenses);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Supplier | null>(null);
  const [form, setForm] = useState<Omit<Supplier, "id">>({ name: "", vat_number: "", email: "", phone: "", note: "" });

  const spendBySupplier = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of expenses) if (e.supplier_id) m[e.supplier_id] = (m[e.supplier_id] || 0) + e.amount;
    return m;
  }, [expenses]);

  function startEdit(s: Supplier | null) {
    setEdit(s);
    setForm(s ? { name: s.name, vat_number: s.vat_number ?? "", email: s.email ?? "", phone: s.phone ?? "", note: s.note ?? "" } : { name: "", vat_number: "", email: "", phone: "", note: "" });
    setOpen(true);
  }

  function save() {
    if (!form.name.trim()) return;
    if (edit) updateSupplier(edit.id, form);
    else addSupplier(form);
    setOpen(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">{suppliers.length} {t("sup.title").toLowerCase()}</div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={() => startEdit(null)}>
              <Plus className="h-4 w-4 mr-1.5" /> {t("sup.add")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{edit ? t("common.edit") : t("sup.add")}</DialogTitle></DialogHeader>
            <div className="grid gap-3">
              <div className="space-y-1.5"><Label>{t("sup.name")}</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>{t("sup.vat")}</Label><Input value={form.vat_number} onChange={(e) => setForm({ ...form, vat_number: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>{t("set.profile.phone")}</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              </div>
              <div className="space-y-1.5"><Label>{t("set.profile.email")}</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>{t("common.notes")}</Label><Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
            </div>
            <DialogFooter><Button onClick={save} disabled={!form.name.trim()}>{t("common.save")}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          {suppliers.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground p-8 flex items-center justify-center gap-2">
              <Building2 className="h-4 w-4" /> {t("sup.none")}
            </p>
          ) : (
            <>
              {/* Mobile supplier cards */}
              <div className="md:hidden divide-y">
                {suppliers.map((s) => (
                  <div key={s.id} className="p-3 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm">{s.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {s.vat_number && <span>{t("sup.vat")}: {s.vat_number} · </span>}
                          {s.phone && <span>{s.phone} · </span>}
                          {s.email && <span>{s.email}</span>}
                        </div>
                      </div>
                      <div className="font-semibold tabular-nums text-sm">{formatEUR(spendBySupplier[s.id] || 0)}</div>
                    </div>
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(s)}>
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteSupplier(s.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              {/* Desktop supplier table */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("sup.name")}</TableHead>
                      <TableHead>{t("sup.vat")}</TableHead>
                      <TableHead>{t("set.profile.phone")}</TableHead>
                      <TableHead className="text-right">{t("common.total")}</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {suppliers.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell className="text-sm">{s.vat_number ?? "—"}</TableCell>
                        <TableCell className="text-sm">{s.phone ?? "—"}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{formatEUR(spendBySupplier[s.id] || 0)}</TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => startEdit(s)}><Pencil className="h-4 w-4 text-muted-foreground" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => deleteSupplier(s.id)}><Trash2 className="h-4 w-4 text-muted-foreground" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
