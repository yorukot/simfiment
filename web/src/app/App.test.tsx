import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCSRFToken } from "../api/client";
import type { DailyDashboard, Meta, Session, Transaction } from "../api/types";
import { ToastProvider } from "../components/Toast/ToastProvider";
import { UIProvider } from "../components/ui";
import { I18nProvider, initializeLocale } from "../i18n";
import { addDays, todayInTimezone } from "../lib/date";
import { App } from "./App";
import {
  STARTUP_SNAPSHOT_STORAGE_KEY,
  hydrateStartupSnapshot,
  saveTodayStartupSnapshot,
} from "./startupSnapshot";

function dataResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errorResponse(status: number, code: string, message: string) {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

const meta: Meta = {
  name: "Simfiment",
  version: "test",
  initialized: true,
  defaultLocale: "zh-TW",
  currencies: [{ code: "TWD", exponent: 0 }],
};

function fixtures() {
  const date = todayInTimezone("Asia/Taipei");
  const session: Session = {
    authenticated: true,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString(),
    csrfToken: "fresh-csrf",
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
    date,
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
      title: "快照午餐",
      occurredAt: new Date().toISOString(),
      occurredLocalDate: date,
      source: "manual",
      locationStatus: "none",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
  return { date, session, dashboard, transactions };
}

function seededClient() {
  const values = fixtures();
  saveTodayStartupSnapshot({ meta, ...values }, localStorage);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 20_000 }, mutations: { retry: false } },
  });
  hydrateStartupSnapshot(client, localStorage);
  return { client, ...values };
}

function renderApp(client: QueryClient) {
  return render(
    <I18nProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/today"]}>
          <UIProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </UIProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </I18nProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("simfiment.locale", "zh-TW");
  initializeLocale();
  setCSRFToken("");
});

afterEach(() => {
  vi.unstubAllGlobals();
  setCSRFToken("");
});

describe("App cached startup", () => {
  it("renders the Today snapshot immediately and unlocks it after session verification", async () => {
    const sessionRequest = deferred<Response>();
    const { client, session, dashboard, transactions, date } = seededClient();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/v1/meta") return Promise.resolve(dataResponse(meta));
        if (url === "/api/v1/session") return sessionRequest.promise;
        if (url === `/api/v1/dashboards/day?date=${date}`)
          return Promise.resolve(dataResponse(dashboard));
        if (url === `/api/v1/transactions?from=${date}&to=${addDays(date, 1)}&limit=200`)
          return Promise.resolve(dataResponse(transactions));
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    const view = renderApp(client);

    expect(screen.getByText("快照午餐")).toBeVisible();
    expect(screen.queryByRole("status", { name: "載入中" })).not.toBeInTheDocument();
    expect(view.container.querySelector("[inert]")).toHaveAttribute("aria-busy", "true");
    fireEvent.keyDown(document, { key: "n" });
    expect(screen.queryByRole("heading", { name: "記錄交易" })).not.toBeInTheDocument();

    sessionRequest.resolve(dataResponse(session));
    await waitFor(() => expect(view.container.querySelector("[inert]")).toBeNull());
    expect(screen.getByRole("button", { name: "記一筆" })).toBeEnabled();
  });

  it("clears cached ledger data and shows login when verification returns 401", async () => {
    const { client, dashboard, transactions, date } = seededClient();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/v1/meta") return dataResponse(meta);
        if (url === "/api/v1/session")
          return errorResponse(401, "authentication_required", "請先登入。");
        if (url === `/api/v1/dashboards/day?date=${date}`) return dataResponse(dashboard);
        if (url.startsWith("/api/v1/transactions?")) return dataResponse(transactions);
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    renderApp(client);

    expect(await screen.findByRole("heading", { name: "登入 Simfiment" })).toBeVisible();
    await waitFor(() => expect(localStorage.getItem(STARTUP_SNAPSHOT_STORAGE_KEY)).toBeNull());
    expect(screen.queryByText("快照午餐")).not.toBeInTheDocument();
  });

  it("keeps cached data read-only and offers retry when verification is offline", async () => {
    const { client, dashboard, transactions, date } = seededClient();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/v1/meta") return dataResponse(meta);
        if (url === `/api/v1/dashboards/day?date=${date}`) return dataResponse(dashboard);
        if (url.startsWith("/api/v1/transactions?")) return dataResponse(transactions);
        throw new TypeError("offline");
      }),
    );

    const view = renderApp(client);

    expect(screen.getByText("快照午餐")).toBeVisible();
    expect(await screen.findByRole("alert")).toHaveTextContent("確認登入前只能瀏覽");
    expect(screen.getByRole("button", { name: "再試一次" })).toBeEnabled();
    expect(view.container.querySelector("[inert]")).toBeInTheDocument();
  });
});
