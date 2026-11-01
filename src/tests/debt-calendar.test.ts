import { describe, expect, it } from "vitest";
import { getDebtCalendarDays } from "@/lib/debt-calendar";

describe("installment calendar", () => {
  it("renders full Monday-first weeks with every day of the selected month", () => {
    const days = getDebtCalendarDays("2026-11", "monday");
    expect(days[0]?.date).toBe("2026-10-26");
    expect(days.at(-1)?.date).toBe("2026-12-06");
    expect(days.length % 7).toBe(0);
    expect(days.filter((day) => day.inMonth)).toHaveLength(30);
    expect(days.find((day) => day.date === "2026-11-01")).toEqual({
      date: "2026-11-01", day: 1, inMonth: true,
    });
  });

  it("respects a Sunday-first preference", () => {
    const days = getDebtCalendarDays("2026-11", "sunday");
    expect(days[0]?.date).toBe("2026-11-01");
    expect(days.at(-1)?.date).toBe("2026-12-05");
  });

  it("handles leap-year February and year boundaries", () => {
    expect(getDebtCalendarDays("2028-02", "monday").filter((day) => day.inMonth)).toHaveLength(29);
    expect(getDebtCalendarDays("2028-02", "monday").some((day) => day.date === "2028-02-29")).toBe(true);
    expect(getDebtCalendarDays("2026-12", "monday").at(-1)?.date).toBe("2027-01-03");
    expect(getDebtCalendarDays("2027-01", "monday")[0]?.date).toBe("2026-12-28");
  });

  it("rejects invalid calendar months", () => {
    expect(() => getDebtCalendarDays("2026-13", "monday")).toThrow("valid calendar month");
    expect(() => getDebtCalendarDays("invalid", "sunday")).toThrow("valid calendar month");
  });
});
