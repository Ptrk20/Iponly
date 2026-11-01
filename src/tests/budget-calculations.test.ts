import { describe, expect, it } from "vitest";
import { calculateBudgetSummary, shiftBudgetMonth } from "@/lib/budget";

describe("monthly budget calculations", () => {
  it("keeps planned and actual amounts separate and excludes reversed transactions", () => {
    const summary = calculateBudgetSummary("PHP", [
      { plannedAmountMinor: 5_000_000, actualAmountMinor: 4_985_000, status: "received" },
      { plannedAmountMinor: 250_000, actualAmountMinor: 0, status: "cancelled" },
    ], [
      { categoryId: "groceries", plannedAmountMinor: 800_000 },
      { categoryId: "savings", plannedAmountMinor: 500_000 },
    ], [
      { categoryId: "groceries", amountMinor: 620_000, sourceType: "linked_account", status: "posted" },
      { categoryId: "savings", amountMinor: 500_000, sourceType: "savings_contribution", status: "posted" },
      { categoryId: "debt", amountMinor: 500_000, sourceType: "debt_payment", status: "posted" },
      { categoryId: "groceries", amountMinor: 200_000, sourceType: "manual", status: "reversed" },
    ]);

    expect(summary).toMatchObject({
      plannedIncomeMinor: 5_000_000,
      actualIncomeMinor: 4_985_000,
      totalAllocatedMinor: 1_300_000,
      unallocatedMinor: 3_700_000,
      actualSpentMinor: 1_620_000,
      availableFromActualIncomeMinor: 3_365_000,
      savingsContributionMinor: 500_000,
      debtPaymentMinor: 500_000,
      utilizationPercent: 32.4,
    });
    expect(summary.categories.find((category) => category.categoryId === "groceries")).toMatchObject({
      spentMinor: 620_000,
      remainingMinor: 180_000,
      utilizationPercent: 77.5,
    });
    expect(summary.categories.find((category) => category.categoryId === "debt")).toMatchObject({
      plannedMinor: 0,
      spentMinor: 500_000,
      overBudgetMinor: 500_000,
      utilizationPercent: 0,
    });
  });

  it("keeps true category utilization above 100 percent", () => {
    const summary = calculateBudgetSummary("PHP", [], [
      { categoryId: "dining", plannedAmountMinor: 400_000 },
    ], [
      { categoryId: "dining", amountMinor: 550_000, sourceType: "manual", status: "posted" },
    ]);

    expect(summary.categories[0]).toMatchObject({
      remainingMinor: -150_000,
      overBudgetMinor: 150_000,
      utilizationPercent: 137.5,
    });
    expect(Number.isFinite(summary.utilizationPercent)).toBe(true);
  });

  it("handles zero allocations and empty data without NaN or Infinity", () => {
    const summary = calculateBudgetSummary("JPY", [], [
      { categoryId: "food", plannedAmountMinor: 0 },
    ], []);
    expect(summary.utilizationPercent).toBe(0);
    expect(summary.categories[0]?.utilizationPercent).toBe(0);
    expect(Object.values(summary).some((value) => typeof value === "number" && !Number.isFinite(value))).toBe(false);
  });

  it("rolls calendar months across year boundaries", () => {
    expect(shiftBudgetMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftBudgetMonth(2027, 1, -1)).toEqual({ year: 2026, month: 12 });
    expect(() => shiftBudgetMonth(2026, 13, 1)).toThrow("valid budget month");
  });

  it("rejects amounts that cannot safely be summed", () => {
    expect(() => calculateBudgetSummary("PHP", [
      { plannedAmountMinor: Number.MAX_SAFE_INTEGER, actualAmountMinor: 0, status: "planned" },
      { plannedAmountMinor: 1, actualAmountMinor: 0, status: "planned" },
    ], [], [])).toThrow("safe integers");
  });
});
