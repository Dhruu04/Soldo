import { createFileRoute } from "@tanstack/react-router";
import { useStore, formatEUR } from "@/lib/store";
import { useT, useCurrentLang } from "@/lib/i18n";
import { MapPin, Wallet, TrendingUp, Boxes, AlertTriangle, ArrowRight, Activity, Calendar, ShieldCheck, Landmark } from "lucide-react";
import { PageHeader } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useMemo } from "react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/locations")({
  head: () => ({
    meta: [
      { title: "Stato Sedi — Soldo" },
      { name: "description", content: "Riepilogo comparativo di tutte le sedi operative." },
    ],
  }),
  component: LocationsSummaryPage,
});

function LocationsSummaryPage() {
  const t = useT();
  const lang = useCurrentLang();
  const store = useStore();
  const { locations, shifts, orders, expenses, products, currentLocation, switchLocation } = store;
  const threshold = store.config.low_stock_threshold ?? 3;

  const summaryData = useMemo(() => {
    const todayStr = new Date().toDateString();
    const currentMonthStr = new Date().toISOString().slice(0, 7);

    // Compute stats for each location
    const locationsStats = locations.map((loc) => {
      // Filter orders/expenses for this location
      const locOrders = orders.filter((o) => o.location_id === loc.id);
      const locExpenses = expenses.filter((e) => e.location_id === loc.id);

      const todayOrders = locOrders.filter((o) => new Date(o.created_at).toDateString() === todayStr);
      const monthOrders = locOrders.filter((o) => o.created_at.slice(0, 7) === currentMonthStr);
      const monthExpenses = locExpenses.filter((e) => e.date.startsWith(currentMonthStr));

      // Today financial figures
      const todayRevenue = todayOrders.reduce((a, o) => a + o.total_gross, 0);
      const todayOrdersCount = todayOrders.length;
      
      // Monthly financial figures for Net Profit
      const monthRevenue = monthOrders.reduce((a, o) => a + o.total_gross, 0);
      const monthCogs = monthOrders.reduce((a, o) => a + o.total_cost, 0);
      const monthVat = monthOrders.reduce((a, o) => a + o.total_vat, 0);
      const monthExpAmount = monthExpenses.reduce((a, e) => a + e.amount, 0);
      const monthNetProfit = monthRevenue - monthCogs - monthExpAmount - monthVat;

      // Inventory calculations
      let totalStockUnits = 0;
      let stockValueCost = 0;
      let lowStockCount = 0;

      for (const p of products) {
        // Variants parent is just a template, only variant children hold real stock
        if (p.is_variant_parent) continue;
        const stock = p.location_stock?.[loc.id] ?? 0;
        totalStockUnits += stock;
        stockValueCost += p.cost_price * stock;
        if (stock <= threshold) {
          lowStockCount++;
        }
      }

      // Shift status
      const activeShift = shifts.find((s) => s.status === "open" && s.location_id === loc.id) ?? null;

      return {
        location: loc,
        todayRevenue,
        todayOrdersCount,
        monthNetProfit,
        totalStockUnits,
        stockValueCost,
        lowStockCount,
        activeShift,
      };
    });

    // Compute global unified totals
    const globalTodayRevenue = locationsStats.reduce((sum, item) => sum + item.todayRevenue, 0);
    const globalTodayOrdersCount = locationsStats.reduce((sum, item) => sum + item.todayOrdersCount, 0);
    const globalMonthNetProfit = locationsStats.reduce((sum, item) => sum + item.monthNetProfit, 0);
    const globalTotalStockUnits = locationsStats.reduce((sum, item) => sum + item.totalStockUnits, 0);
    const globalStockValueCost = locationsStats.reduce((sum, item) => sum + item.stockValueCost, 0);
    const globalLowStockCount = locationsStats.reduce((sum, item) => sum + item.lowStockCount, 0);
    const globalActiveShiftsCount = locationsStats.filter((item) => item.activeShift !== null).length;

    return {
      locationsStats,
      globalTodayRevenue,
      globalTodayOrdersCount,
      globalMonthNetProfit,
      globalTotalStockUnits,
      globalStockValueCost,
      globalLowStockCount,
      globalActiveShiftsCount,
    };
  }, [locations, shifts, orders, expenses, products, threshold]);

  const handleMakeActive = (id: string, name: string) => {
    switchLocation(id);
    toast.success(
      lang === "it"
        ? `Sede attiva impostata su: ${name}`
        : `Active location set to: ${name}`
    );
  };

  return (
    <>
      <PageHeader
        title={lang === "it" ? "Stato Sedi" : "Locations Summary"}
        subtitle={
          lang === "it"
            ? "Panoramica consolidata e stato di cassa di tutte le sedi"
            : "Consolidated overview and register status of all branches"
        }
      />
      <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 max-w-7xl mx-auto w-full">
        {/* Global summary banner */}
        <Card className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-primary/20 shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-primary">
              <Landmark className="h-5 w-5" />
              {lang === "it" ? "Riepilogo Consolidato" : "Consolidated Totals"}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                {lang === "it" ? "Ricavo Totale (Oggi)" : "Total Revenue (Today)"}
              </div>
              <div className="mt-1 text-2xl font-bold font-display text-foreground tabular-nums">
                {formatEUR(summaryData.globalTodayRevenue)}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {summaryData.globalTodayOrdersCount} {summaryData.globalTodayOrdersCount === 1 ? (lang === "it" ? "scontrino" : "receipt") : (lang === "it" ? "scontrini" : "receipts")}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                {lang === "it" ? "Utile Netto (Mese)" : "Net Profit (Month)"}
              </div>
              <div className={cn(
                "mt-1 text-2xl font-bold font-display tabular-nums",
                summaryData.globalMonthNetProfit >= 0 ? "text-success" : "text-destructive"
              )}>
                {formatEUR(summaryData.globalMonthNetProfit)}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {lang === "it" ? "Consolidato OpEx / COGS" : "OpEx / COGS consolidated"}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                {lang === "it" ? "Pezzi Totali" : "Total Stock Units"}
              </div>
              <div className="mt-1 text-2xl font-bold font-display text-foreground tabular-nums">
                {summaryData.globalTotalStockUnits}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {lang === "it" ? "Valore a costo:" : "Value at cost:"} {formatEUR(summaryData.globalStockValueCost)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                {lang === "it" ? "Allerte Scorte Basse" : "Low Stock Alerts"}
              </div>
              <div className={cn(
                "mt-1 text-2xl font-bold font-display tabular-nums",
                summaryData.globalLowStockCount > 0 ? "text-warning" : "text-emerald-500"
              )}>
                {summaryData.globalLowStockCount}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {summaryData.globalActiveShiftsCount} {lang === "it" ? "casse aperte" : "registers open"}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* List of locations side-by-side */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {summaryData.locationsStats.map((item) => {
            const isActive = currentLocation?.id === item.location.id;
            const shift = item.activeShift;
            return (
              <Card
                key={item.location.id}
                className={cn(
                  "transition-all shadow-[var(--shadow-soft)] hover:shadow-md",
                  isActive ? "border-primary/60 bg-accent/5" : "border-border"
                )}
              >
                <CardHeader className="pb-3 border-b flex flex-row items-start justify-between space-y-0 gap-2">
                  <div className="min-w-0">
                    <CardTitle className="text-lg font-bold font-display flex items-center gap-1.5 flex-wrap">
                      {item.location.name}
                      {isActive && (
                        <Badge className="bg-primary text-primary-foreground font-semibold text-[10px] uppercase">
                          {lang === "it" ? "Attiva" : "Active"}
                        </Badge>
                      )}
                    </CardTitle>
                    {item.location.address && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.location.address}</p>
                    )}
                  </div>
                  
                  {!isActive && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-8 whitespace-nowrap"
                      onClick={() => handleMakeActive(item.location.id, item.location.name)}
                    >
                      <ArrowRight className="h-3.5 w-3.5 mr-1" />
                      {lang === "it" ? "Attiva" : "Activate"}
                    </Button>
                  )}
                </CardHeader>

                <CardContent className="pt-4 space-y-4">
                  {/* Register Status */}
                  <div className="rounded-lg border bg-card p-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Wallet className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="text-xs font-semibold">{lang === "it" ? "Stato Registro Cassa" : "Cash Register Status"}</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {shift ? (
                            <>
                              {lang === "it" ? "Cassiere:" : "Cashier:"} <span className="font-medium">{shift.cashier || "N/A"}</span>
                            </>
                          ) : (
                            lang === "it" ? "Nessun turno aperto" : "No open shift"
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <Badge
                      className={cn(
                        "font-semibold text-[10px] uppercase",
                        shift
                          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
                          : "bg-muted text-muted-foreground border-border"
                      )}
                      variant="outline"
                    >
                      {shift ? (lang === "it" ? "Aperto" : "Open") : (lang === "it" ? "Chiuso" : "Closed")}
                    </Badge>
                  </div>

                  {/* Financial Metrics */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="border rounded-lg p-3 bg-card/40">
                      <div className="text-[10px] text-muted-foreground uppercase font-semibold flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-primary" />
                        {lang === "it" ? "Entrate Oggi" : "Today Revenue"}
                      </div>
                      <div className="mt-1 text-lg font-bold font-mono tabular-nums">
                        {formatEUR(item.todayRevenue)}
                      </div>
                      <div className="text-[9px] text-muted-foreground mt-0.5">
                        {item.todayOrdersCount} {lang === "it" ? "scontrini" : "sales"}
                      </div>
                    </div>
                    
                    <div className="border rounded-lg p-3 bg-card/40">
                      <div className="text-[10px] text-muted-foreground uppercase font-semibold flex items-center gap-1.5">
                        <TrendingUp className="h-3.5 w-3.5 text-success" />
                        {lang === "it" ? "Utile Mese" : "Month Profit"}
                      </div>
                      <div className={cn(
                        "mt-1 text-lg font-bold font-mono tabular-nums",
                        item.monthNetProfit >= 0 ? "text-success" : "text-destructive"
                      )}>
                        {formatEUR(item.monthNetProfit)}
                      </div>
                      <div className="text-[9px] text-muted-foreground mt-0.5">
                        {lang === "it" ? "Al netto di COGS/Spese" : "COGS & OpEx deducted"}
                      </div>
                    </div>
                  </div>

                  {/* Stock Metrics */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="border rounded-lg p-3 bg-card/40">
                      <div className="text-[10px] text-muted-foreground uppercase font-semibold flex items-center gap-1.5">
                        <Boxes className="h-3.5 w-3.5 text-muted-foreground" />
                        {lang === "it" ? "Scorte Locali" : "Local Stock"}
                      </div>
                      <div className="mt-1 text-lg font-bold font-mono tabular-nums">
                        {item.totalStockUnits} <span className="text-xs font-normal text-muted-foreground">pz</span>
                      </div>
                      <div className="text-[9px] text-muted-foreground mt-0.5">
                        {lang === "it" ? "Valore costo:" : "Cost value:"} {formatEUR(item.stockValueCost)}
                      </div>
                    </div>

                    <div className="border rounded-lg p-3 bg-card/40">
                      <div className="text-[10px] text-muted-foreground uppercase font-semibold flex items-center gap-1.5">
                        <AlertTriangle className={cn("h-3.5 w-3.5", item.lowStockCount > 0 ? "text-warning animate-pulse" : "text-muted-foreground")} />
                        {lang === "it" ? "Scorte Basse" : "Low Stock Alerts"}
                      </div>
                      <div className={cn(
                        "mt-1 text-lg font-bold font-mono tabular-nums",
                        item.lowStockCount > 0 ? "text-warning" : "text-emerald-500"
                      )}>
                        {item.lowStockCount}
                      </div>
                      <div className="text-[9px] text-muted-foreground mt-0.5">
                        {lang === "it" ? `Soglia: <= ${threshold} pz` : `Threshold: <= ${threshold} units`}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </>
  );
}
