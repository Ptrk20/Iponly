import type {
  travelBookings,
  travelExpenses,
  travelItineraryItems,
  travelPackingItems,
  travelPlannedExpenses,
  travelTodos,
  trips,
} from "@/db/schema";
import type { CurrencyCode } from "@/types/domain";

export type TripRecord = typeof trips.$inferSelect;
export type PlannedTravelExpenseRecord = typeof travelPlannedExpenses.$inferSelect;
export type TravelExpenseRecord = typeof travelExpenses.$inferSelect;
export type TravelItineraryRecord = typeof travelItineraryItems.$inferSelect;
export type TravelTodoRecord = typeof travelTodos.$inferSelect;
export type TravelPackingRecord = typeof travelPackingItems.$inferSelect;
export type TravelBookingRecord = typeof travelBookings.$inferSelect;

export interface TravelCurrencyTotal {
  currencyCode: CurrencyCode;
  amountMinor: number;
}

export interface TravelCategorySummary {
  category: TravelExpenseRecord["category"];
  currencyCode: CurrencyCode;
  plannedMinor: number;
  actualMinor: number;
  remainingMinor: number;
}

export interface TravelTripSummary {
  trip: TripRecord;
  plannedTotals: TravelCurrencyTotal[];
  actualTotals: TravelCurrencyTotal[];
  budgetRemainingMinor: number | null;
  plannedRemainingMinor: number | null;
  utilizationPercent: number | null;
}

export interface TravelDashboardSummary {
  nextTrip: TravelTripSummary | null;
  planningCount: number;
}

export interface TripMemberRecord {
  userId: string;
  name: string;
  role: "viewer" | "editor";
  joinedAt: Date;
}

export interface TripSharingInfo {
  enabled: boolean;
  code: string | null;
  defaultRole: "viewer" | "editor";
  members: TripMemberRecord[];
}

export type SharedTripView = Pick<
  TripRecord,
  "id" | "name" | "destination" | "countryCode" | "startDate" | "endDate" | "travelerCount" | "status"
>;

export interface SharedTripDetail {
  trip: SharedTripView;
  role: "viewer" | "editor";
  ownerName: string;
  memberCount: number;
  itinerary: TravelItineraryRecord[];
  todos: TravelTodoRecord[];
  packingItems: TravelPackingRecord[];
}

export interface TravelTripDetail {
  sharing: TripSharingInfo;
  trip: TripRecord;
  summary: TravelTripSummary;
  categories: TravelCategorySummary[];
  plannedExpenses: PlannedTravelExpenseRecord[];
  expenses: TravelExpenseRecord[];
  itinerary: TravelItineraryRecord[];
  todos: TravelTodoRecord[];
  packingItems: TravelPackingRecord[];
  bookings: TravelBookingRecord[];
  savingsGoal: {
    name: string;
    currencyCode: CurrencyCode;
    targetAmountMinor: number;
    balanceMinor: number;
    archived: boolean;
  } | null;
}
