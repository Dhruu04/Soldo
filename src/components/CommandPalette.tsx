import { useEffect, useState, useMemo } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import {
  LayoutDashboard,
  Mic,
  Package,
  ReceiptText,
  BarChart3,
  Sparkles,
  Settings,
  Moon,
  Sun,
  Plus,
  Languages,
  Wallet,
} from "lucide-react";
import { useStore, formatEUR } from "@/lib/store";
import { useT, useLang, useCurrentLang } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";

export function CommandPalette() {
  const t = useT();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const products = useStore((s) => s.products);
  const orders = useStore((s) => s.orders);
  const expenses = useStore((s) => s.expenses);
  const { mode, setMode } = useTheme();
  const { setLang } = useLang();
  const lang = useCurrentLang();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Close palette on route change
  useEffect(() => {
    setOpen(false);
  }, [path]);

  const matched = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return { products: products.slice(0, 5), orders: orders.slice(0, 5), expenses: expenses.slice(0, 5) };
    return {
      products: products
        .filter((p) =>
          p.name.toLowerCase().includes(term) ||
          p.sku.toLowerCase().includes(term) ||
          (p.barcode ?? "").toLowerCase().includes(term),
        )
        .slice(0, 8),
      orders: orders
        .filter((o) =>
          o.transmission_id?.toLowerCase().includes(term) ||
          (o.customer_name ?? "").toLowerCase().includes(term) ||
          o.items.some((i) => i.product_name.toLowerCase().includes(term)),
        )
        .slice(0, 8),
      expenses: expenses
        .filter((e) =>
          e.description.toLowerCase().includes(term) ||
          e.category.toLowerCase().includes(term) ||
          (e.supplier_name ?? "").toLowerCase().includes(term),
        )
        .slice(0, 8),
    };
  }, [q, products, orders, expenses]);

  function go(to: string) {
    navigate({ to });
    setOpen(false);
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder={t("cmd.placeholder")} value={q} onValueChange={setQ} />
      <CommandList>
        <CommandEmpty>{t("cmd.empty")}</CommandEmpty>

        <CommandGroup heading={t("cmd.nav")}>
          <CommandItem onSelect={() => go("/")}><LayoutDashboard className="h-4 w-4 mr-2" />{t("nav.dashboard")}</CommandItem>
          <CommandItem onSelect={() => go("/sale")}><Mic className="h-4 w-4 mr-2" />{t("nav.sale")}</CommandItem>
          <CommandItem onSelect={() => go("/inventory")}><Package className="h-4 w-4 mr-2" />{t("nav.inventory")}</CommandItem>
          <CommandItem onSelect={() => go("/orders")}><ReceiptText className="h-4 w-4 mr-2" />{t("nav.orders")}</CommandItem>
          <CommandItem onSelect={() => go("/till")}><Wallet className="h-4 w-4 mr-2" />{t("nav.till")}</CommandItem>
          <CommandItem onSelect={() => go("/accounting")}><BarChart3 className="h-4 w-4 mr-2" />{t("nav.accounting")}</CommandItem>
          <CommandItem onSelect={() => go("/insights")}><Sparkles className="h-4 w-4 mr-2" />{t("nav.insights")}</CommandItem>
          <CommandItem onSelect={() => go("/settings")}><Settings className="h-4 w-4 mr-2" />{t("nav.settings")}</CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading={t("cmd.actions")}>
          <CommandItem onSelect={() => go("/sale")}><Plus className="h-4 w-4 mr-2" />{t("cmd.action.newsale")}</CommandItem>
          <CommandItem onSelect={() => go("/inventory")}><Plus className="h-4 w-4 mr-2" />{t("cmd.action.newproduct")}</CommandItem>
          <CommandItem onSelect={() => go("/accounting")}><Plus className="h-4 w-4 mr-2" />{t("cmd.action.newexpense")}</CommandItem>
          <CommandItem
            onSelect={() => {
              setMode(mode === "dark" ? "light" : "dark");
              setOpen(false);
            }}
          >
            {mode === "dark" ? <Sun className="h-4 w-4 mr-2" /> : <Moon className="h-4 w-4 mr-2" />}
            {t("cmd.action.toggletheme")}
          </CommandItem>
          <CommandItem
            onSelect={() => {
              setLang(lang === "it" ? "en" : "it");
              setOpen(false);
            }}
          >
            <Languages className="h-4 w-4 mr-2" />
            {t("cmd.action.togglelang")} · {lang === "it" ? "EN" : "IT"}
          </CommandItem>
        </CommandGroup>

        {matched.products.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={t("cmd.products")}>
              {matched.products.map((p) => (
                <CommandItem key={p.id} value={`p-${p.id}-${p.name}-${p.sku}`} onSelect={() => go("/inventory")}>
                  <Package className="h-4 w-4 mr-2" />
                  <span className="flex-1 truncate">{p.name}</span>
                  <span className="text-xs text-muted-foreground font-mono ml-2">{p.sku}</span>
                  <span className="text-xs tabular-nums ml-3">{formatEUR(p.price_gross)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {matched.orders.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={t("cmd.orders")}>
              {matched.orders.map((o) => (
                <CommandItem key={o.id} value={`o-${o.id}-${o.transmission_id}`} onSelect={() => go("/orders")}>
                  <ReceiptText className="h-4 w-4 mr-2" />
                  <span className="font-mono text-xs flex-1 truncate">{o.transmission_id}</span>
                  <span className="text-xs tabular-nums ml-2">{formatEUR(o.total_gross)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {matched.expenses.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={t("cmd.expenses")}>
              {matched.expenses.map((e) => (
                <CommandItem key={e.id} value={`e-${e.id}-${e.description}`} onSelect={() => go("/accounting")}>
                  <BarChart3 className="h-4 w-4 mr-2" />
                  <span className="flex-1 truncate">{e.description}</span>
                  <span className="text-xs tabular-nums ml-2">{formatEUR(e.amount)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
