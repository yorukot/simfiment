import { describe, expect, it } from "vitest";
import type { MonthlyDashboard } from "../../api/types";
import { activityBarHeight, activityScale } from "./MonthPage";

type DailySeriesPoint = MonthlyDashboard["dailySeries"][number];

function point(incomeMinor: number, expenseMinor: number): DailySeriesPoint {
  return {
    date: "2026-08-01",
    incomeMinor,
    expenseMinor,
    netMinor: incomeMinor - expenseMinor,
  };
}

describe("monthly activity scale", () => {
  it("keeps a linear scale when the values are in a comparable range", () => {
    const scale = activityScale([point(100, 50), point(20, 0)]);

    expect(scale).toEqual({ ceiling: 100, isTruncated: false });
    expect(activityBarHeight(50, scale)).toBe(50);
    expect(activityBarHeight(0, scale)).toBe(2);
  });

  it("truncates an extreme maximum so the other values remain distinguishable", () => {
    const scale = activityScale([point(10_000, 500), point(100, 0)]);

    expect(scale.isTruncated).toBe(true);
    expect(activityBarHeight(10_000, scale)).toBe(100);
    expect(activityBarHeight(500, scale)).toBeCloseTo(70);
    expect(activityBarHeight(100, scale)).toBeCloseTo(14);
  });
});
