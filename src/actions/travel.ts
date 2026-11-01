"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-session";
import {
  createItineraryItemSchema,
  createPackingItemSchema,
  createPlannedTravelExpenseSchema,
  createTravelBookingSchema,
  createTravelExpenseSchema,
  createTravelTodoSchema,
  packingItemIdSchema,
  todoIdSchema,
  reverseTravelExpenseSchema,
  tripIdSchema,
  updateItineraryItemSchema,
  updatePackingItemSchema,
  updatePlannedTravelExpenseSchema,
  updateTravelBookingSchema,
  updateTravelTodoSchema,
  updateTripSchema,
  updateTripStatusSchema,
  createTripSchema,
  memberRemoveSchema,
  memberRoleSchema,
  shareCodeSchema,
  shareSettingsSchema,
} from "@/lib/validations/travel";
import {
  changeMemberRole,
  joinTripByCode,
  leaveTrip,
  removeMemberFromTrip,
  setTripSharing,
  createItineraryItem,
  createPackingItem,
  createPlannedExpense,
  createTravelBooking,
  recordTravelExpense,
  createTravelTodo,
  deleteItineraryItem,
  deletePackingItem,
  deleteTravelTodo,
  reverseTravelExpense,
  setTripArchived,
  setTripStatus,
  TravelRuleError,
  updateItineraryItem,
  updatePackingItem,
  updatePlannedExpense,
  updateTravelBooking,
  updateTravelTodo,
  updateTrip,
  createTrip,
} from "@/services/travel-service";

export interface TravelActionState {
  ok: boolean;
  message: string;
}

function readFormFields(formData: FormData, names: string[]) {
  return Object.fromEntries(names.map((name) => {
    const value = formData.get(name);
    return [name, typeof value === "string" ? value : ""];
  }));
}

async function runTravelAction(operation: (userId: string) => Promise<unknown>): Promise<TravelActionState> {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    console.error("Iponly could not resolve the session for a travel operation.");
    return { ok: false, message: "Your session could not be verified. Please sign in again." };
  }
  if (!user) return { ok: false, message: "Your session has expired. Please sign in again." };
  try {
    await operation(user.id);
    revalidatePath("/travel");
    revalidatePath("/");
    revalidatePath("/analytics");
    revalidatePath("/budget");
    revalidatePath("/savings");
    return { ok: true, message: "Your travel plan has been updated." };
  } catch (error) {
    if (error instanceof TravelRuleError || error instanceof RangeError) {
      return { ok: false, message: error.message };
    }
    console.error("Iponly failed to complete an authenticated travel operation.");
    return { ok: false, message: "We couldn’t save that change. Please try again." };
  }
}

function validationError(error: { issues: { message: string }[] }): TravelActionState {
  return { ok: false, message: error.issues[0]?.message ?? "Check the form and try again." };
}

export async function createTripAction(_previous: TravelActionState, formData: FormData) {
  const parsed = createTripSchema.safeParse(readFormFields(formData, [
    "name", "destination", "countryCode", "startDate", "endDate", "travelerCount", "baseCurrencyCode",
    "totalBudget", "linkedSavingsGoalId", "status", "notes", "idempotencyKey",
  ]));
  if (!parsed.success) return validationError(parsed.error);
  return runTravelAction(async (userId) => { await createTrip(userId, parsed.data); });
}

export async function updateTripAction(_previous: TravelActionState, formData: FormData) {
  const parsed = updateTripSchema.safeParse(readFormFields(formData, [
    "tripId", "name", "destination", "countryCode", "startDate", "endDate", "travelerCount",
    "baseCurrencyCode", "totalBudget", "linkedSavingsGoalId", "status", "notes",
  ]));
  if (!parsed.success) return validationError(parsed.error);
  return runTravelAction(async (userId) => { await updateTrip(userId, parsed.data); });
}

export async function setTripStatusAction(_previous: TravelActionState, formData: FormData) {
  const parsed = updateTripStatusSchema.safeParse(readFormFields(formData, ["tripId", "status"]));
  if (!parsed.success) return validationError(parsed.error);
  return runTravelAction(async (userId) => { await setTripStatus(userId, parsed.data.tripId, parsed.data.status); });
}

export async function setTripArchivedAction(_previous: TravelActionState, formData: FormData) {
  const parsed = tripIdSchema.extend({ archived: z.enum(["true", "false"]).transform((value) => value === "true") })
    .safeParse(readFormFields(formData, ["tripId", "archived"]));
  if (!parsed.success) return validationError(parsed.error);
  return runTravelAction(async (userId) => { await setTripArchived(userId, parsed.data.tripId, parsed.data.archived); });
}

export async function createPlannedTravelExpenseAction(_previous: TravelActionState, formData: FormData) {
  const parsed = createPlannedTravelExpenseSchema.safeParse(readFormFields(formData, [
    "tripId", "category", "description", "amount", "currencyCode", "expectedDate", "notes",
  ]));
  if (!parsed.success) return validationError(parsed.error);
  return runTravelAction(async (userId) => { await createPlannedExpense(userId, parsed.data); });
}

export async function updatePlannedTravelExpenseAction(_previous: TravelActionState, formData: FormData) {
  const parsed = updatePlannedTravelExpenseSchema.safeParse(readFormFields(formData, [
    "expenseId", "category", "description", "amount", "currencyCode", "expectedDate", "notes", "status",
  ]));
  if (!parsed.success) return validationError(parsed.error);
  return runTravelAction(async (userId) => { await updatePlannedExpense(userId, parsed.data); });
}

export async function createTravelExpenseAction(_previous: TravelActionState, formData: FormData) {
  const parsed = createTravelExpenseSchema.safeParse(readFormFields(formData, [
    "tripId", "plannedExpenseId", "category", "description", "merchant", "amount", "currencyCode",
    "transactionDate", "paymentAccountId", "budgetId", "budgetCategoryId", "notes", "idempotencyKey",
  ]));
  if (!parsed.success) return validationError(parsed.error);
  return runTravelAction(async (userId) => { await recordTravelExpense(userId, parsed.data); });
}

export async function reverseTravelExpenseAction(_previous: TravelActionState, formData: FormData) {
  const parsed = reverseTravelExpenseSchema.safeParse(readFormFields(formData, ["expenseId", "reason", "idempotencyKey"]));
  if (!parsed.success) return validationError(parsed.error);
  return runTravelAction(async (userId) => { await reverseTravelExpense(userId, parsed.data); });
}

export async function createItineraryItemAction(_previous: TravelActionState, formData: FormData) {
  const parsed = createItineraryItemSchema.safeParse(readFormFields(formData, [
    "tripId", "date", "startTime", "endTime", "title", "location", "category", "description",
    "confirmationReference", "link", "notes", "sortOrder",
  ]));
  if (!parsed.success) return validationError(parsed.error);
  return runTravelAction(async (userId) => { await createItineraryItem(userId, parsed.data); });
}

export async function updateItineraryItemAction(_previous: TravelActionState, formData: FormData) {
  const parsed = updateItineraryItemSchema.safeParse(readFormFields(formData, [
    "itemId", "date", "startTime", "endTime", "title", "location", "category", "description",
    "confirmationReference", "link", "notes", "sortOrder", "status",
  ]));
  if (!parsed.success) return validationError(parsed.error);
  return runTravelAction(async (userId) => { await updateItineraryItem(userId, parsed.data); });
}

export async function deleteItineraryItemAction(_previous: TravelActionState, formData: FormData) {
  const parsed = z.object({ itemId: tripIdSchema.shape.tripId }).safeParse(readFormFields(formData, ["itemId"]));
  if (!parsed.success) return validationError(parsed.error);
  return runTravelAction(async (userId) => { await deleteItineraryItem(userId, parsed.data.itemId); });
}

export async function createTravelTodoAction(_previous: TravelActionState, formData: FormData) {
  const parsed = createTravelTodoSchema.safeParse(readFormFields(formData, ["tripId", "title", "description", "dueDate", "priority"]));
  if (!parsed.success) return validationError(parsed.error);
  return runTravelAction(async (userId) => { await createTravelTodo(userId, parsed.data); });
}

export async function updateTravelTodoAction(_previous: TravelActionState, formData: FormData) {
  const parsed = updateTravelTodoSchema.safeParse(readFormFields(formData, [
    "todoId", "title", "description", "dueDate", "priority", "status",
  ]));
  if (!parsed.success) return validationError(parsed.error);
  return runTravelAction(async (userId) => { await updateTravelTodo(userId, parsed.data); });
}

export async function deleteTravelTodoAction(_previous: TravelActionState, formData: FormData) {
  const parsed = todoIdSchema.safeParse(readFormFields(formData, ["todoId"]));
  if (!parsed.success) return validationError(parsed.error);
  return runTravelAction(async (userId) => { await deleteTravelTodo(userId, parsed.data.todoId); });
}

export async function createPackingItemAction(_previous: TravelActionState, formData: FormData) {
  const parsed = createPackingItemSchema.safeParse(readFormFields(formData, ["tripId", "name", "category", "quantity", "notes"]));
  if (!parsed.success) return validationError(parsed.error);
  return runTravelAction(async (userId) => { await createPackingItem(userId, parsed.data); });
}

export async function updatePackingItemAction(_previous: TravelActionState, formData: FormData) {
  const parsed = updatePackingItemSchema.safeParse(readFormFields(formData, [
    "itemId", "name", "category", "quantity", "notes", "packed",
  ]));
  if (!parsed.success) return validationError(parsed.error);
  return runTravelAction(async (userId) => { await updatePackingItem(userId, parsed.data); });
}

export async function deletePackingItemAction(_previous: TravelActionState, formData: FormData) {
  const parsed = packingItemIdSchema.safeParse(readFormFields(formData, ["itemId"]));
  if (!parsed.success) return validationError(parsed.error);
  return runTravelAction(async (userId) => { await deletePackingItem(userId, parsed.data.itemId); });
}

export async function createTravelBookingAction(_previous: TravelActionState, formData: FormData) {
  const parsed = createTravelBookingSchema.safeParse(readFormFields(formData, [
    "tripId", "bookingType", "provider", "title", "confirmationNumber", "bookingDate", "startDateTime",
    "endDateTime", "amount", "currencyCode", "status", "link", "notes",
  ]));
  if (!parsed.success) return validationError(parsed.error);
  return runTravelAction(async (userId) => {
    await createTravelBooking(userId, { ...parsed.data, currencyCode: parsed.data.currencyCode || undefined });
  });
}

export async function updateTravelBookingAction(_previous: TravelActionState, formData: FormData) {
  const parsed = updateTravelBookingSchema.safeParse(readFormFields(formData, [
    "bookingId", "bookingType", "provider", "title", "confirmationNumber", "bookingDate", "startDateTime",
    "endDateTime", "amount", "currencyCode", "status", "link", "notes",
  ]));
  if (!parsed.success) return validationError(parsed.error);
  return runTravelAction(async (userId) => {
    await updateTravelBooking(userId, { ...parsed.data, currencyCode: parsed.data.currencyCode || undefined });
  });
}

export async function enableTripSharingAction(_previous: TravelActionState, formData: FormData) {
  const parsed = tripIdSchema.safeParse(readFormFields(formData, ["tripId"]));
  if (!parsed.success) return validationError(parsed.error);
  return runTravelAction(async (userId) => { await setTripSharing(userId, parsed.data.tripId, { enabled: true }); });
}

export async function disableTripSharingAction(_previous: TravelActionState, formData: FormData) {
  const parsed = tripIdSchema.safeParse(readFormFields(formData, ["tripId"]));
  if (!parsed.success) return validationError(parsed.error);
  return runTravelAction(async (userId) => { await setTripSharing(userId, parsed.data.tripId, { enabled: false }); });
}

export async function regenerateTripCodeAction(_previous: TravelActionState, formData: FormData) {
  const parsed = tripIdSchema.safeParse(readFormFields(formData, ["tripId"]));
  if (!parsed.success) return validationError(parsed.error);
  return runTravelAction(async (userId) => { await setTripSharing(userId, parsed.data.tripId, { enabled: true, regenerate: true }); });
}

export async function setTripDefaultRoleAction(_previous: TravelActionState, formData: FormData) {
  const parsed = shareSettingsSchema.safeParse(readFormFields(formData, ["tripId", "defaultRole"]));
  if (!parsed.success) return validationError(parsed.error);
  return runTravelAction(async (userId) => { await setTripSharing(userId, parsed.data.tripId, { defaultRole: parsed.data.defaultRole }); });
}

export async function joinTripAction(_previous: TravelActionState, formData: FormData) {
  const parsed = shareCodeSchema.safeParse(readFormFields(formData, ["code"]));
  if (!parsed.success) return validationError(parsed.error);
  return runTravelAction(async (userId) => { await joinTripByCode(userId, parsed.data.code); });
}

export async function leaveTripAction(_previous: TravelActionState, formData: FormData) {
  const parsed = tripIdSchema.safeParse(readFormFields(formData, ["tripId"]));
  if (!parsed.success) return validationError(parsed.error);
  return runTravelAction(async (userId) => { await leaveTrip(userId, parsed.data.tripId); });
}

export async function removeTripMemberAction(_previous: TravelActionState, formData: FormData) {
  const parsed = memberRemoveSchema.safeParse(readFormFields(formData, ["tripId", "memberId"]));
  if (!parsed.success) return validationError(parsed.error);
  return runTravelAction(async (userId) => { await removeMemberFromTrip(userId, parsed.data.tripId, parsed.data.memberId); });
}

export async function setTripMemberRoleAction(_previous: TravelActionState, formData: FormData) {
  const parsed = memberRoleSchema.safeParse(readFormFields(formData, ["tripId", "memberId", "role"]));
  if (!parsed.success) return validationError(parsed.error);
  return runTravelAction(async (userId) => { await changeMemberRole(userId, parsed.data.tripId, parsed.data.memberId, parsed.data.role); });
}
