import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { Transaction } from "../../api/types";
import { TransactionRow } from "./TransactionRow";

const transaction: Transaction = {
  id: 1,
  kind: "expense",
  amountMinor: 180,
  currencyCode: "TWD",
  category: { id: 1, kind: "expense", name: "飲食", iconKey: "food", sortOrder: 0 },
  title: "",
  occurredAt: "2026-08-05T04:31:00Z",
  occurredLocalDate: "2026-08-05",
  source: "manual",
  locationStatus: "attached",
  createdAt: "2026-08-05T04:31:01Z",
  updatedAt: "2026-08-05T04:31:01Z",
};

describe("TransactionRow", () => {
  it("uses the category as primary text when title is empty", () => {
    render(<MemoryRouter><TransactionRow transaction={transaction} /></MemoryRouter>);
    expect(screen.getByText("飲食")).toBeInTheDocument();
    expect(screen.queryByText("Untitled")).not.toBeInTheDocument();
    expect(screen.getByLabelText("已附上輸入位置")).toBeInTheDocument();
  });
});

