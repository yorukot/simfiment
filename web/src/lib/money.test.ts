import { describe, expect, it } from "vitest";
import {
  currencySymbol,
  formatMoneyMinor,
  majorToMinor,
  minorToMajorInput,
  moneyInputBounds,
} from "./money";

describe("money utilities", () => {
  it("converts major-unit decimal strings without floating-point multiplication", () => {
    expect(majorToMinor("1200", 0)).toBe(1200);
    expect(majorToMinor("12.34", 2)).toBe(1234);
    expect(majorToMinor("12.345", 3)).toBe(12345);
    expect(majorToMinor("12.345", 2)).toBeUndefined();
    expect(majorToMinor("0.00", 2)).toBeUndefined();
    expect(minorToMajorInput(1234, 2)).toBe("12.34");
    expect(minorToMajorInput(12345, 3)).toBe("12.345");
  });

  it("formats zero, two, and three-decimal currencies", () => {
    expect(formatMoneyMinor(1200, "TWD", 0, "en")).toBe("NT$ 1,200");
    expect(formatMoneyMinor(1234, "USD", 2, "en")).toBe("$12.34");
    expect(formatMoneyMinor(12345, "KWD", 3, "en")).toContain("12.345");
    expect(currencySymbol("zh-TW", "TWD")).toBe("NT$");
    expect(moneyInputBounds(2)).toEqual({ min: 0.01, max: 90_000_000_000, step: 0.01 });
  });
});
