import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it } from "vitest";
import type { DailyDashboard, Meta, Session, Transaction } from "../api/types";
import {
  STARTUP_SNAPSHOT_STORAGE_KEY,
  clearStartupSnapshot,
  hydrateStartupSnapshot,
  loadStartupSnapshot,
  saveTodayStartupSnapshot,
} from "./startupSnapshot";

const now = new Date("2026-08-06T04:00:00.000Z");
const meta: Meta = {
  name: "Simfiment",
  version: "test",
  initialized: true,
  defaultLocale: "zh-TW",
  currencies: [{ code: "TWD", exponent: 0 }],
};
const session: Session = {
  authenticated: true,
  expiresAt: "2026-09-05T04:00:00.000Z",
  csrfToken: "secret-csrf",
  settings: {
    currencyCode: "TWD",
    currencyExponent: 0,
    timezone: "Asia/Taipei",
    locale: "zh-TW",
    theme: "system",
    automaticLocationEnabled: false,
  },
};
const dashboard: DailyDashboard = {
  date: "2026-08-06",
  currencyCode: "TWD",
  totals: { incomeMinor: 0, expenseMinor: 125, netMinor: -125, transactionCount: 1 },
  expenseCategories: [
    { categoryId: 1, name: "餐飲", iconKey: "food", amountMinor: 125, transactionCount: 1 },
  ],
  incomeCategories: [],
};
const transactions: Transaction[] = [
  {
    id: 7,
    clientRequestId: "private-request-id",
    kind: "expense",
    amountMinor: 125,
    currencyCode: "TWD",
    category: {
      id: 1,
      kind: "expense",
      name: "餐飲",
      iconKey: "food",
      sortOrder: 0,
    },
    title: "午餐",
    occurredAt: "2026-08-06T04:00:00.000Z",
    occurredLocalDate: "2026-08-06",
    source: "manual",
    locationStatus: "attached",
    location: {
      latitude: 25.033,
      longitude: 121.5654,
      accuracyM: 8,
      capturedAt: "2026-08-06T04:00:00.000Z",
    },
    createdAt: "2026-08-06T04:00:00.000Z",
    updatedAt: "2026-08-06T04:00:00.000Z",
  },
];

beforeEach(() => localStorage.clear());

describe("today startup snapshot", () => {
  it("persists only the safe Today fields and hydrates them as stale data", () => {
    saveTodayStartupSnapshot(
      { meta, session, date: "2026-08-06", dashboard, transactions },
      localStorage,
      now,
    );

    const serialized = localStorage.getItem(STARTUP_SNAPSHOT_STORAGE_KEY) ?? "";
    expect(serialized).not.toContain("secret-csrf");
    expect(serialized).not.toContain("private-request-id");
    expect(serialized).not.toContain("25.033");
    expect(serialized).not.toContain("121.5654");

    const client = new QueryClient();
    expect(hydrateStartupSnapshot(client, localStorage, now)).toBeDefined();
    expect(client.getQueryData<Session>(["session"])).toMatchObject({
      csrfToken: "",
      settings: { timezone: "Asia/Taipei" },
    });
    expect(client.getQueryData(["dashboard", "day", "2026-08-06"])).toEqual(dashboard);
    expect(client.getQueryData(["transactions", { from: "2026-08-06", to: "2026-08-07" }])).toEqual(
      [{ ...transactions[0], clientRequestId: undefined, location: undefined }],
    );
    expect(client.getQueryState(["session"])?.dataUpdatedAt).toBe(0);
  });

  it("does not hydrate yesterday's ledger data into a new day", () => {
    saveTodayStartupSnapshot(
      { meta, session, date: "2026-08-06", dashboard, transactions },
      localStorage,
      now,
    );
    const tomorrow = new Date("2026-08-06T16:01:00.000Z");
    const client = new QueryClient();

    hydrateStartupSnapshot(client, localStorage, tomorrow);

    expect(client.getQueryData(["meta"])).toEqual(meta);
    expect(client.getQueryData(["session"])).toBeDefined();
    expect(client.getQueryData(["dashboard", "day", "2026-08-06"])).toBeUndefined();
    expect(localStorage.getItem(STARTUP_SNAPSHOT_STORAGE_KEY)).not.toBeNull();
  });

  it("removes malformed and expired snapshots", () => {
    localStorage.setItem(STARTUP_SNAPSHOT_STORAGE_KEY, "not-json");
    expect(loadStartupSnapshot(localStorage, now)).toBeUndefined();
    expect(localStorage.getItem(STARTUP_SNAPSHOT_STORAGE_KEY)).toBeNull();

    saveTodayStartupSnapshot(
      {
        meta,
        session: { ...session, expiresAt: "2026-08-06T03:59:59.000Z" },
        date: "2026-08-06",
        dashboard,
        transactions,
      },
      localStorage,
      now,
    );
    expect(loadStartupSnapshot(localStorage, now)).toBeUndefined();
    expect(localStorage.getItem(STARTUP_SNAPSHOT_STORAGE_KEY)).toBeNull();
  });

  it("continues safely when browser storage is unavailable", () => {
    const unavailable = {
      getItem: () => {
        throw new DOMException("disabled");
      },
      removeItem: () => {
        throw new DOMException("disabled");
      },
    } as unknown as Storage;

    expect(loadStartupSnapshot(unavailable, now)).toBeUndefined();
    expect(() => clearStartupSnapshot(unavailable)).not.toThrow();
  });
});
