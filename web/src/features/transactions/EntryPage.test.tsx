import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Settings } from "../../api/types";
import { ToastProvider } from "../../components/Toast/ToastProvider";
import { EntryPage } from "./EntryPage";

const settings: Settings = {
  currencyCode: "TWD",
  currencyExponent: 0,
  timezone: "Asia/Taipei",
  locale: "zh-TW",
  theme: "system",
  automaticLocationEnabled: false,
};
const category = { id: 1, kind: "expense", name: "飲食", iconKey: "food", sortOrder: 0 };
function renderEntry(readOnly = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ToastProvider>
          <EntryPage
            settings={{ ...settings, automaticLocationEnabled: readOnly }}
            readOnly={readOnly}
          />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
afterEach(() => vi.unstubAllGlobals());

describe("quick entry", () => {
  it("preserves a failed draft and retry identity, then stays open for the next transaction", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/categories")) return Response.json({ data: [category] });
        if (url.includes("/budgets?"))
          return Response.json({ data: { month: "2026-09", currencyCode: "TWD", items: [] } });
        if (url === "/api/v1/transactions") {
          const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
          bodies.push(body);
          if (bodies.length === 1)
            return Response.json(
              { error: { code: "temporary", message: "Please retry" } },
              { status: 503 },
            );
          return Response.json({ data: { ...body, id: bodies.length, locationStatus: "none" } });
        }
        throw new Error(url);
      }),
    );
    renderEntry();
    let amount = screen.getByRole("textbox", { name: /金額/ });
    fireEvent.change(amount, { target: { value: "270" } });
    fireEvent.click(await screen.findByRole("button", { name: "飲食" }));
    fireEvent.click(screen.getByRole("switch", { name: "追蹤借還款" }));
    fireEvent.change(screen.getByLabelText(/對象/), { target: { value: "Alex" } });
    fireEvent.click(screen.getByRole("button", { name: "儲存支出" }));
    await screen.findByText("Please retry");
    expect(amount).toHaveValue("270");
    expect(screen.getByLabelText(/對象/)).toHaveValue("Alex");
    fireEvent.click(screen.getByRole("button", { name: "儲存支出" }));
    await waitFor(() => expect(screen.getByRole("textbox", { name: /金額/ })).toHaveValue(""));
    amount = screen.getByRole("textbox", { name: /金額/ });
    expect(bodies[1]).toEqual(bodies[0]);
    expect(bodies[1]?.settlement).toEqual({ counterparty: "Alex", dueOn: "" });
    expect(screen.getByRole("heading", { name: "記一筆" })).toBeVisible();
    fireEvent.change(amount, { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "飲食" }));
    fireEvent.click(screen.getByRole("button", { name: "儲存支出" }));
    await waitFor(() => expect(bodies).toHaveLength(3));
    expect(bodies[2]?.clientRequestId).not.toEqual(bodies[1]?.clientRequestId);
    expect(bodies[2]?.settlement).toBeUndefined();
  });

  it("does not enable saving or acquire a location before session verification", () => {
    const capture = vi.fn();
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition: capture },
    });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    renderEntry(true);
    expect(screen.getByRole("button", { name: "儲存支出" })).toBeDisabled();
    expect(fetch).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
  });
});
