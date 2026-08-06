import { useEffect } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { I18nProvider, initializeLocale, normalizeLocale, useI18n } from "./I18nProvider";

function Probe() {
  const { locale, setLocale, messages } = useI18n();
  useEffect(() => {
    document.body.dataset.testLocale = locale;
  }, [locale]);
  return (
    <button type="button" onClick={() => setLocale(locale === "en" ? "zh-TW" : "en")}>
      {messages.language.label}
    </button>
  );
}

describe("I18nProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.removeAttribute("data-test-locale");
  });

  it("normalizes supported browser language tags", () => {
    expect(normalizeLocale("en-US")).toBe("en");
    expect(normalizeLocale("zh-Hant-TW")).toBe("zh-TW");
    expect(normalizeLocale("ja-JP")).toBeUndefined();
  });

  it("persists a language change and updates document metadata", async () => {
    const user = userEvent.setup();
    localStorage.setItem("simfiment.locale", "en");
    expect(initializeLocale()).toBe("en");
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );

    expect(screen.getByRole("button", { name: "Language" })).toBeVisible();
    expect(document.documentElement.lang).toBe("en");
    await user.click(screen.getByRole("button", { name: "Language" }));
    expect(screen.getByRole("button", { name: "介面語系" })).toBeVisible();
    expect(localStorage.getItem("simfiment.locale")).toBe("zh-TW");
    expect(document.documentElement.lang).toBe("zh-TW");
  });
});
