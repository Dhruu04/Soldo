import { useMemo, useState } from "react";
import { Layers, Plus, Trash2, AlertTriangle, Calendar as CalendarIcon } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useStore, expiryStatus, daysUntil, formatEUR } from "@/lib/store";
import { useT } from "@/lib/i18n";
import type { Product } from "@/lib/types";
import { ReceiveLotDialog } from "./ReceiveLotDialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Props {
  product: Product | null;
  open: boolean;
  onClose: () => void;
}

export function LotsManager({ product, open, onClose }: Props) {
  const t = useT();
  const allLots = useStore((s) => s.lots);
  const updateLot = useStore((s) => s.updateLot);
  const deleteLot = useStore((s) => s.deleteLot);
  const updateProduct = useStore((s) => s.updateProduct);
  const cfgAlert = useStore((s) => s.config.expiry_alert_days ?? 14);
  const [receiveOpen, setReceiveOpen] = useState(false);

  const alertDays = product?.expiry_alert_days ?? cfgAlert;

  const lots = useMemo(() => {
    if (!product) return [];
    return allLots
      .filter((l) => l.product_id === product.id)
      .sort((a, b) => {
        const ax = a.expiry_date ?? "9999-12-31";
        const bx = b.expiry_date ?? "9999-12-31";
        return ax < bx ? -1 : 1;
      });
  }, [allLots, product]);

  const totals = useMemo(() => {
    const onHand = lots.reduce((a, l) => a + l.qty_remaining, 0);
    const value = lots.reduce((a, l) => a + l.qty_remaining * (l.cost_price ?? product?.cost_price ?? 0), 0);
    return { onHand, value };
  }, [lots, product]);

  if (!product) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary" /> {t("lot.mgr.title")} — {product.name}
            </DialogTitle>
          </DialogHeader>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex gap-2 text-xs">
              <Badge variant="secondary">{t("lot.mgr.onhand")}: {totals.onHand}</Badge>
              <Badge variant="outline">{t("lot.mgr.value")}: {formatEUR(totals.value)}</Badge>
              <Badge variant="outline">{t("lot.mgr.alertdays")}: {alertDays}</Badge>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => {
                updateProduct(product.id, { track_lots: !product.track_lots });
                toast.success(product.track_lots ? t("lot.tracking.off") : t("lot.tracking.on"));
              }}>
                {product.track_lots ? t("lot.tracking.disable") : t("lot.tracking.enable")}
              </Button>
              <Button size="sm" onClick={() => setReceiveOpen(true)}>
                <Plus className="h-4 w-4 mr-1" /> {t("lot.receive.title")}
              </Button>
            </div>
          </div>

          {lots.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("lot.mgr.empty")}</p>
          ) : (
            <div className="max-h-[400px] overflow-y-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("lot.code")}</TableHead>
                    <TableHead>{t("lot.expiry")}</TableHead>
                    <TableHead className="text-right">{t("lot.mgr.remaining")}</TableHead>
                    <TableHead className="text-right">{t("lot.unit.cost")}</TableHead>
                    <TableHead>{t("acc.exp.supplier")}</TableHead>
                    <TableHead className="text-right">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lots.map((l) => {
                    const st = expiryStatus(l.expiry_date, alertDays);
                    const days = l.expiry_date ? daysUntil(l.expiry_date) : null;
                    return (
                      <TableRow key={l.id}>
                        <TableCell className="font-mono text-xs">{l.lot_code}</TableCell>
                        <TableCell>
                          {l.expiry_date ? (
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 text-xs",
                                st === "expired" && "text-destructive font-medium",
                                st === "soon" && "text-warning font-medium",
                              )}
                            >
                              <CalendarIcon className="h-3 w-3" />
                              {l.expiry_date}
                              {st === "expired" && (
                                <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                                  {t("lot.status.expired")}
                                </Badge>
                              )}
                              {st === "soon" && days != null && (
                                <Badge className="bg-warning text-warning-foreground text-[10px] px-1.5 py-0">
                                  {days}d
                                </Badge>
                              )}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            min={0}
                            value={l.qty_remaining}
                            onChange={(e) =>
                              updateLot(l.id, { qty_remaining: Math.max(0, parseInt(e.target.value) || 0) })
                            }
                            className="h-7 w-20 text-right text-sm inline-block"
                          />
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums">
                          {l.cost_price != null ? formatEUR(l.cost_price) : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground truncate max-w-[120px]">
                          {l.supplier_name ?? "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (confirm(t("lot.confirm.delete"))) {
                                deleteLot(l.id);
                                toast.success(t("lot.toast.deleted"));
                              }
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {!product.track_lots && lots.length === 0 && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 text-warning" /> {t("lot.tracking.hint")}
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              {t("common.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ReceiveLotDialog
        open={receiveOpen}
        onClose={() => setReceiveOpen(false)}
        initialProductId={product.id}
      />
    </>
  );
}
