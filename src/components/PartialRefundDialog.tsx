import { useMemo, useState } from "react";
import { Undo2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStore, formatEUR, computeRemainingPerItem } from "@/lib/store";
import { useT } from "@/lib/i18n";
import type { Order, RefundReason } from "@/lib/types";
import { toast } from "sonner";

const REASONS: RefundReason[] = [
  "defective",
  "wrong_item",
  "customer_changed_mind",
  "expired",
  "price_error",
  "duplicate",
  "other",
];

interface Props {
  order: Order | null;
  onClose: () => void;
}

export function PartialRefundDialog({ order, onClose }: Props) {
  const t = useT();
  const orders = useStore((s) => s.orders);
  const refundOrder = useStore((s) => s.refundOrder);

  const [mode, setMode] = useState<"full" | "partial">("full");
  const [qtyMap, setQtyMap] = useState<Record<string, number>>({});
  const [reason, setReason] = useState<RefundReason>("customer_changed_mind");
  const [note, setNote] = useState("");

  const remaining = useMemo(() => {
    if (!order) return new Map<string, number>();
    return computeRemainingPerItem(order, orders);
  }, [order, orders]);

  // Reset state when order changes
  useMemo(() => {
    if (order) {
      const init: Record<string, number> = {};
      for (const it of order.items) init[it.id] = remaining.get(it.id) ?? 0;
      setQtyMap(init);
      setMode("full");
      setReason("customer_changed_mind");
      setNote("");
    }
  }, [order?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!order) return null;

  const totalAvailable = Array.from(remaining.values()).reduce((a, b) => a + b, 0);
  if (totalAvailable === 0) {
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("ord.refund.title")}</DialogTitle>
            <DialogDescription>{t("ord.empty")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>{t("common.close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  const effectiveMap = mode === "full"
    ? Object.fromEntries(order.items.map((it) => [it.id, remaining.get(it.id) ?? 0]))
    : qtyMap;

  const refundAmount = order.items.reduce((sum, it) => {
    const q = Math.max(0, Math.min(effectiveMap[it.id] ?? 0, remaining.get(it.id) ?? 0));
    if (q === 0) return sum;
    return sum + (it.total_gross / it.quantity) * q;
  }, 0);

  function handleConfirm() {
    const items = order!.items
      .map((it) => ({ item_id: it.id, quantity: Math.max(0, Math.min(effectiveMap[it.id] ?? 0, remaining.get(it.id) ?? 0)) }))
      .filter((x) => x.quantity > 0);
    if (items.length === 0) {
      toast.error(t("ord.refund.err.zero"));
      return;
    }
    const fullReason = note ? `${t(`reason.${reason}`)} — ${note}` : t(`reason.${reason}`);
    const r = refundOrder(order!.id, { items, reason: fullReason });
    if (r) {
      toast.success(`${t("ord.toast.refunded")} · ${r.transmission_id}`, {
        description: `${formatEUR(Math.abs(r.total_gross))} · ${t(`reason.${reason}`)}`,
      });
      onClose();
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Undo2 className="h-5 w-5" /> {t("ord.refund.title")}
          </DialogTitle>
          <DialogDescription className="font-mono text-xs">{order.transmission_id}</DialogDescription>
        </DialogHeader>

        <RadioGroup value={mode} onValueChange={(v) => setMode(v as "full" | "partial")} className="grid grid-cols-2 gap-2">
          <label className={`flex items-center gap-2 rounded-md border p-2.5 cursor-pointer text-sm ${mode === "full" ? "border-primary bg-primary/5" : ""}`}>
            <RadioGroupItem value="full" /> {t("ord.refund.full")}
          </label>
          <label className={`flex items-center gap-2 rounded-md border p-2.5 cursor-pointer text-sm ${mode === "partial" ? "border-primary bg-primary/5" : ""}`}>
            <RadioGroupItem value="partial" /> {t("ord.refund.partial")}
          </label>
        </RadioGroup>

        <div className="space-y-2 max-h-[260px] overflow-y-auto">
          {order.items.map((it) => {
            const left = remaining.get(it.id) ?? 0;
            const isDisabled = mode === "full" || left === 0;
            const q = mode === "full" ? left : (qtyMap[it.id] ?? 0);
            return (
              <div key={it.id} className="flex items-center gap-2 text-sm border rounded-md p-2">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{it.product_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatEUR(it.unit_price_gross)} · {t("ord.refund.remaining")}: {left}/{it.quantity}
                  </div>
                </div>
                <Input
                  type="number"
                  min={0}
                  max={left}
                  disabled={isDisabled}
                  value={q || ""}
                  onChange={(e) =>
                    setQtyMap((m) => ({
                      ...m,
                      [it.id]: Math.max(0, Math.min(left, parseInt(e.target.value) || 0)),
                    }))
                  }
                  className="w-20 h-8 text-center tabular-nums"
                />
              </div>
            );
          })}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">{t("ord.refund.reason")}</Label>
          <Select value={reason} onValueChange={(v) => setReason(v as RefundReason)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {REASONS.map((r) => (
                <SelectItem key={r} value={r}>{t(`reason.${r}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">{t("ord.refund.note")}</Label>
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>

        <div className="flex items-center justify-between border-t pt-3">
          <span className="text-sm text-muted-foreground">{t("ord.refund.amount")}</span>
          <span className="text-lg font-bold tabular-nums text-destructive">
            − {formatEUR(refundAmount)}
          </span>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={handleConfirm} disabled={refundAmount === 0}>
            {t("ord.refund.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
