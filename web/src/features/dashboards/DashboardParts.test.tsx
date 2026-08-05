import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CategoryTotal } from "../../api/types";
import { CategoryBars, categoryShare } from "./DashboardParts";

const categories: CategoryTotal[] = [
  { categoryId: 1, name: "交通", iconKey: "transport", amountMinor: 111, transactionCount: 1 },
  { categoryId: 2, name: "飲食", iconKey: "food", amountMinor: 80, transactionCount: 1 },
];

describe("CategoryBars", () => {
  it("shows each category amount and share of the period total", () => {
    const { container } = render(<CategoryBars items={categories} currency="TWD" kind="expense" />);

    expect(screen.getByText("58%")).toBeInTheDocument();
    expect(screen.getByText("42%")).toBeInTheDocument();
    expect(screen.getByText("NT$ 111")).toBeInTheDocument();
    expect(screen.queryByText(/1 筆/)).not.toBeInTheDocument();
    const bars = container.querySelectorAll<HTMLElement>("[aria-hidden='true'] > div");
    expect(bars[0]).toHaveStyle({ width: "58.12%" });
    expect(bars[1]).toHaveStyle({ width: "41.88%" });
  });

  it("formats whole, tiny, and empty shares", () => {
    expect(categoryShare(10, 10)).toEqual({ percentage: 100, label: "100%" });
    expect(categoryShare(1, 1000)).toEqual({ percentage: 0.1, label: "<1%" });
    expect(categoryShare(0, 0)).toEqual({ percentage: 0, label: "0%" });
  });
});
