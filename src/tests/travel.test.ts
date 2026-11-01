import { describe, expect, it } from "vitest";
import { calculatePackingProgress, calculateTravelCategorySummaries, calculateTravelSummary, selectNextUpcomingTrip } from "@/lib/travel";
import {
  createPlannedTravelExpenseSchema,
  createTravelBookingSchema,
  createTripSchema,
  updatePlannedTravelExpenseSchema,
  updateTravelBookingSchema,
  updateTripSchema,
} from "@/lib/validations/travel";
import type { TripRecord } from "@/types/travel";

const trip: TripRecord = {
  id: "trip-1",
  userId: "user-1",
  name: "Japan",
  destination: "Tokyo",
  countryCode: "JP",
  startDate: "2026-10-01",
  endDate: "2026-10-08",
  travelerCount: 1,
  baseCurrencyCode: "PHP",
  totalBudgetMinor: 100_000,
  linkedSavingsGoalId: null,
  status: "planning",
  notes: null,
  shareEnabled: false,
  shareCode: null,
  shareDefaultRole: "viewer",
  creationIdempotencyKey: "create-trip-1",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  completedAt: null,
  archivedAt: null,
};

describe("travel calculations", () => {
  it("loads create and update validators and preserves their shared refinements", () => {
    const trip = {
      name: "Japan",
      destination: "Tokyo",
      startDate: "2026-11-10",
      endDate: "2026-11-01",
      travelerCount: 1,
      baseCurrencyCode: "PHP",
      totalBudget: "1000",
      status: "planning",
    };
    expect(createTripSchema.safeParse({ ...trip, idempotencyKey: crypto.randomUUID() }).success).toBe(false);
    expect(updateTripSchema.safeParse({ ...trip, tripId: crypto.randomUUID() }).success).toBe(false);

    const planned = {
      category: "food",
      description: "Dinner",
      amount: "20",
      currencyCode: "PHP",
    };
    expect(createPlannedTravelExpenseSchema.safeParse({ ...planned, tripId: crypto.randomUUID() }).success).toBe(true);
    expect(updatePlannedTravelExpenseSchema.safeParse({
      ...planned,
      expenseId: crypto.randomUUID(),
      status: "planned",
    }).success).toBe(true);

    const booking = {
      bookingType: "hotel",
      title: "Stay",
      status: "planned",
      amount: "100",
      currencyCode: "PHP",
    };
    expect(createTravelBookingSchema.safeParse({ ...booking, tripId: crypto.randomUUID() }).success).toBe(true);
    expect(updateTravelBookingSchema.safeParse({ ...booking, bookingId: crypto.randomUUID() }).success).toBe(true);
  });

  it("keeps currencies separate and excludes cancelled, converted, and reversed expenses", () => {
    const result = calculateTravelSummary(trip, [
      { amountMinor: 20_000, currencyCode: "PHP", category: "flights", status: "planned" },
      { amountMinor: 5_000, currencyCode: "PHP", category: "accommodation", status: "converted_to_actual" },
      { amountMinor: 8_000, currencyCode: "JPY", category: "food", status: "reserved" },
      { amountMinor: 3_000, currencyCode: "PHP", category: "food", status: "cancelled" },
    ], [
      { amountMinor: 12_500, currencyCode: "PHP", category: "flights", status: "posted" },
      { amountMinor: 7_000, currencyCode: "PHP", category: "food", status: "reversed" },
      { amountMinor: 2_500, currencyCode: "JPY", category: "food", status: "posted" },
    ]);

    expect(result.plannedTotals).toEqual([
      { currencyCode: "PHP", amountMinor: 20_000 },
      { currencyCode: "JPY", amountMinor: 8_000 },
    ]);
    expect(result.actualTotals).toEqual([
      { currencyCode: "PHP", amountMinor: 12_500 },
      { currencyCode: "JPY", amountMinor: 2_500 },
    ]);
    expect(result.budgetRemainingMinor).toBe(87_500);
    expect(result.utilizationPercent).toBe(12.5);
  });

  it("calculates category balances by currency and handles empty packing lists", () => {
    expect(calculateTravelCategorySummaries(
      [{ amountMinor: 30_000, currencyCode: "PHP", category: "food", status: "planned" }],
      [{ amountMinor: 22_000, currencyCode: "PHP", category: "food", status: "posted" }],
    )).toEqual([{
      category: "food",
      currencyCode: "PHP",
      plannedMinor: 30_000,
      actualMinor: 22_000,
      remainingMinor: 8_000,
    }]);
    expect(calculatePackingProgress([])).toEqual({ packed: 0, total: 0, percent: 0 });
    expect(calculatePackingProgress([{ packed: true }, { packed: false }, { packed: true }])).toEqual({
      packed: 2,
      total: 3,
      percent: 67,
    });
  });

  it("does not imply a remaining amount when the trip has no budget", () => {
    expect(calculateTravelSummary({ ...trip, totalBudgetMinor: 0 }, [], []).budgetRemainingMinor).toBeNull();
  });

  it("selects the next non-cancelled, incomplete trip with a future end date", () => {
    const rows = [
      { id: "cancelled", startDate: "2026-10-01", endDate: "2026-10-05", status: "cancelled", archivedAt: null },
      { id: "finished", startDate: "2026-09-01", endDate: "2026-09-05", status: "planning", archivedAt: null },
      { id: "later", startDate: "2026-12-01", endDate: "2026-12-05", status: "planning", archivedAt: null },
      { id: "soon", startDate: "2026-11-01", endDate: "2026-11-05", status: "booked", archivedAt: null },
    ];
    expect(selectNextUpcomingTrip(rows, "2026-10-20")?.id).toBe("soon");
  });
});
