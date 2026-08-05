import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const originalPassword = "playwright 測試密碼 1234";
const replacementPassword = "playwright 新測試密碼 5678";

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations, results.violations.map((violation) => `${violation.id}: ${violation.help}`).join("\n")).toEqual([]);
}

async function openEntry(page: Page) {
  await page.getByRole("button", { name: "記錄交易" }).last().click();
  await expect(page.getByRole("heading", { name: "記錄交易" })).toBeVisible();
  await expect(page.getByRole("spinbutton", { name: /金額/ })).toBeFocused();
}

async function saveTransaction(page: Page, input: { amount: string; category: string; title?: string; income?: boolean }) {
  await openEntry(page);
  if (input.income) await page.getByRole("tab", { name: "收入" }).click();
  await page.getByRole("spinbutton", { name: /金額/ }).fill(input.amount);
  await page.getByRole("button", { name: input.category, exact: true }).click();
  if (input.title) await page.getByLabel(/標題/).fill(input.title);
  await page.getByRole("button", { name: input.income ? "儲存收入" : "儲存支出" }).click();
  await expect(page.getByRole("heading", { name: "記錄交易" })).toBeHidden();
}

test("fresh-install finance workflow", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "建立你的私人帳本" })).toBeVisible();
  await expectAccessible(page);
  const setupCode = readFileSync(resolve("test-results/e2e-data/setup-code"), "utf8");
  await page.getByLabel("一次性設定碼").fill(setupCode);
  await page.getByLabel(/^新密碼/).fill(originalPassword);
  await page.getByLabel("確認密碼").fill(originalPassword);
  await page.getByRole("button", { name: "完成設定" }).click();
  await expect(page.getByRole("heading", { name: /年.*月.*日/ })).toBeVisible();

  await saveTransaction(page, { amount: "180", category: "飲食" });
  await expect(page.getByText("1 筆交易")).toBeVisible();
  await expect(page.getByRole("link", { name: /飲食.*−NT\$ 180/ })).toBeVisible();

  await saveTransaction(page, { amount: "500", category: "薪資", title: "E2E 薪資", income: true });
  await expect(page.getByText("+NT$ 500", { exact: true }).first()).toBeVisible();

  await openEntry(page);
  await page.getByRole("spinbutton", { name: /金額/ }).fill("60");
  await page.getByRole("button", { name: "＋ 新分類" }).click();
  await page.getByLabel("新分類名稱").fill("E2E 咖啡");
  await page.getByRole("button", { name: "建立" }).click();
  await expect(page.getByRole("button", { name: "E2E 咖啡" })).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel(/標題/).fill("E2E 拿鐵");
  await page.getByRole("button", { name: "儲存支出" }).click();
  await expect(page.getByText("3 筆交易")).toBeVisible();

  await page.getByRole("link", { name: /E2E 薪資/ }).click();
  await page.getByRole("button", { name: "編輯交易" }).click();
  await page.getByRole("spinbutton", { name: "金額", exact: true }).fill("550");
  await page.getByRole("button", { name: "儲存變更" }).click();
  await expect(page.getByText("+NT$ 550", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "返回" }).click();

  await page.getByRole("link", { name: /E2E 拿鐵/ }).click();
  await page.getByRole("button", { name: "刪除交易" }).click();
  await expect(page.getByText("這筆交易已刪除，不會計入儀表板。你仍可在這裡還原。")).toBeVisible();
  await page.getByRole("button", { name: "復原" }).click();
  await expect(page.getByRole("button", { name: "編輯交易" })).toBeVisible();
  await page.getByRole("button", { name: "返回" }).click();

  await openEntry(page);
  await page.getByRole("spinbutton", { name: /金額/ }).fill("40");
  await page.getByRole("button", { name: "交通", exact: true }).click();
  await page.getByLabel(/標題/).fill("E2E 定位交易");
  await page.getByText("其他選項").click();
  await page.getByRole("checkbox", { name: /附上這筆交易的輸入位置/ }).check();
  await expect(page.getByText("位置：已取得")).toBeVisible();
  await page.getByRole("button", { name: "儲存支出" }).click();
  const locatedRow = page.getByRole("link", { name: /E2E 定位交易/ });
  await expect(locatedRow.getByLabel("已附上輸入位置")).toBeVisible();

  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: {
      getCurrentPosition: (_success: PositionCallback, failure?: PositionErrorCallback | null) => {
        failure?.({ code: 1, message: "denied", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError);
      },
    } });
  });
  await page.reload();
  await expect(page.getByRole("link", { name: /今天/ })).toBeVisible();
  await openEntry(page);
  await page.getByRole("spinbutton", { name: /金額/ }).fill("25");
  await page.getByRole("button", { name: "交通", exact: true }).click();
  await page.getByLabel(/標題/).fill("E2E 拒絕定位仍儲存");
  await page.getByText("其他選項").click();
  await page.getByRole("checkbox", { name: /附上這筆交易的輸入位置/ }).check();
  await expect(page.getByText("位置：權限遭拒")).toBeVisible();
  await page.getByRole("button", { name: "儲存支出" }).click();
  await page.getByRole("link", { name: /E2E 拒絕定位仍儲存/ }).click();
  await expect(page.getByText("擷取失敗", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "返回" }).click();

  await page.getByRole("link", { name: /月份/ }).click();
  await expect(page.getByRole("heading", { name: /年.*月/ })).toBeVisible();
  await expect(page.getByText("+NT$ 550", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("img", { name: /每日收入與支出長條圖/ })).toBeVisible();
  await expectAccessible(page);

  await page.getByRole("link", { name: /週期/ }).click();
  const today = await page.evaluate(() => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()));
  await page.getByRole("button", { name: "＋ 新規則" }).click();
  await page.getByRole("spinbutton", { name: "金額", exact: true }).fill("1000");
  await page.getByLabel("分類").selectOption({ label: "居家" });
  await page.getByRole("textbox", { name: "標題（選填）", exact: true }).fill("E2E 租金");
  await page.getByLabel("開始日期").fill(today);
  await page.getByRole("button", { name: "儲存規則" }).click();
  const rentOccurrence = page.getByText("E2E 租金", { exact: true }).first().locator("../..");
  await rentOccurrence.getByRole("button", { name: "確認", exact: true }).click();
  await expect(page.getByText("週期項目已確認並記入交易。")).toBeVisible();

  await page.getByRole("button", { name: "＋ 新規則" }).click();
  await page.getByRole("spinbutton", { name: "金額", exact: true }).fill("75");
  await page.getByLabel("分類").selectOption({ label: "訂閱" });
  await page.getByRole("textbox", { name: "標題（選填）", exact: true }).fill("E2E 略過項目");
  await page.getByLabel("頻率").selectOption("weekly");
  await page.getByLabel("開始日期").fill(today);
  await page.getByRole("button", { name: "儲存規則" }).click();
  const skippedOccurrence = page.getByText("E2E 略過項目", { exact: true }).first().locator("../..");
  await skippedOccurrence.getByRole("button", { name: "略過", exact: true }).click();
  await expect(page.getByText("已略過這次週期項目。")).toBeVisible();
  await expectAccessible(page);

  await page.getByRole("link", { name: /設定/ }).click();
  await expectAccessible(page);
  await page.getByLabel("外觀主題").selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.waitForTimeout(250);
  await expectAccessible(page);
  await page.getByLabel("目前密碼").fill(originalPassword);
  await page.getByLabel("新密碼", { exact: true }).fill(replacementPassword);
  await page.getByLabel("確認新密碼").fill(replacementPassword);
  await page.getByRole("button", { name: "更新密碼" }).click();
  await expect(page.getByText("密碼已變更，其他登入階段已撤銷。")).toBeVisible();
  await page.getByRole("button", { name: "登出" }).click();
  await expect(page.getByRole("heading", { name: "登入 Simfiment" })).toBeVisible();
  await page.getByLabel("密碼").fill(replacementPassword);
  await page.getByRole("button", { name: "登入" }).click();
  await expect(page.getByRole("link", { name: /今天/ })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 720 });
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  await expect(page.getByRole("link", { name: /今天/ })).toBeVisible();
  await expectAccessible(page);
  const viewport = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(viewport.scroll).toBeLessThanOrEqual(viewport.client);
});
