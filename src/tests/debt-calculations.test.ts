import { describe, expect, it } from "vitest";
import {
  calculateDebtBalance,
  calculateDebtProgress,
  calculateInstallmentRemaining,
  calculateTotalDebt,
  generateDebtSchedule,
  percentageToBasisPoints,
} from "@/lib/debt";

describe("debt calculations", () => {
  it("calculates remaining balance from posted payments and active adjustments", () => {
    const balance = calculateDebtBalance(
      6_000_000,
      [
        { amountMinor: 500_000, status: "posted", paymentType: "regular" },
        { amountMinor: 100_000, status: "reversed", paymentType: "regular" },
        { amountMinor: 50_000, status: "posted", paymentType: "reversal" },
      ],
      [
        { amountMinor: 25_000, status: "posted", adjustmentType: "fee_added" },
        { amountMinor: 10_000, status: "posted", adjustmentType: "fee_waived" },
        { amountMinor: 80_000, status: "reversed", adjustmentType: "balance_increase" },
      ],
    );
    expect(balance).toBe(5_515_000);
  });

  it("calculates installment balances from recorded allocations", () => {
    expect(calculateInstallmentRemaining(
      { scheduledAmountMinor: 100_000 },
      [
        {
          principalAmountMinor: 20_000,
          interestAmountMinor: 0,
          feesAmountMinor: 0,
          adjustmentAmountMinor: 0,
          unapportionedAmountMinor: 30_000,
        },
      ],
    )).toBe(50_000);
  });

  it("calculates progress and groups debt totals by currency", () => {
    expect(calculateDebtProgress({ originalPrincipalMinor: 6_000_000, openingBalanceMinor: 5_000_000 }, 3_000_000))
      .toEqual({ amountPaidMinor: 2_000_000, progressPercent: 40 });
    expect(calculateTotalDebt([
      { balanceMinor: 100, currencyCode: "PHP" },
      { balanceMinor: 200, currencyCode: "PHP" },
      { balanceMinor: 300, currencyCode: "USD" },
      { balanceMinor: 900, currencyCode: "PHP", includeInTotal: false },
    ])).toEqual(new Map([["PHP", 300], ["USD", 300]]));
  });

  it("preserves end-of-month dates and uses the last available day for short months", () => {
    expect(generateDebtSchedule({
      firstDueDate: "2026-01-31",
      recurrence: "monthly",
      installmentCount: 4,
      regularInstallmentMinor: 100,
    }).map((entry) => entry.dueDate)).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
  });

  it("handles leap-year February and keeps the original day after a shorter month", () => {
    expect(generateDebtSchedule({
      firstDueDate: "2028-01-30",
      recurrence: "monthly",
      installmentCount: 3,
      regularInstallmentMinor: 100,
    }).map((entry) => entry.dueDate)).toEqual(["2028-01-30", "2028-02-29", "2028-03-30"]);
  });

  it("generates weekly and biweekly schedule dates without drifting", () => {
    const weekly = generateDebtSchedule({
      firstDueDate: "2026-01-30",
      recurrence: "weekly",
      installmentCount: 3,
      regularInstallmentMinor: 100,
    });
    const biweekly = generateDebtSchedule({
      firstDueDate: "2026-01-30",
      recurrence: "biweekly",
      installmentCount: 3,
      regularInstallmentMinor: 100,
    });
    expect(weekly.map((entry) => entry.dueDate)).toEqual(["2026-01-30", "2026-02-06", "2026-02-13"]);
    expect(biweekly.map((entry) => entry.dueDate)).toEqual(["2026-01-30", "2026-02-13", "2026-02-27"]);
  });

  it("applies final-installment rounding exactly and rejects invalid schedules", () => {
    const schedule = generateDebtSchedule({
      firstDueDate: "2026-01-01",
      recurrence: "monthly",
      installmentCount: 3,
      regularInstallmentMinor: 333,
      totalScheduledAmountMinor: 1_000,
    });
    expect(schedule.map((entry) => entry.scheduledAmountMinor)).toEqual([333, 333, 334]);
    expect(() => generateDebtSchedule({
      firstDueDate: "2026-01-01",
      recurrence: "one_time",
      installmentCount: 2,
      regularInstallmentMinor: 100,
    })).toThrow("exactly one installment");
  });

  it("converts interest percentages to basis points without floating-point storage", () => {
    expect(percentageToBasisPoints("5.5")).toBe(550);
    expect(percentageToBasisPoints("12")).toBe(1200);
    expect(() => percentageToBasisPoints("0.001")).toThrow("up to two decimal places");
  });
});
