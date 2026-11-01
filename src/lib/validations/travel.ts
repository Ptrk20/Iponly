import { z } from "zod";
import { parseMoneyInput } from "@/lib/money";

const uuid = z.string().uuid();
const currency = z.enum(["PHP", "USD", "EUR", "JPY"]);
const date = z.iso.date();
const optionalDate = date.optional().or(z.literal(""));
const notes = z.string().trim().max(2000).optional().or(z.literal(""));
const amount = z.string().trim().max(30).regex(/^\d+(?:\.\d+)?$/, "Enter a valid amount.");
const optionalAmount = z.string().trim().max(30).regex(/^\d+(?:\.\d+)?$/, "Enter a valid amount.").optional().or(z.literal(""));
const httpUrl = z.string().trim().max(2048).url("Enter a valid URL.").refine((value) => /^https?:\/\//i.test(value), "Use an http or https link.").optional().or(z.literal(""));
const tripStatus = z.enum(["idea", "planning", "booked", "ongoing", "completed", "cancelled"]);
const expenseCategory = z.enum([
  "flights", "accommodation", "local_transportation", "food", "activities", "shopping", "insurance", "visa",
  "connectivity", "emergency", "other",
]);

function validateMoney(value: string | undefined, field: string, required = true) {
  return (input: { currencyCode: "PHP" | "USD" | "EUR" | "JPY" }, ctx: z.RefinementCtx) => {
    if (value === undefined || value === "") {
      if (required) ctx.addIssue({ code: "custom", path: [field], message: "Enter a valid amount." });
      return;
    }
    if (parseMoneyInput(value, input.currencyCode) === null) {
      ctx.addIssue({ code: "custom", path: [field], message: "Enter a valid amount for this currency." });
    }
  };
}

const tripFields = z.object({
  name: z.string().trim().min(1, "Enter a trip name.").max(100),
  destination: z.string().trim().min(1, "Enter a destination.").max(160),
  countryCode: z.string().trim().length(2).optional().or(z.literal("")),
  startDate: optionalDate,
  endDate: optionalDate,
  travelerCount: z.preprocess((value) => Number(value), z.number().int().min(1).max(100)),
  baseCurrencyCode: currency,
  totalBudget: optionalAmount,
  linkedSavingsGoalId: uuid.optional().or(z.literal("")),
  status: tripStatus,
  notes,
  idempotencyKey: uuid,
});

function validateTrip(
  value: { startDate?: string; endDate?: string; countryCode?: string; totalBudget?: string; baseCurrencyCode: "PHP" | "USD" | "EUR" | "JPY" },
  ctx: z.RefinementCtx,
) {
  if (value.startDate && value.endDate && value.endDate < value.startDate) {
    ctx.addIssue({ code: "custom", path: ["endDate"], message: "The end date must be on or after the start date." });
  }
  if (value.countryCode && !/^[a-z]{2}$/i.test(value.countryCode)) {
    ctx.addIssue({ code: "custom", path: ["countryCode"], message: "Use a two-letter country code." });
  }
  if (value.totalBudget && parseMoneyInput(value.totalBudget, value.baseCurrencyCode) === null) {
    ctx.addIssue({ code: "custom", path: ["totalBudget"], message: "Enter a valid amount for this currency." });
  }
}

export const createTripSchema = tripFields.superRefine(validateTrip);
export const updateTripSchema = tripFields.omit({ idempotencyKey: true }).extend({ tripId: uuid }).superRefine(validateTrip);
export const tripIdSchema = z.object({ tripId: uuid });
export const updateTripStatusSchema = z.object({ tripId: uuid, status: tripStatus });

const plannedTravelExpenseFields = z.object({
  tripId: uuid,
  category: expenseCategory,
  description: z.string().trim().min(1, "Enter a description.").max(120),
  amount: amount,
  currencyCode: currency,
  expectedDate: optionalDate,
  notes,
});

function validatePlannedTravelExpense(
  value: { amount: string; currencyCode: "PHP" | "USD" | "EUR" | "JPY" },
  ctx: z.RefinementCtx,
) {
  validateMoney(value.amount, "amount")(value, ctx);
}

export const createPlannedTravelExpenseSchema = plannedTravelExpenseFields.superRefine(validatePlannedTravelExpense);
export const updatePlannedTravelExpenseSchema = plannedTravelExpenseFields.omit({ tripId: true }).extend({
  expenseId: uuid,
  status: z.enum(["planned", "reserved", "cancelled"]),
}).superRefine(validatePlannedTravelExpense);

export const createTravelExpenseSchema = z.object({
  tripId: uuid,
  plannedExpenseId: uuid.optional().or(z.literal("")),
  category: expenseCategory,
  description: z.string().trim().min(1, "Enter a description.").max(120),
  merchant: z.string().trim().max(100).optional().or(z.literal("")),
  amount: amount,
  currencyCode: currency,
  transactionDate: date,
  paymentAccountId: uuid.optional().or(z.literal("")),
  budgetId: uuid.optional().or(z.literal("")),
  budgetCategoryId: uuid.optional().or(z.literal("")),
  notes,
  idempotencyKey: uuid,
}).superRefine((value, ctx) => {
  validateMoney(value.amount, "amount")(value, ctx);
  if (Boolean(value.budgetId) !== Boolean(value.budgetCategoryId)) {
    ctx.addIssue({ code: "custom", path: ["budgetId"], message: "Choose both a Monthly Budget and its category, or neither." });
  }
});

export const reverseTravelExpenseSchema = z.object({
  expenseId: uuid,
  reason: z.string().trim().min(1, "Enter a reason for the reversal.").max(300),
  idempotencyKey: uuid,
});

export const createItineraryItemSchema = z.object({
  tripId: uuid,
  date,
  startTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).optional().or(z.literal("")),
  endTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).optional().or(z.literal("")),
  title: z.string().trim().min(1, "Enter an itinerary title.").max(120),
  location: z.string().trim().max(160).optional().or(z.literal("")),
  category: z.enum(["flight", "accommodation", "transport", "food", "activity", "sightseeing", "shopping", "free_time", "other"]),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  confirmationReference: z.string().trim().max(100).optional().or(z.literal("")),
  link: httpUrl,
  notes,
  sortOrder: z.preprocess((value) => Number(value || 0), z.number().int().min(0).max(10000)),
});

export const updateItineraryItemSchema = createItineraryItemSchema.omit({ tripId: true }).extend({
  itemId: uuid,
  status: z.enum(["planned", "confirmed", "completed", "cancelled"]),
});

export const createTravelTodoSchema = z.object({
  tripId: uuid,
  title: z.string().trim().min(1, "Enter a task.").max(120),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  dueDate: optionalDate,
  priority: z.enum(["low", "normal", "high"]),
});

export const updateTravelTodoSchema = createTravelTodoSchema.omit({ tripId: true }).extend({
  todoId: uuid,
  status: z.enum(["pending", "completed", "cancelled"]),
});

export const createPackingItemSchema = z.object({
  tripId: uuid,
  name: z.string().trim().min(1, "Enter an item name.").max(120),
  category: z.enum(["documents", "clothing", "electronics", "toiletries", "medicine", "money", "travel_gear", "other"]),
  quantity: z.preprocess((value) => Number(value), z.number().int().min(1).max(1000)),
  notes,
});

export const updatePackingItemSchema = createPackingItemSchema.omit({ tripId: true }).extend({
  itemId: uuid,
  packed: z.enum(["true", "false"]).transform((value) => value === "true"),
});
export const packingItemIdSchema = z.object({ itemId: uuid });
export const todoIdSchema = z.object({ todoId: uuid });

const travelBookingFields = z.object({
  tripId: uuid,
  bookingType: z.enum(["flight", "hotel", "transport", "activity", "restaurant", "insurance", "other"]),
  provider: z.string().trim().max(120).optional().or(z.literal("")),
  title: z.string().trim().min(1, "Enter a booking title.").max(120),
  confirmationNumber: z.string().trim().max(120).optional().or(z.literal("")),
  bookingDate: optionalDate,
  startDateTime: z.iso.datetime({ offset: true }).optional().or(z.literal("")),
  endDateTime: z.iso.datetime({ offset: true }).optional().or(z.literal("")),
  amount: optionalAmount,
  currencyCode: currency.optional().or(z.literal("")),
  status: z.enum(["planned", "booked", "completed", "cancelled"]),
  link: httpUrl,
  notes,
});

function validateTravelBooking(
  value: { amount?: string; currencyCode?: "PHP" | "USD" | "EUR" | "JPY" | ""; startDateTime?: string; endDateTime?: string },
  ctx: z.RefinementCtx,
) {
  if (Boolean(value.amount) !== Boolean(value.currencyCode)) {
    ctx.addIssue({ code: "custom", path: ["amount"], message: "Choose an amount and currency together." });
  }
  if (value.startDateTime && value.endDateTime && value.endDateTime < value.startDateTime) {
    ctx.addIssue({ code: "custom", path: ["endDateTime"], message: "The end time must be on or after the start time." });
  }
  if (value.amount && value.currencyCode && parseMoneyInput(value.amount, value.currencyCode) === null) {
    ctx.addIssue({ code: "custom", path: ["amount"], message: "Enter a valid amount for this currency." });
  }
}

export const createTravelBookingSchema = travelBookingFields.superRefine(validateTravelBooking);
export const updateTravelBookingSchema = travelBookingFields.omit({ tripId: true }).extend({ bookingId: uuid }).superRefine(validateTravelBooking);

const memberRole = z.enum(["viewer", "editor"]);
export const shareCodeSchema = z.object({
  code: z.string().trim().max(20).transform((value) => value.replace(/[\s-]/g, "").toUpperCase())
    .pipe(z.string().regex(/^[A-HJ-NP-Z2-9]{8}$/, "Enter a valid 8-character trip code.")),
});
export const shareSettingsSchema = z.object({ tripId: uuid, defaultRole: memberRole });
export const memberRoleSchema = z.object({ tripId: uuid, memberId: z.string().min(1).max(100), role: memberRole });
export const memberRemoveSchema = z.object({ tripId: uuid, memberId: z.string().min(1).max(100) });
