import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useSessionState } from "@/hooks/useSessionState";
import { Search, Receipt, Undo2, Trash2, Printer, Download, Eye } from "lucide-react";
import { PageHeader } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useStore, formatEUR, downloadCsv } from "@/lib/store";
import { useT, useCurrentLang } from "@/lib/i18n";
import type { Order } from "@/lib/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PartialRefundDialog } from "@/components/PartialRefundDialog";


export const Route = createFileRoute("/orders")({
  head: () => ({
    meta: [
      { title: "Storico Vendite — Soldo" },
      { name: "description", content: "Gestisci, rimborsa o elimina vendite." },
    ],
  }),
  component: OrdersPage,
});

function OrdersPage() {
  const t = useT();
  const lang = useCurrentLang();
  const orders = useStore((s) => s.orders);
  const locations = useStore((s) => s.locations);
  const config = useStore((s) => s.config);
  const deleteOrder = useStore((s) => s.deleteOrder);
  const currentLocation = useStore((s) => s.currentLocation);

  const [search, setSearch] = useSessionState("orders-search", "");
  const [payment, setPayment] = useSessionState<"all" | "elettronico" | "contanti">("orders-payment", "all");
  const [status, setStatus] = useSessionState<"all" | "active" | "refunded" | "refund">("orders-status", "all");
  const [detail, setDetail] = useState<Order | null>(null);
  const [refunding, setRefunding] = useState<Order | null>(null);


  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const locId = currentLocation?.id;
    return orders.filter((o) => {
      if (locId && o.location_id !== locId) return false;
      if (payment !== "all" && o.payment_method !== payment) return false;
      if (status === "active" && (o.refunded || o.refund_of)) return false;
      if (status === "refunded" && !o.refunded) return false;
      if (status === "refund" && !o.refund_of) return false;
      if (!q) return true;
      return (
        o.transmission_id?.toLowerCase().includes(q) ||
        (o.customer_name ?? "").toLowerCase().includes(q) ||
        o.items.some((it) => it.product_name.toLowerCase().includes(q))
      );
    });
  }, [orders, search, payment, status]);

  function handleExport() {
    downloadCsv(
      `vendite-${new Date().toISOString().slice(0, 10)}.csv`,
      ["id", "date", "transmission_id", "payment", "customer", "items", "gross", "net", "vat", "status"],
      filtered.map((o) => [
        o.id,
        o.created_at,
        o.transmission_id ?? "",
        o.payment_method,
        o.customer_name ?? "",
        o.items.map((i) => `${i.quantity}× ${i.product_name}`).join(" | "),
        o.total_gross.toFixed(2),
        o.total_net.toFixed(2),
        o.total_vat.toFixed(2),
        o.refund_of ? "refund" : o.refunded ? "refunded" : "active",
      ]),
    );
  }

  function printReceipt(o: Order) {
    const w = window.open("", "_blank", "width=380,height=600");
    if (!w) return;
    const lines = o.items
      .map((i) => `<tr><td>${i.quantity}× ${i.product_name}</td><td style="text-align:right">${formatEUR(i.total_gross)}</td></tr>`)
      .join("");
    
    const title = lang === "it" ? `Scontrino ${o.transmission_id}` : `Receipt ${o.transmission_id}`;
    const customerLabel = lang === "it" ? "Cliente" : "Customer";
    const discountLabel = lang === "it" ? "Sconto" : "Discount";
    const netLabel = lang === "it" ? "Netto" : "Net";
    const vatLabel = lang === "it" ? "IVA" : "VAT";
    const totalLabel = lang === "it" ? "TOTALE" : "TOTAL";
    const paymentLabel = lang === "it" ? "Pagamento" : "Payment";
    const paymentVal = o.payment_method === "contanti" ? t("sale.payment.cash") : t("sale.payment.card");
    const lotteryLabel = lang === "it" ? "Lotteria" : "Lottery";

    w.document.write(`<!doctype html><html><head><title>${title}</title>
      <style>body{font:12px/1.4 monospace;padding:12px;max-width:300px}h1{font-size:14px;margin:0 0 4px}table{width:100%;border-collapse:collapse;margin:8px 0}td{padding:2px 0}hr{border:0;border-top:1px dashed #999;margin:6px 0}.tot{font-size:14px;font-weight:bold}</style>
      </head><body>
      <h1>${config.store_name || "Bottega"}</h1>
      <div>${config.address ?? ""}</div>
      <div>P.IVA ${config.partita_iva || "—"}</div>
      <hr/>
      <div>${new Date(o.created_at).toLocaleString(lang === "it" ? "it-IT" : "en-US")}</div>
      <div>ID ${o.transmission_id}</div>
      ${o.customer_name ? `<div>${customerLabel}: ${o.customer_name}</div>` : ""}
      <table>${lines}</table>
      ${o.discount ? `<div>${discountLabel}: −${formatEUR(o.discount)}</div>` : ""}
      <hr/>
      <table>
        <tr><td>${netLabel}</td><td style="text-align:right">${formatEUR(o.total_net)}</td></tr>
        <tr><td>${vatLabel}</td><td style="text-align:right">${formatEUR(o.total_vat)}</td></tr>
        <tr class="tot"><td>${totalLabel}</td><td style="text-align:right">${formatEUR(o.total_gross)}</td></tr>
      </table>
      <div>${paymentLabel}: ${paymentVal}</div>
      ${o.lottery_code ? `<div>${lotteryLabel}: ${o.lottery_code}</div>` : ""}
      <hr/>
      <div style="text-align:center">${config.receipt_footer ?? ""}</div>
      <script>window.print();</script>
      </body></html>`);
    w.document.close();
  }

  return (
    <>
      <PageHeader
        title={t("ord.title")}
        subtitle={t("ord.subtitle")}
        actions={
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">{t("common.export")}</span>
          </Button>
        }
      />
      <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-4">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("ord.search.ph")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <Select value={payment} onValueChange={(v) => setPayment(v as any)}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all")} · {t("ord.filter.payment")}</SelectItem>
              <SelectItem value="elettronico">{t("sale.payment.card")}</SelectItem>
              <SelectItem value="contanti">{t("sale.payment.cash")}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => setStatus(v as any)}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all")} · {t("ord.filter.status")}</SelectItem>
              <SelectItem value="active">{t("ord.status.active")}</SelectItem>
              <SelectItem value="refunded">{t("ord.status.refunded")}</SelectItem>
              <SelectItem value="refund">{t("ord.status.refund")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Mobile */}
        <div className="md:hidden space-y-2">
          {filtered.map((o) => {
            const locName = locations.find((l) => l.id === o.location_id)?.name ?? (lang === "it" ? "Globale" : "Global");
            return (
              <Card key={o.id}>
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <button type="button" onClick={() => setDetail(o)} className="text-left min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-[10px] text-muted-foreground truncate">{o.transmission_id}</span>
                        <StatusBadge o={o} />
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-background leading-none font-medium">
                          {locName}
                        </Badge>
                      </div>
                    <div className="text-sm font-medium truncate mt-0.5">
                      {o.items.map((i) => `${i.quantity}× ${i.product_name}`).join(", ")}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(o.created_at).toLocaleString(lang === "it" ? "it-IT" : "en-US")} · {o.payment_method === "contanti" ? t("sale.payment.cash") : t("sale.payment.card")}
                    </div>
                  </button>
                  <div
                    className={cn(
                      "text-right font-semibold tabular-nums",
                      o.total_gross < 0 && "text-destructive",
                    )}
                  >
                    {formatEUR(o.total_gross)}
                  </div>
                </div>
                <div className="flex gap-1 mt-2 justify-end">
                  <RowActions o={o} onView={() => setDetail(o)} onPrint={() => printReceipt(o)}
                    onRefund={() => setRefunding(o)}
                    onDelete={() => {
                      deleteOrder(o.id);
                      toast.success(t("ord.toast.deleted"));
                    }}
                  />

                </div>
              </CardContent>
            </Card>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">{t("ord.empty")}</p>
          )}
        </div>

        {/* Desktop */}
        <Card className="hidden md:block">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("common.date")}</TableHead>
                    <TableHead>{t("ord.tx")}</TableHead>
                    <TableHead>{lang === "it" ? "Sede" : "Location"}</TableHead>
                    <TableHead>{t("ord.detail.items")}</TableHead>
                    <TableHead>{t("sale.field.payment")}</TableHead>
                    <TableHead className="text-right">{t("common.total")}</TableHead>
                    <TableHead>{t("ord.filter.status")}</TableHead>
                    <TableHead className="text-right">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {new Date(o.created_at).toLocaleString(lang === "it" ? "it-IT" : "en-US")}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{o.transmission_id}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[11px] whitespace-nowrap bg-background font-medium">
                          {locations.find((l) => l.id === o.location_id)?.name ?? (lang === "it" ? "Globale" : "Global")}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[300px] truncate text-sm">
                        {o.items.map((i) => `${i.quantity}× ${i.product_name}`).join(", ")}
                      </TableCell>
                      <TableCell className="text-sm">{o.payment_method === "contanti" ? t("sale.payment.cash") : t("sale.payment.card")}</TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-semibold tabular-nums",
                          o.total_gross < 0 && "text-destructive",
                        )}
                      >
                        {formatEUR(o.total_gross)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge o={o} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => setDetail(o)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <RowActions
                            o={o}
                            onView={() => setDetail(o)}
                            onPrint={() => printReceipt(o)}
                            onRefund={() => setRefunding(o)}
                            onDelete={() => {
                              deleteOrder(o.id);
                              toast.success(t("ord.toast.deleted"));
                            }}
                            compact
                          />

                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        {t("ord.empty")}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detail */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        {detail && (
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5" /> {t("ord.detail.title")}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="font-mono">{detail.transmission_id}</Badge>
                <StatusBadge o={detail} />
                <Badge variant="secondary">{detail.payment_method === "contanti" ? t("sale.payment.cash") : t("sale.payment.card")}</Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                {new Date(detail.created_at).toLocaleString(lang === "it" ? "it-IT" : "en-US")}
              </div>
              {detail.customer_name && (
                <div>
                  <b>{t("common.customer")}:</b> {detail.customer_name}
                </div>
              )}
              <div className="border rounded-md divide-y">
                {detail.items.map((it) => (
                  <div key={it.id} className="flex justify-between p-2">
                    <div>
                      <div className="font-medium">{it.product_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {it.quantity} × {formatEUR(it.unit_price_gross)} · IVA {it.vat_rate}%
                      </div>
                    </div>
                    <div className="font-semibold tabular-nums">{formatEUR(it.total_gross)}</div>
                  </div>
                ))}
              </div>
              {detail.discount ? (
                <div className="flex justify-between text-destructive">
                  <span>{t("common.discount")}</span>
                  <span>− {formatEUR(detail.discount)}</span>
                </div>
              ) : null}
              <div className="grid grid-cols-3 gap-2 pt-2 border-t">
                <Stat label={t("acc.ledger.net")} value={formatEUR(detail.total_net)} />
                <Stat label={t("acc.ledger.vat")} value={formatEUR(detail.total_vat)} />
                <Stat label={t("common.total")} value={formatEUR(detail.total_gross)} bold />
              </div>
              {detail.note && (
                <div className="rounded-md bg-muted/40 p-2 text-xs">{detail.note}</div>
              )}
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => printReceipt(detail)}>
                  <Printer className="h-4 w-4 mr-2" /> {t("common.print")}
                </Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>

      <PartialRefundDialog order={refunding} onClose={() => setRefunding(null)} />
    </>
  );
}


function StatusBadge({ o }: { o: Order }) {
  const t = useT();
  if (o.refund_of) return <Badge variant="destructive" className="text-[10px]">{t("ord.status.refund")}</Badge>;
  if (o.refunded) return <Badge variant="outline" className="text-[10px]">{t("ord.status.refunded")}</Badge>;
  return <Badge variant="secondary" className="text-[10px]">{t("ord.status.active")}</Badge>;
}

function Stat({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="rounded-md border bg-card p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("tabular-nums", bold ? "font-bold text-base" : "font-medium")}>{value}</div>
    </div>
  );
}

function RowActions({
  o,
  onPrint,
  onRefund,
  onDelete,
  compact,
}: {
  o: Order;
  onView: () => void;
  onPrint: () => void;
  onRefund: () => void;
  onDelete: () => void;
  compact?: boolean;
}) {
  const t = useT();
  const canRefund = !o.refunded && !o.refund_of;
  return (
    <>
      <Button variant="ghost" size={compact ? "icon" : "sm"} onClick={onPrint}>
        <Printer className="h-4 w-4" />
        {!compact && <span className="ml-1">{t("common.print")}</span>}
      </Button>
      {canRefund && (
        <Button variant="ghost" size={compact ? "icon" : "sm"} onClick={onRefund}>
          <Undo2 className="h-4 w-4 text-warning" />
          {!compact && <span className="ml-1">{t("common.refund")}</span>}
        </Button>
      )}

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size={compact ? "icon" : "sm"}>
            <Trash2 className="h-4 w-4 text-destructive" />
            {!compact && <span className="ml-1">{t("common.delete")}</span>}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("ord.confirm.delete")}</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete}>{t("common.delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
