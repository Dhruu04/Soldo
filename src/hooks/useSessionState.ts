import { useState, useCallback, useEffect, useRef } from "react";

/**
 * A drop-in replacement for `useState` that persists state in `sessionStorage`.
 *
 * - Survives tab/route navigation within the same browser session ✅
 * - Clears when the browser tab is closed ✅ (fresh start)
 * - Provides a `reset()` function for manual clearing
 * - Falls back gracefully if sessionStorage is unavailable
 *
 * Usage:
 *   const [search, setSearch, resetSearch] = useSessionState("sale-search", "");
 */
export function useSessionState<T>(
  key: string,
  initialValue: T,
): [T, (value: T | ((prev: T) => T)) => void, () => void] {
  // Lazy initialiser: read from sessionStorage on first render
  const [state, setStateRaw] = useState<T>(() => {
    if (typeof window === "undefined") return initialValue;
    try {
      const stored = sessionStorage.getItem(key);
      if (stored !== null) {
        return JSON.parse(stored) as T;
      }
    } catch {
      // corrupt or missing — fall back
    }
    return initialValue;
  });

  // Keep a ref so we can write to sessionStorage without re-renders
  const stateRef = useRef(state);
  stateRef.current = state;

  // Wrapped setter that also writes to sessionStorage
  const setState = useCallback(
    (value: T | ((prev: T) => T)) => {
      setStateRaw((prev) => {
        const next = typeof value === "function" ? (value as (prev: T) => T)(prev) : value;
        try {
          sessionStorage.setItem(key, JSON.stringify(next));
        } catch {
          // storage full or blocked — silently ignore
        }
        return next;
      });
    },
    [key],
  );

  // Reset to initial value and clear from sessionStorage
  const reset = useCallback(() => {
    setStateRaw(initialValue);
    try {
      sessionStorage.removeItem(key);
    } catch {
      // ignore
    }
  }, [key, initialValue]);

  return [state, setState, reset];
}
