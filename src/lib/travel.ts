import { sumSafeMinor } from "@/lib/analytics";
import type { CurrencyCode } from "@/types/domain";
import type { PlannedTravelExpenseRecord, TravelExpenseRecord, TravelTripSummary, TripRecord } from "@/types/travel";

export function calculateTravelSummary(
  trip: TripRecord,
  plannedExpenses: Pick<PlannedTravelExpenseRecord, "amountMinor" | "currencyCode" | "category" | "status">[],
  expenses: Pick<TravelExpenseRecord, "amountMinor" | "currencyCode" | "category" | "status">[],
): Pick<TravelTripSummary, "plannedTotals" | "actualTotals" | "budgetRemainingMinor" | "plannedRemainingMinor" | "utilizationPercent"> {
  const planned = new Map<CurrencyCode, number>();
  const actual = new Map<CurrencyCode, number>();
  for (const expense of plannedExpenses) {
    if (expense.status === "cancelled" || expense.status === "converted_to_actual") continue;
    addTo(planned, expense.currencyCode, expense.amountMinor);
  }
  for (const expense of expenses) {
    if (expense.status === "reversed") continue;
    addTo(actual, expense.currencyCode, expense.amountMinor);
  }
  const plannedTotals = [...planned.entries()].map(([currencyCode, amountMinor]) => ({ currencyCode, amountMinor }));
  const actualTotals = [...actual.entries()].map(([currencyCode, amountMinor]) => ({ currencyCode, amountMinor }));
  for (const totals of [plannedTotals, actualTotals]) {
    totals.sort((left, right) => left.currencyCode === trip.baseCurrencyCode
      ? -1
      : right.currencyCode === trip.baseCurrencyCode ? 1 : left.currencyCode.localeCompare(right.currencyCode));
  }
  const plannedBase = planned.get(trip.baseCurrencyCode) ?? 0;
  const actualBase = actual.get(trip.baseCurrencyCode) ?? 0;
  const utilizationPercent = trip.totalBudgetMinor > 0
    ? Number(((actualBase / trip.totalBudgetMinor) * 100).toFixed(1))
    : null;
  return {
    plannedTotals,
    actualTotals,
    budgetRemainingMinor: trip.totalBudgetMinor > 0 ? trip.totalBudgetMinor - actualBase : null,
    plannedRemainingMinor: trip.totalBudgetMinor > 0 ? trip.totalBudgetMinor - plannedBase : null,
    utilizationPercent,
  };
}

export function calculateTravelCategorySummaries(
  plannedExpenses: Pick<PlannedTravelExpenseRecord, "amountMinor" | "currencyCode" | "category" | "status">[],
  expenses: Pick<TravelExpenseRecord, "amountMinor" | "currencyCode" | "category" | "status">[],
) {
  const totals = new Map<string, { category: TravelExpenseRecord["category"]; currencyCode: CurrencyCode; plannedMinor: number; actualMinor: number }>();
  for (const expense of plannedExpenses) {
    if (expense.status === "cancelled" || expense.status === "converted_to_actual") continue;
    const key = `${expense.currencyCode}:${expense.category}`;
    const row = totals.get(key) ?? { category: expense.category, currencyCode: expense.currencyCode, plannedMinor: 0, actualMinor: 0 };
    row.plannedMinor = sumSafeMinor([row.plannedMinor, expense.amountMinor]);
    totals.set(key, row);
  }
  for (const expense of expenses) {
    if (expense.status === "reversed") continue;
    const key = `${expense.currencyCode}:${expense.category}`;
    const row = totals.get(key) ?? { category: expense.category, currencyCode: expense.currencyCode, plannedMinor: 0, actualMinor: 0 };
    row.actualMinor = sumSafeMinor([row.actualMinor, expense.amountMinor]);
    totals.set(key, row);
  }
  return [...totals.values()]
    .map((row) => ({ ...row, remainingMinor: row.plannedMinor - row.actualMinor }))
    .sort((left, right) => left.currencyCode.localeCompare(right.currencyCode) || right.actualMinor - left.actualMinor);
}

export function calculatePackingProgress(items: { packed: boolean }[]) {
  const total = items.length;
  const packed = items.filter((item) => item.packed).length;
  return { packed, total, percent: total > 0 ? Math.round((packed / total) * 100) : 0 };
}

export function selectNextUpcomingTrip<T extends { startDate: string | null; endDate: string | null; status: string; archivedAt: Date | null }>(
  trips: T[],
  today: string,
): T | null {
  return trips
    .filter((trip) =>
      trip.archivedAt === null &&
      trip.status !== "cancelled" &&
      trip.status !== "completed" &&
      trip.endDate !== null &&
      trip.endDate >= today,
    )
    .sort((left, right) => {
      if (left.startDate === null) return right.startDate === null ? 0 : 1;
      if (right.startDate === null) return -1;
      return left.startDate.localeCompare(right.startDate);
    })[0] ?? null;
}

function addTo(totals: Map<CurrencyCode, number>, currency: CurrencyCode, amountMinor: number) {
  totals.set(currency, sumSafeMinor([totals.get(currency) ?? 0, amountMinor]));
}
