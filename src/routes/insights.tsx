import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  Minus,
  PackageX,
  Clock,
  AlertTriangle,
  Lightbulb,
  Activity,
  Target,
  Gauge,
  RefreshCw,
  CalendarX,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  CartesianGrid,
  BarChart,
  Bar,
} from "recharts";
import { PageHeader } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useStore, formatEUR, expiryStatus, daysUntil } from "@/lib/store";
import { useT, useCurrentLang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/insights")({
  head: () => ({
    meta: [
      { title: "Insight — Soldo" },
      { name: "description", content: "Suggerimenti strategici e analisi predittive per il tuo negozio." },
    ],
  }),
  component: InsightsPage,
});

const DAY_MS = 86_400_000;

function InsightsPage() {
  const t = useT();
  const lang = useCurrentLang();
  const { orders, products, expenses, lots } = useStore();
  const alertDays = useStore((s) => s.config.expiry_alert_days ?? 14);

  const expiringLots = useMemo(() => {
    return lots
      .filter((l) => {
        if (l.qty_remaining <= 0 || !l.expiry_date) return false;
        const p = products.find((x) => x.id === l.product_id);
        const d = p?.expiry_alert_days ?? alertDays;
        const st = expiryStatus(l.expiry_date, d);
        return st === "soon" || st === "expired";
      })
      .sort((a, b) => (a.expiry_date! < b.expiry_date! ? -1 : 1));
  }, [lots, products, alertDays]);

  const expiringValue = useMemo(() => {
    return expiringLots.reduce((a, l) => {
      const p = products.find((x) => x.id === l.product_id);
      return a + l.qty_remaining * (l.cost_price ?? p?.cost_price ?? 0);
    }, 0);
  }, [expiringLots, products]);


  // -------- Core aggregations --------
  const data = useMemo(() => {
    const now = new Date();
    const todayKey = now.toISOString().slice(0, 10);

    // Real (non-refund) sales
    const realOrders = orders.filter((o) => !o.refund_of && !o.refunded);

    // Daily revenue map (last 60 days)
    const dayMap = new Map<string, { revenue: number; cogs: number; count: number }>();
    for (let i = 59; i >= 0; i--) {
      const k = new Date(now.getTime() - i * DAY_MS).toISOString().slice(0, 10);
      dayMap.set(k, { revenue: 0, cogs: 0, count: 0 });
    }
    for (const o of realOrders) {
      const k = o.created_at.slice(0, 10);
      const cur = dayMap.get(k);
      if (cur) {
        cur.revenue += o.total_gross;
        cur.cogs += o.total_cost;
        cur.count += 1;
      }
    }
    const series = Array.from(dayMap.entries()).map(([date, v]) => ({ date, ...v }));
    const last30 = series.slice(-30);
    const prev30 = series.slice(-60, -30);
    const sum = (a: { revenue: number }[]) => a.reduce((s, x) => s + x.revenue, 0);
    const rev30 = sum(last30);
    const revPrev30 = sum(prev30);
    const trendPct = revPrev30 > 0 ? ((rev30 - revPrev30) / revPrev30) * 100 : 0;
    const avgDaily = rev30 / 30;
    const aov = realOrders.length ? realOrders.reduce((a, o) => a + o.total_gross, 0) / realOrders.length : 0;

    // ---- 7-day forecast: weighted moving average + linear trend ----
    const recent = last30.map((d) => d.revenue);
    const n = recent.length;
    const xMean = (n - 1) / 2;
    const yMean = recent.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
      num += (i - xMean) * (recent[i] - yMean);
      den += (i - xMean) ** 2;
    }
    const slope = den ? num / den : 0;
    const intercept = yMean - slope * xMean;
    const forecast: { date: string; revenue: number | null; predicted: number | null }[] = [];
    last30.forEach((d, i) => {
      forecast.push({ date: d.date.slice(5), revenue: d.revenue, predicted: Math.max(0, intercept + slope * i) });
    });
    let forecastSum = 0;
    for (let i = 0; i < 7; i++) {
      const k = new Date(now.getTime() + (i + 1) * DAY_MS).toISOString().slice(5, 10);
      const p = Math.max(0, intercept + slope * (n + i));
      forecastSum += p;
      forecast.push({ date: k, revenue: null, predicted: p });
    }

    // ---- Reorder suggestions: velocity-based ----
    const soldByProduct = new Map<string, number>();
    const lastSoldByProduct = new Map<string, number>();
    for (const o of realOrders) {
      const ts = new Date(o.created_at).getTime();
      if (now.getTime() - ts > 30 * DAY_MS) continue;
      for (const it of o.items) {
        soldByProduct.set(it.product_id, (soldByProduct.get(it.product_id) || 0) + it.quantity);
        const prev = lastSoldByProduct.get(it.product_id) || 0;
        if (ts > prev) lastSoldByProduct.set(it.product_id, ts);
      }
    }
    const allLastSold = new Map<string, number>();
    for (const o of realOrders) {
      const ts = new Date(o.created_at).getTime();
      for (const it of o.items) {
        const prev = allLastSold.get(it.product_id) || 0;
        if (ts > prev) allLastSold.set(it.product_id, ts);
      }
    }
    const reorder = products
      .map((p) => {
        const sold = soldByProduct.get(p.id) || 0;
        const velocity = sold / 30;
        const cover = velocity > 0 ? p.stock_quantity / velocity : Infinity;
        const suggestQty = velocity > 0 ? Math.max(0, Math.ceil(velocity * 14 - p.stock_quantity)) : 0;
        return { product: p, velocity, cover, suggestQty };
      })
      .filter((r) => r.velocity > 0 && r.cover < 14)
      .sort((a, b) => a.cover - b.cover)
      .slice(0, 8);

    // ---- Dead stock ----
    const dead = products
      .filter((p) => p.stock_quantity > 0)
      .map((p) => ({
        product: p,
        lastSold: allLastSold.get(p.id) ?? 0,
        tied: p.cost_price * p.stock_quantity,
      }))
      .filter((d) => {
        if (!d.lastSold) return true; // never sold
        return now.getTime() - d.lastSold > 30 * DAY_MS;
      })
      .sort((a, b) => b.tied - a.tied)
      .slice(0, 8);
    const deadTotal = dead.reduce((a, d) => a + d.tied, 0);

    // ---- Peak hours / day-of-week ----
    const hourBuckets = new Array(24).fill(0);
    const dowBuckets = new Array(7).fill(0);
    for (const o of realOrders) {
      const d = new Date(o.created_at);
      hourBuckets[d.getHours()] += o.total_gross;
      dowBuckets[d.getDay()] += o.total_gross;
    }
    const peakHour = hourBuckets.indexOf(Math.max(...hourBuckets));
    const peakDow = dowBuckets.indexOf(Math.max(...dowBuckets));
    const hourSeries = hourBuckets.map((v, h) => ({ hour: `${h}h`, revenue: +v.toFixed(2) }));
    const dowLabels = lang === "it"
      ? ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"]
      : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    // ---- Margin / break-even / runway ----
    const month = todayKey.slice(0, 7);
    const monthExp = expenses.filter((e) => e.date.startsWith(month));
    const indirectMonth = monthExp.filter((e) => e.cost_type === "indirect").reduce((a, e) => a + e.amount, 0);
    const grossMargin = realOrders.reduce((a, o) => a + (o.total_gross - o.total_cost), 0);
    const monthRev = realOrders
      .filter((o) => o.created_at.slice(0, 7) === month)
      .reduce((a, o) => a + o.total_gross, 0);
    const monthCogs = realOrders
      .filter((o) => o.created_at.slice(0, 7) === month)
      .reduce((a, o) => a + o.total_cost, 0);
    const marginRatio = monthRev > 0 ? (monthRev - monthCogs) / monthRev : 0;
    const breakeven = marginRatio > 0 ? indirectMonth / marginRatio : 0;
    const dailyBurn = (indirectMonth + monthExp.filter((e) => e.cost_type === "direct").reduce((a, e) => a + e.amount, 0)) / 30;
    const netDaily = avgDaily * marginRatio - dailyBurn;
    const cashRunway = netDaily >= 0 ? Infinity : (monthRev * marginRatio - indirectMonth) < 0 ? 0 : 0;

    // ---- Top & bottom products by margin ----
    const productPerf = new Map<string, { qty: number; revenue: number; margin: number; name: string }>();
    for (const o of realOrders) {
      for (const it of o.items) {
        const p = products.find((x) => x.id === it.product_id);
        const mg = (it.unit_price_gross - (p?.cost_price ?? 0)) * it.quantity;
        const cur = productPerf.get(it.product_id) ?? { qty: 0, revenue: 0, margin: 0, name: it.product_name };
        cur.qty += it.quantity;
        cur.revenue += it.total_gross;
        cur.margin += mg;
        productPerf.set(it.product_id, cur);
      }
    }
    const topMargin = Array.from(productPerf.values()).sort((a, b) => b.margin - a.margin).slice(0, 5);
    const worstMargin = Array.from(productPerf.values()).filter((p) => p.qty >= 2).sort((a, b) => a.margin / Math.max(1, a.revenue) - b.margin / Math.max(1, b.revenue)).slice(0, 3);

    // ---- Tips engine (data-scientist rules) ----
    const tips: { icon: any; tone: "good" | "warn" | "bad" | "info"; title: string; body: string; impact?: string }[] = [];

    if (trendPct >= 10) {
      tips.push({
        icon: TrendingUp, tone: "good",
        title: lang === "it" ? "Ricavi in crescita" : "Revenue is growing",
        body: lang === "it"
          ? `Le vendite degli ultimi 30 giorni sono cresciute del ${trendPct.toFixed(1)}% rispetto al periodo precedente. Reinvesti in marketing sui prodotti top-margin.`
          : `Sales in the last 30 days grew ${trendPct.toFixed(1)}% vs the prior period. Reinvest in marketing the top-margin products.`,
        impact: `+${formatEUR((rev30 - revPrev30) * 0.1)}`,
      });
    } else if (trendPct <= -10) {
      tips.push({
        icon: TrendingDown, tone: "bad",
        title: lang === "it" ? "Vendite in calo" : "Sales declining",
        body: lang === "it"
          ? `Calo del ${Math.abs(trendPct).toFixed(1)}% sui 30 giorni. Lancia una promozione mirata sui prodotti più venduti o riduci i prezzi dello stock dormiente.`
          : `Down ${Math.abs(trendPct).toFixed(1)}% in 30 days. Launch a targeted promo on top sellers or discount dead stock.`,
      });
    }

    if (deadTotal > 0) {
      tips.push({
        icon: PackageX, tone: "warn",
        title: lang === "it" ? "Capitale immobilizzato in stock dormiente" : "Capital tied in dead stock",
        body: lang === "it"
          ? `Hai ${formatEUR(deadTotal)} di merce ferma da oltre 30 giorni. Considera sconti dal 15–25% per liberare cassa.`
          : `${formatEUR(deadTotal)} sitting unsold for 30+ days. Consider 15–25% discounts to free up cash.`,
        impact: `+${formatEUR(deadTotal * 0.4)}`,
      });
    }

    if (reorder.length > 0) {
      const urgent = reorder.filter((r) => r.cover < 7).length;
      if (urgent > 0) {
        tips.push({
          icon: AlertTriangle, tone: "warn",
          title: lang === "it" ? `${urgent} prodotti a rischio rottura stock` : `${urgent} products risk stockout`,
          body: lang === "it"
            ? `Riordina entro 7 giorni per non perdere vendite stimate in ${formatEUR(reorder.slice(0, urgent).reduce((a, r) => a + r.velocity * 7 * r.product.price_gross, 0))}.`
            : `Reorder within 7 days to avoid losing approximately ${formatEUR(reorder.slice(0, urgent).reduce((a, r) => a + r.velocity * 7 * r.product.price_gross, 0))} in sales.`,
        });
      }
    }

    if (marginRatio > 0 && marginRatio < 0.25 && monthRev > 0) {
      tips.push({
        icon: Gauge, tone: "warn",
        title: lang === "it" ? "Margine lordo basso" : "Low gross margin",
        body: lang === "it"
          ? `Il tuo margine è ${(marginRatio * 100).toFixed(1)}%. Punta almeno al 30%: rinegozia con i fornitori o aumenta i prezzi dei prodotti meno sensibili.`
          : `Your margin is ${(marginRatio * 100).toFixed(1)}%. Aim for 30%+: renegotiate with suppliers or raise prices on low-elasticity items.`,
      });
    }

    if (breakeven > 0 && monthRev < breakeven) {
      const gap = breakeven - monthRev;
      tips.push({
        icon: Target, tone: "bad",
        title: lang === "it" ? "Sotto il punto di pareggio" : "Below break-even",
        body: lang === "it"
          ? `Servono ${formatEUR(gap)} di vendite in più questo mese per coprire i costi fissi.`
          : `You need ${formatEUR(gap)} more in sales this month to cover fixed costs.`,
      });
    }

    if (Math.max(...hourBuckets) > 0) {
      tips.push({
        icon: Clock, tone: "info",
        title: lang === "it" ? `Ora di picco: ${peakHour}:00` : `Peak hour: ${peakHour}:00`,
        body: lang === "it"
          ? `Pianifica più personale e promozioni flash intorno alle ${peakHour}:00 del ${dowLabels[peakDow]}.`
          : `Schedule more staff and flash promos around ${peakHour}:00 on ${dowLabels[peakDow]}.`,
      });
    }

    if (worstMargin.length > 0) {
      const w = worstMargin[0];
      tips.push({
        icon: Activity, tone: "info",
        title: lang === "it" ? "Prodotto a margine debole" : "Low-margin product",
        body: lang === "it"
          ? `"${w.name}" rende poco per unità venduta. Valuta un aumento di prezzo del 5–10% o sostituiscilo con un'alternativa più redditizia.`
          : `"${w.name}" earns little per unit sold. Consider a 5–10% price bump or replace it with a more profitable alternative.`,
      });
    }

    const elecShare = (() => {
      const ele = realOrders.filter((o) => o.payment_method === "elettronico").reduce((a, o) => a + o.total_gross, 0);
      const tot = realOrders.reduce((a, o) => a + o.total_gross, 0);
      return tot > 0 ? ele / tot : 0;
    })();
    if (realOrders.length >= 10 && elecShare < 0.3) {
      tips.push({
        icon: Lightbulb, tone: "info",
        title: lang === "it" ? "Promuovi i pagamenti elettronici" : "Promote electronic payments",
        body: lang === "it"
          ? `Solo il ${(elecShare * 100).toFixed(0)}% incassi sono elettronici: riducono il rischio cassa e velocizzano la chiusura.`
          : `Only ${(elecShare * 100).toFixed(0)}% of revenue is electronic: it lowers cash-handling risk and speeds closing.`,
      });
    }

    return {
      forecast, forecastSum, trendPct, avgDaily, aov, reorder, dead, deadTotal,
      hourSeries, peakHour, peakDow, dowLabels,
      marginRatio, breakeven, monthRev, indirectMonth, cashRunway, netDaily,
      topMargin, worstMargin, tips,
    };
  }, [orders, products, expenses, lang]);

  const trendIcon = data.trendPct > 2 ? TrendingUp : data.trendPct < -2 ? TrendingDown : Minus;
  const trendLabel = data.trendPct > 2 ? t("ins.forecast.trend.up") : data.trendPct < -2 ? t("ins.forecast.trend.down") : t("ins.forecast.trend.flat");

  return (
    <>
      <PageHeader title={t("ins.title")} subtitle={t("ins.subtitle")} />
      <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-5 md:space-y-6 max-w-7xl">
        {/* KPI strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <MiniKpi
            label={t("ins.kpi.aov")}
            value={formatEUR(data.aov)}
            icon={Activity}
          />
          <MiniKpi
            label={t("ins.kpi.velocity")}
            value={formatEUR(data.avgDaily)}
            icon={trendIcon}
            hint={`${data.trendPct >= 0 ? "+" : ""}${data.trendPct.toFixed(1)}% · 30g`}
            tone={data.trendPct >= 0 ? "good" : "bad"}
          />
          <MiniKpi
            label={t("ins.kpi.breakeven")}
            value={formatEUR(data.breakeven)}
            icon={Target}
            hint={data.monthRev > 0 ? `${Math.min(100, (data.monthRev / Math.max(1, data.breakeven)) * 100).toFixed(0)}%` : undefined}
          />
          <MiniKpi
            label={t("ins.kpi.runway")}
            value={data.netDaily >= 0 ? t("ins.runway.infinite") : "—"}
            icon={Gauge}
            tone={data.netDaily >= 0 ? "good" : "warn"}
          />
        </div>

        {/* Tips */}
        <Card className="border-primary/40 bg-gradient-to-br from-primary/5 to-transparent">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              {t("ins.tips.title")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.tips.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">{t("ins.tips.empty")}</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {data.tips.map((tip, i) => {
                  const Icon = tip.icon;
                  const tone = {
                    good: "border-success/40 bg-success/5",
                    warn: "border-warning/40 bg-warning/5",
                    bad: "border-destructive/40 bg-destructive/5",
                    info: "border-border bg-muted/30",
                  }[tip.tone];
                  const iconTone = {
                    good: "text-success",
                    warn: "text-warning",
                    bad: "text-destructive",
                    info: "text-primary",
                  }[tip.tone];
                  return (
                    <div key={i} className={cn("flex gap-3 rounded-lg border p-3", tone)}>
                      <Icon className={cn("h-5 w-5 shrink-0 mt-0.5", iconTone)} />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm">{tip.title}</div>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{tip.body}</p>
                        {tip.impact && (
                          <Badge variant="secondary" className="mt-2 text-[10px]">
                            {t("ins.tips.impact")}: {tip.impact}
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Forecast */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center justify-between gap-2 flex-wrap">
              <span className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                {t("ins.forecast.title")}
              </span>
              <div className="flex items-center gap-2 text-xs font-normal">
                <Badge variant="outline">{trendLabel}</Badge>
                <Badge variant="secondary">
                  {t("ins.forecast.next7")}: {formatEUR(data.forecastSum)}
                </Badge>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[260px]">
              <ResponsiveContainer>
                <AreaChart data={data.forecast}>
                  <defs>
                    <linearGradient id="g-act" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="g-pred" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--warning))" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="hsl(var(--warning))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" interval={3} />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number) => formatEUR(v)}
                  />
                  <Area type="monotone" dataKey="revenue" name={t("ins.forecast.actual")} stroke="hsl(var(--primary))" fill="url(#g-act)" strokeWidth={2} />
                  <Area type="monotone" dataKey="predicted" name={t("ins.forecast.predicted")} stroke="hsl(var(--warning))" fill="url(#g-pred)" strokeDasharray="4 4" strokeWidth={2} />
                  <ReferenceLine x={data.forecast[29]?.date} stroke="hsl(var(--muted-foreground))" strokeDasharray="2 2" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Reorder */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <RefreshCw className="h-5 w-5 text-warning" /> {t("ins.reorder.title")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.reorder.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">{t("ins.reorder.empty")}</p>
              ) : (
                <div className="space-y-3">
                  {data.reorder.map((r) => {
                    const urgent = r.cover < 7;
                    const pct = Math.max(0, Math.min(100, (r.cover / 14) * 100));
                    return (
                      <div key={r.product.id} className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <div className="min-w-0">
                            <div className="font-medium truncate">{r.product.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {t("ins.reorder.velocity")}: {r.velocity.toFixed(2)} · {t("ins.reorder.cover")}: {Number.isFinite(r.cover) ? r.cover.toFixed(1) : "∞"}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            {urgent && <Badge variant="destructive" className="text-[10px] mb-1">{t("ins.reorder.urgent")}</Badge>}
                            <div className="text-xs font-semibold tabular-nums">
                              {t("ins.reorder.suggest")}: +{r.suggestQty}
                            </div>
                          </div>
                        </div>
                        <Progress value={pct} className={cn("h-1.5", urgent && "[&>div]:bg-destructive")} />
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Dead stock */}
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-base flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <PackageX className="h-5 w-5 text-destructive" /> {t("ins.dead.title")}
                </span>
                <Badge variant="outline" className="text-xs">{t("ins.dead.tied")}: {formatEUR(data.deadTotal)}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">{t("ins.dead.help")}</p>
              {data.dead.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">{t("ins.dead.empty")}</p>
              ) : (
                <div className="space-y-2">
                  {data.dead.map((d) => {
                    const days = d.lastSold ? Math.floor((Date.now() - d.lastSold) / DAY_MS) : null;
                    return (
                      <div key={d.product.id} className="flex items-center justify-between gap-2 text-sm border-b last:border-0 pb-2 last:pb-0">
                        <div className="min-w-0">
                          <div className="font-medium truncate">{d.product.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {d.product.stock_quantity}× · {days === null ? (lang === "it" ? "mai venduto" : "never sold") : `${days}g`}
                          </div>
                        </div>
                        <div className="text-right shrink-0 font-semibold tabular-nums">{formatEUR(d.tied)}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Expiring lots */}
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-base flex items-center justify-between flex-wrap gap-2">
              <span className="flex items-center gap-2">
                <CalendarX className="h-5 w-5 text-warning" /> {t("lot.alerts.title")}
              </span>
              <Badge variant="outline" className="text-xs">
                {t("lot.alerts.value")}: {formatEUR(expiringValue)}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {expiringLots.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">{t("lot.alerts.empty")}</p>
            ) : (
              <div className="space-y-2">
                {expiringLots.slice(0, 8).map((l) => {
                  const p = products.find((x) => x.id === l.product_id);
                  const days = daysUntil(l.expiry_date!);
                  const expired = days < 0;
                  const value = l.qty_remaining * (l.cost_price ?? p?.cost_price ?? 0);
                  return (
                    <div
                      key={l.id}
                      className={`flex items-center justify-between gap-2 text-sm border-l-4 pl-3 py-1.5 rounded-r ${expired ? "border-destructive" : "border-warning"}`}
                    >
                      <div className="min-w-0">
                        <div className="font-medium truncate">{p?.name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">
                          <span className="font-mono">{l.lot_code}</span> · {l.expiry_date} · {l.qty_remaining} pz
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge
                          variant={expired ? "destructive" : "default"}
                          className={expired ? "" : "bg-warning text-warning-foreground"}
                        >
                          {expired ? t("lot.status.expired") : `${days}d`}
                        </Badge>
                        <span className="text-xs font-semibold tabular-nums w-16 text-right">
                          {formatEUR(value)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Peak hours */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center justify-between gap-2 flex-wrap">
              <span className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" /> {t("ins.peak.title")}
              </span>
              <div className="flex gap-2 text-xs font-normal">
                <Badge variant="secondary">{t("ins.peak.hour")}: {data.peakHour}:00</Badge>
                <Badge variant="secondary">{t("ins.peak.day")}: {data.dowLabels[data.peakDow]}</Badge>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">{t("ins.peak.help")}</p>
            {data.hourSeries.every((h) => h.revenue === 0) ? (
              <p className="text-sm text-muted-foreground py-6 text-center">{t("ins.peak.empty")}</p>
            ) : (
              <div className="h-[200px]">
                <ResponsiveContainer>
                  <BarChart data={data.hourSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="hour" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" interval={1} />
                    <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                      formatter={(v: number) => formatEUR(v)}
                    />
                    <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function MiniKpi({
  label, value, icon: Icon, hint, tone,
}: { label: string; value: string; icon: any; hint?: string; tone?: "good" | "bad" | "warn" }) {
  const toneClass = tone === "good" ? "text-success" : tone === "bad" ? "text-destructive" : tone === "warn" ? "text-warning" : "text-muted-foreground";
  return (
    <Card className="border-border/60 shadow-[var(--shadow-soft)]">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] md:text-xs uppercase tracking-wider text-muted-foreground font-medium truncate">{label}</div>
            <div className="mt-1 text-lg md:text-2xl font-display font-semibold tabular-nums truncate">{value}</div>
            {hint && <div className={cn("text-[11px] mt-0.5", toneClass)}>{hint}</div>}
          </div>
          <div className="h-9 w-9 rounded-lg grid place-items-center shrink-0 bg-accent text-accent-foreground">
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
