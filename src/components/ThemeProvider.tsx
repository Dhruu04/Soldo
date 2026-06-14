import { useEffect } from "react";
import { useTheme, ACCENTS, resolveDark } from "@/lib/theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const mode = useTheme((s) => s.mode);
  const accent = useTheme((s) => s.accent);

  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const dark = resolveDark(mode);
      root.classList.toggle("dark", dark);
      const a = ACCENTS[accent];
      const p = dark ? a.primaryDark : a.primary;
      root.style.setProperty("--primary", `oklch(${p})`);
      root.style.setProperty("--ring", `oklch(${a.ring})`);
      root.style.setProperty("--sidebar-primary", `oklch(${p})`);
      root.style.setProperty("--sidebar-ring", `oklch(${a.ring})`);
      root.style.setProperty(
        "--gradient-primary",
        `linear-gradient(135deg, oklch(${p}) 0%, oklch(${a.glow}) 100%)`,
      );
    };
    apply();
    if (mode === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
  }, [mode, accent]);

  return <>{children}</>;
}
