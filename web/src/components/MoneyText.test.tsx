import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MoneyText } from "./MoneyText";

describe("MoneyText", () => {
  it("renders explicit income and expense signs", () => {
    const { rerender } = render(<MoneyText amount={1200} kind="income" />);
    expect(screen.getByText(/\+.*1,200/)).toBeInTheDocument();
    rerender(<MoneyText amount={1200} kind="expense" />);
    expect(screen.getByText(/−.*1,200/)).toBeInTheDocument();
  });
});
