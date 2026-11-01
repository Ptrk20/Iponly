import { describe, expect, it } from "vitest";
import {
  getComparisonRange,
  percentageChange,
  resolveAnalyticsRange,
} from "@/lib/analytics";
import { normalizeSpendingEvents } from "@/lib/analytics-events";

describe("analytics periods and comparisons", () => {
  it("uses the user's timezone for local month boundaries and half-open timestamps", () => {
    const range = resolveAnalyticsRange(
      "this-month",
      "Asia/Manila",
      new Date("2026-10-31T16:30:00.000Z"),
    );

    expect(range.startDate).toBe("2026-11-01");
    expect(range.endDate).toBe("2026-11-01");
    expect(range.startInclusive.toISOString()).toBe("2026-10-31T16:00:00.000Z");
    expect(range.endExclusive.toISOString()).toBe("2026-11-01T16:00:00.000Z");
  });

  it("handles leap-year custom ranges and compares equal-length adjacent periods", () => {
    const range = resolveAnalyticsRange("custom", "UTC", new Date("2024-06-01T12:00:00Z"), "2024-02-28", "2024-03-01");
    expect(range.startDate).toBe("2024-02-28");
    expect(range.endDate).toBe("2024-03-01");
    expect(getComparisonRange(range)).toMatchObject({
      startDate: "2024-02-25",
      endDate: "2024-02-27",
    });
  });

  it("rejects malformed, reversed, and unbounded custom periods", () => {
    expect(() => resolveAnalyticsRange("custom", "UTC", new Date(), "2026-02-30", "2026-03-01")).toThrow("valid calendar dates");
    expect(() => resolveAnalyticsRange("custom", "UTC", new Date(), "2026-04-02", "2026-04-01")).toThrow("on or before");
    expect(() => resolveAnalyticsRange("custom", "UTC", new Date(), "2024-01-01", "2025-01-02")).toThrow("limited to 366 days");
  });

  it("does not invent percentage changes from a zero previous amount", () => {
    expect(percentageChange(12_500, 0)).toBeNull();
    expect(percentageChange(31_000, 28_000)).toBe(10.7);
    expect(percentageChange(7_500, 10_000)).toBe(-25);
  });
});

describe("canonical financial spending events", () => {
  it("counts a linked debt payment, savings withdrawal, and budget expense once", () => {
    const expenses = [{
      id: "budget-expense-1",
      categoryId: "debt-category",
      categoryName: "Debt Payments",
      color: "#cc7660",
      categoryType: "debt" as const,
      sourceType: "debt_payment" as const,
      status: "posted" as const,
      linkedDebtPaymentId: "debt-payment-1",
      linkedTravelExpenseId: null,
      date: "2026-11-01",
      amountMinor: 500_000,
      currencyCode: "PHP" as const,
    }];
    const payments = [{
      id: "debt-payment-1",
      date: "2026-11-01",
      amountMinor: 500_000,
      currencyCode: "PHP" as const,
    }];

    const events = normalizeSpendingEvents(expenses, payments);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      canonicalId: "debt-payment-1",
      amountMinor: 500_000,
      currencyCode: "PHP",
    });
    expect(events.reduce((total, event) => total + event.amountMinor, 0)).toBe(500_000);
  });

  it("omits reversed expenses and savings contributions, but retains standalone debt payments", () => {
    const events = normalizeSpendingEvents([
      {
        id: "reversed-expense",
        categoryId: "food",
        categoryName: "Groceries",
        color: "#d29a3d",
        categoryType: "expense",
        sourceType: "manual",
        status: "reversed",
        linkedDebtPaymentId: null,
        linkedTravelExpenseId: null,
        date: "2026-11-01",
        amountMinor: 200_000,
        currencyCode: "PHP",
      },
      {
        id: "savings-contribution",
        categoryId: "savings",
        categoryName: "Savings",
        color: "#95a74c",
        categoryType: "savings",
        sourceType: "savings_contribution",
        status: "posted",
        linkedDebtPaymentId: null,
        linkedTravelExpenseId: null,
        date: "2026-11-01",
        amountMinor: 100_000,
        currencyCode: "PHP",
      },
    ], [{
      id: "standalone-payment",
      date: "2026-11-01",
      amountMinor: 75_000,
      currencyCode: "USD",
    }]);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      canonicalId: "standalone-payment",
      amountMinor: 75_000,
      currencyCode: "USD",
    });
  });
});
