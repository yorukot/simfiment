import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const originalPassword = "playwright 測試密碼 1234";
const replacementPassword = "playwright 新測試密碼 5678";

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations,
    results.violations.map((violation) => `${violation.id}: ${violation.help}`).join("\n"),
  ).toEqual([]);
}

async function dismissNotifications(page: Page) {
  const notifications = page.getByRole("dialog", { name: "通知" });
  while ((await notifications.count()) > 0) {
    const count = await notifications.count();
    await notifications.first().locator("button").last().click();
    await expect(notifications).toHaveCount(count - 1);
  }
}

async function openEntry(page: Page) {
  await page.keyboard.press("Escape");
  await page.locator("body").click({ position: { x: 1, y: 1 } });
  await page.keyboard.press("n");
  await expect(page.getByRole("heading", { name: "記錄交易" })).toBeVisible();
  const amountInput = page.getByRole("textbox", { name: /金額/ });
  await expect(amountInput).toBeFocused();
  const focusLayout = await amountInput.evaluate((input) => {
    const inputRect = input.getBoundingClientRect();
    const groupRect = input.parentElement!.getBoundingClientRect();
    return {
      contained:
        inputRect.left >= groupRect.left &&
        inputRect.top >= groupRect.top &&
        inputRect.right <= groupRect.right &&
        inputRect.bottom <= groupRect.bottom,
      outlineStyle: getComputedStyle(input).outlineStyle,
    };
  });
  expect(focusLayout).toEqual({ contained: true, outlineStyle: "none" });
}

async function selectOption(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

async function saveTransaction(
  page: Page,
  input: { amount: string; category: string; title?: string; income?: boolean },
) {
  await openEntry(page);
  if (input.income) await page.getByRole("button", { name: "收入" }).click();
  await page.getByRole("textbox", { name: /金額/ }).fill(input.amount);
  await page.getByRole("button", { name: input.category, exact: true }).click();
  if (input.title) await page.getByLabel(/標題/).fill(input.title);
  await page.getByRole("button", { name: input.income ? "儲存收入" : "儲存支出" }).click();
  await expect(page.getByRole("heading", { name: "記錄交易" })).toBeHidden();
}

test("fresh-install finance workflow", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    "/manifest.webmanifest",
  );
  const manifestResponse = await page.request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBe(true);
  expect(manifestResponse.headers()["content-type"]).toContain("application/manifest+json");
  expect(await manifestResponse.json()).toMatchObject({
    name: "Simfiment",
    short_name: "Simfiment",
    display: "standalone",
    start_url: "/entry",
    background_color: "#0f1113",
    theme_color: "#0f1113",
    icons: expect.arrayContaining([
      expect.objectContaining({ sizes: "192x192", purpose: "any" }),
      expect.objectContaining({ sizes: "512x512", purpose: "maskable" }),
    ]),
  });
  const serviceWorkerResponse = await page.request.get("/sw.js");
  expect(serviceWorkerResponse.ok()).toBe(true);
  expect(serviceWorkerResponse.headers()["cache-control"]).toContain("no-cache");
  await expect
    .poll(() => page.evaluate(async () => Boolean(await navigator.serviceWorker.getRegistration())))
    .toBe(true);
  await expect(page.getByRole("heading", { name: "建立你的私人帳本" })).toBeVisible();
  await expectAccessible(page);
  await page.getByLabel(/^密碼/).fill(originalPassword);
  await page.getByLabel("確認密碼").fill(originalPassword);
  await expect(page.getByRole("button", { name: "帳本幣別" })).toContainText("TWD");
  await page.getByRole("button", { name: "完成設定" }).click();
  await expect(page).toHaveURL(/\/entry$/);
  await page.getByRole("link", { name: "今天", exact: true }).click();
  await expect(page.getByRole("heading", { name: /年.*月.*日/ })).toBeVisible();

  await saveTransaction(page, { amount: "180", category: "飲食" });
  await expect(page.getByText("1 筆交易")).toBeVisible();
  await expect(page.getByRole("link", { name: /飲食.*−NT\$ 180/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "今日支出分布" })).toBeVisible();
  await expect(page.getByText("100%", { exact: true })).toBeVisible();
  const todaySectionHeadings = await page.locator("main h2").allTextContents();
  expect(todaySectionHeadings.indexOf("交易")).toBeLessThan(
    todaySectionHeadings.indexOf("今日支出分布"),
  );

  await saveTransaction(page, { amount: "500", category: "薪資", title: "E2E 薪資", income: true });
  await expect(page.getByText("+NT$ 500", { exact: true }).first()).toBeVisible();

  await openEntry(page);
  await page.getByRole("textbox", { name: /金額/ }).fill("60");
  await page.getByRole("button", { name: "＋ 新分類" }).click();
  await page.getByLabel("新分類名稱").fill("E2E 咖啡");
  await page.getByRole("button", { name: "建立" }).click();
  await expect(page.getByRole("button", { name: "E2E 咖啡" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByLabel(/標題/).fill("E2E 拿鐵");
  await page.getByRole("button", { name: "儲存支出" }).click();
  await expect(page.getByText("3 筆交易")).toBeVisible();

  await page.getByRole("link", { name: /E2E 薪資/ }).click();
  await page.getByRole("button", { name: "編輯交易" }).click();
  const editedAmount = page.locator("main").getByRole("textbox", { name: /金額/ });
  await editedAmount.press("ControlOrMeta+A");
  await editedAmount.pressSequentially("550");
  await page.getByRole("button", { name: "儲存變更" }).click();
  await expect(page.getByText("+NT$ 550", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "返回" }).click();

  await page.getByRole("link", { name: /E2E 拿鐵/ }).click();
  await page.getByRole("button", { name: "刪除交易" }).click();
  await expect(page.getByText("這筆交易已刪除，不會計入儀表板。你仍可在這裡還原。")).toBeVisible();
  await page
    .getByRole("dialog")
    .filter({ hasText: "交易已刪除。" })
    .getByRole("button", { name: "復原" })
    .click();
  await expect(page.getByRole("button", { name: "編輯交易" })).toBeVisible();
  await page.getByRole("button", { name: "返回" }).click();

  await openEntry(page);
  await page.getByRole("textbox", { name: /金額/ }).fill("40");
  await page.getByRole("button", { name: "交通", exact: true }).click();
  await page.getByLabel(/標題/).fill("E2E 定位交易");
  await page.getByText("其他選項").click();
  await page.getByRole("switch", { name: /附上這筆交易的輸入位置/ }).click();
  await expect(page.getByText("位置：已取得")).toBeVisible();
  await page.getByRole("button", { name: "儲存支出" }).click();
  const locatedRow = page.getByRole("link", { name: /E2E 定位交易/ });
  await expect(locatedRow.getByLabel("已附上輸入位置")).toBeVisible();

  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (
          _success: PositionCallback,
          failure?: PositionErrorCallback | null,
        ) => {
          failure?.({
            code: 1,
            message: "denied",
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
          } as GeolocationPositionError);
        },
      },
    });
  });
  await page.reload();
  await expect(page.getByRole("link", { name: /今天/ })).toBeVisible();
  await openEntry(page);
  await page.getByRole("textbox", { name: /金額/ }).fill("25");
  await page.getByRole("button", { name: "交通", exact: true }).click();
  await page.getByLabel(/標題/).fill("E2E 拒絕定位仍儲存");
  await page.getByText("其他選項").click();
  await page.getByRole("switch", { name: /附上這筆交易的輸入位置/ }).click();
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

  await page.getByRole("link", { name: "更多", exact: true }).click();
  await page.getByRole("link", { name: /週期/ }).click();
  const today = await page.evaluate(() =>
    new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()),
  );
  await page.getByRole("button", { name: "新規則" }).click();
  await page.getByRole("textbox", { name: /金額/ }).fill("1000");
  await selectOption(page, "分類 *", "居家");
  await page.getByRole("textbox", { name: "標題（選填）", exact: true }).fill("E2E 租金");
  await page.getByLabel("開始日期").fill(today);
  await page.getByRole("button", { name: "儲存規則" }).click();
  const rentOccurrence = page.getByText("E2E 租金", { exact: true }).first().locator("../..");
  await rentOccurrence.getByRole("button", { name: "確認", exact: true }).click();
  await expect(page.getByText("週期項目已確認並記入交易。")).toBeVisible();

  await page.getByRole("button", { name: "新規則" }).click();
  await page.getByRole("textbox", { name: /金額/ }).fill("75");
  await selectOption(page, "分類 *", "訂閱");
  await page.getByRole("textbox", { name: "標題（選填）", exact: true }).fill("E2E 略過項目");
  await selectOption(page, "頻率 *", "週");
  await page.getByLabel("開始日期").fill(today);
  await page.getByRole("button", { name: "儲存規則" }).click();
  const skippedOccurrence = page
    .getByText("E2E 略過項目", { exact: true })
    .first()
    .locator("../..");
  await skippedOccurrence.getByRole("button", { name: "更多操作" }).click();
  await page.getByRole("menuitem", { name: "略過這一次" }).click();
  await expect(page.getByText("已略過這次週期項目。")).toBeVisible();
  await dismissNotifications(page);
  await expectAccessible(page);

  await page.getByRole("link", { name: "更多", exact: true }).click();
  await page.getByRole("link", { name: /設定/ }).click();
  await expectAccessible(page);
  await page.getByRole("link", { name: "分類", exact: true }).click();
  const newExpenseIcon = page.getByRole("button", {
    name: "新增支出分類圖示：預設圖示",
  });
  await newExpenseIcon.click();
  const iconMenu = page.getByRole("dialog", { name: "新增支出分類圖示" });
  const iconChoices = iconMenu.locator("button[aria-pressed]");
  await expect(iconChoices).toHaveCount(120);
  const iconGrid = iconChoices.first().locator("..");
  await expect(iconGrid).toHaveCSS("display", "grid");
  expect(
    await iconGrid.evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.split(" ").length),
  ).toBe(5);
  await expect(iconChoices.first().locator('[aria-hidden="true"]').first()).toBeVisible();
  await iconMenu.getByRole("searchbox", { name: "搜尋圖示" }).fill("健康");
  await iconMenu.getByRole("button", { name: "健康", exact: true }).click();
  await expect(page.getByRole("button", { name: "新增支出分類圖示：健康" })).toBeVisible();
  await page.getByRole("link", { name: "一般", exact: true }).click();
  await page.getByRole("button", { name: "深色" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.waitForTimeout(250);
  await expectAccessible(page);

  const currencyPicker = page.getByRole("button", { name: "帳本幣別" });
  await currencyPicker.click();
  await page.getByRole("searchbox", { name: "搜尋幣別" }).fill("USD");
  await page.getByRole("option", { name: /USD/ }).click();
  await page.getByRole("button", { name: "變更幣別" }).click();
  let currencyDialog = page.getByRole("dialog", { name: "確認變更整本帳的幣別" });
  await expect(currencyDialog.getByText(/不會依匯率換算/)).toBeVisible();
  await currencyDialog.getByRole("checkbox", { name: "我了解這會更新所有歷史與週期資料" }).check();
  await currencyDialog.getByRole("button", { name: "確認變更幣別" }).click();
  await expect(currencyPicker).toContainText("USD");

  await page.getByRole("link", { name: /今天/ }).click();
  await saveTransaction(page, {
    amount: "12.34",
    category: "飲食",
    title: "E2E 小數幣別",
  });
  await expect(page.getByRole("link", { name: /E2E 小數幣別.*US\$12\.34/ })).toBeVisible();

  await page.getByRole("link", { name: "更多", exact: true }).click();
  await page.getByRole("link", { name: /設定/ }).click();
  await page.getByRole("button", { name: "帳本幣別" }).click();
  await page.getByRole("searchbox", { name: "搜尋幣別" }).fill("JPY");
  await page.getByRole("option", { name: /JPY/ }).click();
  await page.getByRole("button", { name: "變更幣別" }).click();
  currencyDialog = page.getByRole("dialog", { name: "確認變更整本帳的幣別" });
  await expect(currencyDialog.getByText(/直接截斷.*USD 12\.34 → JPY 12/)).toBeVisible();
  await currencyDialog.getByRole("checkbox", { name: "我了解這會更新所有歷史與週期資料" }).check();
  await currencyDialog.getByRole("button", { name: "確認變更幣別" }).click();
  await expect(page.getByRole("button", { name: "帳本幣別" })).toContainText("JPY");
  await page.getByRole("link", { name: /今天/ }).click();
  await expect(page.getByRole("link", { name: /E2E 小數幣別.*¥12/ })).toBeVisible();
  await page.getByRole("link", { name: "更多", exact: true }).click();
  await page.getByRole("link", { name: /設定/ }).click();
  await dismissNotifications(page);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "下載完整備份" }).click();
  const backupDownload = await downloadPromise;
  expect(backupDownload.suggestedFilename()).toMatch(/^simfiment-backup-.*\.db$/);
  const backupPath = await backupDownload.path();
  if (!backupPath) throw new Error("Playwright did not retain the downloaded backup");

  await page.getByRole("link", { name: /今天/ }).click();
  await saveTransaction(page, {
    amount: "1",
    category: "飲食",
    title: "E2E 備份後資料",
  });
  await expect(page.getByRole("link", { name: /E2E 備份後資料/ })).toBeVisible();
  await page.getByRole("link", { name: "更多", exact: true }).click();
  await page.getByRole("link", { name: /設定/ }).click();
  await page.getByRole("link", { name: "安全" }).click();
  await page.getByLabel("目前密碼").fill(originalPassword);
  await page.getByLabel(/^新密碼/).fill(replacementPassword);
  await page.getByLabel("確認新密碼").fill(replacementPassword);
  await page.getByRole("button", { name: "更新密碼" }).click();
  await expect(page.getByText("密碼已變更，其他登入階段已撤銷。")).toBeVisible();
  await dismissNotifications(page);
  await page.getByRole("button", { name: "登出" }).click();
  await expect(page.getByRole("heading", { name: "登入 Simfiment" })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("simfiment.startup-snapshot")))
    .toBeNull();
  await page.getByLabel("密碼").fill(replacementPassword);
  await page.getByRole("button", { name: "登入" }).click();
  await expect(page.getByRole("link", { name: /今天/ })).toBeVisible();

  await page.getByRole("link", { name: "更多", exact: true }).click();
  await page.getByRole("link", { name: /設定/ }).click();
  await page.getByLabel("選擇備份檔").setInputFiles({
    name: backupDownload.suggestedFilename(),
    mimeType: "application/vnd.sqlite3",
    buffer: await readFile(backupPath),
  });
  const restoreDialog = page.getByRole("dialog", { name: "以備份取代所有資料" });
  await expect(
    restoreDialog.getByText(backupDownload.suggestedFilename(), { exact: false }),
  ).toBeVisible();
  await restoreDialog.getByRole("button", { name: "取代所有資料" }).click();
  await expect(page.getByRole("heading", { name: "登入 Simfiment" })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("simfiment.startup-snapshot")))
    .toBeNull();
  await expect(page.getByText("備份已還原。請使用備份當時的密碼重新登入。")).toBeVisible();
  await page.getByLabel("密碼").fill(replacementPassword);
  await page.getByRole("button", { name: "登入" }).click();
  await expect(page.getByText("密碼不正確。")).toBeVisible();
  await page.getByLabel("密碼").fill(originalPassword);
  await page.getByRole("button", { name: "登入" }).click();
  await expect(page.getByRole("link", { name: /今天/ })).toBeVisible();
  await page.getByRole("link", { name: "今天", exact: true }).click();
  await expect(page.getByText("E2E 備份後資料")).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => Boolean(localStorage.getItem("simfiment.startup-snapshot"))))
    .toBe(true);
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
  await page.context().setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(
    page.getByText("目前離線或無法連到 Simfiment 伺服器；重新連線後請再試一次。"),
  ).toBeVisible();
  await expect(page.getByText("E2E 小數幣別")).toBeVisible();
  await expect(page.locator("[inert]")).toHaveAttribute("aria-busy", "true");
  await expect(page.getByRole("status", { name: "載入中" })).toHaveCount(0);
  await page.context().setOffline(false);
  await page.getByRole("button", { name: "再試一次" }).click();
  await expect(page.getByRole("link", { name: /今天/ })).toBeVisible();
  await expect(page.locator("[inert]")).toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 720 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await expect(page.getByRole("link", { name: /今天/ })).toBeVisible();
  await expectAccessible(page);
  const viewport = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(viewport.scroll).toBeLessThanOrEqual(viewport.client);

  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("link", { name: "更多", exact: true }).click();
  await page.getByRole("link", { name: /設定/ }).click();
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByRole("link", { name: "General", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("simfiment.locale"))).toBe("en");
  await page.getByRole("link", { name: "Today", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible();
  await page.keyboard.press("n");
  await expect(page.getByRole("heading", { name: "Record transaction" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save expense" })).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  await expect(
    page.getByRole("heading", { name: "Record transaction", includeHidden: true }),
  ).toHaveCount(0);
  await expectAccessible(page);

  // Exercise the new screens with the same authenticated installation.
  await page.goto("/settings");
  await page.getByRole("button", { name: "繁體中文", exact: true }).click();
  await page.goto("/");
  await expect(page).toHaveURL(/\/entry$/);
  await expect(page.getByRole("textbox", { name: /金額/ })).toBeFocused();
  await page.getByRole("textbox", { name: /金額/ }).fill("400");
  await page.getByRole("button", { name: "＋ 新分類" }).click();
  await page.getByLabel("新分類名稱").fill("E2E 預算餐飲");
  await page.getByRole("button", { name: "建立", exact: true }).click();
  await expect(page.getByRole("button", { name: "E2E 預算餐飲", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByLabel(/標題/).fill("E2E 預算支出");
  await page.getByText("其他選項", { exact: true }).click();
  const featureDate = await page.evaluate(() =>
    new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei" }).format(new Date()),
  );
  const featureMonth = featureDate.slice(0, 7);
  const days = new Date(
    Number(featureMonth.slice(0, 4)),
    Number(featureMonth.slice(5)),
    0,
  ).getDate();
  await page.getByLabel("日期與時間").fill(`${featureMonth}-01T00:00`);
  await page.getByRole("button", { name: "儲存支出" }).click();
  await expect(page.getByRole("textbox", { name: /金額/ })).toHaveValue("");
  await expect(page).toHaveURL(/\/entry$/);
  await dismissNotifications(page);
  await page.getByRole("button", { name: "設定預算", exact: true }).click();
  await page.getByRole("button", { name: "新增分類預算" }).click();
  await selectOption(page, "分類", "E2E 預算餐飲");
  await page.getByRole("textbox", { name: "每月額度" }).fill(String(days * 300));
  await page.getByRole("button", { name: "儲存預算" }).click();
  await expect(page.getByText("預算已儲存。", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "每日明細" }).click();
  const firstDay = page.getByRole("row", { name: new RegExp(`${featureMonth.slice(5)}-01`) });
  await expect(firstDay).toContainText("−¥100");
  await expectAccessible(page);
  await page.screenshot({ path: "test-results/budgets.png", fullPage: true });
  await page.getByRole("button", { name: "收入", exact: true }).click();
  await page.getByRole("textbox", { name: /金額/ }).fill("270");
  await page.getByRole("button", { name: "薪資", exact: true }).click();
  await page.getByLabel(/標題/).fill("E2E 待收午餐");
  await page.getByRole("switch", { name: "追蹤借還款" }).click();
  await page.getByLabel("對象", { exact: false }).fill("Alex");
  await page.getByRole("button", { name: "儲存收入" }).click();
  await expect(page.getByRole("textbox", { name: /金額/ })).toHaveValue("");
  await dismissNotifications(page);
  const beforeCompletion = await (
    await page.request.get(`/api/v1/dashboards/day?date=${featureDate}`)
  ).json();
  await page.getByRole("link", { name: "更多", exact: true }).click();
  await page.getByRole("link", { name: "借還款", exact: true }).click();
  await expect(page.getByRole("link", { name: /Alex.*E2E 待收午餐/ })).toBeVisible();
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await expect(page.getByRole("link", { name: /Alex.*E2E 待收午餐/ })).toHaveCount(0);
  const afterCompletion = await (
    await page.request.get(`/api/v1/dashboards/day?date=${featureDate}`)
  ).json();
  expect(afterCompletion.data.totals).toEqual(beforeCompletion.data.totals);
  await page.getByRole("button", { name: "已完成", exact: true }).click();
  await page.getByRole("link", { name: /Alex.*E2E 待收午餐/ }).click();
  await page.getByRole("button", { name: "撤銷完成", exact: true }).click();
  await expect(page.getByText("別人欠我 · 待完成", { exact: true })).toBeVisible();
  await expectAccessible(page);
  await page.goto("/entry");
  await page.getByRole("button", { name: "E2E 預算餐飲", exact: true }).click();
  await expect(page.getByText("今日可用", { exact: false })).toBeVisible();
  const saveBounds = await page.getByRole("button", { name: "儲存支出" }).boundingBox();
  const navigationBounds = await page.getByRole("navigation", { name: "主要導覽" }).boundingBox();
  expect(saveBounds).not.toBeNull();
  expect(navigationBounds).not.toBeNull();
  expect(saveBounds!.y + saveBounds!.height).toBeLessThan(navigationBounds!.y);
  await expectAccessible(page);
  await page.screenshot({ path: "test-results/quick-entry.png", fullPage: true });
});
