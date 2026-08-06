import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { setCSRFToken } from "../../api/client";
import type { Meta, Settings } from "../../api/types";
import { ToastProvider } from "../../components/Toast/ToastProvider";
import { UIProvider } from "../../components/ui";
import { SettingsPage } from "./SettingsPage";

const settings: Settings = {
  currencyCode: "TWD",
  currencyExponent: 0,
  timezone: "Asia/Taipei",
  locale: "zh-TW",
  theme: "system",
  automaticLocationEnabled: false,
};

const meta: Meta = {
  name: "Simfiment",
  version: "test",
  initialized: true,
  defaultLocale: "zh-TW",
  currencies: [{ code: "TWD", exponent: 0 }],
};

describe("SettingsPage backup restore", () => {
  it("requires confirmation and uploads the selected SQLite file", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/v1/operations/status")
        return new Response(JSON.stringify({ data: { databaseHealthy: true } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      if (url === "/api/v1/backups/restore" && init?.method === "POST")
        return new Response(
          JSON.stringify({
            error: {
              code: "invalid_backup",
              message: "選取的檔案不是有效的 Simfiment 備份。",
              requestId: "req_test",
            },
          }),
          { status: 422, headers: { "Content-Type": "application/json" } },
        );
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    setCSRFToken("csrf-test");
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/settings"]}>
          <UIProvider>
            <ToastProvider>
              <SettingsPage settings={settings} meta={meta} />
            </ToastProvider>
          </UIProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByText("完整備份與還原");
    const input = screen.getByLabelText("選擇備份檔");
    const file = new File(["SQLite format 3\0test"], "ledger.db", {
      type: "application/vnd.sqlite3",
    });
    await user.upload(input, file);
    expect(await screen.findByRole("heading", { name: "以備份取代所有資料" })).toBeVisible();
    expect(screen.getByText(/ledger\.db/)).toBeVisible();
    expect(
      fetchMock.mock.calls.filter((call) => String(call[0]) === "/api/v1/backups/restore"),
    ).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "取代所有資料" }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter((call) => String(call[0]) === "/api/v1/backups/restore"),
      ).toHaveLength(1),
    );
    const restoreCall = fetchMock.mock.calls.find(
      (call) => String(call[0]) === "/api/v1/backups/restore",
    );
    expect(restoreCall?.[1]?.body).toBe(file);
    expect(new Headers(restoreCall?.[1]?.headers).get("Content-Type")).toBe(
      "application/vnd.sqlite3",
    );
    expect(await screen.findByText("選取的檔案不是有效的 Simfiment 備份。")).toBeVisible();
  });
});
