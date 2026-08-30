import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "acoustic-crm:theme";

/** Resolve the initial theme from localStorage, falling back to the OS-level
 *  prefers-color-scheme. Runs only on the client — SSR guards are unnecessary
 *  in a Vite SPA but the typeof check keeps tests / first-render safe. */
function readInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) return "dark";
  return "light";
}

/** Apply / remove `.dark` on <html> so the CSS variables flip. Kept in module
 *  scope so the initial paint can call it before React hydrates. */
function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

/** Apply the persisted theme as early as possible (before <App/> renders) so
 *  there's no light-then-dark flash. Safe to call from main.tsx. */
export function bootstrapTheme(): void {
  applyTheme(readInitialTheme());
}

/**
 * Theme hook. Returns the current theme and a setter. Persists to localStorage
 * and broadcasts a custom event so other instances of the hook stay in sync
 * (e.g. if the same app is open in two windows).
 */
export function useTheme(): { theme: Theme; setTheme: (t: Theme) => void; toggle: () => void } {
  const [theme, setThemeState] = useState<Theme>(readInitialTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== STORAGE_KEY) return;
      if (e.newValue === "light" || e.newValue === "dark") setThemeState(e.newValue);
    }
    function onCustom(e: Event) {
      const next = (e as CustomEvent<Theme>).detail;
      if (next === "light" || next === "dark") setThemeState(next);
    }
    window.addEventListener("storage", onStorage);
    window.addEventListener("acoustic-crm:theme", onCustom as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("acoustic-crm:theme", onCustom as EventListener);
    };
  }, []);

  function setTheme(next: Theme) {
    setThemeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage might be disabled (Safari private mode, hardened browser); the
      // theme still applies for the current session.
    }
    window.dispatchEvent(new CustomEvent("acoustic-crm:theme", { detail: next }));
  }

  return {
    theme,
    setTheme,
    toggle: () => setTheme(theme === "light" ? "dark" : "light"),
  };
}
