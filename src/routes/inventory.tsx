import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useSessionState } from "@/hooks/useSessionState";
import { Plus, Upload, Trash2, Pencil, Search, Download, History, PackagePlus, Star, ScanLine, Layers, AlertTriangle, Calendar as CalendarIcon } from "lucide-react";
import { PageHeader } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useStore, VAT_RATES, formatEUR, downloadCsv, expiryStatus, daysUntil } from "@/lib/store";
import { useT, useCurrentLang } from "@/lib/i18n";
import type { Product, StockMovement, VatRate } from "@/lib/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { ReceiveLotDialog } from "@/components/ReceiveLotDialog";
import { LotsManager } from "@/components/LotsManager";


export const Route = createFileRoute("/inventory")({
  head: () => ({
    meta: [
      { title: "Magazzino — Soldo" },
      { name: "description", content: "Gestione prodotti, scorte e aliquote IVA italiane." },
    ],
  }),
  component: InventoryPage,
});

function InventoryPage() {
  const t = useT();
  const lang = useCurrentLang();
  const [activeTab, setActiveTab] = useSessionState<"products" | "variants" | "recipes" | "transfers" | "suggestions">("inv-activeTab", "products");
  const products = useStore((s) => s.products);
  const movements = useStore((s) => s.movements);
  const lots = useStore((s) => s.lots);
  const addProduct = useStore((s) => s.addProduct);
  const updateProduct = useStore((s) => s.updateProduct);
  const deleteProduct = useStore((s) => s.deleteProduct);
  const toggleFavorite = useStore((s) => s.toggleFavorite);
  const importProducts = useStore((s) => s.importProducts);
  const threshold = useStore((s) => s.config.low_stock_threshold ?? 3);
  const globalAlertDays = useStore((s) => s.config.expiry_alert_days ?? 14);
  const locations = useStore((s) => s.locations);

  const [openAdd, setOpenAdd] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [adjusting, setAdjusting] = useState<Product | null>(null);
  const [managingLots, setManagingLots] = useState<Product | null>(null);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [search, setSearch] = useSessionState("inv-search", "");
  const [category, setCategory] = useSessionState("inv-category", "__all");
  const [onlyLow, setOnlyLow] = useSessionState("inv-onlyLow", false);
  const [onlyFav, setOnlyFav] = useSessionState("inv-onlyFav", false);
  const [scannerOpen, setScannerOpen] = useState(false);


  const categories = useMemo(() => {
    const s = new Set<string>();
    products.forEach((p) => p.category && s.add(p.category));
    return Array.from(s).sort();
  }, [products]);

  // Earliest expiring lot per product + global expiring/expired lists
  const expiryByProduct = useMemo(() => {
    const map = new Map<string, { status: "expired" | "soon" | "ok" | "none"; date: string | null; days: number | null }>();
    for (const p of products) {
      const days = p.expiry_alert_days ?? globalAlertDays;
      const plots = lots.filter((l) => l.product_id === p.id && l.qty_remaining > 0 && l.expiry_date);
      if (plots.length === 0) {
        map.set(p.id, { status: "none", date: null, days: null });
        continue;
      }
      const earliest = plots.reduce((a, b) =>
        (a.expiry_date! < b.expiry_date! ? a : b),
      );
      map.set(p.id, {
        status: expiryStatus(earliest.expiry_date, days),
        date: earliest.expiry_date,
        days: earliest.expiry_date ? daysUntil(earliest.expiry_date) : null,
      });
    }
    return map;
  }, [products, lots, globalAlertDays]);

  const expiringLots = useMemo(() => {
    return lots
      .filter((l) => {
        if (l.qty_remaining <= 0 || !l.expiry_date) return false;
        const p = products.find((x) => x.id === l.product_id);
        const days = p?.expiry_alert_days ?? globalAlertDays;
        const st = expiryStatus(l.expiry_date, days);
        return st === "soon" || st === "expired";
      })
      .sort((a, b) => (a.expiry_date! < b.expiry_date! ? -1 : 1));
  }, [lots, products, globalAlertDays]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (category !== "__all" && p.category !== category) return false;
      if (onlyLow && p.stock_quantity > threshold) return false;
      if (onlyFav && !p.favorite) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.barcode ?? "").toLowerCase().includes(q) ||
        (p.category ?? "").toLowerCase().includes(q)
      );
    });
  }, [products, search, category, onlyLow, onlyFav, threshold]);

  function handleScan(code: string) {
    setSearch(code);
    const hit = products.find(
      (p) => (p.barcode ?? "").toLowerCase() === code.toLowerCase() || p.sku.toLowerCase() === code.toLowerCase(),
    );
    if (hit) {
      setEditing(hit);
      toast.success(hit.name);
    } else {
      toast.error(t("scan.notfound"), { description: code });
    }
  }


  function handleExport() {
    downloadCsv(
      `inventario-${new Date().toISOString().slice(0, 10)}.csv`,
      ["name", "sku", "category", "barcode", "cost_price", "price_gross", "vat_rate", "stock_quantity"],
      products.map((p) => [
        p.name,
        p.sku,
        p.category ?? "",
        p.barcode ?? "",
        p.cost_price,
        p.price_gross,
        p.vat_rate,
        p.stock_quantity,
      ]),
    );
  }

  function handleImport(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result);
        const lines = text.split(/\r?\n/).filter(Boolean);
        const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
        const rows: Omit<Product, "id">[] = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = parseCsvLine(lines[i]);
          const obj: any = {};
          headers.forEach((h, idx) => (obj[h] = cols[idx]));
          rows.push({
            name: obj.name ?? "",
            sku: obj.sku ?? "",
            category: obj.category || undefined,
            barcode: obj.barcode || undefined,
            cost_price: parseFloat(obj.cost_price) || 0,
            price_gross: parseFloat(obj.price_gross) || 0,
            vat_rate: (parseInt(obj.vat_rate) || 22) as VatRate,
            stock_quantity: parseInt(obj.stock_quantity) || 0,
          });
        }
        const n = importProducts(rows);
        toast.success(`${n} ${t("inv.import.toast")}`);
      } catch {
        toast.error(lang === "it" ? "Errore importazione CSV" : "CSV import error");
      }
    };
    reader.readAsText(file);
  }

  return (
    <>
      <PageHeader
        title={t("inv.title")}
        subtitle={`${products.length} ${t("inv.subtitle")}`}
        actions={
          activeTab === "products" ? (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleExport} className="hidden sm:inline-flex">
                <Download className="h-4 w-4 mr-2" /> {t("inv.export")}
              </Button>
              <label className="hidden sm:inline-flex">
                <input
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleImport(f);
                    e.target.value = "";
                  }}
                />
                <span className="inline-flex items-center h-9 px-3 rounded-md border bg-background hover:bg-accent text-sm font-medium cursor-pointer">
                  <Upload className="h-4 w-4 mr-2" /> {t("inv.import")}
                </span>
              </label>
              <Button variant="outline" size="sm" onClick={() => setReceiveOpen(true)}>
                <PackagePlus className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">{t("lot.btn.receive")}</span>
              </Button>
              <Dialog open={openAdd} onOpenChange={setOpenAdd}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">{t("common.add")}</span>
                  </Button>
                </DialogTrigger>
                <ProductDialog
                  title={t("inv.add.title")}
                  onSave={(p) => {
                    addProduct(p);
                    setOpenAdd(false);
                    toast.success(t("inv.toast.added"));
                  }}
                />
              </Dialog>
            </div>
          ) : null
        }
      />

      <div className="border-b border-border bg-card">
        <div className="max-w-6xl mx-auto px-4 md:px-8 flex space-x-6 overflow-x-auto">
          {[
            { id: "products", label: lang === "it" ? "Prodotti" : "Products" },
            { id: "variants", label: t("inv.tab.variants") },
            { id: "recipes", label: t("inv.tab.recipes") },
            { id: "transfers", label: t("inv.tab.transfers") },
            { id: "suggestions", label: t("inv.tab.suggestions") },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "py-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap",
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === "products" && (
        <div className="p-4 md:p-8 space-y-4 max-w-6xl mx-auto w-full">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("inv.search.ph")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">{t("inv.filter.all")}</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => setScannerOpen(true)}>
            <ScanLine className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">{t("scan.btn")}</span>
          </Button>
          <Button
            variant={onlyFav ? "default" : "outline"}
            size="sm"
            onClick={() => setOnlyFav((v) => !v)}
            title={t("sale.fav.title")}
          >
            <Star className={cn("h-4 w-4", onlyFav && "fill-current")} />
          </Button>
          <Button
            variant={onlyLow ? "default" : "outline"}
            size="sm"
            onClick={() => setOnlyLow((v) => !v)}
          >
            {t("inv.filter.low")}
          </Button>
        </div>

        <BarcodeScanner open={scannerOpen} onClose={() => setScannerOpen(false)} onDecode={handleScan} />

        {expiringLots.length > 0 && (
          <Card className="border-warning/50 bg-warning/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning" />
                {t("lot.alerts.title")}
                <Badge variant="secondary" className="ml-auto text-xs">
                  {expiringLots.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {expiringLots.slice(0, 6).map((l) => {
                const p = products.find((x) => x.id === l.product_id);
                const days = daysUntil(l.expiry_date!);
                const expired = days < 0;
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => p && setManagingLots(p)}
                    className={cn(
                      "w-full flex items-center justify-between gap-3 text-sm border-l-4 pl-3 py-1.5 rounded-r hover:bg-accent/40 text-left",
                      expired ? "border-destructive" : "border-warning",
                    )}
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">{p?.name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <CalendarIcon className="h-3 w-3" />
                        <span className="font-mono">{l.lot_code}</span> · {l.expiry_date}
                      </div>
                    </div>
                    <Badge
                      variant={expired ? "destructive" : "default"}
                      className={cn("text-[10px] shrink-0", !expired && "bg-warning text-warning-foreground")}
                    >
                      {expired ? t("lot.status.expired") : `${days}d`} · {l.qty_remaining}
                    </Badge>
                  </button>
                );
              })}
              {expiringLots.length > 6 && (
                <p className="text-xs text-muted-foreground pt-1">+{expiringLots.length - 6}</p>
              )}
            </CardContent>
          </Card>
        )}




        {/* Mobile cards */}
        <div className="md:hidden space-y-2">
          {filtered.map((p) => {
            const low = p.stock_quantity <= 0;
            const warn = p.stock_quantity > 0 && p.stock_quantity <= threshold;
            const exp = expiryByProduct.get(p.id);
            return (
              <Card key={p.id} className="overflow-hidden">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm text-foreground flex items-center gap-1.5 flex-wrap">
                        {p.name}
                        <ExpiryBadge exp={exp} t={t} />
                      </div>
                      <div className="text-xs text-muted-foreground font-mono mt-0.5">{p.sku}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {formatEUR(p.price_gross)} · IVA {p.vat_rate}%
                        {p.category && <span className="ml-1 px-1.5 py-0.5 rounded bg-muted text-[10px]">{p.category}</span>}
                      </div>
                    </div>
                    
                    <div className="text-right shrink-0 flex flex-col items-end">
                      <div
                        className={cn(
                          "text-base font-bold tabular-nums leading-none",
                          low && "text-destructive",
                          warn && "text-warning",
                          !low && !warn && "text-success",
                        )}
                      >
                        {p.stock_quantity} <span className="text-[10px] font-normal text-muted-foreground">pz</span>
                      </div>
                      <span className="text-[9px] text-muted-foreground uppercase tracking-wider mt-1 block font-medium">
                        {lang === "it" ? "In Sede:" : "Local Stock:"}
                      </span>
                    </div>
                  </div>

                  {/* Stock Bifurcation row */}
                  {p.location_stock && (
                    <div className="flex flex-wrap gap-x-3 gap-y-1 bg-muted/40 rounded-lg p-2 text-[10px] text-muted-foreground">
                      {locations.map((loc) => {
                        const s = p.location_stock?.[loc.id] ?? 0;
                        return (
                          <div key={loc.id} className="flex gap-1">
                            <span className="font-semibold text-foreground">{loc.name.split(" ")[0]}:</span>
                            <span className="font-mono tabular-nums">{s}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Card Actions Row */}
                  <div className="flex items-center justify-between pt-2.5 border-t border-dashed">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs px-2 text-primary"
                      onClick={() => setEditing(p)}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1" />
                      {t("common.edit")}
                    </Button>
                    
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => {
                          toggleFavorite(p.id);
                          toast.success(p.favorite ? t("inv.fav.removed") : t("inv.fav.added"));
                        }}
                        title={t("inv.fav.tooltip")}
                      >
                        <Star className={cn("h-3.5 w-3.5", p.favorite && "fill-amber-400 text-amber-400")} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setManagingLots(p)}
                        title={t("lot.btn.manage")}
                      >
                        <Layers className={cn("h-3.5 w-3.5", p.track_lots && "text-primary")} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-primary"
                        onClick={() => setAdjusting(p)}
                        title={t("inv.adjust.title")}
                      >
                        <PackagePlus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">{t("common.empty")}</p>
          )}
        </div>


        {/* Desktop table */}
        <Card className="hidden md:block">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("inv.col.product")}</TableHead>
                    <TableHead>{t("inv.col.sku")}</TableHead>
                    <TableHead>{t("inv.col.category")}</TableHead>
                    <TableHead className="text-right">{t("inv.col.cost")}</TableHead>
                    <TableHead className="text-right">{t("inv.col.price")}</TableHead>
                    <TableHead>{t("inv.col.vat")}</TableHead>
                    <TableHead className="text-right">{t("inv.col.stock")}</TableHead>
                    <TableHead className="text-right">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p) => {
                    const low = p.stock_quantity <= 0;
                    const warn = p.stock_quantity > 0 && p.stock_quantity <= threshold;
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-1.5">
                            {p.name}
                            <ExpiryBadge exp={expiryByProduct.get(p.id)} t={t} />
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground font-mono text-xs">{p.sku}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">{p.category ?? "—"}</TableCell>
                        <TableCell className="text-right">{formatEUR(p.cost_price)}</TableCell>
                        <TableCell className="text-right">{formatEUR(p.price_gross)}</TableCell>
                        <TableCell>{p.vat_rate}%</TableCell>
                        <TableCell className="text-right">
                          <div className={cn(
                            "font-semibold tabular-nums",
                            low && "text-destructive font-bold",
                            warn && "text-warning",
                            !low && !warn && "text-success",
                          )}>{p.stock_quantity}</div>
                          <div className="text-[10px] text-muted-foreground/80 mt-0.5 space-y-0.5 leading-none">
                            {locations.map((loc) => {
                              const s = p.location_stock?.[loc.id] ?? 0;
                              return (
                                <div key={loc.id} className="whitespace-nowrap">
                                  {loc.name.split(" ")[0]}: <span className="font-mono font-medium tabular-nums">{s}</span>
                                </div>
                              );
                            })}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                toggleFavorite(p.id);
                                toast.success(p.favorite ? t("inv.fav.removed") : t("inv.fav.added"));
                              }}
                              title={t("inv.fav.tooltip")}
                            >
                              <Star className={cn("h-4 w-4", p.favorite && "fill-amber-400 text-amber-400")} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setManagingLots(p)}
                              title={t("lot.btn.manage")}
                            >
                              <Layers className={cn("h-4 w-4", p.track_lots && "text-primary")} />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => setAdjusting(p)} title={t("inv.adjust.title")}>
                              <PackagePlus className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => setEditing(p)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <DeleteProductButton
                              onConfirm={() => {
                                deleteProduct(p.id);
                                toast.success(t("inv.toast.deleted"));
                              }}
                            />
                          </div>
                        </TableCell>


                      </TableRow>
                    );
                  })}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                        {t("common.empty")}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Movements */}
        {movements.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <History className="h-4 w-4" /> {t("inv.history")}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[320px] overflow-y-auto">
                <Table>
                  <TableBody>
                    {movements.slice(0, 30).map((m: StockMovement) => (
                      <TableRow key={m.id}>
                        <TableCell className="text-xs text-muted-foreground font-mono w-32">
                          {new Date(m.created_at).toLocaleString("it-IT")}
                        </TableCell>
                        <TableCell className="font-medium truncate max-w-[200px]">{m.product_name}</TableCell>
                        <TableCell className="text-xs">
                          <span className="px-1.5 py-0.5 rounded bg-muted">{m.reason}</span>
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right font-semibold tabular-nums",
                            m.delta < 0 ? "text-destructive" : "text-success",
                          )}
                        >
                          {m.delta > 0 ? "+" : ""}
                          {m.delta}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        <p className="text-xs text-muted-foreground">{t("inv.import.help")}</p>
      </div>
      )}

      {activeTab === "variants" && (
        <div className="p-4 md:p-8 space-y-4 max-w-6xl mx-auto w-full">
          <VariantsTab />
        </div>
      )}
      {activeTab === "recipes" && (
        <div className="p-4 md:p-8 space-y-4 max-w-6xl mx-auto w-full">
          <RecipesTab />
        </div>
      )}
      {activeTab === "transfers" && (
        <div className="p-4 md:p-8 space-y-4 max-w-6xl mx-auto w-full">
          <StockTransfersTab />
        </div>
      )}
      {activeTab === "suggestions" && (
        <div className="p-4 md:p-8 space-y-4 max-w-6xl mx-auto w-full">
          <DynamicPricingTab />
        </div>
      )}
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <ProductDialog
            title={t("inv.edit.title")}
            initial={editing}
            onSave={(p) => {
              updateProduct(editing.id, p);
              setEditing(null);
              toast.success(t("inv.toast.updated"));
            }}
            onDelete={() => {
              deleteProduct(editing.id);
              setEditing(null);
              toast.success(t("inv.toast.deleted"));
            }}
          />
        )}
      </Dialog>

      {/* Adjust dialog */}
      <Dialog open={!!adjusting} onOpenChange={(o) => !o && setAdjusting(null)}>
        {adjusting && <AdjustDialog product={adjusting} onClose={() => setAdjusting(null)} />}
      </Dialog>

      {/* Lots manager */}
      <LotsManager
        product={managingLots}
        open={!!managingLots}
        onClose={() => setManagingLots(null)}
      />

      {/* Receive lot (global) */}
      <ReceiveLotDialog open={receiveOpen} onClose={() => setReceiveOpen(false)} />
    </>
  );
}

function ExpiryBadge({
  exp,
  t,
}: {
  exp: { status: "expired" | "soon" | "ok" | "none"; date: string | null; days: number | null } | undefined;
  t: (k: string) => string;
}) {
  if (!exp || exp.status === "none" || exp.status === "ok") return null;
  if (exp.status === "expired") {
    return (
      <Badge variant="destructive" className="text-[10px] px-1.5 py-0 gap-1">
        <CalendarIcon className="h-2.5 w-2.5" />
        {t("lot.status.expired")}
      </Badge>
    );
  }
  return (
    <Badge className="bg-warning text-warning-foreground text-[10px] px-1.5 py-0 gap-1">
      <CalendarIcon className="h-2.5 w-2.5" />
      {exp.days != null ? `${exp.days}d` : t("lot.status.soon")}
    </Badge>
  );
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') inQ = false;
      else cur += ch;
    } else {
      if (ch === ",") {
        out.push(cur);
        cur = "";
      } else if (ch === '"') inQ = true;
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function DeleteProductButton({ onConfirm }: { onConfirm: () => void }) {
  const t = useT();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon">
          <Trash2 className="h-4 w-4 text-muted-foreground" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("inv.confirm.delete")}</AlertDialogTitle>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{t("common.delete")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ProductDialog({
  title,
  initial,
  onSave,
  onDelete,
}: {
  title: string;
  initial?: Product;
  onSave: (p: Omit<Product, "id">) => void;
  onDelete?: () => void;
}) {
  const t = useT();
  const [form, setForm] = useState<Omit<Product, "id">>({
    name: initial?.name ?? "",
    sku: initial?.sku ?? "",
    barcode: initial?.barcode ?? "",
    category: initial?.category ?? "",
    cost_price: initial?.cost_price ?? 0,
    price_gross: initial?.price_gross ?? 0,
    vat_rate: initial?.vat_rate ?? 22,
    stock_quantity: initial?.stock_quantity ?? 0,
    track_lots: initial?.track_lots ?? false,
    expiry_alert_days: initial?.expiry_alert_days,
  });
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      <div className="grid gap-3">
        <Field label={t("inv.add.name")}>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("inv.col.sku")}>
            <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
          </Field>
          <Field label={t("inv.add.barcode")}>
            <Input value={form.barcode ?? ""} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
          </Field>
        </div>
        <Field label={t("inv.add.category")}>
          <Input value={form.category ?? ""} onChange={(e) => setForm({ ...form, category: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("inv.add.cost")}>
            <Input
              type="number"
              step="0.01"
              value={form.cost_price}
              onChange={(e) => setForm({ ...form, cost_price: parseFloat(e.target.value) || 0 })}
            />
          </Field>
          <Field label={t("inv.add.price")}>
            <Input
              type="number"
              step="0.01"
              value={form.price_gross}
              onChange={(e) => setForm({ ...form, price_gross: parseFloat(e.target.value) || 0 })}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("inv.add.vat")}>
            <Select
              value={String(form.vat_rate)}
              onValueChange={(v) => setForm({ ...form, vat_rate: Number(v) as VatRate })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VAT_RATES.map((r) => (
                  <SelectItem key={r} value={String(r)}>
                    {r}%
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("inv.add.stock")}>
            <Input
              type="number"
              value={form.stock_quantity}
              onChange={(e) => setForm({ ...form, stock_quantity: parseInt(e.target.value) || 0 })}
            />
          </Field>
        </div>
        <div className="rounded-md border p-3 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label className="text-sm">{t("inv.track.label")}</Label>
              <p className="text-xs text-muted-foreground">{t("lot.tracking.hint")}</p>
            </div>
            <Switch
              checked={!!form.track_lots}
              onCheckedChange={(v) => setForm({ ...form, track_lots: v })}
            />
          </div>
          {form.track_lots && (
            <Field label={t("inv.track.alertdays")}>
              <Input
                type="number"
                min={0}
                value={form.expiry_alert_days ?? ""}
                placeholder="—"
                onChange={(e) =>
                  setForm({
                    ...form,
                    expiry_alert_days: e.target.value === "" ? undefined : Math.max(0, parseInt(e.target.value) || 0),
                  })
                }
              />
            </Field>
          )}
        </div>
      </div>
      <DialogFooter className="gap-2 sm:gap-2">
        {onDelete && (
          <Button variant="destructive" onClick={onDelete} className="mr-auto">
            <Trash2 className="h-4 w-4 mr-2" /> {t("common.delete")}
          </Button>
        )}
        <Button disabled={!form.name || !form.sku} onClick={() => onSave(form)}>
          {t("common.save")}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function AdjustDialog({ product, onClose }: { product: Product; onClose: () => void }) {
  const t = useT();
  const adjustStock = useStore((s) => s.adjustStock);
  const [delta, setDelta] = useState(0);
  const [reason, setReason] = useState<"restock" | "adjustment" | "loss">("restock");
  const [note, setNote] = useState("");
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>
          {t("inv.adjust.title")} — {product.name}
        </DialogTitle>
      </DialogHeader>
      <div className="grid gap-3">
        <div className="text-sm text-muted-foreground">
          {t("inv.col.stock")}: <b className="text-foreground tabular-nums">{product.stock_quantity}</b>
        </div>
        <Field label={t("inv.adjust.delta")}>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setDelta(delta - 1)}>
              <Trash2 className="h-3 w-3" />
            </Button>
            <Input
              type="number"
              value={delta}
              onChange={(e) => setDelta(parseInt(e.target.value) || 0)}
              className="text-center"
            />
            <Button variant="outline" size="icon" onClick={() => setDelta(delta + 1)}>
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </Field>
        <Field label={t("inv.adjust.reason")}>
          <Select value={reason} onValueChange={(v) => setReason(v as any)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="restock">{t("inv.adjust.restock")}</SelectItem>
              <SelectItem value="adjustment">{t("inv.adjust.adjustment")}</SelectItem>
              <SelectItem value="loss">{t("inv.adjust.loss")}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label={t("inv.adjust.note")}>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
        </Field>
      </div>
      <DialogFooter>
        <Button
          disabled={delta === 0}
          onClick={() => {
            adjustStock(product.id, delta, reason, note);
            toast.success(t("inv.toast.updated"));
            onClose();
          }}
        >
          {t("common.confirm")}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function VariantsTab() {
  const t = useT();
  const lang = useCurrentLang();
  const products = useStore((s) => s.products);
  const updateProduct = useStore((s) => s.updateProduct);

  const parents = products.filter((p) => p.is_variant_parent);
  const eligibleChildren = products.filter((p) => !p.is_variant_parent && !p.parent_id);

  const [selectedParentId, setSelectedParentId] = useState("");
  const [selectedChildId, setSelectedChildId] = useState("");
  const [attrName, setAttrName] = useState("");
  const [attrVal, setAttrVal] = useState("");
  const [attrs, setAttrs] = useState<{ name: string; value: string }[]>([]);

  const [newParentProductId, setNewParentProductId] = useState("");

  const handleCreateParent = () => {
    if (!newParentProductId) return;
    updateProduct(newParentProductId, { is_variant_parent: true });
    setNewParentProductId("");
    toast.success(lang === "it" ? "Prodotto contrassegnato come Padre" : "Product marked as Parent");
  };

  const handleAddAttr = () => {
    if (!attrName.trim() || !attrVal.trim()) return;
    setAttrs([...attrs, { name: attrName.trim(), value: attrVal.trim() }]);
    setAttrName("");
    setAttrVal("");
  };

  const handleLinkChild = () => {
    if (!selectedParentId || !selectedChildId) {
      toast.error(lang === "it" ? "Seleziona padre e figlio" : "Select parent and child");
      return;
    }
    updateProduct(selectedChildId, {
      parent_id: selectedParentId,
      variant_attributes: attrs.length > 0 ? attrs : undefined,
    });
    setSelectedChildId("");
    setAttrs([]);
    toast.success(lang === "it" ? "Variante collegata con successo" : "Variant linked successfully");
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Create Parent Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{lang === "it" ? "1. Crea Prodotto Padre" : "1. Create Parent Product"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {lang === "it"
                ? "Seleziona un prodotto esistente che fungerà da genitore per le varianti (es. Maglietta Polo senza taglia)."
                : "Select an existing product to act as the parent for variants (e.g., Polo Shirt with no size)."}
            </p>
            <div className="flex gap-2">
              <Select value={newParentProductId} onValueChange={setNewParentProductId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder={lang === "it" ? "Seleziona prodotto..." : "Select product..."} />
                </SelectTrigger>
                <SelectContent>
                  {products
                    .filter((p) => !p.is_variant_parent && !p.parent_id)
                    .map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} ({p.sku})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Button onClick={handleCreateParent} disabled={!newParentProductId}>
                {lang === "it" ? "Imposta Padre" : "Set Parent"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Link Child Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{lang === "it" ? "2. Collega Variante Figlio" : "2. Link Child Variant"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div>
                <Label className="text-xs">{t("inv.variant.parent")}</Label>
                <Select value={selectedParentId} onValueChange={setSelectedParentId}>
                  <SelectTrigger>
                    <SelectValue placeholder={lang === "it" ? "Scegli padre..." : "Select parent..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {parents.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} ({p.sku})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">{lang === "it" ? "Seleziona Prodotto Figlio" : "Select Child Product"}</Label>
                <Select value={selectedChildId} onValueChange={setSelectedChildId}>
                  <SelectTrigger>
                    <SelectValue placeholder={lang === "it" ? "Scegli figlio..." : "Select child..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleChildren.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} ({p.sku})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Attributes Form */}
              <div className="border p-3 rounded-lg bg-muted/40 space-y-2">
                <span className="text-xs font-semibold block">{lang === "it" ? "Attributi della Variante (es. Taglia: M)" : "Variant Attributes (e.g., Size: M)"}</span>
                <div className="flex gap-2">
                  <Input
                    placeholder={lang === "it" ? "Attributo (es. Taglia)" : "Name (e.g. Size)"}
                    value={attrName}
                    onChange={(e) => setAttrName(e.target.value)}
                    className="h-8 text-xs"
                  />
                  <Input
                    placeholder={lang === "it" ? "Valore (es. M)" : "Value (e.g. M)"}
                    value={attrVal}
                    onChange={(e) => setAttrVal(e.target.value)}
                    className="h-8 text-xs"
                  />
                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleAddAttr}>
                    +
                  </Button>
                </div>
                {attrs.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {attrs.map((a, idx) => (
                      <Badge key={idx} variant="secondary" className="text-[10px] gap-1 pr-1">
                        {a.name}: {a.value}
                        <button
                          type="button"
                          className="hover:text-destructive font-bold ml-1"
                          onClick={() => setAttrs(attrs.filter((_, i) => i !== idx))}
                        >
                          ×
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <Button onClick={handleLinkChild} disabled={!selectedParentId || !selectedChildId} className="w-full">
                {lang === "it" ? "Collega come Variante" : "Link as Variant"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Parents & Children Directory */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{lang === "it" ? "Relazioni Varianti Attive" : "Active Variant Relationships"}</CardTitle>
        </CardHeader>
        <CardContent>
          {parents.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              {lang === "it" ? "Nessun prodotto padre configurato." : "No parent products configured."}
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {parents.map((parent) => {
                const children = products.filter((c) => c.parent_id === parent.id);
                return (
                  <div key={parent.id} className="border p-4 rounded-xl space-y-2 bg-card">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-semibold text-sm">{parent.name}</div>
                        <div className="text-xs font-mono text-muted-foreground">{parent.sku}</div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[10px] px-2"
                        onClick={() => {
                          updateProduct(parent.id, { is_variant_parent: false });
                          children.forEach((c) => updateProduct(c.id, { parent_id: undefined, variant_attributes: undefined }));
                          toast.success(lang === "it" ? "Genitore e figli scollegati" : "Parent and children unlinked");
                        }}
                      >
                        {lang === "it" ? "Scollega Tutto" : "Unlink All"}
                      </Button>
                    </div>
                    <div className="h-px bg-border my-2" />
                    {children.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic py-1">
                        {lang === "it" ? "Nessun figlio collegato" : "No child variants linked"}
                      </p>
                    ) : (
                      <div className="divide-y text-xs space-y-1">
                        {children.map((child) => (
                          <div key={child.id} className="pt-2 flex justify-between items-center">
                            <div>
                              <span className="font-medium">{child.name}</span>{" "}
                              <span className="text-muted-foreground font-mono">({child.sku})</span>
                              <div className="flex gap-1 mt-0.5">
                                {child.variant_attributes?.map((a, idx) => (
                                  <Badge key={idx} variant="outline" className="text-[9px] px-1 py-0 bg-muted/30">
                                    {a.name}: {a.value}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => {
                                updateProduct(child.id, { parent_id: undefined, variant_attributes: undefined });
                                toast.success(lang === "it" ? "Variante scollegata" : "Variant unlinked");
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RecipesTab() {
  const lang = useCurrentLang();
  const products = useStore((s) => s.products);
  const updateProduct = useStore((s) => s.updateProduct);

  const [selectedRecipeProductId, setSelectedRecipeProductId] = useState("");
  const selectedRecipeProduct = products.find((p) => p.id === selectedRecipeProductId);

  const [ingredientId, setIngredientId] = useState("");
  const [ingredientQty, setIngredientQty] = useState("1");

  const handleToggleComposite = (checked: boolean) => {
    if (!selectedRecipeProduct) return;
    updateProduct(selectedRecipeProduct.id, {
      is_composite: checked,
      recipe_items: checked ? (selectedRecipeProduct.recipe_items ?? []) : undefined,
    });
    toast.success(lang === "it" ? "Stato ricetta modificato" : "Recipe status updated");
  };

  const handleAddIngredient = () => {
    if (!selectedRecipeProduct || !ingredientId) return;
    const qty = parseFloat(ingredientQty);
    if (isNaN(qty) || qty <= 0) return toast.error(lang === "it" ? "Quantità non valida" : "Invalid quantity");

    const currentItems = selectedRecipeProduct.recipe_items ?? [];
    const existingIndex = currentItems.findIndex((item) => item.product_id === ingredientId);

    let newItems = [...currentItems];
    if (existingIndex > -1) {
      newItems[existingIndex] = { ...newItems[existingIndex], quantity: newItems[existingIndex].quantity + qty };
    } else {
      newItems.push({ product_id: ingredientId, quantity: qty });
    }

    updateProduct(selectedRecipeProduct.id, { recipe_items: newItems });
    setIngredientId("");
    setIngredientQty("1");
    toast.success(lang === "it" ? "Ingrediente aggiunto" : "Ingredient added");
  };

  const handleRemoveIngredient = (prodId: string) => {
    if (!selectedRecipeProduct) return;
    const newItems = (selectedRecipeProduct.recipe_items ?? []).filter((item) => item.product_id !== prodId);
    updateProduct(selectedRecipeProduct.id, { recipe_items: newItems });
    toast.success(lang === "it" ? "Ingrediente rimosso" : "Ingredient removed");
  };

  // Compute stats
  const recipeItemsWithDetails = useMemo(() => {
    if (!selectedRecipeProduct?.recipe_items) return [];
    return selectedRecipeProduct.recipe_items.map((item) => {
      const p = products.find((x) => x.id === item.product_id);
      return {
        ...item,
        name: p?.name ?? "Unknown product",
        sku: p?.sku ?? "N/A",
        cost: p?.cost_price ?? 0,
        totalCost: (p?.cost_price ?? 0) * item.quantity,
      };
    });
  }, [selectedRecipeProduct, products]);

  const productionCost = useMemo(() => {
    return recipeItemsWithDetails.reduce((sum, item) => sum + item.totalCost, 0);
  }, [recipeItemsWithDetails]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          {lang === "it" ? "Gestione Ricette & Distinta Base (BOM)" : "Recipes & Bill of Materials (BOM) Management"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label>{lang === "it" ? "Seleziona Prodotto Finito / Piatto" : "Select Finished Product / Menu Item"}</Label>
          <Select value={selectedRecipeProductId} onValueChange={setSelectedRecipeProductId}>
            <SelectTrigger>
              <SelectValue placeholder={lang === "it" ? "Seleziona un prodotto..." : "Select a product..."} />
            </SelectTrigger>
            <SelectContent>
              {products.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} ({p.sku})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedRecipeProduct && (
          <div className="space-y-4 pt-2 border-t">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-semibold text-sm">{selectedRecipeProduct.name}</span>
                <span className="text-xs text-muted-foreground block">
                  {lang === "it" ? "Prezzo di vendita: " : "Retail Price: "} {formatEUR(selectedRecipeProduct.price_gross)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs cursor-pointer" htmlFor="is-composite-toggle">
                  {lang === "it" ? "Prodotto Composito / Ricetta" : "Composite Product / Recipe"}
                </Label>
                <Switch
                  id="is-composite-toggle"
                  checked={!!selectedRecipeProduct.is_composite}
                  onCheckedChange={handleToggleComposite}
                />
              </div>
            </div>

            {selectedRecipeProduct.is_composite && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
                {/* Left: Add ingredient */}
                <div className="md:col-span-1 space-y-3 border p-4 rounded-xl bg-muted/20">
                  <h4 className="font-semibold text-xs uppercase tracking-wider">{lang === "it" ? "Aggiungi Ingrediente" : "Add Ingredient"}</h4>
                  <div className="space-y-2">
                    <Label className="text-xs">{lang === "it" ? "Ingrediente" : "Ingredient"}</Label>
                    <Select value={ingredientId} onValueChange={setIngredientId}>
                      <SelectTrigger>
                        <SelectValue placeholder={lang === "it" ? "Scegli prodotto..." : "Select product..."} />
                      </SelectTrigger>
                      <SelectContent>
                        {products
                          .filter((p) => p.id !== selectedRecipeProduct.id && !p.is_composite)
                          .map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name} (Scorta: {p.stock_quantity})
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">{lang === "it" ? "Quantità (Unità o Kg)" : "Quantity (Units or Kg)"}</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={ingredientQty}
                      onChange={(e) => setIngredientQty(e.target.value)}
                    />
                  </div>
                  <Button className="w-full" onClick={handleAddIngredient} disabled={!ingredientId}>
                    {lang === "it" ? "Aggiungi alla Ricetta" : "Add to Recipe"}
                  </Button>
                </div>

                {/* Right: Ingredients list & stats */}
                <div className="md:col-span-2 space-y-4">
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{lang === "it" ? "Ingrediente" : "Ingredient"}</TableHead>
                          <TableHead className="text-right">{lang === "it" ? "Q.tà" : "Qty"}</TableHead>
                          <TableHead className="text-right">{lang === "it" ? "Costo unit." : "Unit Cost"}</TableHead>
                          <TableHead className="text-right">{lang === "it" ? "Costo tot." : "Total Cost"}</TableHead>
                          <TableHead className="w-12"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recipeItemsWithDetails.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center text-muted-foreground py-4 text-xs italic">
                              {lang === "it" ? "Nessun ingrediente in distinta" : "No ingredients in BOM"}
                            </TableCell>
                          </TableRow>
                        ) : (
                          recipeItemsWithDetails.map((item) => (
                            <TableRow key={item.product_id} className="text-xs">
                              <TableCell>
                                <span className="font-medium">{item.name}</span>
                                <span className="text-muted-foreground block text-[10px] font-mono">{item.sku}</span>
                              </TableCell>
                              <TableCell className="text-right font-semibold">{item.quantity}</TableCell>
                              <TableCell className="text-right">{formatEUR(item.cost)}</TableCell>
                              <TableCell className="text-right font-medium">{formatEUR(item.totalCost)}</TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-destructive"
                                  onClick={() => handleRemoveIngredient(item.product_id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  {recipeItemsWithDetails.length > 0 && (
                    <div className="rounded-xl border p-4 bg-primary/5 flex items-center justify-between text-sm">
                      <div>
                        <span className="text-muted-foreground text-xs block">{lang === "it" ? "COSTO DI PRODUZIONE STIMATO" : "ESTIMATED PRODUCTION COST"}</span>
                        <span className="font-bold text-lg font-mono">{formatEUR(productionCost)}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-muted-foreground text-xs block">{lang === "it" ? "PREZZO VENDITA / MARGINE" : "RETAIL PRICE / MARGIN"}</span>
                        <span className="font-bold text-lg text-primary font-mono">
                          {formatEUR(selectedRecipeProduct.price_gross)}
                          <span className="text-xs font-normal text-muted-foreground ml-1">
                            ({Math.round(((selectedRecipeProduct.price_gross - productionCost) / selectedRecipeProduct.price_gross) * 100)}% marg.)
                          </span>
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StockTransfersTab() {
  const lang = useCurrentLang();
  const products = useStore((s) => s.products);
  const locations = useStore((s) => s.locations);
  const transferStock = useStore((s) => s.transferStock);

  const [productId, setProductId] = useState("");
  const [fromLocId, setFromLocId] = useState("loc-rome");
  const [toLocId, setToLocId] = useState("loc-milan");
  const [quantity, setQuantity] = useState("1");

  const selectedProduct = products.find((p) => p.id === productId);
  const fromStock = selectedProduct ? (selectedProduct.location_stock?.[fromLocId] ?? selectedProduct.stock_quantity) : 0;
  const toStock = selectedProduct ? (selectedProduct.location_stock?.[toLocId] ?? 0) : 0;

  const handleTransfer = () => {
    if (!productId) return;
    const qty = parseInt(quantity);
    if (isNaN(qty) || qty <= 0) return toast.error(lang === "it" ? "Quantità non valida" : "Invalid quantity");
    if (qty > fromStock) {
      toast.error(lang === "it" ? "Scorta insufficiente nella sorgente" : "Insufficient stock in source location");
      return;
    }

    transferStock(productId, fromLocId, toLocId, qty);
    setQuantity("1");
    toast.success(lang === "it" ? "Trasferimento stock completato" : "Stock transfer completed successfully");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          {lang === "it" ? "Trasferimento Scorte Inter-Sede" : "Inter-Location Stock Transfer"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          {lang === "it"
            ? "Permette di spostare merci fisiche tra le diverse sedi operative, inserendo una rettifica automatica nel registro di magazzino."
            : "Allows physical goods to be moved between different operational locations, automatically recording adjustments in the stock register."}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div>
              <Label className="text-xs">{lang === "it" ? "Seleziona Prodotto" : "Select Product"}</Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger>
                  <SelectValue placeholder={lang === "it" ? "Seleziona..." : "Select product..."} />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.sku})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">{lang === "it" ? "Da Sede (Sorgente)" : "From Location (Source)"}</Label>
                <Select value={fromLocId} onValueChange={setFromLocId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>
                        {loc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">{lang === "it" ? "A Sede (Destinazione)" : "To Location (Destination)"}</Label>
                <Select value={toLocId} onValueChange={setToLocId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((loc) => (
                      <SelectItem key={loc.id} value={loc.id} disabled={loc.id === fromLocId}>
                        {loc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs">{lang === "it" ? "Quantità da trasferire" : "Quantity to transfer"}</Label>
              <Input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>

            <Button onClick={handleTransfer} disabled={!productId || fromLocId === toLocId || fromStock <= 0} className="w-full">
              {lang === "it" ? "Trasferisci Stock" : "Transfer Stock"}
            </Button>
          </div>

          {/* Transfer Preview Card */}
          <div className="border rounded-xl p-4 bg-muted/30 flex flex-col justify-center space-y-4">
            <h4 className="font-semibold text-sm border-b pb-2">{lang === "it" ? "Riepilogo Scorte" : "Stock Levels Preview"}</h4>
            {selectedProduct ? (
              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">{lang === "it" ? "Prodotto:" : "Product:"}</span>
                  <span className="font-semibold text-sm">{selectedProduct.name}</span>
                </div>
                <div className="flex justify-between items-center p-2.5 bg-card rounded border">
                  <span>{locations.find((l) => l.id === fromLocId)?.name}</span>
                  <span className="font-bold font-mono text-sm">{fromStock} pz</span>
                </div>
                <div className="text-center font-bold text-muted-foreground text-sm">↓</div>
                <div className="flex justify-between items-center p-2.5 bg-card rounded border">
                  <span>{locations.find((l) => l.id === toLocId)?.name}</span>
                  <span className="font-bold font-mono text-sm">{toStock} pz</span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic text-center py-6">
                {lang === "it" ? "Seleziona un prodotto per vedere le scorte locali" : "Select a product to view local stock levels"}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DynamicPricingTab() {
  const t = useT();
  const lang = useCurrentLang();
  const getDynamicPricingSuggestions = useStore((s) => s.getDynamicPricingSuggestions);
  const applyPricingSuggestion = useStore((s) => s.applyPricingSuggestion);

  const suggestions = useMemo(() => getDynamicPricingSuggestions(), [getDynamicPricingSuggestions]);

  const [localSuggestions, setLocalSuggestions] = useState(suggestions);

  const handleApply = (productId: string, suggestedPrice: number) => {
    applyPricingSuggestion(productId, suggestedPrice);
    setLocalSuggestions(localSuggestions.filter((s) => s.product_id !== productId));
    toast.success(lang === "it" ? "Prezzo aggiornato correttamente" : "Price updated successfully");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          {lang === "it" ? "Suggerimenti Prezzi Dinamici" : "Dynamic Pricing Suggestions"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          {lang === "it"
            ? "L'algoritmo analizza la velocità di vendita degli ultimi 7 giorni, lo stock morto oltre i 30 giorni e i lotti in scadenza nei prossimi 10 giorni per consigliare variazioni di prezzo ottimali."
            : "The algorithm analyzes sales velocity from the last 7 days, dead stock older than 30 days, and lots expiring in the next 10 days to recommend optimal price adjustments."}
        </p>

        {localSuggestions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">
            {lang === "it" ? "Nessun suggerimento di prezzo disponibile al momento." : "No pricing suggestions available at this time."}
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {localSuggestions.map((s) => (
              <div key={`${s.product_id}-${s.suggested_price}`} className="border p-4 rounded-xl bg-card hover:shadow-soft transition-all space-y-3 flex flex-col justify-between">
                <div className="space-y-1.5">
                  <div className="font-semibold text-sm">{s.product_name}</div>
                  <Badge variant="outline" className="text-[10px] bg-muted/40 font-medium">
                    {t(s.reason)}
                  </Badge>
                </div>
                <div className="flex items-center justify-between pt-2 border-t text-xs">
                  <div className="flex gap-4">
                    <div>
                      <span className="text-muted-foreground block text-[9px]">{lang === "it" ? "PREZZO ATTUALE" : "CURRENT PRICE"}</span>
                      <span className="font-semibold line-through text-muted-foreground font-mono">{formatEUR(s.current_price)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[9px]">{lang === "it" ? "SUGGERITO" : "SUGGESTED"}</span>
                      <span className="font-bold text-primary font-mono text-sm">{formatEUR(s.suggested_price)}</span>
                    </div>
                  </div>
                  <Button size="sm" onClick={() => handleApply(s.product_id, s.suggested_price)}>
                    {lang === "it" ? "Applica Prezzo" : "Apply Price"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

