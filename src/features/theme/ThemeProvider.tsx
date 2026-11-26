import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  readThemePreference,
  resolveTheme,
  writeThemePreference,
  type ResolvedTheme,
  type ThemePreference,
} from "./themePreference";

const NIGHT_ACCENT_STORAGE_KEY = "controle-gastos-night-accent";

interface ThemeContextValue {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
  nightAccent: string | null;
  setNightAccent: (accent: string | null) => void;
}

const fallbackTheme: ThemeContextValue = {
  preference: "light",
  resolvedTheme: "light",
  setPreference: () => undefined,
  nightAccent: null,
  setNightAccent: () => undefined,
};

const ThemeContext = createContext<ThemeContextValue>(fallbackTheme);

function storageOrNull(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function readNightAccent(storage: { getItem: (key: string) => string | null }): string | null {
  try {
    const raw = storage.getItem(NIGHT_ACCENT_STORAGE_KEY);
    if (!raw) return null;
    const v = raw.trim();
    if (/^#[0-9A-Fa-f]{6}$/.test(v)) return v.toUpperCase();
    return null;
  } catch {
    return null;
  }
}

function writeNightAccent(accent: string | null, storage: { setItem: (k: string, v: string) => void }): void {
  try {
    if (accent) {
      storage.setItem(NIGHT_ACCENT_STORAGE_KEY, accent);
    } else {
      storage.setItem(NIGHT_ACCENT_STORAGE_KEY, "");
      // remove for cleanliness
      try {
        (storage as Storage).removeItem?.(NIGHT_ACCENT_STORAGE_KEY);
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
}

function applyNightAccent(accent: string | null): void {
  const el = document.documentElement;
  if (!accent) {
    el.style.removeProperty("--primary");
    el.style.removeProperty("--ring");
    el.style.removeProperty("--primary-foreground");
    el.style.removeProperty("--border");
    el.style.removeProperty("--control-border");
    return;
  }
  el.style.setProperty("--primary", accent);
  el.style.setProperty("--ring", accent);
  el.style.setProperty("--primary-foreground", "#ffffff");
  // Accent também colore contornos/bordas dos cards no Noturno
  el.style.setProperty("--border", accent);
  el.style.setProperty("--control-border", accent);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setStoredPreference] = useState<ThemePreference>(() =>
    readThemePreference(storageOrNull() ?? { getItem: () => null }),
  );
  const [nightAccent, setNightAccentState] = useState<string | null>(() =>
    readNightAccent(storageOrNull() ?? { getItem: () => null }),
  );
  const resolvedTheme = resolveTheme(preference);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    if (resolvedTheme === "night") {
      applyNightAccent(nightAccent);
    } else {
      applyNightAccent(null);
    }
  }, [resolvedTheme, nightAccent]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference,
      resolvedTheme,
      setPreference: (nextPreference) => {
        writeThemePreference(nextPreference, storageOrNull() ?? { setItem: () => undefined });
        setStoredPreference(nextPreference);
      },
      nightAccent,
      setNightAccent: (accent) => {
        const normalized = accent && /^#[0-9A-Fa-f]{6}$/.test(accent) ? accent.toUpperCase() : null;
        writeNightAccent(normalized, storageOrNull() ?? { setItem: () => undefined });
        setNightAccentState(normalized);
      },
    }),
    [preference, resolvedTheme, nightAccent],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
