import { useEffect, useMemo, useState } from "react";
import { ScanLine, PackagePlus, Calendar as CalendarIcon, X } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStore } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import type { Product } from "@/lib/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  initialProductId?: string;
}

export function ReceiveLotDialog({ open, onClose, initialProductId }: Props) {
  const t = useT();
  const products = useStore((s) => s.products);
  const suppliers = useStore((s) => s.suppliers);
  const addLot = useStore((s) => s.addLot);

  const [productId, setProductId] = useState<string>(initialProductId ?? "");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [lotCode, setLotCode] = useState("");
  const [expiry, setExpiry] = useState("");
  const [qty, setQty] = useState<number>(1);
  const [cost, setCost] = useState<number | "">("");
  const [supplierId, setSupplierId] = useState<string>("__none");
  const [note, setNote] = useState("");
  const [productQuery, setProductQuery] = useState("");

  useEffect(() => {
    if (open) {
      setProductId(initialProductId ?? "");
      setLotCode("");
      setExpiry("");
      setQty(1);
      setCost("");
      setSupplierId("__none");
      setNote("");
      setProductQuery("");
    }
  }, [open, initialProductId]);

  const product = useMemo(() => products.find((p) => p.id === productId), [products, productId]);

  const filteredProducts = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    if (!q) return products.slice(0, 8);
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          (p.barcode ?? "").toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [products, productQuery]);

  function handleScan(code: string) {
    setScannerOpen(false);
    const hit = products.find(
      (p) => (p.barcode ?? "").toLowerCase() === code.toLowerCase() || p.sku.toLowerCase() === code.toLowerCase(),
    );
    if (hit) {
      setProductId(hit.id);
      if (!cost && hit.cost_price) setCost(hit.cost_price);
      toast.success(hit.name);
    } else {
      toast.error(t("scan.notfound"), { description: code });
    }
  }

  function submit() {
    if (!product) {
      toast.error(t("lot.err.product"));
      return;
    }
    if (!lotCode.trim()) {
      toast.error(t("lot.err.code"));
      return;
    }
    if (!qty || qty <= 0) {
      toast.error(t("lot.err.qty"));
      return;
    }
    const sup = suppliers.find((s) => s.id === supplierId);
    addLot({
      product_id: product.id,
      lot_code: lotCode.trim(),
      expiry_date: expiry || null,
      qty_received: qty,
      cost_price: cost === "" ? null : Number(cost),
      supplier_id: sup?.id ?? null,
      supplier_name: sup?.name ?? null,
      note: note || null,
    });
    toast.success(t("lot.toast.received"), { description: `${product.name} · ${lotCode} (+${qty})` });
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackagePlus className="h-5 w-5 text-primary" /> {t("lot.receive.title")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!product ? (
            <div className="space-y-2">
              <Label>{t("lot.product")}</Label>
              <div className="flex gap-2">
                <Input
                  autoFocus
                  placeholder={t("inv.search.ph")}
                  value={productQuery}
                  onChange={(e) => setProductQuery(e.target.value)}
                />
                <Button variant="outline" size="icon" onClick={() => setScannerOpen(true)} title={t("scan.btn")}>
                  <ScanLine className="h-4 w-4" />
                </Button>
              </div>
              <div className="max-h-48 overflow-y-auto rounded-md border divide-y">
                {filteredProducts.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setProductId(p.id);
                      if (!cost && p.cost_price) setCost(p.cost_price);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-accent text-sm flex justify-between gap-2"
                  >
                    <span className="truncate">{p.name}</span>
                    <span className="text-xs text-muted-foreground font-mono shrink-0">{p.sku}</span>
                  </button>
                ))}
                {filteredProducts.length === 0 && (
                  <div className="px-3 py-4 text-xs text-muted-foreground text-center">{t("common.empty")}</div>
                )}
              </div>
            </div>
          ) : (
            <SelectedProduct product={product} onClear={() => setProductId("")} />
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("lot.code")}</Label>
              <Input
                value={lotCode}
                onChange={(e) => setLotCode(e.target.value)}
                placeholder="L240601-A"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1">
                <CalendarIcon className="h-3 w-3" /> {t("lot.expiry")}
              </Label>
              <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("lot.qty")}</Label>
              <Input
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("lot.unit.cost")} (€)</Label>
              <Input
                type="number"
                step="0.01"
                value={cost}
                onChange={(e) => setCost(e.target.value === "" ? "" : parseFloat(e.target.value) || 0)}
                placeholder={product?.cost_price ? String(product.cost_price) : "—"}
              />
            </div>
          </div>

          {suppliers.length > 0 && (
            <div className="space-y-1.5">
              <Label>{t("acc.exp.supplier")}</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— {t("common.none")} —</SelectItem>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>{t("inv.adjust.note")}</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={!product || !lotCode.trim() || qty <= 0}>
            {t("lot.receive.confirm")}
          </Button>
        </DialogFooter>

        <BarcodeScanner open={scannerOpen} onClose={() => setScannerOpen(false)} onDecode={handleScan} />
      </DialogContent>
    </Dialog>
  );
}

function SelectedProduct({ product, onClear }: { product: Product; onClear: () => void }) {
  return (
    <div className={cn("flex items-center justify-between rounded-md border bg-accent/40 px-3 py-2")}>
      <div className="min-w-0">
        <div className="font-medium truncate">{product.name}</div>
        <div className="text-xs text-muted-foreground font-mono">{product.sku}</div>
      </div>
      <Button variant="ghost" size="icon" onClick={onClear} title="Change">
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
