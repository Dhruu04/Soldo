import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  Mic,
  Package,
  Settings,
  BarChart3,
  Languages,
  ReceiptText,
  Sparkles,
  Search,
  Wallet,
  MoreHorizontal,
  MapPin,
  User,
  Users,
  Bot,
  Cloud,
  CloudOff,
  RefreshCw
} from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { cn } from "@/lib/utils";
import { useLang, useT, useCurrentLang } from "@/lib/i18n";
import { useStore } from "@/lib/store";

import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const primaryTabs = [
  { to: "/", labelKey: "nav.dashboard", icon: LayoutDashboard },
  { to: "/sale", labelKey: "nav.sale", icon: Mic },
  { to: "/inventory", labelKey: "nav.inventory", icon: Package },
  { to: "/orders", labelKey: "nav.orders", icon: ReceiptText },
] as const;

const secondaryTabs = [
  { to: "/locations", labelKey: "nav.locations", icon: MapPin },
  { to: "/till", labelKey: "nav.till", icon: Wallet },
  { to: "/staff", labelKey: "nav.staff", icon: Users },
  { to: "/accounting", labelKey: "nav.accounting", icon: BarChart3 },
  { to: "/insights", labelKey: "nav.insights", icon: Sparkles },
  { to: "/assistant", labelKey: "nav.assistant", icon: Bot },
  { to: "/settings", labelKey: "nav.settings", icon: Settings },
] as const;

export function AppLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const t = useT();
  const { setLang } = useLang();
  const lang = useCurrentLang();
  const [moreOpen, setMoreOpen] = useState(false);
  const [userSwitcherOpen, setUserSwitcherOpen] = useState(false);

  // Store selections
  const currentUser = useStore((s) => s.currentUser);
  const locations = useStore((s) => s.locations);
  const currentLocation = useStore((s) => s.currentLocation);
  const switchLocation = useStore((s) => s.switchLocation);
  const syncConfig = useStore((s) => s.syncConfig);
  const triggerSync = useStore((s) => s.triggerSync);
  const timeLogs = useStore((s) => s.timeLogs);
  const clockIn = useStore((s) => s.clockIn);
  const clockOut = useStore((s) => s.clockOut);

  // Sync and Online State
  const [syncing, setSyncing] = useState(false);
  const [online, setOnline] = useState(typeof window !== "undefined" ? window.navigator.onLine : true);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const handleSync = async () => {
    if (!online || syncing) return;
    setSyncing(true);
    try {
      await triggerSync();
      toast.success(lang === "it" ? "Sincronizzato" : "Sync completed");
    } catch {
      toast.error(lang === "it" ? "Errore sincronizzazione" : "Sync error");
    } finally {
      setSyncing(false);
    }
  };

  // Filter tabs by User Role
  const isCashier = currentUser?.role === "cashier";
  const allowedSecondary = secondaryTabs.filter((tab) => {
    if (isCashier) {
      // Cashier cannot see Accounting, Insights, or Settings
      return tab.to === "/till" || tab.to === "/assistant" || tab.to === "/staff";
    }
    return true;
  });

  const inSecondary = allowedSecondary.some((tab) => path.startsWith(tab.to));
  const allAllowedTabs = [...primaryTabs, ...allowedSecondary];

  return (
    <div className="h-screen w-screen overflow-hidden flex bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 lg:w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground h-full">
        <div className="flex items-center gap-2 px-3.5 py-1.5 border-b border-sidebar-border" translate="no">
          <div className="h-7 w-7 text-primary shrink-0">
            <BrandLogo size={28} />
          </div>
          <div className="min-w-0">
            <div className="font-display font-semibold text-sm leading-none tracking-tight truncate">{t("brand.name")}</div>
            <div className="text-[9px] text-muted-foreground truncate mt-0.5">{t("brand.tagline")}</div>
          </div>
        </div>

        {/* Active Location Selection */}
        <div className="px-3.5 py-1 border-b border-sidebar-border">
          <label className="text-[9px] text-muted-foreground uppercase font-semibold tracking-wider flex items-center gap-1 mb-0.5">
            <MapPin className="h-2.5 w-2.5 text-primary" /> {lang === "it" ? "Sede Attiva" : "Active Location"}
          </label>
          <Select value={currentLocation?.id ?? ""} onValueChange={switchLocation}>
            <SelectTrigger className="h-7 bg-background/50 border-sidebar-border text-[10px] py-0.5 px-2">
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

        <nav className="flex-1 px-2 py-1 space-y-0 overflow-y-auto scrollbar-none">
          {allAllowedTabs.map((tab) => {
            const active = tab.to === "/" ? path === "/" : path.startsWith(tab.to);
            return (
              <Link
                key={tab.to}
                to={tab.to}
                className={cn(
                  "flex items-center gap-2 px-2.5 py-1.25 rounded-md text-xs font-medium transition-colors",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                    : "text-sidebar-foreground hover:bg-sidebar-accent",
                )}
              >
                <tab.icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{t(tab.labelKey)}</span>
              </Link>
            );
          })}
        </nav>

        {/* User Card, Clock Status & Sync indicator */}
        <div className="px-2.5 py-1 border-t border-sidebar-border bg-sidebar-accent/20">
          <div className="flex items-center justify-between gap-1.5">
            <button
              type="button"
              onClick={() => setUserSwitcherOpen(true)}
              className="flex items-center gap-1.5 text-left hover:bg-sidebar-accent p-0.5 rounded-md flex-1 min-w-0"
              title={lang === "it" ? "Cambia operatore" : "Switch user"}
            >
              <div className="h-6 w-6 rounded-full bg-primary/10 text-primary grid place-items-center shrink-0 font-semibold text-[9px]">
                {currentUser.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-[10px] truncate leading-none">{currentUser.name}</div>
                <div className="text-[8px] text-muted-foreground uppercase font-medium mt-0.5">{currentUser.role}</div>
              </div>
            </button>

            <button
              type="button"
              onClick={handleSync}
              disabled={!online || syncing}
              className={cn(
                "p-1 rounded-md hover:bg-sidebar-accent text-muted-foreground shrink-0",
                syncing && "animate-spin text-primary"
              )}
              title={online ? (lang === "it" ? "Sincronizza Cloud" : "Cloud Sync") : (lang === "it" ? "Offline" : "Offline Mode")}
            >
              {online ? (
                <RefreshCw className="h-3 w-3" />
              ) : (
                <CloudOff className="h-3 w-3 text-destructive" />
              )}
            </button>
          </div>

          <div className="mt-1 flex items-center justify-between gap-1 text-[9px] border-t border-sidebar-border/30 pt-1">
            <span className="text-muted-foreground font-medium flex items-center gap-1 text-[9px]">
              <span className={cn("h-1 w-1 rounded-full", timeLogs.find((l) => l.user_id === currentUser.id && !l.clock_out) ? "bg-emerald-500 animate-pulse" : "bg-destructive")} />
              {timeLogs.find((l) => l.user_id === currentUser.id && !l.clock_out)
                ? (lang === "it" ? "In Servizio" : "Clocked In")
                : (lang === "it" ? "Fuori Servizio" : "Clocked Out")}
            </span>
            <Button
              variant={timeLogs.find((l) => l.user_id === currentUser.id && !l.clock_out) ? "destructive" : "outline"}
              className="h-5 text-[8px] py-0 px-1.5"
              onClick={() => {
                const active = timeLogs.find((l) => l.user_id === currentUser.id && !l.clock_out);
                if (active) {
                  clockOut(currentUser.id);
                  toast.success(lang === "it" ? "Turno terminato" : "Clocked out successfully");
                } else {
                  clockIn(currentUser.id);
                  toast.success(lang === "it" ? "Turno iniziato" : "Clocked in successfully");
                }
              }}
            >
              {timeLogs.find((l) => l.user_id === currentUser.id && !l.clock_out) ? "Clock Out" : "Clock In"}
            </Button>
          </div>
        </div>

        <div className="px-2.5 py-1 border-t border-sidebar-border space-y-1">
          <div className="flex items-center justify-between gap-1.5">
            <button
              type="button"
              onClick={() =>
                window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }))
              }
              className="h-6.5 px-2 rounded-md border border-sidebar-border bg-background/40 hover:bg-sidebar-accent transition-colors text-[10px] text-muted-foreground flex items-center gap-1"
              title={t("common.search")}
            >
              <Search className="h-3 w-3" />
              <span>{t("common.search")}</span>
            </button>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                className="h-6.5 px-1.5 text-[9px] flex items-center gap-0.5"
                onClick={() => setLang(lang === "it" ? "en" : "it")}
              >
                {lang === "it" ? "🇮🇹 IT" : "🇬🇧 EN"}
              </Button>
              <ThemeToggle compact />
            </div>
          </div>
          <div className="text-[8px] text-muted-foreground text-center leading-none">{t("brand.offline")}</div>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 h-full overflow-hidden flex flex-col min-w-0 pb-20 md:pb-0">
        <Outlet />
      </main>

      {/* Mobile bottom nav — 5 slots: 4 primary + More */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-sidebar/95 backdrop-blur border-t border-sidebar-border safe-bottom">
        <div className="grid grid-cols-5">
          {primaryTabs.map((tab) => {
            const active = tab.to === "/" ? path === "/" : path.startsWith(tab.to);
            return (
              <Link
                key={tab.to}
                to={tab.to}
                className={cn(
                  "flex flex-col items-center gap-0.5 py-2.5 text-[10px] leading-tight transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <tab.icon className="h-5 w-5" />
                <span className="truncate max-w-[64px] text-center">{t(tab.labelKey).split(" ")[0]}</span>
              </Link>
            );
          })}
          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                className={cn(
                  "flex flex-col items-center gap-0.5 py-2.5 text-[10px] leading-tight transition-colors",
                  inSecondary ? "text-primary" : "text-muted-foreground",
                )}
              >
                <MoreHorizontal className="h-5 w-5" />
                <span>{t("nav.more")}</span>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-2xl pb-[max(env(safe-area-inset-bottom),1rem)]">
              <SheetHeader className="text-left">
                <SheetTitle className="text-base">{t("nav.more")}</SheetTitle>
              </SheetHeader>
              <div className="grid grid-cols-4 gap-2 mt-3">
                {allowedSecondary.map((tab) => {
                  const active = path.startsWith(tab.to);
                  return (
                    <Link
                      key={tab.to}
                      to={tab.to}
                      onClick={() => setMoreOpen(false)}
                      className={cn(
                        "flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3 text-xs transition-colors",
                        active
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-border bg-card text-foreground hover:bg-accent",
                      )}
                    >
                      <tab.icon className="h-5 w-5" />
                      <span className="text-center leading-tight">{t(tab.labelKey)}</span>
                    </Link>
                  );
                })}
              </div>

              {/* Mobile Location & User Switcher Card */}
              <div className="mt-4 pt-4 border-t space-y-4">
                <div className="flex items-center justify-between gap-3 bg-muted/40 p-2.5 rounded-xl">
                  <button
                    type="button"
                    onClick={() => {
                      setMoreOpen(false);
                      setUserSwitcherOpen(true);
                    }}
                    className="flex items-center gap-2 text-left flex-1 min-w-0"
                  >
                    <div className="h-8 w-8 rounded-full bg-primary/15 text-primary grid place-items-center shrink-0 font-bold text-xs">
                      {currentUser.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-xs truncate leading-none">{currentUser.name}</div>
                      <div className="text-[10px] text-muted-foreground uppercase mt-0.5">{currentUser.role}</div>
                    </div>
                  </button>
                  <Button
                    size="sm"
                    variant={timeLogs.find((l) => l.user_id === currentUser.id && !l.clock_out) ? "destructive" : "outline"}
                    className="h-7 text-[10px] px-2.5"
                    onClick={() => {
                      const active = timeLogs.find((l) => l.user_id === currentUser.id && !l.clock_out);
                      if (active) {
                        clockOut(currentUser.id);
                        toast.success(lang === "it" ? "Turno terminato" : "Clocked out successfully");
                      } else {
                        clockIn(currentUser.id);
                        toast.success(lang === "it" ? "Turno iniziato" : "Clocked in successfully");
                      }
                    }}
                  >
                    {timeLogs.find((l) => l.user_id === currentUser.id && !l.clock_out) ? "Clock Out" : "Clock In"}
                  </Button>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider flex items-center gap-1">
                    <MapPin className="h-3 w-3 text-primary" /> {lang === "it" ? "Sede Attiva" : "Active Location"}
                  </label>
                  <Select value={currentLocation?.id ?? ""} onValueChange={switchLocation}>
                    <SelectTrigger className="h-9 w-full bg-background border-border text-xs">
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
              </div>

              <div className="mt-4 pt-4 border-t flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant={lang === "it" ? "default" : "outline"}
                    className="h-8 px-3"
                    onClick={() => setLang("it")}
                  >🇮🇹 IT</Button>
                  <Button
                    size="sm"
                    variant={lang === "en" ? "default" : "outline"}
                    className="h-8 px-3"
                    onClick={() => setLang("en")}
                  >🇬🇧 EN</Button>
                </div>
                <ThemeToggle compact />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>

      {/* User Switcher Dialog */}
      <UserSwitcherDialog open={userSwitcherOpen} onClose={() => setUserSwitcherOpen(false)} lang={lang} />
    </div>
  );
}

function UserSwitcherDialog({ open, onClose, lang }: { open: boolean; onClose: () => void; lang: string }) {
  const users = useStore((s) => s.users);
  const switchUser = useStore((s) => s.switchUser);
  const [selectedUser, setSelectedUser] = useState(users[0]?.id ?? "");
  const [pin, setPin] = useState("");

  function handleSwitch() {
    const ok = switchUser(selectedUser, pin);
    if (ok) {
      toast.success(lang === "it" ? "Operatore cambiato con successo" : "User switched successfully");
      setPin("");
      onClose();
    } else {
      toast.error(lang === "it" ? "PIN errato per questo operatore" : "Incorrect PIN for this user");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xs rounded-xl">
        <DialogHeader>
          <DialogTitle>{lang === "it" ? "Cambia Operatore" : "Switch Operator"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">{lang === "it" ? "Seleziona dipendente" : "Select employee"}</Label>
            <Select value={selectedUser} onValueChange={setSelectedUser}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name} ({u.role.toUpperCase()})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{lang === "it" ? "Codice PIN di sicurezza" : "Security PIN"}</Label>
            <Input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              placeholder="••••"
              className="text-center font-mono text-lg tracking-widest h-11"
            />
            <p className="text-[10px] text-muted-foreground text-center mt-1">
              PINs: Proprietario 1111 · Gestore 2222 · Cassiere 3333
            </p>
          </div>
          <Button onClick={handleSwitch} className="w-full h-10 mt-2">
            {lang === "it" ? "Conferma" : "Confirm"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function LanguageToggle() {
  const { lang, setLang } = useLang();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1.5">
          <Languages className="h-4 w-4" />
          <span className="font-mono text-xs uppercase">{lang}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setLang("it")}>🇮🇹 Italiano</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setLang("en")}>🇬🇧 English</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 bg-background/85 backdrop-blur border-b">
      <div className="px-4 md:px-8 py-3 md:py-4 flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-base md:text-2xl font-display font-semibold truncate">{title}</h1>
          {subtitle && <p className="hidden md:block text-xs md:text-sm text-muted-foreground truncate">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {actions}
          <button
            type="button"
            onClick={() =>
              window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }))
            }
            className="hidden lg:inline-flex items-center gap-2 h-9 px-3 rounded-md border bg-background/60 hover:bg-accent transition-colors text-xs text-muted-foreground"
            aria-label="Open command palette"
          >
            <Search className="h-3.5 w-3.5" /> <span>Search</span>
            <kbd className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded border">⌘K</kbd>
          </button>
          <div className="hidden md:inline-flex"><ThemeToggle compact /></div>
        </div>
      </div>
    </header>
  );
}
