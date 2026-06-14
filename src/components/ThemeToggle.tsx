import { Moon, Sun, Monitor, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme, ACCENTS, type AccentColor, type ThemeMode } from "@/lib/theme";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const ACCENT_SWATCH: Record<AccentColor, string> = {
  emerald: "bg-[oklch(0.55_0.18_145)]",
  indigo: "bg-[oklch(0.55_0.18_270)]",
  amber: "bg-[oklch(0.7_0.17_65)]",
  rose: "bg-[oklch(0.6_0.22_15)]",
  slate: "bg-[oklch(0.4_0.04_250)]",
};

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const { mode, accent, setMode, setAccent } = useTheme();
  const Icon = mode === "dark" ? Moon : mode === "light" ? Sun : Monitor;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={compact ? "icon" : "sm"} className={compact ? "h-9 w-9" : "h-9 gap-1.5"}>
          <Icon className="h-4 w-4" />
          {!compact && <span className="text-xs">{t("theme.title")}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs">{t("theme.mode")}</DropdownMenuLabel>
        {(["light", "dark", "system"] as ThemeMode[]).map((m) => {
          const I = m === "dark" ? Moon : m === "light" ? Sun : Monitor;
          return (
            <DropdownMenuItem key={m} onClick={() => setMode(m)} className={cn(mode === m && "bg-accent")}>
              <I className="h-4 w-4 mr-2" /> {t(`theme.${m}`)}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs flex items-center gap-1.5">
          <Palette className="h-3.5 w-3.5" />
          {t("theme.accent")}
        </DropdownMenuLabel>
        <div className="grid grid-cols-5 gap-1.5 px-2 py-1.5">
          {(Object.keys(ACCENTS) as AccentColor[]).map((a) => (
            <button
              key={a}
              type="button"
              aria-label={a}
              onClick={() => setAccent(a)}
              className={cn(
                "h-7 w-7 rounded-full border-2 transition",
                ACCENT_SWATCH[a],
                accent === a ? "border-foreground scale-110" : "border-transparent hover:scale-105",
              )}
            />
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
