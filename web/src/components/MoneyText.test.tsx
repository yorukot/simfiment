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

  it("renders stored minor units with the configured exponent", () => {
    const { rerender } = render(
      <MoneyText amount={1234} currency="USD" exponent={2} showSign={false} />,
    );
    expect(screen.getByText(/12\.34/)).toBeInTheDocument();
    rerender(<MoneyText amount={12345} currency="KWD" exponent={3} showSign={false} />);
    expect(screen.getByText(/12\.345/)).toBeInTheDocument();
  });
});
