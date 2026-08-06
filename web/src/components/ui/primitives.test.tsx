import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  AdaptiveModal,
  Button,
  IconPickerField,
  SegmentedControl,
  SelectField,
  SwitchField,
  TextField,
  UIProvider,
} from ".";

function Harness() {
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [category, setCategory] = useState("");
  const [location, setLocation] = useState(false);
  const [open, setOpen] = useState(false);
  return (
    <UIProvider>
      <TextField label="標題" supportingText="最多 80 個字元" />
      <SegmentedControl
        label="交易類型"
        value={kind}
        onValueChange={setKind}
        options={[
          { value: "expense", label: "支出" },
          { value: "income", label: "收入" },
        ]}
      />
      <SelectField
        label="分類"
        value={category}
        onValueChange={setCategory}
        options={[
          { value: "food", label: "飲食" },
          { value: "home", label: "居家" },
        ]}
        required
      />
      <SwitchField checked={location} onCheckedChange={setLocation} label="附上位置" />
      <Button onClick={() => setOpen(true)}>開啟表單</Button>
      <AdaptiveModal open={open} onOpenChange={setOpen} title="測試表單">
        <p>對話內容</p>
      </AdaptiveModal>
    </UIProvider>
  );
}

const searchableIcons = Array.from({ length: 25 }, (_, index) => ({
  value: `icon_${index}`,
  label: index === 24 ? "Wallet" : `圖示 ${index}`,
  keywords: index === 24 ? "money wallet" : undefined,
  icon: <span aria-hidden="true">{index}</span>,
}));

function IconPickerHarness() {
  const [icon, setIcon] = useState("icon_0");
  return (
    <UIProvider>
      <IconPickerField
        label="圖示"
        value={icon}
        onValueChange={setIcon}
        options={searchableIcons}
      />
    </UIProvider>
  );
}

describe("Material UI primitives", () => {
  it("exposes accessible field, toggle, select, switch, and dialog behavior", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByRole("textbox", { name: "標題" })).toHaveAccessibleDescription(
      "最多 80 個字元",
    );

    const income = screen.getByRole("button", { name: "收入" });
    await user.click(income);
    expect(income).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("combobox", { name: /分類/ }));
    await user.click(screen.getByRole("option", { name: "居家" }));
    expect(screen.getByRole("combobox", { name: /分類/ })).toHaveTextContent("居家");

    const location = screen.getByRole("switch", { name: "附上位置" });
    await user.click(location);
    expect(location).toBeChecked();

    await user.click(screen.getByRole("button", { name: "開啟表單" }));
    expect(screen.getByRole("dialog", { name: /測試表單/ })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "關閉" }));
    expect(screen.queryByRole("dialog", { name: /測試表單/ })).not.toBeInTheDocument();
  });

  it("searches a large icon collection and selects a filtered result", async () => {
    const user = userEvent.setup();
    render(<IconPickerHarness />);

    await user.click(screen.getByRole("button", { name: "圖示：圖示 0" }));
    const search = screen.getByRole("searchbox", { name: "搜尋圖示" });
    expect(screen.getByRole("status")).toHaveTextContent("共 25 個圖示");

    await user.click(search);
    await user.type(search, "wallet");
    expect(screen.getByRole("status")).toHaveTextContent("找到 1 個圖示");
    expect(screen.queryByRole("button", { name: "圖示 0" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Wallet" }));

    expect(screen.getByRole("button", { name: "圖示：Wallet" })).toBeVisible();
  });
});
