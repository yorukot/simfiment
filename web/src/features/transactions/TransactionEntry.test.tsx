import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { ToastProvider } from "../../components/Toast/ToastProvider";
import type { Settings } from "../../api/types";
import { TransactionEntry } from "./TransactionEntry";

const settings: Settings = { currencyCode: "TWD", currencyExponent: 0, timezone: "Asia/Taipei", locale: "zh-TW", theme: "system", automaticLocationEnabled: false };
const category = { id: 1, kind: "expense", name: "飲食", iconKey: "food", sortOrder: 0 };

function wrapper(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}><MemoryRouter><ToastProvider>{children}</ToastProvider></MemoryRouter></QueryClientProvider>;
}

describe("TransactionEntry", () => {
  it("keeps save disabled for zero, then sends one transaction with an empty title", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/categories")) return new Response(JSON.stringify({ data: [category] }), { status: 200, headers: { "Content-Type": "application/json" } });
      if (url === "/api/v1/transactions" && init?.method === "POST") return new Response(JSON.stringify({ data: {
        id: 42, kind: "expense", amountMinor: 180, currencyCode: "TWD", category, title: "", occurredAt: "2026-08-05T04:31:00Z", occurredLocalDate: "2026-08-05", source: "manual", locationStatus: "none", createdAt: "2026-08-05T04:31:01Z", updatedAt: "2026-08-05T04:31:01Z",
      }}), { status: 201, headers: { "Content-Type": "application/json" } });
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const onClose = vi.fn();
    const view = render(wrapper(<TransactionEntry open settings={settings} onClose={onClose} />));
    const save = await screen.findByRole("button", { name: "儲存支出" });
    const amount = screen.getByRole("spinbutton", { name: /金額/ });
    fireEvent.change(amount, { target: { value: "0" } });
    expect(save).toBeDisabled();
    fireEvent.change(amount, { target: { value: "180" } });
    fireEvent.click(await screen.findByRole("button", { name: "飲食" }));
    expect(save).toBeEnabled();
    fireEvent.click(save);
    fireEvent.click(save);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const posts = fetchMock.mock.calls.filter((call) => String(call[0]) === "/api/v1/transactions");
    expect(posts).toHaveLength(1);
    const body = JSON.parse(String(posts[0]?.[1]?.body)) as { title: string; amountMinor: number };
    expect(body.title).toBe("");
    expect(body.amountMinor).toBe(180);

    view.rerender(wrapper(<TransactionEntry open={false} settings={settings} onClose={onClose} />));
    view.rerender(wrapper(<TransactionEntry open settings={settings} onClose={onClose} />));
    const nextAmount = screen.getByRole("spinbutton", { name: /金額/ });
    expect(nextAmount).toHaveValue(null);
    fireEvent.change(nextAmount, { target: { value: "90" } });
    fireEvent.click(await screen.findByRole("button", { name: "飲食" }));
    fireEvent.click(screen.getByRole("button", { name: "儲存支出" }));
    await waitFor(() => expect(fetchMock.mock.calls.filter((call) => String(call[0]) === "/api/v1/transactions")).toHaveLength(2));
    const allPosts = fetchMock.mock.calls.filter((call) => String(call[0]) === "/api/v1/transactions");
    const firstRequest = JSON.parse(String(allPosts[0]?.[1]?.body)) as { clientRequestId: string };
    const secondRequest = JSON.parse(String(allPosts[1]?.[1]?.body)) as { clientRequestId: string };
    expect(secondRequest.clientRequestId).not.toBe(firstRequest.clientRequestId);
  });
});
