import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AppLayout } from "@/components/AppLayout";
import { ThemeProvider } from "@/components/ThemeProvider";
import { CommandPalette } from "@/components/CommandPalette";
import { Toaster } from "@/components/ui/sonner";
import { useCurrentLang } from "@/lib/i18n";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { useRouterState } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

function NotFoundComponent() {
  const lang = useCurrentLang();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold">404</h1>
        <p className="mt-2 text-sm text-muted-foreground">{lang === "it" ? "Pagina non trovata." : "Page not found."}</p>
        <a href="/" className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          {lang === "it" ? "Torna alla dashboard" : "Back to dashboard"}
        </a>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  const lang = useCurrentLang();
  useEffect(() => { reportLovableError(error, { boundary: "tanstack_root_error_component" }); }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">{lang === "it" ? "Si è verificato un errore" : "An error occurred"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <button onClick={() => { router.invalidate(); reset(); }} className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          {lang === "it" ? "Riprova" : "Try again"}
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "google", content: "notranslate" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "Soldo — Micro-ERP fiscale per negozi italiani" },
      { name: "description", content: "Gestionale offline-first con assistente vocale, scorporo IVA e trasmissione Corrispettivi Elettronici." },
      { property: "og:title", content: "Soldo — Micro-ERP fiscale per negozi italiani" },
      { name: "twitter:title", content: "Soldo — Micro-ERP fiscale per negozi italiani" },
      { property: "og:description", content: "Gestionale offline-first con assistente vocale, scorporo IVA e trasmissione Corrispettivi Elettronici." },
      { name: "twitter:description", content: "Gestionale offline-first con assistente vocale, scorporo IVA e trasmissione Corrispettivi Elettronici." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/85f48df8-c7ae-4bce-b450-c0b4187054e4/id-preview-fa7f397e--8240186c-1068-4e57-bca7-06d58ab739e3.lovable.app-1780615642425.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/85f48df8-c7ae-4bce-b450-c0b4187054e4/id-preview-fa7f397e--8240186c-1068-4e57-bca7-06d58ab739e3.lovable.app-1780615642425.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
      { rel: "manifest", href: "/manifest.json" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

const themeBootstrap = `(function(){try{var s=localStorage.getItem('soldo-theme');var m='system';if(s){try{m=(JSON.parse(s).state||{}).mode||'system'}catch(e){}}var d=m==='dark'||(m==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;

function RootShell({ children }: { children: ReactNode }) {
  useEffect(() => {
    if ("serviceWorker" in navigator && typeof window !== "undefined") {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.warn("Service worker registration failed", err);
      });
    }
  }, []);

  return (
    <html lang="it" className="notranslate" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body suppressHydrationWarning>{children}<Scripts /></body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AccessGuard>
          <AppLayout />
        </AccessGuard>
        <CommandPalette />
        <Toaster richColors position="top-center" />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function AccessGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const currentUser = useStore((s) => s.currentUser);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const lang = useCurrentLang();

  const isForbidden =
    currentUser?.role === "cashier" &&
    (path.startsWith("/accounting") ||
      path.startsWith("/insights") ||
      path.startsWith("/settings") ||
      path.startsWith("/locations"));

  if (isForbidden) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
        <div className="max-w-md space-y-4 rounded-xl border bg-card p-8 shadow-lg">
          <div className="mx-auto h-12 w-12 rounded-full bg-destructive/10 text-destructive grid place-items-center">
            <Lock className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-semibold">{lang === "it" ? "Accesso Negato" : "Access Denied"}</h2>
          <p className="text-sm text-muted-foreground">
            {lang === "it"
              ? `L'operatore corrente (${currentUser.name}) non dispone dei permessi per visualizzare questa sezione.`
              : `The current operator (${currentUser.name}) does not have permission to view this section.`}
          </p>
          <div className="flex flex-col gap-2 pt-2">
            <Button onClick={() => setSwitcherOpen(true)} className="w-full">
              Cambia Operatore / Switch Operator
            </Button>
            <Button onClick={() => router.navigate({ to: "/" })} variant="outline" className="w-full">
              {lang === "it" ? "Torna alla Dashboard" : "Back to Dashboard"}
            </Button>
          </div>
        </div>
        <GuardSwitcherDialog open={switcherOpen} onClose={() => setSwitcherOpen(false)} />
      </div>
    );
  }

  return <>{children}</>;
}

function GuardSwitcherDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const users = useStore((s) => s.users);
  const switchUser = useStore((s) => s.switchUser);
  const [selectedUser, setSelectedUser] = useState(users[0]?.id ?? "");
  const [pin, setPin] = useState("");
  const lang = useCurrentLang();

  function handleSwitch() {
    const ok = switchUser(selectedUser, pin);
    if (ok) {
      toast.success(lang === "it" ? "Operatore cambiato con successo" : "Operator changed successfully");
      setPin("");
      onClose();
    } else {
      toast.error(lang === "it" ? "PIN errato per questo operatore" : "Incorrect PIN for this operator");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xs rounded-xl">
        <DialogHeader>
          <DialogTitle>{lang === "it" ? "Cambia Operatore" : "Change Operator"}</DialogTitle>
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
            <Label className="text-xs">{lang === "it" ? "Codice PIN di sicurezza" : "Security PIN code"}</Label>
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
              {lang === "it"
                ? "PINs: Proprietario 1111 · Gestore 2222 · Cassiere 3333"
                : "PINs: Owner 1111 · Manager 2222 · Cashier 3333"}
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
