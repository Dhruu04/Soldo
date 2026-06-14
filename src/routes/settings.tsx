import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Shield, KeyRound, Save, Languages, Store, DatabaseBackup, Upload, Download, Trash2, Palette, MapPin, Plus, Edit2 } from "lucide-react";
import { PageHeader } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  AlertDialogDescription,
} from "@/components/ui/alert-dialog";
import { useStore } from "@/lib/store";
import { useT, useCurrentLang, useLang } from "@/lib/i18n";
import { useTheme, ACCENTS, type AccentColor, type ThemeMode } from "@/lib/theme";
import { ActivityLogPanel } from "@/components/ActivityLogPanel";
import { Sun, Moon, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";


export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Impostazioni — Soldo" },
      {
        name: "description",
        content: "Credenziali fiscali e configurazione API per i Corrispettivi Elettronici.",
      },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const t = useT();
  const { setLang } = useLang();
  const lang = useCurrentLang();
  const store = useStore();
  const [form, setForm] = useState(store.config);
  const fileRef = useRef<HTMLInputElement>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [newName, setNewName] = useState("");
  const [newAddress, setNewAddress] = useState("");

  const startEditing = (loc: any) => {
    setEditingId(loc.id);
    setEditName(loc.name);
    setEditAddress(loc.address ?? "");
  };

  const handleSaveEdit = (id: string) => {
    if (!editName.trim()) {
      toast.error(lang === "it" ? "Il nome della sede è obbligatorio" : "Location name is required");
      return;
    }
    store.updateLocation(id, { name: editName.trim(), address: editAddress.trim() || null });
    setEditingId(null);
    toast.success(lang === "it" ? "Sede modificata con successo" : "Location successfully updated");
  };

  const handleAddLocation = () => {
    if (!newName.trim()) return;
    store.addLocation({ name: newName.trim(), address: newAddress.trim() || null });
    setNewName("");
    setNewAddress("");
    toast.success(lang === "it" ? "Nuova sede aggiunta" : "New location added");
  };

  function save() {
    if (form.partita_iva && form.partita_iva.length !== 11) {
      toast.error(t("set.piva.err"));
      return;
    }
    store.saveConfig(form);
    toast.success(t("set.toast.saved"), { description: t("set.toast.ready") });
  }

  function exportBackup() {
    const data = {
      products: store.products,
      orders: store.orders,
      movements: store.movements,
      expenses: store.expenses,
      config: store.config,
      exported_at: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bottega-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t("set.data.toast.exported"));
  }

  function importBackup(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        store.importBackup(data);
        setForm(data.config ?? form);
        toast.success(t("set.data.toast.imported"));
      } catch {
        toast.error("JSON");
      }
    };
    reader.readAsText(file);
  }

  return (
    <>
      <PageHeader title={t("set.title")} subtitle={t("set.subtitle")} />
      <div className="flex-1 overflow-y-auto p-4 md:p-8 max-w-3xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Languages className="h-5 w-5 text-primary" /> {t("common.language")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              <Button variant={lang === "it" ? "default" : "outline"} onClick={() => setLang("it")} className="h-12">
                🇮🇹 Italiano
              </Button>
              <Button variant={lang === "en" ? "default" : "outline"} onClick={() => setLang("en")} className="h-12">
                🇬🇧 English
              </Button>
            </div>
          </CardContent>
        </Card>

        <ThemeCard />


        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Store className="h-5 w-5 text-primary" /> {t("set.profile.title")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t("set.profile.name")}</Label>
              <Input value={form.store_name ?? ""} onChange={(e) => setForm({ ...form, store_name: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("set.profile.phone")}</Label>
                <Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("set.profile.email")}</Label>
                <Input
                  type="email"
                  value={form.email ?? ""}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t("set.profile.address")}</Label>
              <Input value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("set.profile.footer")}</Label>
              <Textarea
                rows={2}
                value={form.receipt_footer ?? ""}
                onChange={(e) => setForm({ ...form, receipt_footer: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("set.profile.threshold")}</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.low_stock_threshold ?? 3}
                  onChange={(e) =>
                    setForm({ ...form, low_stock_threshold: Math.max(0, parseInt(e.target.value) || 0) })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("set.expiry.days")}</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.expiry_alert_days ?? 14}
                  onChange={(e) =>
                    setForm({ ...form, expiry_alert_days: Math.max(0, parseInt(e.target.value) || 0) })
                  }
                />
                <p className="text-xs text-muted-foreground">{t("set.expiry.help")}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-5 w-5 text-primary" /> {lang === "it" ? "Gestione Sedi" : "Location Management"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <Label className="text-sm font-semibold">{lang === "it" ? "Sedi esistenti" : "Existing Locations"}</Label>
              <div className="grid gap-3">
                {store.locations.map((loc) => {
                  const isActive = store.currentLocation?.id === loc.id;
                  const isEditing = editingId === loc.id;
                  return (
                    <div
                      key={loc.id}
                      className={cn(
                        "flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg border gap-3 transition-all",
                        isActive ? "bg-accent/40 border-primary/50" : "bg-card border-border hover:bg-accent/10"
                      )}
                    >
                      {isEditing ? (
                        <div className="flex-1 space-y-2">
                          <Input
                            placeholder={lang === "it" ? "Nome Sede" : "Location Name"}
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="h-9"
                          />
                          <Input
                            placeholder={lang === "it" ? "Indirizzo (opzionale)" : "Address (optional)"}
                            value={editAddress}
                            onChange={(e) => setEditAddress(e.target.value)}
                            className="h-9"
                          />
                        </div>
                      ) : (
                        <div className="min-w-0">
                          <div className="font-semibold text-sm flex items-center gap-2">
                            {loc.name}
                            {isActive && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary text-primary-foreground font-medium">
                                {lang === "it" ? "Attiva" : "Active"}
                              </span>
                            )}
                          </div>
                          {loc.address ? (
                            <p className="text-xs text-muted-foreground mt-0.5">{loc.address}</p>
                          ) : (
                            <p className="text-xs text-muted-foreground/60 italic mt-0.5">
                              {lang === "it" ? "Nessun indirizzo" : "No address specified"}
                            </p>
                          )}
                        </div>
                      )}
                      
                      <div className="flex items-center gap-2 self-end sm:self-center">
                        {isEditing ? (
                          <>
                            <Button size="sm" variant="default" onClick={() => handleSaveEdit(loc.id)}>
                              <Save className="h-3.5 w-3.5 mr-1" />
                              {lang === "it" ? "Salva" : "Save"}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                              {lang === "it" ? "Annulla" : "Cancel"}
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => startEditing(loc)}
                            >
                              <Edit2 className="h-3.5 w-3.5 mr-1" />
                              {lang === "it" ? "Modifica" : "Edit"}
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={isActive}
                              onClick={() => {
                                if (isActive) {
                                  toast.error(lang === "it" ? "Non puoi eliminare la sede attiva" : "Cannot delete active location");
                                  return;
                                }
                                store.deleteLocation(loc.id);
                                toast.success(lang === "it" ? "Sede eliminata" : "Location deleted");
                              }}
                              title={isActive ? (lang === "it" ? "Sede attiva" : "Active location") : ""}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="border-t pt-4 space-y-4">
              <Label className="text-sm font-semibold">{lang === "it" ? "Aggiungi Nuova Sede" : "Add New Location"}</Label>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Input
                    placeholder={lang === "it" ? "Nome Sede (es. Napoli Branch)" : "Location Name (e.g. Rome HQ)"}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Input
                    placeholder={lang === "it" ? "Indirizzo (es. Via Toledo 10)" : "Address (e.g. Via Corso 2)"}
                    value={newAddress}
                    onChange={(e) => setNewAddress(e.target.value)}
                  />
                </div>
              </div>
              <Button onClick={handleAddLocation} disabled={!newName.trim()}>
                <Plus className="h-4 w-4 mr-2" />
                {lang === "it" ? "Aggiungi Sede" : "Add Location"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-5 w-5 text-primary" /> {t("set.creds")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="piva">{t("set.piva")}</Label>
                <Input
                  id="piva"
                  inputMode="numeric"
                  maxLength={11}
                  placeholder="11 cifre"
                  value={form.partita_iva}
                  onChange={(e) => setForm({ ...form, partita_iva: e.target.value.replace(/\D/g, "") })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cf">{t("set.cf")}</Label>
                <Input
                  id="cf"
                  maxLength={16}
                  placeholder="RSSMRA80A01H501U"
                  value={form.codice_fiscale}
                  onChange={(e) => setForm({ ...form, codice_fiscale: e.target.value.toUpperCase() })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t("set.provider")}</Label>
              <Select
                value={form.api_provider}
                onValueChange={(v) => setForm({ ...form, api_provider: v as any })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Openapi.it">Openapi.it</SelectItem>
                  <SelectItem value="Effatta">Effatta</SelectItem>
                  <SelectItem value="A-Cube">A-Cube</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="key" className="flex items-center gap-2">
                <KeyRound className="h-4 w-4" />
                {t("set.apikey")}
              </Label>
              <Input
                id="key"
                type="password"
                placeholder="••••••••••••"
                value={form.api_key}
                onChange={(e) => setForm({ ...form, api_key: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">{t("set.apikey.note")}</p>
            </div>
          </CardContent>
        </Card>

        <Button onClick={save} className="w-full sm:w-auto" size="lg">
          <Save className="h-4 w-4 mr-2" /> {t("set.save")}
        </Button>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <DatabaseBackup className="h-5 w-5 text-primary" /> {t("set.data.title")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Button variant="outline" onClick={exportBackup}>
                <Download className="h-4 w-4 mr-2" /> {t("set.data.export")}
              </Button>
              <Button variant="outline" onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" /> {t("set.data.import")}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) importBackup(f);
                  e.target.value = "";
                }}
              />
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="w-full sm:w-auto">
                  <Trash2 className="h-4 w-4 mr-2" /> {t("set.data.reset")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("set.data.reset")}</AlertDialogTitle>
                  <AlertDialogDescription>{t("set.data.reset.confirm")}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      store.resetAll();
                      toast.success(t("set.data.toast.reset"));
                    }}
                  >
                    {t("common.confirm")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>

        <ActivityLogPanel />

        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base">{t("set.how.title")}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>{t("set.how.p1")}</p>
            <p>{t("set.how.p2")}</p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

const ACCENT_SWATCH: Record<AccentColor, string> = {
  emerald: "bg-[oklch(0.55_0.18_145)]",
  indigo: "bg-[oklch(0.55_0.18_270)]",
  amber: "bg-[oklch(0.7_0.17_65)]",
  rose: "bg-[oklch(0.6_0.22_15)]",
  slate: "bg-[oklch(0.4_0.04_250)]",
};

function ThemeCard() {
  const t = useT();
  const { mode, accent, setMode, setAccent } = useTheme();
  const modes: { id: ThemeMode; Icon: typeof Sun; label: string }[] = [
    { id: "light", Icon: Sun, label: t("theme.light") },
    { id: "dark", Icon: Moon, label: t("theme.dark") },
    { id: "system", Icon: Monitor, label: t("theme.system") },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Palette className="h-5 w-5 text-primary" /> {t("theme.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label className="text-xs mb-2 block">{t("theme.mode")}</Label>
          <div className="grid grid-cols-3 gap-2">
            {modes.map(({ id, Icon, label }) => (
              <Button
                key={id}
                variant={mode === id ? "default" : "outline"}
                onClick={() => setMode(id)}
                className="h-14 flex-col gap-1"
              >
                <Icon className="h-4 w-4" />
                <span className="text-xs">{label}</span>
              </Button>
            ))}
          </div>
        </div>
        <div>
          <Label className="text-xs mb-2 block">{t("theme.accent")}</Label>
          <div className="flex gap-3 flex-wrap">
            {(Object.keys(ACCENTS) as AccentColor[]).map((a) => (
              <button
                key={a}
                type="button"
                aria-label={a}
                onClick={() => setAccent(a)}
                className={cn(
                  "h-10 w-10 rounded-full border-2 transition capitalize",
                  ACCENT_SWATCH[a],
                  accent === a ? "border-foreground scale-110" : "border-transparent hover:scale-105",
                )}
                title={a}
              />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

