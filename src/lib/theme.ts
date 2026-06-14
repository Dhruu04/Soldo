import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeMode = "light" | "dark" | "system";
export type AccentColor = "emerald" | "indigo" | "amber" | "rose" | "slate";

interface ThemeState {
  mode: ThemeMode;
  accent: AccentColor;
  setMode: (m: ThemeMode) => void;
  setAccent: (a: AccentColor) => void;
}

export const useTheme = create<ThemeState>()(
  persist(
    (set) => ({
      mode: "system",
      accent: "emerald",
      setMode: (mode) => set({ mode }),
      setAccent: (accent) => set({ accent }),
    }),
    { name: "soldo-theme" },
  ),
);

export const ACCENTS: Record<AccentColor, { primary: string; ring: string; glow: string; primaryDark: string }> = {
  emerald: { primary: "0.45 0.18 145", ring: "0.45 0.18 145", glow: "0.62 0.16 160", primaryDark: "0.65 0.16 145" },
  indigo:  { primary: "0.45 0.18 270", ring: "0.45 0.18 270", glow: "0.62 0.18 285", primaryDark: "0.68 0.17 275" },
  amber:   { primary: "0.62 0.17 65",  ring: "0.62 0.17 65",  glow: "0.72 0.17 55",  primaryDark: "0.72 0.17 65" },
  rose:    { primary: "0.55 0.22 15",  ring: "0.55 0.22 15",  glow: "0.65 0.20 25",  primaryDark: "0.68 0.20 18" },
  slate:   { primary: "0.32 0.04 250", ring: "0.32 0.04 250", glow: "0.45 0.04 250", primaryDark: "0.75 0.03 250" },
};

export function resolveDark(mode: ThemeMode): boolean {
  if (typeof window === "undefined") return false;
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}
