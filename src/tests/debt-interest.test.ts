import { describe, expect, it } from "vitest";
import { calculateInstallmentInterest } from "@/lib/debt";

describe("inferred installment interest in minor units", () => {
  it("adds the difference between monthly repayments and principal exactly once", () => {
    expect(calculateInstallmentInterest(1000000, 100000, 12))
      .toEqual({ totalMinor: 1200000, interestMinor: 200000, openingBalanceMinor: 1200000 });
  });

  it("respects a final-installment schedule total", () => {
    expect(calculateInstallmentInterest(1000000, 100000, 12, 1150050))
      .toEqual({ totalMinor: 1150050, interestMinor: 150050, openingBalanceMinor: 1150050 });
  });

  it("does not infer negative interest or reduce principal", () => {
    expect(calculateInstallmentInterest(1000000, 50000, 12).interestMinor).toBe(0);
    expect(calculateInstallmentInterest(1000000, 50000, 12).openingBalanceMinor).toBe(1000000);
  });

  it.each([NaN, Infinity, -1, 0, 1.5, 601])("rejects invalid payment term %s", (term) => {
    expect(() => calculateInstallmentInterest(100, 10, term)).toThrow(RangeError);
  });

  it("rejects unsafe integer totals instead of rounding money", () => {
    expect(() => calculateInstallmentInterest(100, Number.MAX_SAFE_INTEGER, 12)).toThrow(RangeError);
  });
});
