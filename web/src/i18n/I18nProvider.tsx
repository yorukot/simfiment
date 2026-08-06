import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { messages, type Messages } from "./messages";

export type SupportedLocale = "zh-TW" | "en";

const STORAGE_KEY = "simfiment.locale";
const FALLBACK_LOCALE: SupportedLocale = "zh-TW";

let activeLocale: SupportedLocale = FALLBACK_LOCALE;

function safeStoredLocale(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function persistLocale(locale: SupportedLocale) {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // The in-memory preference still works when storage is unavailable.
  }
}

export function normalizeLocale(value: string | null | undefined): SupportedLocale | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === "en" || normalized.startsWith("en-")) return "en";
  if (normalized === "zh-tw" || normalized.startsWith("zh-")) return "zh-TW";
  return undefined;
}

export function detectLocale(): SupportedLocale {
  const stored = normalizeLocale(safeStoredLocale());
  if (stored) return stored;
  const browserLocales = navigator.languages?.length ? navigator.languages : [navigator.language];
  return browserLocales.map(normalizeLocale).find(Boolean) ?? FALLBACK_LOCALE;
}

function applyDocumentLocale(locale: SupportedLocale) {
  document.documentElement.lang = locale;
  document.documentElement.dir = "ltr";
  document.title = "Simfiment";
  document
    .querySelector<HTMLMetaElement>('meta[name="description"]')
    ?.setAttribute("content", messages[locale].meta.description);
}

export function initializeLocale(): SupportedLocale {
  activeLocale = detectLocale();
  persistLocale(activeLocale);
  applyDocumentLocale(activeLocale);
  return activeLocale;
}

export function currentLocale(): SupportedLocale {
  return activeLocale;
}

type I18nContextValue = {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => void;
  messages: Messages;
  formatNumber: (value: number) => string;
};

const I18nContext = createContext<I18nContextValue>({
  locale: FALLBACK_LOCALE,
  setLocale: () => undefined,
  messages: messages[FALLBACK_LOCALE],
  formatNumber: (number) => new Intl.NumberFormat(FALLBACK_LOCALE).format(number),
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<SupportedLocale>(() => activeLocale);
  const setLocale = useCallback((next: SupportedLocale) => {
    activeLocale = next;
    persistLocale(next);
    applyDocumentLocale(next);
    setLocaleState(next);
  }, []);

  useEffect(() => {
    function storage(event: StorageEvent) {
      if (event.key !== STORAGE_KEY) return;
      const next = normalizeLocale(event.newValue);
      if (next && next !== activeLocale) {
        activeLocale = next;
        applyDocumentLocale(next);
        setLocaleState(next);
      }
    }
    window.addEventListener("storage", storage);
    return () => window.removeEventListener("storage", storage);
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      messages: messages[locale],
      formatNumber: (number) => new Intl.NumberFormat(locale).format(number),
    }),
    [locale, setLocale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
