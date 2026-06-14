import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useSessionState } from "@/hooks/useSessionState";
import { Users, Clock, TrendingUp, DollarSign, Plus, UserPlus, CheckCircle2, PiggyBank, Briefcase, Pencil } from "lucide-react";
import { PageHeader } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { useStore, formatEUR } from "@/lib/store";
import { useT, useCurrentLang } from "@/lib/i18n";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { User } from "@/lib/types";

export const Route = createFileRoute("/staff")({
  head: () => ({
    meta: [
      { title: "Gestione Staff & Turni — Soldo" },
      { name: "description", content: "Presenze dipendenti, provvigioni, turni e stipendi." },
    ],
  }),
  component: StaffPage,
});

function StaffPage() {
  const t = useT();
  const lang = useCurrentLang();
  
  // Store selections
  const users = useStore((s) => s.users);
  const currentUser = useStore((s) => s.currentUser);
  const timeLogs = useStore((s) => s.timeLogs);
  const orders = useStore((s) => s.orders);
  const clockIn = useStore((s) => s.clockIn);
  const clockOut = useStore((s) => s.clockOut);
  const addUser = useStore((s) => s.addUser);
  const updateUser = useStore((s) => s.updateUser);
  const addExpense = useStore((s) => s.addExpense);

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  
  // Employee form fields
  const [empName, setEmpName] = useSessionState("staff-empName", "");
  const [empRole, setEmpRole] = useSessionState<"owner" | "manager" | "cashier">("staff-empRole", "cashier");
  const [empPin, setEmpPin] = useSessionState("staff-empPin", "");
  const [empRate, setEmpRate] = useSessionState("staff-empRate", "12");
  const [empCommission, setEmpCommission] = useSessionState("staff-empCommission", "2");

  const isOwnerOrManager = currentUser?.role === "owner" || currentUser?.role === "manager";
  const defaultTab = isOwnerOrManager ? "performance" : "clock";
  const [activeTab, setActiveTab] = useSessionState("staff-activeTab", defaultTab);
  const currentTab = (activeTab === "performance" || activeTab === "employees") && !isOwnerOrManager ? "clock" : activeTab;

  // Calculate staff performance metrics
  const staffPerformance = useMemo(() => {
    return users.map((user) => {
      // 1. Calculate hours worked
      const logs = timeLogs.filter((l) => l.user_id === user.id);
      let totalMs = 0;
      logs.forEach((l) => {
        const start = new Date(l.clock_in).getTime();
        const end = l.clock_out ? new Date(l.clock_out).getTime() : Date.now();
        totalMs += end - start;
      });
      const hours = +(totalMs / (1000 * 60 * 60)).toFixed(2);

      // 2. Calculate sales completed by this cashier
      const cashierOrders = orders.filter((o) => o.cashier_id === user.id && !o.refund_of);
      const totalSales = cashierOrders.reduce((sum, o) => sum + o.total_gross, 0);

      // 3. Calculate commissions
      const commission = +((totalSales * user.commission_rate) / 100).toFixed(2);

      // 4. Calculate total payroll
      const basePay = +(hours * user.hourly_rate).toFixed(2);
      const totalPayroll = +(basePay + commission).toFixed(2);

      return {
        user,
        hours,
        salesCount: cashierOrders.length,
        salesTotal: totalSales,
        commission,
        totalPayroll,
      };
    });
  }, [users, timeLogs, orders]);

  const handleAddEmployee = () => {
    if (!empName.trim()) return toast.error(lang === "it" ? "Inserisci il nome" : "Enter name");
    addUser({
      name: empName,
      role: empRole,
      pin: empPin || undefined,
      hourly_rate: parseFloat(empRate) || 0,
      commission_rate: parseFloat(empCommission) || 0,
      status: "active",
    });
    toast.success(lang === "it" ? "Dipendente aggiunto" : "Employee added");
    setAddDialogOpen(false);
    setEmpName("");
    setEmpPin("");
  };

  const handlePostPayrollExpense = (empPerf: typeof staffPerformance[0]) => {
    if (empPerf.totalPayroll <= 0) {
      return toast.warning(lang === "it" ? "Stipendio calcolato pari a zero" : "Calculated payroll is zero");
    }

    addExpense({
      date: new Date().toISOString().slice(0, 10),
      category: "Stipendi",
      cost_type: "indirect",
      description: `Payroll: ${empPerf.user.name} (${empPerf.hours}h · ${empPerf.user.commission_rate}% comm)`,
      amount: empPerf.totalPayroll,
      vat_rate: 0,
      payment_method: "elettronico",
      status: "pending",
      recurrence: "none",
      supplier_id: empPerf.user.id,
      supplier_name: empPerf.user.name,
    });

    toast.success(t("staff.expense.toast"));
  };

  // Removed duplicate isOwnerOrManager declaration

  return (
    <>
      <PageHeader
        title={t("staff.title")}
        subtitle={t("staff.subtitle")}
        actions={
          isOwnerOrManager && (
            <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <UserPlus className="h-4 w-4 mr-1.5" />
                  {lang === "it" ? "Nuovo Dipendente" : "New Employee"}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md rounded-xl">
                <DialogHeader>
                  <DialogTitle>{lang === "it" ? "Aggiungi Personale" : "Add Staff Member"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 py-2 text-sm">
                  <div>
                    <Label className="text-xs">{lang === "it" ? "Nome Completo" : "Full Name"}</Label>
                    <Input value={empName} onChange={(e) => setEmpName(e.target.value)} placeholder="es. Mario Rossi" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Ruolo / Role</Label>
                      <Select value={empRole} onValueChange={(v) => setEmpRole(v as any)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="owner">Owner</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                          <SelectItem value="cashier">Cashier</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">PIN (4 cifre)</Label>
                      <Input
                        type="password"
                        maxLength={4}
                        placeholder="es. 1234"
                        value={empPin}
                        onChange={(e) => setEmpPin(e.target.value.replace(/\D/g, ""))}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">{lang === "it" ? "Paga Oraria (€/h)" : "Hourly Rate (€/h)"}</Label>
                      <Input type="number" step="0.5" value={empRate} onChange={(e) => setEmpRate(e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs">{lang === "it" ? "Provvigioni (% vendite)" : "Commissions (% sales)"}</Label>
                      <Input type="number" step="0.1" value={empCommission} onChange={(e) => setEmpCommission(e.target.value)} />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setAddDialogOpen(false)}>{t("common.cancel")}</Button>
                  <Button onClick={handleAddEmployee}>{t("common.confirm")}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )
        }
      />

      <div className="flex-1 overflow-y-auto p-4 md:p-8 max-w-6xl space-y-6 mx-auto">
        <Tabs value={currentTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-4">
            {isOwnerOrManager && <TabsTrigger value="performance">{t("staff.tab.performance")}</TabsTrigger>}
            <TabsTrigger value="clock">{t("staff.tab.clock")}</TabsTrigger>
            {isOwnerOrManager && <TabsTrigger value="employees">{t("staff.tab.employees")}</TabsTrigger>}
          </TabsList>

          {/* Performance Dashboard */}
          {isOwnerOrManager && (
            <TabsContent value="performance" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-primary" />
                    {lang === "it" ? "Rendiconto Prestazioni & Payroll" : "Staff Performance & Payroll Ledgers"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {/* Mobile View */}
                  <div className="md:hidden space-y-2 p-3">
                    {staffPerformance.map((p) => (
                      <Card key={p.user.id} className="border bg-card">
                        <CardContent className="p-3 space-y-2 text-xs">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="font-semibold text-sm">{p.user.name}</div>
                              <Badge variant="outline" className="capitalize text-[10px] mt-0.5">{p.user.role}</Badge>
                            </div>
                            <div className="text-right">
                              <span className="text-[10px] text-muted-foreground uppercase block">{t("staff.payroll")}</span>
                              <span className="font-bold text-sm tabular-nums">{formatEUR(p.totalPayroll)}</span>
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-1 pt-1.5 border-t text-[11px] text-muted-foreground">
                            <div>
                              <span>{t("staff.hours")}</span>
                              <span className="block font-semibold text-foreground font-mono mt-0.5">{p.hours} h</span>
                            </div>
                            <div>
                              <span>{t("staff.sales")}</span>
                              <span className="block font-semibold text-foreground font-mono mt-0.5">{formatEUR(p.salesTotal)}</span>
                            </div>
                            <div>
                              <span>{t("staff.commission")}</span>
                              <span className="block font-semibold text-emerald-600 font-mono mt-0.5">+{formatEUR(p.commission)}</span>
                            </div>
                          </div>

                          <div className="pt-2 border-t mt-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full h-8 text-xs gap-1.5 justify-center"
                              onClick={() => handlePostPayrollExpense(p)}
                            >
                              <PiggyBank className="h-4 w-4 text-primary" />
                              {t("staff.btn.expense")}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {/* Desktop View */}
                  <div className="hidden md:block overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{lang === "it" ? "Operatore" : "Operator"}</TableHead>
                          <TableHead>{lang === "it" ? "Ruolo" : "Role"}</TableHead>
                          <TableHead className="text-right">{t("staff.hours")}</TableHead>
                          <TableHead className="text-right">{t("staff.sales")}</TableHead>
                          <TableHead className="text-right">{t("staff.commission")}</TableHead>
                          <TableHead className="text-right">{t("staff.payroll")}</TableHead>
                          <TableHead className="text-center">{t("common.actions")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {staffPerformance.map((p) => (
                          <TableRow key={p.user.id}>
                            <TableCell className="font-semibold">{p.user.name}</TableCell>
                            <TableCell><Badge variant="outline" className="capitalize">{p.user.role}</Badge></TableCell>
                            <TableCell className="text-right font-mono">{p.hours} h</TableCell>
                            <TableCell className="text-right font-mono">{formatEUR(p.salesTotal)} ({p.salesCount} ord)</TableCell>
                            <TableCell className="text-right font-mono text-emerald-600 font-medium">+{formatEUR(p.commission)}</TableCell>
                            <TableCell className="text-right font-mono font-bold">{formatEUR(p.totalPayroll)}</TableCell>
                            <TableCell className="text-center">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs gap-1.5"
                                onClick={() => handlePostPayrollExpense(p)}
                              >
                                <PiggyBank className="h-4 w-4 text-primary" />
                                {t("staff.btn.expense")}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* Time Clock Terminal */}
          <TabsContent value="clock" className="space-y-4">
            <Card className="max-w-md mx-auto border-primary/20">
              <CardHeader className="text-center">
                <CardTitle className="flex items-center justify-center gap-2">
                  <Clock className="h-6 w-6 text-primary" />
                  {t("staff.tab.clock")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6 flex flex-col items-center">
                <div className="text-center">
                  <div className="text-sm text-muted-foreground">{lang === "it" ? "Operatore Selezionato" : "Active Operator"}</div>
                  <div className="text-2xl font-bold font-display mt-1">{currentUser.name}</div>
                  <Badge className="mt-1.5 uppercase">{currentUser.role}</Badge>
                </div>

                <div className="h-28 w-28 rounded-full border-4 border-muted flex items-center justify-center bg-card shadow-inner">
                  {timeLogs.find((l) => l.user_id === currentUser.id && !l.clock_out) ? (
                    <span className="text-emerald-500 font-bold animate-pulse text-sm">🟢 ACTIVE</span>
                  ) : (
                    <span className="text-destructive font-bold text-sm">🔴 OFFLINE</span>
                  )}
                </div>

                <div className="w-full space-y-2">
                  <Button
                    size="lg"
                    className="w-full h-12 text-sm"
                    variant={timeLogs.find((l) => l.user_id === currentUser.id && !l.clock_out) ? "destructive" : "default"}
                    onClick={() => {
                      const active = timeLogs.find((l) => l.user_id === currentUser.id && !l.clock_out);
                      if (active) {
                        clockOut(currentUser.id);
                        toast.success(lang === "it" ? "Turno terminato" : "Shift ended");
                      } else {
                        clockIn(currentUser.id);
                        toast.success(lang === "it" ? "Turno iniziato" : "Shift started");
                      }
                    }}
                  >
                    {timeLogs.find((l) => l.user_id === currentUser.id && !l.clock_out)
                      ? t("staff.clock.out")
                      : t("staff.clock.in")}
                  </Button>
                </div>

                {/* Clock-in history logs */}
                <div className="w-full space-y-2 border-t pt-4">
                  <div className="text-xs font-semibold text-muted-foreground uppercase">{lang === "it" ? "Miei ultimi ingressi" : "My recent clock history"}</div>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {timeLogs
                      .filter((l) => l.user_id === currentUser.id)
                      .slice(0, 5)
                      .map((l) => (
                        <div key={l.id} className="text-xs border rounded-md p-2 flex justify-between bg-muted/40">
                          <div>
                            <span className="font-semibold text-emerald-600">IN:</span>{" "}
                            {new Date(l.clock_in).toLocaleTimeString(lang === "it" ? "it-IT" : "en-US", { hour: "2-digit", minute: "2-digit" })}
                          </div>
                          <div>
                            <span className="font-semibold text-destructive">OUT:</span>{" "}
                            {l.clock_out ? (
                              new Date(l.clock_out).toLocaleTimeString(lang === "it" ? "it-IT" : "en-US", { hour: "2-digit", minute: "2-digit" })
                            ) : (
                              <span className="text-emerald-500 font-medium">attivo</span>
                            )}
                          </div>
                          <div className="text-muted-foreground">
                            {new Date(l.clock_in).toLocaleDateString()}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Employee Directory Management */}
          {isOwnerOrManager && (
            <TabsContent value="employees" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Briefcase className="h-5 w-5 text-primary" />
                    {lang === "it" ? "Anagrafiche e Tariffe Contratti" : "Employee Contract Rates & Settings"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {/* Mobile View */}
                  <div className="md:hidden space-y-2 p-3">
                    {users.map((u) => (
                      <Card key={u.id} className="border bg-card">
                        <CardContent className="p-3 space-y-2 text-xs">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="font-semibold text-sm">{u.name}</div>
                              <Badge variant="outline" className="capitalize text-[10px] mt-0.5">{u.role}</Badge>
                            </div>
                            <Badge variant={u.status === "active" ? "default" : "secondary"}>
                              {u.status}
                            </Badge>
                          </div>

                          <div className="grid grid-cols-3 gap-1 pt-1.5 border-t text-[11px] text-muted-foreground">
                            <div>
                              <span>{lang === "it" ? "Paga Oraria" : "Hourly Rate"}</span>
                              <span className="block font-semibold text-foreground mt-0.5">{formatEUR(u.hourly_rate)}/h</span>
                            </div>
                            <div>
                              <span>{lang === "it" ? "Provvigione" : "Commission"}</span>
                              <span className="block font-semibold text-foreground mt-0.5">{u.commission_rate}%</span>
                            </div>
                            <div>
                              <span>PIN</span>
                              <span className="block font-semibold text-foreground font-mono mt-0.5">{u.pin ? "••••" : "nessuno"}</span>
                            </div>
                          </div>
                          
                          <div className="flex justify-end pt-2 border-t mt-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs gap-1.5"
                              onClick={() => setEditingUser(u)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              {lang === "it" ? "Modifica" : "Edit"}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {/* Desktop View */}
                  <div className="hidden md:block overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{lang === "it" ? "Operatore" : "Operator"}</TableHead>
                          <TableHead>{lang === "it" ? "Ruolo" : "Role"}</TableHead>
                          <TableHead>{lang === "it" ? "Paga Oraria" : "Hourly Rate"}</TableHead>
                          <TableHead>{lang === "it" ? "Provvigione Vendite" : "Commissions"}</TableHead>
                          <TableHead>{lang === "it" ? "PIN Cassa" : "Cassa PIN"}</TableHead>
                          <TableHead>{lang === "it" ? "Stato" : "Status"}</TableHead>
                          <TableHead className="text-right">{lang === "it" ? "Azioni" : "Actions"}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {users.map((u) => (
                          <TableRow key={u.id}>
                            <TableCell className="font-semibold">{u.name}</TableCell>
                            <TableCell className="capitalize">{u.role}</TableCell>
                            <TableCell className="font-mono">{formatEUR(u.hourly_rate)} / ora</TableCell>
                            <TableCell className="font-mono">{u.commission_rate} %</TableCell>
                            <TableCell className="font-mono text-muted-foreground">{u.pin ? "••••" : "nessuno"}</TableCell>
                            <TableCell>
                              <Badge variant={u.status === "active" ? "default" : "secondary"}>
                                {u.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setEditingUser(u)}
                                title={lang === "it" ? "Modifica dipendente" : "Edit employee"}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </div>
      <EditEmployeeDialog
        user={editingUser}
        onClose={() => setEditingUser(null)}
        onSave={(id, patch) => {
          updateUser(id, patch);
          toast.success(lang === "it" ? "Dipendente modificato con successo" : "Employee updated successfully");
        }}
        lang={lang}
        t={t}
      />
    </>
  );
}

interface EditEmployeeDialogProps {
  user: User | null;
  onClose: () => void;
  onSave: (id: string, patch: Partial<User>) => void;
  lang: string;
  t: (key: string) => string;
}

function EditEmployeeDialog({ user, onClose, onSave, lang, t }: EditEmployeeDialogProps) {
  const [name, setName] = useState("");
  const [role, setRole] = useState<"owner" | "manager" | "cashier">("cashier");
  const [pin, setPin] = useState("");
  const [hourlyRate, setHourlyRate] = useState("12");
  const [commissionRate, setCommissionRate] = useState("2");
  const [status, setStatus] = useState<"active" | "inactive">("active");

  useEffect(() => {
    if (user) {
      setName(user.name);
      setRole(user.role);
      setPin(user.pin ?? "");
      setHourlyRate(String(user.hourly_rate));
      setCommissionRate(String(user.commission_rate));
      setStatus(user.status);
    }
  }, [user]);

  if (!user) return null;

  const handleConfirm = () => {
    if (!name.trim()) {
      toast.error(lang === "it" ? "Inserisci il nome" : "Enter name");
      return;
    }
    onSave(user.id, {
      name: name.trim(),
      role,
      pin: pin || undefined,
      hourly_rate: parseFloat(hourlyRate) || 0,
      commission_rate: parseFloat(commissionRate) || 0,
      status,
    });
    onClose();
  };

  return (
    <Dialog open={!!user} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md rounded-xl">
        <DialogHeader>
          <DialogTitle>{lang === "it" ? "Modifica Dipendente" : "Edit Employee"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2 text-sm">
          <div>
            <Label className="text-xs">{lang === "it" ? "Nome Completo" : "Full Name"}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Ruolo / Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner">Owner</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="cashier">Cashier</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">PIN (4 cifre)</Label>
              <Input
                type="password"
                maxLength={4}
                placeholder="es. 1234"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">{lang === "it" ? "Paga Oraria (€/h)" : "Hourly Rate (€/h)"}</Label>
              <Input type="number" step="0.5" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">{lang === "it" ? "Provvigioni (% vendite)" : "Commissions (% sales)"}</Label>
              <Input type="number" step="0.1" value={commissionRate} onChange={(e) => setCommissionRate(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Stato / Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">{lang === "it" ? "Attivo" : "Active"}</SelectItem>
                <SelectItem value="inactive">{lang === "it" ? "Inattivo" : "Inactive"}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={handleConfirm}>{t("common.confirm")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
