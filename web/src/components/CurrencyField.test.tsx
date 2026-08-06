import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { CurrencyField } from "./CurrencyField";
import { UIProvider } from "./ui";

function Harness() {
  const [currency, setCurrency] = useState("TWD");
  return (
    <UIProvider>
      <CurrencyField
        currencies={[
          { code: "TWD", exponent: 0 },
          { code: "USD", exponent: 2 },
          { code: "KWD", exponent: 3 },
        ]}
        value={currency}
        onValueChange={setCurrency}
      />
    </UIProvider>
  );
}

describe("CurrencyField", () => {
  it("searches by code and selects a currency", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "帳本幣別" }));
    await user.type(screen.getByRole("searchbox", { name: "搜尋幣別" }), "USD");
    await user.click(screen.getByRole("option", { name: /USD/ }));
    expect(screen.getByRole("button", { name: "帳本幣別" })).toHaveTextContent("USD");
  });
});
