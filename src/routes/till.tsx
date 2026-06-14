import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useSessionState } from "@/hooks/useSessionState";
import {
  Wallet,
  Lock,
  Unlock,
  ArrowDownToLine,
  ArrowUpFromLine,
  FileText,
  Trash2,
  Receipt,
  CircleDollarSign,
  CreditCard,
  AlertCircle,
  CheckCircle2,
  History,
  Printer,
  Calculator
} from "lucide-react";
import { PageHeader } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useStore, formatEUR, computeShiftSummary, downloadCsv } from "@/lib/store";
import { useT, useCurrentLang } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Shift } from "@/lib/types";

export const Route = createFileRoute("/till")({
  head: () => ({
    meta: [
      { title: "Cassa & Turni — Soldo" },
      { name: "description", content: "Apertura cassa, chiusura turno, report X e Z." },
    ],
  }),
  component: TillPage,
});

function TillPage() {
  const t = useT();
  const lang = useCurrentLang();
  const shifts = useStore((s) => s.shifts);
  const orders = useStore((s) => s.orders);
  const cashMovements = useStore((s) => s.cashMovements);
  const openShift = useStore((s) => s.openShift);
  const closeShift = useStore((s) => s.closeShift);
  const addCashMovement = useStore((s) => s.addCashMovement);
  const deleteShift = useStore((s) => s.deleteShift);
  const config = useStore((s) => s.config);
  const currentLocation = useStore((s) => s.currentLocation);
  const locations = useStore((s) => s.locations);

  const current = shifts.find((s) => s.status === "open" && s.location_id === currentLocation?.id) ?? null;
  const summary = current ? computeShiftSummary(current, orders, cashMovements) : null;

  const [openDialog, setOpenDialog] = useState(false);
  const [closeDialog, setCloseDialog] = useState(false);
  const [movDialog, setMovDialog] = useState<null | "paid_in" | "paid_out">(null);
  const [xReportOpen, setXReportOpen] = useState(false);
  const [zReport, setZReport] = useState<Shift | null>(null);

  // Open shift form
  const [registerName, setRegisterName] = useSessionState("till-registerName", "Cassa 1");
  const [cashier, setCashier] = useSessionState("till-cashier", "");
  const [openingFloat, setOpeningFloat] = useSessionState("till-openingFloat", "100");
  const [openNote, setOpenNote] = useSessionState("till-openNote", "");
  const [showOpenCalculator, setShowOpenCalculator] = useState(false);
  const [openCounts, setOpenCounts] = useSessionState<Record<string, number>>("till-openCounts", {});

  // Close shift form
  const [counted, setCounted] = useSessionState("till-counted", "");
  const [closeNote, setCloseNote] = useSessionState("till-closeNote", "");
  const [showCloseCalculator, setShowCloseCalculator] = useState(false);

  // Movement form
  const [movAmount, setMovAmount] = useSessionState("till-movAmount", "");
  const [movReason, setMovReason] = useSessionState("till-movReason", "");

  // Print area state
  const [printData, setPrintData] = useState<{ summary: any; isZ: boolean } | null>(null);

  const closedShifts = shifts.filter((s) => s.status === "closed" && s.location_id === currentLocation?.id).slice(0, 20);

  // Update open calculator cashier name to match current store user
  const activeUser = useStore((s) => s.currentUser);
  useEffect(() => {
    if (activeUser) {
      setCashier(activeUser.name);
    }
  }, [activeUser]);

  function handleOpen() {
    openShift({
      register_name: registerName,
      cashier: cashier || null,
      opening_float: parseFloat(openingFloat) || 0,
      note: openNote || null,
      cash_denominations: openCounts,
    });
    setOpenDialog(false);
    setOpenNote("");
    setOpenCounts({});
    setShowOpenCalculator(false);
    toast.success(t("till.toast.opened"));
  }

  function handleClose() {
    const c = parseFloat(counted);
    if (isNaN(c) || c < 0) return toast.error(t("till.err.counted"));
    const closed = closeShift({ counted_cash: c, note: closeNote || null });
    if (closed) {
      setZReport(closed);
      setCloseDialog(false);
      setCounted("");
      setCloseNote("");
      setShowCloseCalculator(false);
      toast.success(t("till.toast.closed"));
    }
  }

  function handleMovement() {
    if (!movDialog) return;
    const amt = parseFloat(movAmount);
    if (isNaN(amt) || amt <= 0) return toast.error(t("till.err.amount"));
    if (movDialog === "paid_out" && summary && amt > summary.expected_cash) {
      return toast.error(
        lang === "it"
          ? "Importo da prelevare superiore al contante disponibile!"
          : "Withdrawal amount exceeds available cash!"
      );
    }
    const m = addCashMovement({ kind: movDialog, amount: amt, reason: movReason });
    if (m) {
      toast.success(movDialog === "paid_in" ? t("till.toast.paidin") : t("till.toast.paidout"));
      setMovAmount("");
      setMovReason("");
      setMovDialog(null);
    }
  }

  const handlePrint = (reportSummary: any, isZ: boolean) => {
    setPrintData({ summary: reportSummary, isZ });
    setTimeout(() => {
      window.print();
    }, 100);
  };

  return (
    <>
      <PageHeader
        title={t("till.title")}
        subtitle={t("till.subtitle")}
        actions={
          current ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setXReportOpen(true)}>
                <FileText className="h-4 w-4 sm:mr-1.5" />
                <span className="hidden sm:inline">{t("till.x.btn")}</span>
              </Button>
              <Button size="sm" onClick={() => setCloseDialog(true)}>
                <Lock className="h-4 w-4 mr-1.5" />
                {t("till.close.btn")}
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={() => { setOpenCounts({}); setOpenDialog(true); }}>
              <Unlock className="h-4 w-4 mr-1.5" />
              {t("till.open.btn")}
            </Button>
          )
        }
      />

      <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 max-w-6xl w-full mx-auto print:hidden">
        {/* Current shift status */}
        {current && summary ? (
          <ActiveShiftCard
            summary={summary}
            onPaidIn={() => setMovDialog("paid_in")}
            onPaidOut={() => setMovDialog("paid_out")}
          />
        ) : (
          <Card className="border-dashed">
            <CardContent className="p-10 text-center space-y-3">
              <Wallet className="h-12 w-12 mx-auto text-muted-foreground/60" />
              <h3 className="font-semibold text-lg">{t("till.none.title")}</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">{t("till.none.desc")}</p>
              <Button onClick={() => { setOpenCounts({}); setOpenDialog(true); }} className="mt-2">
                <Unlock className="h-4 w-4 mr-1.5" /> {t("till.open.btn")}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Cash movements for current shift */}
        {current && (
          <CurrentShiftMovements
            shiftId={current.id}
            cashMovements={cashMovements}
            orders={orders}
            lang={lang}
          />
        )}

        {/* History */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <History className="h-4 w-4" /> {t("till.history.title")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {closedShifts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">{t("till.history.empty")}</p>
            ) : (
              <div className="divide-y">
                {closedShifts.map((s) => {
                  const sum = computeShiftSummary(s, orders, cashMovements);
                  const ok = Math.abs(sum.variance) < 0.01;
                  const locName = locations.find((l) => l.id === s.location_id)?.name ?? "Global";
                  return (
                    <div key={s.id} className="px-4 py-3 flex items-center gap-3 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm flex items-center gap-2 flex-wrap">
                          {s.register_name}
                          {s.cashier && <Badge variant="outline" className="text-[10px]">{s.cashier}</Badge>}
                          <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary border-primary/20">{locName}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(s.opened_at).toLocaleString(lang === "it" ? "it-IT" : "en-US")}
                          {" → "}
                          {s.closed_at && new Date(s.closed_at).toLocaleString(lang === "it" ? "it-IT" : "en-US")}
                        </div>
                      </div>
                      <div className="text-right text-xs">
                        <div className="text-muted-foreground">{t("till.net.sales")}</div>
                        <div className="font-semibold tabular-nums">{formatEUR(sum.net_sales)}</div>
                      </div>
                      <div className="text-right text-xs">
                        <div className="text-muted-foreground">{t("till.variance")}</div>
                        <div className={cn("font-semibold tabular-nums", ok ? "text-emerald-600" : "text-destructive")}>
                          {sum.variance > 0 ? "+" : ""}{formatEUR(sum.variance)}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setZReport(s)}>
                          <Receipt className="h-3.5 w-3.5 mr-1" /> Z
                        </Button>
                        <DeleteShiftButton onConfirm={() => deleteShift(s.id)} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Open dialog */}
      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="max-w-md rounded-xl">
          <DialogHeader>
            <DialogTitle>{t("till.open.title")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
            <div>
              <Label className="text-xs">{t("till.register")}</Label>
              <Input value={registerName} onChange={(e) => setRegisterName(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">{t("till.cashier")}</Label>
              <Input value={cashier} onChange={(e) => setCashier(e.target.value)} placeholder={t("common.optional")} />
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <Label className="text-xs">{t("till.opening.float")}</Label>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[10px] gap-1 px-1.5 text-primary"
                  onClick={() => setShowOpenCalculator(!showOpenCalculator)}
                >
                  <Calculator className="h-3 w-3" />
                  {t("till.counts.denominations")}
                </Button>
              </div>
              <Input type="number" step="0.01" min="0" value={openingFloat} onChange={(e) => setOpeningFloat(e.target.value)} />
              {showOpenCalculator && (
                <div className="mt-2">
                  <DenominationsCounter
                    onValueChange={(v) => setOpeningFloat(v.toFixed(2))}
                    onCountsChange={setOpenCounts}
                  />
                </div>
              )}
              <p className="text-[11px] text-muted-foreground mt-1">{t("till.opening.help")}</p>
            </div>
            <div>
              <Label className="text-xs">{t("common.notes")}</Label>
              <Textarea rows={2} value={openNote} onChange={(e) => setOpenNote(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDialog(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleOpen}><Unlock className="h-4 w-4 mr-1.5" />{t("till.open.btn")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close dialog */}
      <Dialog open={closeDialog} onOpenChange={setCloseDialog}>
        <DialogContent className="max-w-md rounded-xl">
          <DialogHeader>
            <DialogTitle>{t("till.close.title")}</DialogTitle>
          </DialogHeader>
          {summary && (
            <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
              <div className="rounded-md border bg-muted/40 p-3 space-y-1.5 text-sm">
                <Row label={t("till.opening.float")} value={formatEUR(summary.shift.opening_float)} />
                <Row label={t("till.sales.cash")} value={formatEUR(summary.sales_cash)} />
                <Row label={t("till.refunds.cash")} value={`− ${formatEUR(summary.refunds_cash)}`} />
                <Row label={t("till.paidin")} value={`+ ${formatEUR(summary.paid_in)}`} />
                <Row label={t("till.paidout")} value={`− ${formatEUR(summary.paid_out)}`} />
                <Separator className="my-1.5" />
                <Row label={t("till.expected.cash")} value={formatEUR(summary.expected_cash)} bold />
              </div>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <Label className="text-xs">{t("till.counted.cash")}</Label>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[10px] gap-1 px-1.5 text-primary"
                    onClick={() => setShowCloseCalculator(!showCloseCalculator)}
                  >
                    <Calculator className="h-3 w-3" />
                    {t("till.counts.denominations")}
                  </Button>
                </div>
                <Input type="number" step="0.01" min="0" value={counted} onChange={(e) => setCounted(e.target.value)} autoFocus />
                {showCloseCalculator && (
                  <div className="mt-2">
                    <DenominationsCounter
                      onValueChange={(v) => setCounted(v.toFixed(2))}
                      initialCounts={current?.cash_denominations ?? {}}
                    />
                  </div>
                )}
                {counted && !isNaN(parseFloat(counted)) && (
                  <p className={cn(
                    "text-xs mt-1 font-medium tabular-nums",
                    Math.abs(parseFloat(counted) - summary.expected_cash) < 0.01
                      ? "text-emerald-600"
                      : "text-destructive",
                  )}>
                    {t("till.variance")}: {parseFloat(counted) - summary.expected_cash > 0 ? "+" : ""}
                    {formatEUR(parseFloat(counted) - summary.expected_cash)}
                  </p>
                )}
              </div>
              <div>
                <Label className="text-xs">{t("common.notes")}</Label>
                <Textarea rows={2} value={closeNote} onChange={(e) => setCloseNote(e.target.value)} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseDialog(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleClose}><Lock className="h-4 w-4 mr-1.5" />{t("till.close.btn")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Movement dialog */}
      <Dialog open={movDialog !== null} onOpenChange={(o) => !o && setMovDialog(null)}>
        <DialogContent className="rounded-xl max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {movDialog === "paid_in" ? t("till.paidin.title") : t("till.paidout.title")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">{t("common.amount")}</Label>
              <Input type="number" step="0.01" min="0.01" value={movAmount} onChange={(e) => setMovAmount(e.target.value)} autoFocus />
            </div>
            <div>
              <Label className="text-xs">{t("till.reason")}</Label>
              <Input value={movReason} onChange={(e) => setMovReason(e.target.value)} placeholder={movDialog === "paid_in" ? "es. Fondo extra" : "es. Pagamento fornitore"} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMovDialog(null)}>{t("common.cancel")}</Button>
            <Button onClick={handleMovement}>{t("common.confirm")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* X Report */}
      {current && summary && (
        <Dialog open={xReportOpen} onOpenChange={setXReportOpen}>
          <DialogContent className="max-w-md rounded-xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-4 w-4" /> {t("till.x.title")}
              </DialogTitle>
            </DialogHeader>
            <ReportBody summary={summary} lang={lang} t={t} isZ={false} />
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => handlePrint(summary, false)}>
                <Printer className="h-4 w-4 mr-1.5" /> {t("till.btn.print")}
              </Button>
              <Button variant="outline" onClick={() => downloadReportCsv(summary, false)}>
                {t("common.export")} CSV
              </Button>
              <Button onClick={() => setXReportOpen(false)}>{t("common.close")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Z Report */}
      {zReport && (() => {
        const sum = computeShiftSummary(zReport, orders, cashMovements);
        return (
          <Dialog open={!!zReport} onOpenChange={(o) => !o && setZReport(null)}>
            <DialogContent className="max-w-md rounded-xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Receipt className="h-4 w-4" /> {t("till.z.title")}
                </DialogTitle>
              </DialogHeader>
              <ReportBody summary={sum} lang={lang} t={t} isZ={true} />
              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" onClick={() => handlePrint(sum, true)}>
                  <Printer className="h-4 w-4 mr-1.5" /> {t("till.btn.print")}
                </Button>
                <Button variant="outline" onClick={() => downloadReportCsv(sum, true)}>
                  {t("common.export")} CSV
                </Button>
                <Button onClick={() => setZReport(null)}>{t("common.close")}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* Printable Thermal Receipt Container */}
      {printData && (
        <div id="thermal-report-receipt" className="hidden print:block print:w-[80mm] print:p-2 print:text-black print:bg-white print:font-mono print:text-[10px] print:leading-tight">
          <div className="text-center font-bold text-xs uppercase tracking-wider mb-2 border-b border-dashed pb-2">
            <div>{config.store_name || "SOLDO ERP"}</div>
            <div className="font-normal text-[9px] lowercase">{config.address || "Roma, Italia"}</div>
            <div className="font-normal text-[9px]">P.IVA: {config.partita_iva || "00000000000"}</div>
            <div className="mt-2 border-t border-dashed pt-1 text-[11px]">
              {printData.isZ ? "Z REPORT - CHIUSURA CASSA" : "X REPORT - LETTURA CASSA"}
            </div>
          </div>
          <div className="space-y-1 mb-2 border-b border-dashed pb-2">
            <div className="flex justify-between">
              <span>Cassa:</span> <span>{printData.summary.shift.register_name}</span>
            </div>
            <div className="flex justify-between">
              <span>Cassiere:</span> <span>{printData.summary.shift.cashier || "N/A"}</span>
            </div>
            <div className="flex justify-between">
              <span>Data Apertura:</span> <span>{new Date(printData.summary.shift.opened_at).toLocaleDateString()}</span>
            </div>
            {printData.summary.shift.closed_at && (
              <div className="flex justify-between">
                <span>Data Chiusura:</span> <span>{new Date(printData.summary.shift.closed_at).toLocaleDateString()}</span>
              </div>
            )}
          </div>
          
          <div className="space-y-1 border-b border-dashed pb-2 mb-2 font-mono">
            <div className="flex justify-between">
              <span>Fondo Cassa:</span> <span>{formatEUR(printData.summary.shift.opening_float)}</span>
            </div>
            <div className="flex justify-between">
              <span>Vendite Contanti:</span> <span>{formatEUR(printData.summary.sales_cash)}</span>
            </div>
            <div className="flex justify-between">
              <span>Vendite Elettronico:</span> <span>{formatEUR(printData.summary.sales_card)}</span>
            </div>
            <div className="flex justify-between text-red-600">
              <span>Rimborsi Contanti:</span> <span>-{formatEUR(printData.summary.refunds_cash)}</span>
            </div>
            <div className="flex justify-between text-red-600">
              <span>Rimborsi Elettronico:</span> <span>-{formatEUR(printData.summary.refunds_card)}</span>
            </div>
            <div className="flex justify-between">
              <span>Versamenti (In):</span> <span>+{formatEUR(printData.summary.paid_in)}</span>
            </div>
            <div className="flex justify-between">
              <span>Prelievi (Out):</span> <span>-{formatEUR(printData.summary.paid_out)}</span>
            </div>
            <div className="flex justify-between font-bold border-t border-dotted mt-1 pt-1">
              <span>ATTESO IN CASSA:</span> <span>{formatEUR(printData.summary.expected_cash)}</span>
            </div>
            {printData.isZ && printData.summary.shift.counted_cash != null && (
              <>
                <div className="flex justify-between font-bold">
                  <span>CONTATO IN CASSA:</span> <span>{formatEUR(printData.summary.shift.counted_cash)}</span>
                </div>
                <div className={cn("flex justify-between font-bold border-t border-dotted pt-1", Math.abs(printData.summary.variance) < 0.01 ? "text-green-600" : "text-red-600")}>
                  <span>DISCREPANZA (Δ):</span> <span>{printData.summary.variance > 0 ? "+" : ""}{formatEUR(printData.summary.variance)}</span>
                </div>
              </>
            )}
          </div>

          <div className="text-center text-[8px] text-gray-500 uppercase mt-4">
            <div>Documento non fiscale</div>
            <div>Grazie per aver scelto Soldo</div>
          </div>
        </div>
      )}
    </>
  );
}

function ActiveShiftCard({
  summary,
  onPaidIn,
  onPaidOut,
}: {
  summary: ReturnType<typeof computeShiftSummary>;
  onPaidIn: () => void;
  onPaidOut: () => void;
}) {
  const t = useT();
  const lang = useCurrentLang();
  const s = summary.shift;
  const [showDrawerDenoms, setShowDrawerDenoms] = useState(false);

  const denoms = s.cash_denominations ?? {};
  const standardDenoms = [
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

  const denomEntries = standardDenoms.map(d => ({
    ...d,
    qty: denoms[d.val.toString()] || 0
  })).filter(x => x.qty > 0);

  const denomTotal = denomEntries.reduce((sum, d) => sum + d.val * d.qty, 0);
  const adjustment = +(summary.expected_cash - denomTotal).toFixed(2);

  return (
    <Card className="border-emerald-500/40 bg-emerald-50/40 dark:bg-emerald-500/5 animate-fade-in">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <h2 className="font-semibold text-lg">{s.register_name}</h2>
              {s.cashier && <Badge variant="outline">{s.cashier}</Badge>}
              <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
                {t("till.status.open")}
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {t("till.opened.at")}: {new Date(s.opened_at).toLocaleString(lang === "it" ? "it-IT" : "en-US")}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDrawerDenoms(!showDrawerDenoms)}
              className={showDrawerDenoms ? "bg-primary/10 text-primary border-primary/30" : ""}
            >
              <Calculator className="h-4 w-4 mr-1.5" />
              {lang === "it" ? "Tagli in Cassa" : "Drawer Denoms"}
            </Button>
            <Button variant="outline" size="sm" onClick={onPaidIn}>
              <ArrowDownToLine className="h-4 w-4 mr-1.5" /> {t("till.paidin")}
            </Button>
            <Button variant="outline" size="sm" onClick={onPaidOut}>
              <ArrowUpFromLine className="h-4 w-4 mr-1.5" /> {t("till.paidout")}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi
            icon={<Wallet className="h-4 w-4" />}
            label={t("till.expected.cash")}
            value={formatEUR(summary.expected_cash)}
            highlight
          />
          <Kpi
            icon={<CircleDollarSign className="h-4 w-4" />}
            label={t("till.sales.cash")}
            value={formatEUR(summary.sales_cash)}
          />
          <Kpi
            icon={<CreditCard className="h-4 w-4" />}
            label={t("till.sales.card")}
            value={formatEUR(summary.sales_card)}
          />
          <Kpi
            icon={<Receipt className="h-4 w-4" />}
            label={t("till.orders")}
            value={`${summary.order_count}${summary.refund_count ? ` (−${summary.refund_count})` : ""}`}
          />
        </div>

        {showDrawerDenoms && (
          <div className="border border-emerald-500/20 bg-background/50 dark:bg-background/10 rounded-lg p-4 space-y-3 animate-slide-down">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Wallet className="h-3.5 w-3.5 text-emerald-600" />
              {lang === "it" ? "Dettaglio Banconote e Monete in Cassa" : "Drawer Bill and Coin Breakdown"}
            </h3>
            {denomEntries.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                {lang === "it" 
                  ? "Nessun taglio registrato al momento. Esegui vendite in contanti o inserisci tagli all'apertura." 
                  : "No denominations recorded yet. Process cash sales or count opening float."}
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                {denomEntries.map(d => (
                  <div key={d.val} className="flex items-center justify-between px-3 py-1.5 rounded bg-muted/30 border text-xs">
                    <span className="font-mono text-muted-foreground">{d.label}</span>
                    <span className="font-bold font-mono text-foreground bg-muted-foreground/10 px-1.5 py-0.5 rounded">
                      × {d.qty}
                    </span>
                  </div>
                ))}
              </div>
            )}
            
            <div className="flex flex-col sm:flex-row justify-between border-t border-dashed pt-3 text-xs gap-2">
              <div className="flex items-center gap-2">
                <span>{lang === "it" ? "Totale Calcolato Tagli:" : "Total Calculated Denoms:"}</span>
                <span className="font-bold font-mono text-primary text-sm">{formatEUR(denomTotal)}</span>
              </div>
              {Math.abs(adjustment) > 0.01 && (
                <div className="text-muted-foreground flex items-center gap-1">
                  <span>
                    {lang === "it" 
                      ? `Regolazioni extra (movimenti/arrotondamenti):` 
                      : `Extra adjustments (movements/rounding):`}
                  </span>
                  <span className="font-mono font-medium">{adjustment > 0 ? "+" : ""}{formatEUR(adjustment)}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Kpi({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: string; highlight?: boolean }) {
  return (
    <div className={cn(
      "rounded-md border bg-card p-3",
      highlight && "border-primary/40 bg-primary/5",
    )}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon} {label}
      </div>
      <div className="mt-1 font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function CurrentShiftMovements({
  shiftId,
  cashMovements,
  orders,
  lang,
}: {
  shiftId: string;
  cashMovements: ReturnType<typeof useStore.getState>["cashMovements"];
  orders: ReturnType<typeof useStore.getState>["orders"];
  lang: "it" | "en";
}) {
  const t = useT();
  const shiftOrders = orders.filter((o) => o.shift_id === shiftId).slice(0, 8);
  const shiftMovs = cashMovements.filter((m) => m.shift_id === shiftId).slice(0, 8);
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("till.recent.sales")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {shiftOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">{t("common.empty")}</p>
          ) : (
            <div className="divide-y">
              {shiftOrders.map((o) => (
                <div key={o.id} className="px-4 py-2.5 flex items-center gap-2 text-sm">
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {o.transmission_id}
                  </Badge>
                  <div className="flex-1 min-w-0 text-xs text-muted-foreground">
                    {new Date(o.created_at).toLocaleTimeString(lang === "it" ? "it-IT" : "en-US", { hour: "2-digit", minute: "2-digit" })}
                    {" · "}
                    {o.payment_method === "contanti" ? t("sale.payment.cash") : t("sale.payment.card")}
                  </div>
                  <div className={cn("font-semibold tabular-nums", o.total_gross < 0 && "text-destructive")}>
                    {formatEUR(o.total_gross)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("till.cash.movements")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {shiftMovs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">{t("common.empty")}</p>
          ) : (
            <div className="divide-y">
              {shiftMovs.map((m) => (
                <div key={m.id} className="px-4 py-2.5 flex items-center gap-2 text-sm">
                  {m.kind === "paid_in" ? (
                    <ArrowDownToLine className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <ArrowUpFromLine className="h-3.5 w-3.5 text-destructive" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{m.reason}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {new Date(m.created_at).toLocaleTimeString(lang === "it" ? "it-IT" : "en-US", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                  <div className={cn("font-semibold tabular-nums", m.kind === "paid_in" ? "text-emerald-600" : "text-destructive")}>
                    {m.kind === "paid_in" ? "+" : "−"} {formatEUR(m.amount)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ReportBody({
  summary,
  lang,
  t,
  isZ,
}: {
  summary: ReturnType<typeof computeShiftSummary>;
  lang: "it" | "en";
  t: (k: string) => string;
  isZ: boolean;
}) {
  const s = summary.shift;
  const ok = Math.abs(summary.variance) < 0.01;
  return (
    <div className="space-y-3 text-sm">
      <div className="rounded-md border bg-muted/40 p-3 space-y-1">
        <div className="font-semibold">{s.register_name}{s.cashier ? ` · ${s.cashier}` : ""}</div>
        <div className="text-xs text-muted-foreground">
          {new Date(s.opened_at).toLocaleString(lang === "it" ? "it-IT" : "en-US")}
          {s.closed_at && (
            <> → {new Date(s.closed_at).toLocaleString(lang === "it" ? "it-IT" : "en-US")}</>
          )}
        </div>
      </div>
      <div className="space-y-1.5 font-mono">
        <Row label={t("till.opening.float")} value={formatEUR(s.opening_float)} />
        <Row label={t("till.sales.cash")} value={formatEUR(summary.sales_cash)} />
        <Row label={t("till.sales.card")} value={formatEUR(summary.sales_card)} />
        <Row label={t("till.refunds.cash")} value={`− ${formatEUR(summary.refunds_cash)}`} />
        <Row label={t("till.refunds.card")} value={`− ${formatEUR(summary.refunds_card)}`} />
        <Row label={t("till.paidin")} value={`+ ${formatEUR(summary.paid_in)}`} />
        <Row label={t("till.paidout")} value={`− ${formatEUR(summary.paid_out)}`} />
        <Separator className="my-1.5" />
        <Row label={t("till.net.sales")} value={formatEUR(summary.net_sales)} />
        <Row label={t("till.expected.cash")} value={formatEUR(summary.expected_cash)} bold />
        {isZ && s.counted_cash != null && (
          <>
            <Row label={t("till.counted.cash")} value={formatEUR(s.counted_cash)} bold />
            <div className={cn(
              "flex items-center justify-between font-semibold rounded-md px-2 py-1.5 font-mono",
              ok ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-destructive/10 text-destructive",
            )}>
              <span className="flex items-center gap-1.5 text-xs">
                {ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                {t("till.variance")}
              </span>
              <span className="tabular-nums">{summary.variance > 0 ? "+" : ""}{formatEUR(summary.variance)}</span>
            </div>
          </>
        )}
      </div>
      <div className="text-[11px] text-muted-foreground">
        {t("till.orders")}: {summary.order_count} · {t("common.refund")}: {summary.refund_count}
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between text-xs", bold && "font-semibold text-sm")}>
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function DeleteShiftButton({ onConfirm }: { onConfirm: () => void }) {
  const [open, setOpen] = useState(false);
  const t = useT();
  return (
    <>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(true)}>
        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent className="rounded-xl max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("till.delete.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("till.delete.desc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirm}>{t("common.delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function downloadReportCsv(summary: ReturnType<typeof computeShiftSummary>, isZ: boolean) {
  const s = summary.shift;
  const rows: (string | number)[][] = [
    ["Register", s.register_name],
    ["Cashier", s.cashier ?? ""],
    ["Opened", s.opened_at],
    ["Closed", s.closed_at ?? ""],
    ["Opening float", s.opening_float],
    ["Sales (cash)", summary.sales_cash],
    ["Sales (card)", summary.sales_card],
    ["Refunds (cash)", summary.refunds_cash],
    ["Refunds (card)", summary.refunds_card],
    ["Paid in", summary.paid_in],
    ["Paid out", summary.paid_out],
    ["Net sales", summary.net_sales],
    ["Expected cash", summary.expected_cash],
    ["Counted cash", s.counted_cash ?? ""],
    ["Variance", summary.variance],
    ["Orders", summary.order_count],
    ["Refunds", summary.refund_count],
  ];
  const prefix = isZ ? "z-report" : "x-report";
  downloadCsv(`${prefix}-${s.register_name}-${s.opened_at.slice(0, 10)}.csv`, ["Field", "Value"], rows);
}

function DenominationsCounter({
  onValueChange,
  onCountsChange,
  initialCounts = {},
}: {
  onValueChange: (val: number) => void;
  onCountsChange?: (counts: Record<string, number>) => void;
  initialCounts?: Record<string, number>;
}) {
  const lang = useCurrentLang();
  const denominations = [
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
  const [counts, setCounts] = useState<Record<number, number>>(() => {
    const init: Record<number, number> = {};
    Object.entries(initialCounts).forEach(([k, v]) => {
      init[parseFloat(k)] = v;
    });
    return init;
  });
  const total = Object.entries(counts).reduce((sum, [val, qty]) => sum + parseFloat(val) * qty, 0);

  useEffect(() => {
    onValueChange(total);
    if (onCountsChange) {
      const stringCounts: Record<string, number> = {};
      Object.entries(counts).forEach(([val, qty]) => {
        if (qty > 0) {
          stringCounts[val] = qty;
        }
      });
      onCountsChange(stringCounts);
    }
  }, [total, counts]);

  return (
    <div className="grid grid-cols-2 gap-2 border p-3 rounded-lg bg-muted/20">
      {denominations.map((d) => (
        <div key={d.val} className="flex items-center justify-between gap-1 text-[11px]">
          <span className="font-mono text-muted-foreground w-12">{d.label}</span>
          <Input
            type="number"
            min={0}
            placeholder="0"
            className="h-7 w-20 text-center text-xs px-1"
            value={counts[d.val] || ""}
            onChange={(e) => {
              const v = parseInt(e.target.value) || 0;
              setCounts((prev) => ({ ...prev, [d.val]: Math.max(0, v) }));
            }}
          />
        </div>
      ))}
      <div className="col-span-full border-t border-dashed pt-2 flex items-center justify-between text-xs font-bold mt-1">
        <span>{lang === "it" ? "Totale Calcolato:" : "Total Calculated:"}</span>
        <span className="text-primary font-mono text-sm">{formatEUR(total)}</span>
      </div>
    </div>
  );
}
