import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { CheckCircle2, TrendingUp, Wallet, AlertTriangle, Download, Receipt, PiggyBank, CalendarClock, Clock, Boxes, CalendarX } from "lucide-react";
import { PageHeader } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useStore, formatEUR, expiryStatus, daysUntil } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Soldo" },
      {
        name: "description",
        content: "Panoramica vendite, margine netto e conformità Corrispettivi Elettronici.",
      },
    ],
  }),
  component: Dashboard,
});

function KPI({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  icon: any;
  accent?: string;
}) {
  return (
    <Card className="border-border/60 shadow-[var(--shadow-soft)]">
      <CardContent className="p-4 md:p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] md:text-xs uppercase tracking-wider text-muted-foreground font-medium truncate">
              {label}
            </div>
            <div className="mt-1.5 text-xl md:text-3xl font-display font-semibold tabular-nums">
              {value}
            </div>
          </div>
          <div
            className={`h-9 w-9 md:h-10 md:w-10 rounded-lg grid place-items-center shrink-0 ${accent ?? "bg-accent text-accent-foreground"}`}
          >
            <Icon className="h-4 w-4 md:h-5 md:w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Dashboard() {
  const t = useT();
  const { orders, products, expenses, lots, currentLocation } = useStore();
  const alertDays = useStore((s) => s.config.expiry_alert_days ?? 14);
  const rollRecurring = useStore((s) => s.rollRecurringExpenses);

  useEffect(() => { rollRecurring(); }, [rollRecurring]);

  const stats = useMemo(() => {
    const today = new Date().toDateString();
    const todayKey = new Date().toISOString().slice(0, 10);
    const month = new Date().toISOString().slice(0, 7);
    const locId = currentLocation?.id;

    // Filter by location
    const filteredOrders = locId ? orders.filter((o) => o.location_id === locId) : orders;
    const filteredExpenses = locId ? expenses.filter((e) => e.location_id === locId) : expenses;

    const todayOrders = filteredOrders.filter((o) => new Date(o.created_at).toDateString() === today);
    const monthOrders = filteredOrders.filter((o) => o.created_at.slice(0, 7) === month);
    const monthExp = filteredExpenses.filter((e) => e.date.startsWith(month));
    const revenue = todayOrders.reduce((a, o) => a + o.total_gross, 0);
    const cost = todayOrders.reduce((a, o) => a + o.total_cost, 0);
    const monthRevenue = monthOrders.reduce((a, o) => a + o.total_gross, 0);
    const monthCogs = monthOrders.reduce((a, o) => a + o.total_cost, 0);
    const monthVat = monthOrders.reduce((a, o) => a + o.total_vat, 0);
    const monthDirect = monthExp.filter((e) => e.cost_type === "direct").reduce((a, e) => a + e.amount, 0);
    const monthIndirect = monthExp.filter((e) => e.cost_type === "indirect").reduce((a, e) => a + e.amount, 0);
    const monthNet = monthRevenue - monthCogs - monthDirect - monthIndirect - monthVat;
    const vatByRate = todayOrders.flatMap((o) => o.items).reduce<Record<number, number>>((acc, it) => {
      acc[it.vat_rate] = (acc[it.vat_rate] || 0) + it.vat_amount;
      return acc;
    }, {});

    const lowStock = products.filter((p) => {
      const stock = locId ? (p.location_stock?.[locId] ?? p.stock_quantity) : p.stock_quantity;
      return stock <= 3;
    });

    const upcoming = filteredExpenses
      .filter((e) => e.status !== "paid" && e.due_date)
      .sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1))
      .slice(0, 4)
      .map((e) => ({ ...e, _overdue: e.due_date! < todayKey }));
    const pendingTotal = filteredExpenses.filter((e) => e.status !== "paid").reduce((a, e) => a + e.amount, 0);

    const stockValueCost = products.reduce((a, p) => {
      const stock = locId ? (p.location_stock?.[locId] ?? p.stock_quantity) : p.stock_quantity;
      return a + p.cost_price * stock;
    }, 0);
    const stockValueRetail = products.reduce((a, p) => {
      const stock = locId ? (p.location_stock?.[locId] ?? p.stock_quantity) : p.stock_quantity;
      return a + p.price_gross * stock;
    }, 0);

    // Expiry analysis
    const expiringLots = lots.filter((l) => {
      if (l.qty_remaining <= 0 || !l.expiry_date) return false;
      const p = products.find((x) => x.id === l.product_id);
      const d = p?.expiry_alert_days ?? alertDays;
      const st = expiryStatus(l.expiry_date, d);
      return st === "soon" || st === "expired";
    });
    const expiringValue = expiringLots.reduce((a, l) => {
      const p = products.find((x) => x.id === l.product_id);
      return a + l.qty_remaining * (l.cost_price ?? p?.cost_price ?? 0);
    }, 0);
    return {
      revenue,
      profit: revenue - cost,
      vatByRate,
      lowStock,
      count: todayOrders.length,
      monthExpenses: monthDirect + monthIndirect,
      monthNet,
      upcoming,
      pendingTotal,
      stockValueCost,
      stockValueRetail,
      expiringLots,
      expiringValue,
      filteredOrders,
    };
  }, [orders, products, expenses, lots, alertDays, currentLocation]);

  return (
    <>
      <PageHeader title={t("dash.title")} subtitle={t("dash.subtitle")} />
      <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-5 md:space-y-6 max-w-7xl">
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 md:gap-4">
          <KPI label={t("dash.revenue")} value={formatEUR(stats.revenue)} icon={Wallet} accent="bg-primary/10 text-primary" />
          <KPI label={t("acc.kpi.netprofit")} value={formatEUR(stats.monthNet)} icon={TrendingUp} accent={stats.monthNet >= 0 ? "bg-success/15 text-success" : "bg-destructive/10 text-destructive"} />
          <KPI label={t("acc.exp.kpi.month")} value={formatEUR(stats.monthExpenses)} icon={PiggyBank} accent="bg-destructive/10 text-destructive" />
          <KPI label={t("inv.value.title")} value={formatEUR(stats.stockValueCost)} icon={Boxes} accent="bg-accent text-accent-foreground" />
          <KPI label={t("dash.lowstock")} value={String(stats.lowStock.length)} icon={AlertTriangle} accent="bg-warning/20 text-warning" />
          <KPI label={t("lot.kpi.expiring")} value={String(stats.expiringLots.length)} icon={CalendarX} accent={stats.expiringLots.length > 0 ? "bg-warning/20 text-warning" : "bg-accent text-accent-foreground"} />
        </div>

        {stats.expiringLots.length > 0 && (
          <Card className="border-warning/40 bg-warning/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarX className="h-5 w-5 text-warning" />
                {t("lot.alerts.title")}
                <Badge variant="secondary" className="ml-auto text-xs">
                  {t("lot.alerts.value")}: {formatEUR(stats.expiringValue)}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {stats.expiringLots.slice(0, 5).map((l) => {
                const p = products.find((x) => x.id === l.product_id);
                const days = daysUntil(l.expiry_date!);
                const expired = days < 0;
                return (
                  <div
                    key={l.id}
                    className={`flex items-center justify-between gap-3 text-sm border-l-4 pl-3 py-1.5 rounded-r ${expired ? "border-destructive" : "border-warning"}`}
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">{p?.name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        <span className="font-mono">{l.lot_code}</span> · {l.expiry_date} · {l.qty_remaining} pz
                      </div>
                    </div>
                    <Badge variant={expired ? "destructive" : "default"} className={expired ? "" : "bg-warning text-warning-foreground"}>
                      {expired ? t("lot.status.expired") : `${days}d`}
                    </Badge>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}


        {stats.upcoming.length > 0 && (
          <Card className="border-warning/40">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarClock className="h-5 w-5 text-warning" />
                {t("acc.exp.upcoming")}
                <Badge variant="secondary" className="ml-auto text-xs">{formatEUR(stats.pendingTotal)}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {stats.upcoming.map((e) => (
                <div key={e.id} className={`flex items-center justify-between gap-3 text-sm border-l-4 pl-3 py-1.5 rounded-r ${e._overdue ? "border-destructive" : "border-warning"}`}>
                  <div className="min-w-0">
                    <div className="font-medium truncate">{e.description || e.category}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      {e._overdue ? <AlertTriangle className="h-3 w-3 text-destructive" /> : <Clock className="h-3 w-3" />}
                      {e.supplier_name ? `${e.supplier_name} · ` : ""}{e.due_date}
                    </div>
                  </div>
                  <div className="font-semibold tabular-nums shrink-0">{formatEUR(e.amount)}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2 border-success/40 bg-gradient-to-br from-success/10 to-transparent">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-success" />
                {t("dash.fiscal.title")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{t("dash.fiscal.desc")}</p>
              <div className="mt-4 grid grid-cols-3 sm:grid-cols-5 gap-2 md:gap-3">
                {[22, 10, 5, 4, 0].map((r) => (
                  <div key={r} className="rounded-lg border bg-card p-2.5 md:p-3">
                    <div className="text-[10px] md:text-xs text-muted-foreground">{t("inv.col.vat")} {r}%</div>
                    <div className="font-semibold text-sm md:text-base tabular-nums">
                      {formatEUR(stats.vatByRate[r] || 0)}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge variant="secondary">{t("dash.fiscal.last")}</Badge>
                <Badge variant="outline">{t("dash.fiscal.provider")}</Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t("dash.export.title")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{t("dash.export.desc")}</p>
              <input
                type="date"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                defaultValue={new Date().toISOString().slice(0, 10)}
              />
              <input
                type="date"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                defaultValue={new Date().toISOString().slice(0, 10)}
              />
              <Button className="w-full" onClick={() => toast.success(t("dash.export.ready"))}>
                <Download className="h-4 w-4 mr-2" /> {t("dash.export.csv")}
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("dash.recent")}</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.filteredOrders.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">{t("dash.empty")}</div>
            ) : (
              <div className="divide-y">
                {stats.filteredOrders.slice(0, 6).map((o) => (
                  <div key={o.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        {o.items.map((i) => `${i.quantity}× ${i.product_name}`).join(", ")}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {new Date(o.created_at).toLocaleTimeString("it-IT")} · {o.payment_method} ·{" "}
                        {o.transmission_id}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-semibold tabular-nums">{formatEUR(o.total_gross)}</div>
                      <Badge variant="outline" className="text-[10px]">
                        {t("inv.col.vat")} {formatEUR(o.total_vat)}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
