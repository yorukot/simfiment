import type { QueryClient } from "@tanstack/react-query";
import type { Category, DailyDashboard, Meta, Session, Settings, Transaction } from "../api/types";
import { addDays } from "../lib/date";

export const STARTUP_SNAPSHOT_STORAGE_KEY = "simfiment.startup-snapshot";

type CachedSession = Pick<Session, "authenticated" | "expiresAt" | "settings">;
type CachedTransaction = Omit<Transaction, "clientRequestId" | "location">;

export type StartupSnapshotV1 = {
  version: 1;
  savedAt: string;
  meta: Meta;
  session: CachedSession;
  today: {
    date: string;
    dashboard: DailyDashboard;
    transactions: CachedTransaction[];
  };
};

type SnapshotInput = {
  meta: Meta;
  session: Session;
  date: string;
  dashboard: DailyDashboard;
  transactions: Transaction[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isCategory(value: unknown): value is Category {
  return (
    isRecord(value) &&
    isFiniteNumber(value.id) &&
    (value.kind === "expense" || value.kind === "income") &&
    isString(value.name) &&
    isString(value.iconKey) &&
    isFiniteNumber(value.sortOrder)
  );
}

function isSettings(value: unknown): value is Settings {
  return (
    isRecord(value) &&
    isString(value.currencyCode) &&
    isFiniteNumber(value.currencyExponent) &&
    isString(value.timezone) &&
    isString(value.locale) &&
    (value.theme === "system" || value.theme === "light" || value.theme === "dark") &&
    typeof value.automaticLocationEnabled === "boolean"
  );
}

function isMeta(value: unknown): value is Meta {
  return (
    isRecord(value) &&
    isString(value.name) &&
    isString(value.version) &&
    value.initialized === true &&
    isString(value.defaultLocale) &&
    Array.isArray(value.currencies) &&
    value.currencies.every(
      (currency) =>
        isRecord(currency) && isString(currency.code) && isFiniteNumber(currency.exponent),
    )
  );
}

function isTotals(value: unknown) {
  return (
    isRecord(value) &&
    isFiniteNumber(value.incomeMinor) &&
    isFiniteNumber(value.expenseMinor) &&
    isFiniteNumber(value.netMinor) &&
    isFiniteNumber(value.transactionCount)
  );
}

function isCategoryTotal(value: unknown) {
  return (
    isRecord(value) &&
    isFiniteNumber(value.categoryId) &&
    isString(value.name) &&
    isString(value.iconKey) &&
    isFiniteNumber(value.amountMinor) &&
    isFiniteNumber(value.transactionCount)
  );
}

function isDailyDashboard(value: unknown): value is DailyDashboard {
  return (
    isRecord(value) &&
    isString(value.date) &&
    isString(value.currencyCode) &&
    isTotals(value.totals) &&
    Array.isArray(value.expenseCategories) &&
    value.expenseCategories.every(isCategoryTotal) &&
    Array.isArray(value.incomeCategories) &&
    value.incomeCategories.every(isCategoryTotal)
  );
}

function isCachedTransaction(value: unknown): value is CachedTransaction {
  return (
    isRecord(value) &&
    !("clientRequestId" in value) &&
    !("location" in value) &&
    isFiniteNumber(value.id) &&
    (value.kind === "expense" || value.kind === "income") &&
    isFiniteNumber(value.amountMinor) &&
    isString(value.currencyCode) &&
    isCategory(value.category) &&
    isString(value.title) &&
    isString(value.occurredAt) &&
    isString(value.occurredLocalDate) &&
    (value.source === "manual" || value.source === "recurring") &&
    (value.locationStatus === "none" ||
      value.locationStatus === "pending" ||
      value.locationStatus === "attached" ||
      value.locationStatus === "failed" ||
      value.locationStatus === "skipped") &&
    isString(value.createdAt) &&
    isString(value.updatedAt)
  );
}

function parseSnapshot(value: unknown): StartupSnapshotV1 | undefined {
  if (!isRecord(value) || value.version !== 1 || !isString(value.savedAt)) return undefined;
  if (!isMeta(value.meta) || !isRecord(value.session) || !isRecord(value.today)) return undefined;
  if (
    value.session.authenticated !== true ||
    !isString(value.session.expiresAt) ||
    !isSettings(value.session.settings) ||
    !isString(value.today.date) ||
    !isDailyDashboard(value.today.dashboard) ||
    value.today.dashboard.date !== value.today.date ||
    !Array.isArray(value.today.transactions) ||
    value.today.transactions.length > 200 ||
    !value.today.transactions.every(isCachedTransaction)
  )
    return undefined;
  return value as StartupSnapshotV1;
}

function todayInTimezoneAt(timezone: string, now: Date) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function storageOrUndefined(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function clearStartupSnapshot(storage = storageOrUndefined()) {
  try {
    storage?.removeItem(STARTUP_SNAPSHOT_STORAGE_KEY);
  } catch {
    // Startup must continue when storage is disabled.
  }
}

export function loadStartupSnapshot(
  storage = storageOrUndefined(),
  now = new Date(),
): StartupSnapshotV1 | undefined {
  try {
    const serialized = storage?.getItem(STARTUP_SNAPSHOT_STORAGE_KEY);
    if (!serialized) return undefined;
    const snapshot = parseSnapshot(JSON.parse(serialized));
    const expiresAt = snapshot ? Date.parse(snapshot.session.expiresAt) : Number.NaN;
    const savedAt = snapshot ? Date.parse(snapshot.savedAt) : Number.NaN;
    if (
      !snapshot ||
      !Number.isFinite(savedAt) ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= now.getTime()
    ) {
      clearStartupSnapshot(storage);
      return undefined;
    }
    return snapshot;
  } catch {
    clearStartupSnapshot(storage);
    return undefined;
  }
}

export function hydrateStartupSnapshot(
  queryClient: QueryClient,
  storage = storageOrUndefined(),
  now = new Date(),
) {
  const snapshot = loadStartupSnapshot(storage, now);
  if (!snapshot) return undefined;
  const currentDate = todayInTimezoneAt(snapshot.session.settings.timezone, now);
  queryClient.setQueryData(["meta"], snapshot.meta, { updatedAt: 0 });
  queryClient.setQueryData(["session"], { ...snapshot.session, csrfToken: "" } satisfies Session, {
    updatedAt: 0,
  });
  if (snapshot.today.date === currentDate) {
    queryClient.setQueryData(["dashboard", "day", snapshot.today.date], snapshot.today.dashboard, {
      updatedAt: 0,
    });
    queryClient.setQueryData(
      ["transactions", { from: snapshot.today.date, to: addDays(snapshot.today.date, 1) }],
      snapshot.today.transactions,
      { updatedAt: 0 },
    );
  }
  return snapshot;
}

export function saveTodayStartupSnapshot(
  input: SnapshotInput,
  storage = storageOrUndefined(),
  now = new Date(),
) {
  if (
    !storage ||
    !input.meta.initialized ||
    !input.session.csrfToken ||
    input.dashboard.date !== input.date ||
    input.date !== todayInTimezoneAt(input.session.settings.timezone, now)
  )
    return;
  const transactions = input.transactions.map((transaction) => {
    const sanitized = { ...transaction };
    delete sanitized.clientRequestId;
    delete sanitized.location;
    return sanitized;
  });
  const snapshot: StartupSnapshotV1 = {
    version: 1,
    savedAt: now.toISOString(),
    meta: input.meta,
    session: {
      authenticated: true,
      expiresAt: input.session.expiresAt,
      settings: input.session.settings,
    },
    today: { date: input.date, dashboard: input.dashboard, transactions },
  };
  try {
    storage.setItem(STARTUP_SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // The live query cache still works when storage is full or disabled.
  }
}
