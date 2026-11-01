import "server-only";
import { getDatabase, type IponlyDatabase } from "@/db";
import { randomInt } from "node:crypto";
import {
  getBalanceForAccount,
  findAccountsForUser,
  lockAccountsForUser,
} from "@/repositories/account-repository";
import {
  createTransactionForUser,
  findTransactionByIdForUser,
  type SavingsDatabaseTransaction,
} from "@/repositories/account-transaction-repository";
import { findGoalsForUser } from "@/repositories/savings-goal-repository";
import {
  createExpenseForBudgetAndUser,
  findBudgetForUser,
  findCategoryForUser,
  markExpenseReversedForUser,
} from "@/repositories/budget-repository";
import { amountToMinor } from "@/lib/validations/savings";
import { dateKeyInTimezone } from "@/lib/analytics";
import {
  calculatePackingProgress,
  calculateTravelCategorySummaries,
  calculateTravelSummary,
  selectNextUpcomingTrip,
} from "@/lib/travel";
import { reverseSavingsTransactionInTransaction } from "@/services/savings-service";
import type { CurrencyCode } from "@/types/domain";
import type { SharedTripDetail, SharedTripView, TravelDashboardSummary, TravelTripDetail, TravelTripSummary, TripRecord } from "@/types/travel";
import {
  addTripMember,
  findMembership,
  findTripById,
  findTripByShareCode,
  findTripIdForSharedItem,
  findTripMembers,
  findTripsSharedWithUser,
  removeTripMember,
  setTripMemberRole,
  updateTripSharing,
  aggregateTravelActualForTrips,
  aggregateTravelPlannedForTrips,
  createBookingForUser,
  createTripForUser,
  createItineraryItemForUser,
  createPackingItemForUser,
  createPlannedTravelExpenseForUser,
  createTodoForUser,
  createTravelExpenseForUser,
  deleteItineraryItemForUser,
  deletePackingItemForUser,
  deleteTodoForUser,
  findBookingForUser,
  findBudgetExpenseForTravelExpense,
  findBookingsForTrip,
  findItineraryForTrip,
  findItineraryItemByIdempotencyKey,
  findItineraryItemForUser,
  findPackingItemsForTrip,
  findPlannedTravelExpenseForUser,
  findPlannedTravelExpenses,
  findSavingsGoalForUser,
  findTodosForTrip,
  findTodoForUser,
  findTodoByIdempotencyKey,
  findTripByCreationKey,
  findTripForUser,
  findTripsForUser,
  findTravelExpenseByIdempotencyKey,
  findTravelExpenseByReversalKey,
  findTravelExpenseForUser,
  findTravelExpensesForTrip,
  findTravelBudgetsForUser,
  findPackingItemForUser,
  reverseTravelExpenseForUser,
  setTripArchivedForUser,
  updateBookingForUser,
  updateItineraryItemForUser,
  updatePackingItemForUser,
  updatePlannedTravelExpenseForUser,
  updateTodoForUser,
  updateTripForUser,
} from "@/repositories/travel-repository";

export class TravelRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TravelRuleError";
  }
}

type TravelDb = IponlyDatabase;

export async function getTravelPageData(userId: string, database: TravelDb = getDatabase()) {
  const [activeTrips, archivedTrips] = await Promise.all([
    findTripsForUser(userId, { limit: 100, database }),
    findTripsForUser(userId, { archived: true, limit: 50, database }),
  ]);
  const summaries = await summarizeTripRows(userId, [...activeTrips, ...archivedTrips], database);
  const byId = new Map(summaries.map((summary) => [summary.trip.id, summary]));
  return {
    activeTrips: activeTrips.map((trip) => byId.get(trip.id)!).filter(Boolean),
    archivedTrips: archivedTrips.map((trip) => byId.get(trip.id)!).filter(Boolean),
  };
}

export async function getTravelDashboardSummary(
  userId: string,
  timezone: string,
  now = new Date(),
  database: TravelDb = getDatabase(),
): Promise<TravelDashboardSummary> {
  const trips = await findTripsForUser(userId, { limit: 100, database });
  const summaries = await summarizeTripRows(userId, trips, database);
  const next = selectNextUpcomingTrip(summaries.map((item) => item.trip), dateKeyInTimezone(now, timezone));
  return {
    nextTrip: next ? summaries.find((item) => item.trip.id === next.id) ?? null : null,
    planningCount: trips.filter((trip) => trip.status === "idea" || trip.status === "planning").length,
  };
}

export async function getTravelTripDetail(
  tripId: string,
  userId: string,
  database: TravelDb = getDatabase(),
): Promise<TravelTripDetail | null> {
  const trip = await findTripForUser(tripId, userId, database);
  if (!trip) return null;
  const [plannedExpenses, expenses, itinerary, todos, packingItems, bookings, goal, members] = await Promise.all([
    findPlannedTravelExpenses(tripId, userId, database),
    findTravelExpensesForTrip(tripId, userId, database),
    findItineraryForTrip(tripId, userId, database),
    findTodosForTrip(tripId, userId, database),
    findPackingItemsForTrip(tripId, userId, database),
    findBookingsForTrip(tripId, userId, database),
    trip.linkedSavingsGoalId ? findSavingsGoalForUser(trip.linkedSavingsGoalId, userId, database) : Promise.resolve(null),
    findTripMembers(tripId, database),
  ]);
  const summary = { trip, ...calculateTravelSummary(trip, plannedExpenses, expenses) };
  const balanceMinor = goal?.accountId ? await getBalanceForAccount(goal.accountId, userId, database) : 0;
  return {
    trip,
    sharing: { enabled: trip.shareEnabled, code: trip.shareCode, defaultRole: trip.shareDefaultRole, members },
    summary,
    categories: calculateTravelCategorySummaries(plannedExpenses, expenses),
    plannedExpenses,
    expenses,
    itinerary,
    todos,
    packingItems,
    bookings,
    savingsGoal: goal ? {
      name: goal.name,
      currencyCode: goal.currencyCode,
      targetAmountMinor: goal.targetAmountMinor,
      balanceMinor: Math.max(0, balanceMinor),
      archived: goal.status === "archived",
    } : null,
  };
}

export async function getTravelChoices(userId: string, database: IponlyDatabase = getDatabase()) {
  const [budgets, goals, accounts] = await Promise.all([
    findTravelBudgetsForUser(userId, database),
    findGoalsForUser(userId, { database }),
    findAccountsForUser(userId, { database }),
  ]);
  return { budgets, goals, accounts };
}

export async function createTrip(
  userId: string,
  input: {
    name: string; destination: string; countryCode?: string; startDate?: string; endDate?: string;
    travelerCount: number; baseCurrencyCode: CurrencyCode; totalBudget?: string; linkedSavingsGoalId?: string;
    status: "idea" | "planning" | "booked" | "ongoing" | "completed" | "cancelled"; notes?: string; idempotencyKey: string;
  },
  database: IponlyDatabase = getDatabase(),
) {
  const budgetMinor = input.totalBudget ? amountToMinor(input.totalBudget, input.baseCurrencyCode, true) : 0;
  return database.transaction(async (transaction) => {
    const replay = await findTripByCreationKey(userId, input.idempotencyKey, transaction);
    if (replay) {
      if (!sameTripInput(replay, input, budgetMinor)) throw new TravelRuleError("This submission key was already used for a different trip.");
      return replay;
    }
    await validateSavingsGoal(userId, input.linkedSavingsGoalId, input.baseCurrencyCode, transaction);
    return createTripForUser(userId, {
      name: input.name,
      destination: input.destination,
      countryCode: input.countryCode?.toUpperCase() || null,
      startDate: input.startDate || null,
      endDate: input.endDate || null,
      travelerCount: input.travelerCount,
      baseCurrencyCode: input.baseCurrencyCode,
      totalBudgetMinor: budgetMinor,
      linkedSavingsGoalId: input.linkedSavingsGoalId || null,
      status: input.status,
      notes: input.notes || null,
      creationIdempotencyKey: input.idempotencyKey,
      completedAt: input.status === "completed" ? new Date() : null,
    }, transaction);
  });
}

export async function updateTrip(
  userId: string,
  input: {
    tripId: string; name: string; destination: string; countryCode?: string; startDate?: string; endDate?: string;
    travelerCount: number; baseCurrencyCode: CurrencyCode; totalBudget?: string; linkedSavingsGoalId?: string;
    status: "idea" | "planning" | "booked" | "ongoing" | "completed" | "cancelled"; notes?: string;
  },
  database: IponlyDatabase = getDatabase(),
) {
  const budgetMinor = input.totalBudget ? amountToMinor(input.totalBudget, input.baseCurrencyCode, true) : 0;
  const existing = await findTripForUser(input.tripId, userId, database);
  if (!existing || existing.archivedAt) throw new TravelRuleError("This trip could not be found.");
  await validateSavingsGoal(
    userId, input.linkedSavingsGoalId, input.baseCurrencyCode, database,
    input.linkedSavingsGoalId === existing.linkedSavingsGoalId,
  );
  const updated = await updateTripForUser(input.tripId, userId, {
    name: input.name,
    destination: input.destination,
    countryCode: input.countryCode?.toUpperCase() || null,
    startDate: input.startDate || null,
    endDate: input.endDate || null,
    travelerCount: input.travelerCount,
    baseCurrencyCode: input.baseCurrencyCode,
    totalBudgetMinor: budgetMinor,
    linkedSavingsGoalId: input.linkedSavingsGoalId || null,
    status: input.status,
    completedAt: input.status === "completed" ? existing.completedAt ?? new Date() : null,
    notes: input.notes || null,
  }, database);
  if (!updated) throw new TravelRuleError("This trip could not be updated.");
  return updated;
}

export async function setTripArchived(userId: string, tripId: string, archived: boolean, database: IponlyDatabase = getDatabase()) {
  const updated = await setTripArchivedForUser(tripId, userId, archived, database);
  if (!updated) throw new TravelRuleError(archived ? "This trip is already archived or could not be found." : "This archived trip could not be found.");
  return updated;
}

export async function setTripStatus(
  userId: string,
  tripId: string,
  status: "idea" | "planning" | "booked" | "ongoing" | "completed" | "cancelled",
  database: IponlyDatabase = getDatabase(),
) {
  const existing = await findTripForUser(tripId, userId, database);
  if (!existing || existing.archivedAt) throw new TravelRuleError("This trip could not be found.");
  const updated = await updateTripForUser(tripId, userId, {
    status,
    completedAt: status === "completed" ? existing.completedAt ?? new Date() : null,
  }, database);
  if (!updated) throw new TravelRuleError("This trip status could not be updated.");
  return updated;
}

export async function createPlannedExpense(
  userId: string,
  input: { tripId: string; category: tripCategory; description: string; amount: string; currencyCode: CurrencyCode; expectedDate?: string; notes?: string },
  database: IponlyDatabase = getDatabase(),
) {
  await findEditableTrip(userId, input.tripId, database);
  const amountMinor = amountToMinor(input.amount, input.currencyCode);
  return createPlannedTravelExpenseForUser(userId, {
    tripId: input.tripId,
    category: input.category,
    description: input.description,
    amountMinor,
    currencyCode: input.currencyCode,
    expectedDate: input.expectedDate || null,
    notes: input.notes || null,
    status: "planned",
  }, database);
}

type tripCategory = "flights" | "accommodation" | "local_transportation" | "food" | "activities" | "shopping" | "insurance" | "visa" | "connectivity" | "emergency" | "other";

export async function updatePlannedExpense(
  userId: string,
  input: { expenseId: string; category: tripCategory; description: string; amount: string; currencyCode: CurrencyCode; expectedDate?: string; notes?: string; status: "planned" | "reserved" | "cancelled" },
  database: IponlyDatabase = getDatabase(),
) {
  const existing = await findPlannedTravelExpenseForUser(input.expenseId, userId, database);
  if (!existing) throw new TravelRuleError("This planned travel expense could not be found.");
  await findEditableTrip(userId, existing.tripId, database);
  if (existing.status === "converted_to_actual") throw new TravelRuleError("This plan already has an actual expense.");
  const updated = await updatePlannedTravelExpenseForUser(input.expenseId, userId, {
    category: input.category,
    description: input.description,
    amountMinor: amountToMinor(input.amount, input.currencyCode),
    currencyCode: input.currencyCode,
    expectedDate: input.expectedDate || null,
    notes: input.notes || null,
    status: input.status,
  }, database);
  if (!updated) throw new TravelRuleError("This planned travel expense could not be updated.");
  return updated;
}

export async function recordTravelExpense(
  userId: string,
  input: {
    tripId: string; plannedExpenseId?: string; category: tripCategory; description: string; merchant?: string;
    amount: string; currencyCode: CurrencyCode; transactionDate: string; paymentAccountId?: string;
    budgetId?: string; budgetCategoryId?: string; notes?: string; idempotencyKey: string;
  },
  database: IponlyDatabase = getDatabase(),
) {
  const amountMinor = amountToMinor(input.amount, input.currencyCode);
  return database.transaction(async (transaction) => {
    const trip = await findEditableTrip(userId, input.tripId, transaction);
    const duplicate = await findTravelExpenseByIdempotencyKey(userId, input.idempotencyKey, transaction);
    if (duplicate) {
      const linkedBudget = await findBudgetExpenseForTravelExpense(duplicate.id, userId, transaction);
      if (
        duplicate.tripId !== input.tripId ||
        duplicate.plannedExpenseId !== (input.plannedExpenseId || null) ||
        duplicate.category !== input.category ||
        duplicate.description !== input.description ||
        duplicate.merchant !== (input.merchant || null) ||
        duplicate.amountMinor !== amountMinor ||
        duplicate.currencyCode !== input.currencyCode ||
        duplicate.transactionDate !== input.transactionDate ||
        Boolean(duplicate.linkedAccountTransactionId) !== Boolean(input.paymentAccountId) ||
        Boolean(linkedBudget) !== Boolean(input.budgetId) ||
        (linkedBudget && (linkedBudget.budgetId !== input.budgetId || linkedBudget.categoryId !== input.budgetCategoryId))
      ) throw new TravelRuleError("This submission key was already used for a different travel expense.");
      if (duplicate.status === "reversed") throw new TravelRuleError("This travel expense was already reversed.");
      if (duplicate.linkedAccountTransactionId && input.paymentAccountId) {
        const linkedTransaction = await findTransactionByIdForUser(duplicate.linkedAccountTransactionId, userId, transaction);
        if (linkedTransaction?.accountId !== input.paymentAccountId) {
          throw new TravelRuleError("This submission key was already used with a different Savings account.");
        }
      }
      return { expense: duplicate, duplicate: true };
    }
    if (input.plannedExpenseId) {
      const planned = await findPlannedTravelExpenseForUser(input.plannedExpenseId, userId, transaction);
      if (!planned || planned.tripId !== trip.id || planned.currencyCode !== input.currencyCode ||
          planned.status === "cancelled" || planned.status === "converted_to_actual") {
        throw new TravelRuleError("Choose an unconverted plan from this trip using the same currency.");
      }
    }
    let accountTransactionId: string | null = null;
    if (input.paymentAccountId) {
      const account = (await lockAccountsForUser([input.paymentAccountId], userId, transaction))[0];
      if (!account || account.status !== "active") throw new TravelRuleError("Choose one of your active Savings accounts.");
      if (account.currencyCode !== input.currencyCode) throw new TravelRuleError("The Savings account currency must match this expense.");
      if (amountMinor > await getBalanceForAccount(account.id, userId, transaction)) {
        throw new TravelRuleError("This expense exceeds the available account balance.");
      }
      const accountTransaction = await createTransactionForUser(userId, {
        accountId: account.id,
        transactionType: "withdrawal",
        amountMinor,
        currencyCode: input.currencyCode,
        transactionDate: new Date(`${input.transactionDate}T12:00:00.000Z`),
        description: input.description,
        notes: `Linked Iponly travel expense${input.notes ? `: ${input.notes}` : ""}`,
        idempotencyKey: `travel-expense:${input.idempotencyKey}:account`,
      }, transaction);
      accountTransactionId = accountTransaction.id;
    }
    let budgetId: string | null = null;
    let categoryId: string | null = null;
    if (Boolean(input.budgetId) !== Boolean(input.budgetCategoryId)) {
      throw new TravelRuleError("Choose both a Monthly Budget and its category, or neither.");
    }
    if (input.budgetId && input.budgetCategoryId) {
      const budget = await findBudgetForUser(input.budgetId, userId, transaction);
      const budgetCategory = await findCategoryForUser(input.budgetCategoryId, userId, transaction);
      if (!budget || budget.status !== "active") throw new TravelRuleError("Choose one of your active Monthly Budgets.");
      if (!budgetCategory || !budgetCategory.isActive || (budgetCategory.categoryType !== "expense" && budgetCategory.categoryType !== "other")) {
        throw new TravelRuleError("Choose an active expense category from that budget.");
      }
      if (budget.currencyCode !== input.currencyCode) throw new TravelRuleError("The Budget currency must match this travel expense.");
      if (budget.year !== Number(input.transactionDate.slice(0, 4)) || budget.month !== Number(input.transactionDate.slice(5, 7))) {
        throw new TravelRuleError("Use a Monthly Budget that matches the travel expense date.");
      }
      budgetId = budget.id;
      categoryId = budgetCategory.id;
    }
    const expense = await createTravelExpenseForUser(userId, {
      tripId: trip.id,
      plannedExpenseId: input.plannedExpenseId || null,
      category: input.category,
      description: input.description,
      merchant: input.merchant || null,
      amountMinor,
      currencyCode: input.currencyCode,
      transactionDate: input.transactionDate,
      linkedAccountTransactionId: accountTransactionId,
      notes: input.notes || null,
      status: "posted",
      reversalReason: null,
      reversedAt: null,
      reversalIdempotencyKey: null,
      idempotencyKey: input.idempotencyKey,
    }, transaction);
    if (budgetId && categoryId) {
      const budget = await findBudgetForUser(budgetId, userId, transaction);
      const budgetCategory = await findCategoryForUser(categoryId, userId, transaction);
      if (!budget || !budgetCategory) throw new TravelRuleError("The selected Monthly Budget details could not be verified.");
      await createExpenseForBudgetAndUser(userId, {
        budgetId: budget.id,
        categoryId: budgetCategory.id,
        amountMinor,
        currencyCode: input.currencyCode,
        transactionDate: input.transactionDate,
        merchant: input.merchant || null,
        description: input.description,
        notes: input.notes || null,
        linkedAccountTransactionId: null,
        linkedDebtPaymentId: null,
        linkedTravelExpenseId: expense.id,
        sourceType: "travel",
        status: "posted",
        reversalReason: null,
        reversedAt: null,
        reversalIdempotencyKey: null,
        idempotencyKey: `travel-expense:${input.idempotencyKey}:budget`,
        createdBy: "user",
      }, transaction);
    }
    if (input.plannedExpenseId) {
      await updatePlannedTravelExpenseForUser(input.plannedExpenseId, userId, { status: "converted_to_actual" }, transaction);
    }
    return { expense, duplicate: false };
  });
}

export async function reverseTravelExpense(
  userId: string,
  input: { expenseId: string; reason: string; idempotencyKey: string },
  database: IponlyDatabase = getDatabase(),
) {
  return database.transaction(async (transaction) => {
    const expense = await findTravelExpenseForUser(input.expenseId, userId, transaction);
    if (!expense) throw new TravelRuleError("This travel expense could not be found.");
    const replay = await findTravelExpenseByReversalKey(userId, input.idempotencyKey, transaction);
    if (replay) {
      if (replay.id !== expense.id || replay.reversalReason !== input.reason) {
        throw new TravelRuleError("This reversal key was already used for a different correction.");
      }
      return replay;
    }
    if (expense.status !== "posted") throw new TravelRuleError("This travel expense has already been reversed.");
    if (expense.linkedAccountTransactionId) {
      await reverseSavingsTransactionInTransaction(userId, {
        transactionId: expense.linkedAccountTransactionId,
        reason: input.reason,
        idempotencyKey: `travel-expense-reversal:${input.idempotencyKey}:account`,
      }, transaction);
    }
    const linkedBudget = await findBudgetExpenseForTravelExpense(expense.id, userId, transaction);
    if (linkedBudget) {
      if (linkedBudget.status !== "posted" || linkedBudget.sourceType !== "travel") {
        throw new TravelRuleError("The linked Monthly Budget entry cannot be safely reversed.");
      }
      const reversedBudget = await markExpenseReversedForUser(
        linkedBudget.id, userId, input.reason, `travel-expense-reversal:${input.idempotencyKey}:budget`, transaction,
      );
      if (!reversedBudget) throw new TravelRuleError("The linked Monthly Budget entry has already been reversed.");
    }
    const reversed = await reverseTravelExpenseForUser(expense.id, userId, input.reason, input.idempotencyKey, transaction);
    if (!reversed) throw new TravelRuleError("This travel expense has already been reversed.");
    return reversed;
  });
}

export async function createItineraryItem(actorId: string, input: {
  tripId: string; date: string; startTime?: string; endTime?: string; title: string; location?: string;
  category: "flight" | "accommodation" | "transport" | "food" | "activity" | "sightseeing" | "shopping" | "free_time" | "other";
  description?: string; confirmationReference?: string; link?: string; notes?: string; sortOrder: number; idempotencyKey?: string;
}, database: IponlyDatabase = getDatabase()) {
  const userId = await resolveEditorOwner(actorId, input.tripId, database);
  await findEditableTrip(userId, input.tripId, database);
  if (input.idempotencyKey) {
    const existing = await findItineraryItemByIdempotencyKey(userId, input.idempotencyKey, database);
    if (existing) {
      if (existing.tripId !== input.tripId || existing.date !== input.date || existing.title !== input.title ||
          existing.startTime !== (input.startTime || null) || existing.endTime !== (input.endTime || null)) {
        throw new TravelRuleError("This itinerary submission key was already used for different details.");
      }
      return existing;
    }
  }
  return createItineraryItemForUser(userId, {
    tripId: input.tripId,
    date: input.date,
    startTime: input.startTime || null,
    endTime: input.endTime || null,
    title: input.title,
    location: input.location || null,
    category: input.category,
    description: input.description || null,
    confirmationReference: input.confirmationReference || null,
    link: input.link || null,
    notes: input.notes || null,
    sortOrder: input.sortOrder,
    status: "planned",
    idempotencyKey: input.idempotencyKey || null,
  }, database);
}

export async function updateItineraryItem(actorId: string, input: {
  itemId: string; date: string; startTime?: string; endTime?: string; title: string; location?: string;
  category: "flight" | "accommodation" | "transport" | "food" | "activity" | "sightseeing" | "shopping" | "free_time" | "other";
  description?: string; confirmationReference?: string; link?: string; notes?: string; sortOrder: number;
  status: "planned" | "confirmed" | "completed" | "cancelled";
}, database: IponlyDatabase = getDatabase()) {
  const userId = await resolveEditorOwnerForItem(actorId, "itinerary", input.itemId, database);
  const item = await findItineraryItem(userId, input.itemId, database);
  await findEditableTrip(userId, item.tripId, database);
  const updated = await updateItineraryItemForUser(input.itemId, userId, {
    date: input.date, startTime: input.startTime || null, endTime: input.endTime || null,
    title: input.title, location: input.location || null, category: input.category, description: input.description || null,
    confirmationReference: input.confirmationReference || null, link: input.link || null, notes: input.notes || null,
    sortOrder: input.sortOrder, status: input.status,
  }, database);
  if (!updated) throw new TravelRuleError("This itinerary item could not be updated.");
  return updated;
}

export async function deleteItineraryItem(actorId: string, itemId: string, database: IponlyDatabase = getDatabase()) {
  const userId = await resolveEditorOwnerForItem(actorId, "itinerary", itemId, database);
  const item = await findItineraryItem(userId, itemId, database);
  await findEditableTrip(userId, item.tripId, database);
  const removed = await deleteItineraryItemForUser(itemId, userId, database);
  if (!removed) throw new TravelRuleError("This itinerary item could not be deleted.");
  return removed;
}

export async function createTravelTodo(actorId: string, input: {
  tripId: string; title: string; description?: string; dueDate?: string; priority: "low" | "normal" | "high"; idempotencyKey?: string;
}, database: IponlyDatabase = getDatabase()) {
  const userId = await resolveEditorOwner(actorId, input.tripId, database);
  await findEditableTrip(userId, input.tripId, database);
  if (input.idempotencyKey) {
    const existing = await findTodoByIdempotencyKey(userId, input.idempotencyKey, database);
    if (existing) {
      if (existing.tripId !== input.tripId || existing.title !== input.title ||
          existing.description !== (input.description || null) || existing.dueDate !== (input.dueDate || null)) {
        throw new TravelRuleError("This travel task submission key was already used for different details.");
      }
      return existing;
    }
  }
  return createTodoForUser(userId, {
    tripId: input.tripId, title: input.title, description: input.description || null, dueDate: input.dueDate || null,
    priority: input.priority, status: "pending", sortOrder: 0, completedAt: null, idempotencyKey: input.idempotencyKey || null,
  }, database);
}

export async function updateTravelTodo(actorId: string, input: {
  todoId: string; title: string; description?: string; dueDate?: string; priority: "low" | "normal" | "high";
  status: "pending" | "completed" | "cancelled";
}, database: IponlyDatabase = getDatabase()) {
  const userId = await resolveEditorOwnerForItem(actorId, "todo", input.todoId, database);
  const todo = await findTodo(userId, input.todoId, database);
  await findEditableTrip(userId, todo.tripId, database);
  const updated = await updateTodoForUser(input.todoId, userId, {
    title: input.title, description: input.description || null, dueDate: input.dueDate || null,
    priority: input.priority, status: input.status, completedAt: input.status === "completed" ? todo.completedAt ?? new Date() : null,
  }, database);
  if (!updated) throw new TravelRuleError("This travel task could not be updated.");
  return updated;
}

export async function deleteTravelTodo(actorId: string, todoId: string, database: IponlyDatabase = getDatabase()) {
  const userId = await resolveEditorOwnerForItem(actorId, "todo", todoId, database);
  const todo = await findTodo(userId, todoId, database);
  await findEditableTrip(userId, todo.tripId, database);
  const removed = await deleteTodoForUser(todoId, userId, database);
  if (!removed) throw new TravelRuleError("This travel task could not be deleted.");
  return removed;
}

export async function createPackingItem(actorId: string, input: {
  tripId: string; name: string; category: "documents" | "clothing" | "electronics" | "toiletries" | "medicine" | "money" | "travel_gear" | "other"; quantity: number; notes?: string;
}, database: IponlyDatabase = getDatabase()) {
  const userId = await resolveEditorOwner(actorId, input.tripId, database);
  await findEditableTrip(userId, input.tripId, database);
  return createPackingItemForUser(userId, {
    tripId: input.tripId, name: input.name, category: input.category, quantity: input.quantity, packed: false,
    notes: input.notes || null, sortOrder: 0,
  }, database);
}

export async function updatePackingItem(actorId: string, input: {
  itemId: string; name: string; category: "documents" | "clothing" | "electronics" | "toiletries" | "medicine" | "money" | "travel_gear" | "other"; quantity: number; notes?: string; packed: boolean;
}, database: IponlyDatabase = getDatabase()) {
  const userId = await resolveEditorOwnerForItem(actorId, "packing", input.itemId, database);
  const item = await findPackingItem(userId, input.itemId, database);
  await findEditableTrip(userId, item.tripId, database);
  const updated = await updatePackingItemForUser(input.itemId, userId, {
    name: input.name, category: input.category, quantity: input.quantity, notes: input.notes || null, packed: input.packed,
  }, database);
  if (!updated) throw new TravelRuleError("This packing item could not be updated.");
  return updated;
}

export async function deletePackingItem(actorId: string, itemId: string, database: IponlyDatabase = getDatabase()) {
  const userId = await resolveEditorOwnerForItem(actorId, "packing", itemId, database);
  const item = await findPackingItem(userId, itemId, database);
  await findEditableTrip(userId, item.tripId, database);
  const removed = await deletePackingItemForUser(itemId, userId, database);
  if (!removed) throw new TravelRuleError("This packing item could not be deleted.");
  return removed;
}

export async function createTravelBooking(userId: string, input: {
  tripId: string; bookingType: "flight" | "hotel" | "transport" | "activity" | "restaurant" | "insurance" | "other";
  provider?: string; title: string; confirmationNumber?: string; bookingDate?: string; startDateTime?: string;
  endDateTime?: string; amount?: string; currencyCode?: CurrencyCode; status: "planned" | "booked" | "completed" | "cancelled";
  link?: string; notes?: string;
}, database: IponlyDatabase = getDatabase()) {
  const trip = await findEditableTrip(userId, input.tripId, database);
  return createBookingForUser(userId, {
    tripId: trip.id, bookingType: input.bookingType, provider: input.provider || null, title: input.title,
    confirmationNumber: input.confirmationNumber || null, bookingDate: input.bookingDate || null,
    startDateTime: input.startDateTime ? new Date(input.startDateTime) : null,
    endDateTime: input.endDateTime ? new Date(input.endDateTime) : null,
    amountMinor: input.amount && input.currencyCode ? amountToMinor(input.amount, input.currencyCode, true) : null,
    currencyCode: input.currencyCode || null, status: input.status, link: input.link || null, notes: input.notes || null,
  }, database);
}

export async function updateTravelBooking(userId: string, input: {
  bookingId: string; bookingType: "flight" | "hotel" | "transport" | "activity" | "restaurant" | "insurance" | "other";
  provider?: string; title: string; confirmationNumber?: string; bookingDate?: string; startDateTime?: string;
  endDateTime?: string; amount?: string; currencyCode?: CurrencyCode; status: "planned" | "booked" | "completed" | "cancelled";
  link?: string; notes?: string;
}, database: IponlyDatabase = getDatabase()) {
  const booking = await findBooking(userId, input.bookingId, database);
  await findEditableTrip(userId, booking.tripId, database);
  const updated = await updateBookingForUser(input.bookingId, userId, {
    bookingType: input.bookingType, provider: input.provider || null, title: input.title,
    confirmationNumber: input.confirmationNumber || null, bookingDate: input.bookingDate || null,
    startDateTime: input.startDateTime ? new Date(input.startDateTime) : null,
    endDateTime: input.endDateTime ? new Date(input.endDateTime) : null,
    amountMinor: input.amount && input.currencyCode ? amountToMinor(input.amount, input.currencyCode, true) : null,
    currencyCode: input.currencyCode || null, status: input.status, link: input.link || null, notes: input.notes || null,
  }, database);
  if (!updated) throw new TravelRuleError("This booking could not be updated.");
  return updated;
}

const SHARE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateShareCode() {
  return Array.from({ length: 8 }, () => SHARE_CODE_ALPHABET[randomInt(SHARE_CODE_ALPHABET.length)]).join("");
}

async function resolveEditorOwner(actorId: string, tripId: string, database: IponlyDatabase) {
  const trip = await findTripById(tripId, database);
  if (!trip) throw new TravelRuleError("This trip could not be found or is archived.");
  if (trip.userId === actorId) return actorId;
  const member = trip.shareEnabled ? await findMembership(tripId, actorId, database) : null;
  if (member?.role !== "editor") throw new TravelRuleError("This trip could not be found or is archived.");
  return trip.userId;
}

async function resolveEditorOwnerForItem(actorId: string, kind: "itinerary" | "todo" | "packing", itemId: string, database: IponlyDatabase) {
  const tripId = await findTripIdForSharedItem(kind, itemId, database);
  if (!tripId) throw new TravelRuleError("This item could not be found.");
  return resolveEditorOwner(actorId, tripId, database);
}

export async function setTripSharing(
  userId: string,
  tripId: string,
  change: { enabled?: boolean; regenerate?: boolean; defaultRole?: "viewer" | "editor" },
  database: IponlyDatabase = getDatabase(),
) {
  const trip = await findEditableTrip(userId, tripId, database);
  const values: Parameters<typeof updateTripSharing>[2] = {};
  if (change.enabled !== undefined) values.shareEnabled = change.enabled;
  if ((change.enabled || change.regenerate) && (change.regenerate || !trip.shareCode)) values.shareCode = generateShareCode();
  if (change.defaultRole) values.shareDefaultRole = change.defaultRole;
  const updated = await updateTripSharing(tripId, userId, values, database);
  if (!updated) throw new TravelRuleError("Sharing could not be updated.");
  return updated;
}

export async function joinTripByCode(userId: string, code: string, database: IponlyDatabase = getDatabase()) {
  const trip = await findTripByShareCode(code, database);
  if (!trip) throw new TravelRuleError("That trip code isn’t valid or sharing has been turned off.");
  if (trip.userId === userId) throw new TravelRuleError("You already own this trip.");
  await addTripMember(trip.id, userId, trip.shareDefaultRole, database);
  return trip.id;
}

export async function leaveTrip(userId: string, tripId: string, database: IponlyDatabase = getDatabase()) {
  if (!(await removeTripMember(tripId, userId, database))) throw new TravelRuleError("You are not a member of this trip.");
}

export async function removeMemberFromTrip(ownerId: string, tripId: string, memberId: string, database: IponlyDatabase = getDatabase()) {
  await findEditableTrip(ownerId, tripId, database);
  if (!(await removeTripMember(tripId, memberId, database))) throw new TravelRuleError("That member could not be found.");
}

export async function changeMemberRole(
  ownerId: string,
  tripId: string,
  memberId: string,
  role: "viewer" | "editor",
  database: IponlyDatabase = getDatabase(),
) {
  await findEditableTrip(ownerId, tripId, database);
  if (!(await setTripMemberRole(tripId, memberId, role, database))) throw new TravelRuleError("That member could not be found.");
}

export async function getSharedTrips(userId: string, database: IponlyDatabase = getDatabase()) {
  const rows = await findTripsSharedWithUser(userId, database);
  return rows.map(({ trip, role, ownerName }) => ({ trip: toSharedTripView(trip), role, ownerName }));
}

export async function getSharedTripDetail(tripId: string, userId: string, database: IponlyDatabase = getDatabase()): Promise<SharedTripDetail | null> {
  const trip = await findTripById(tripId, database);
  if (!trip || trip.userId === userId || !trip.shareEnabled || trip.archivedAt) return null;
  const member = await findMembership(tripId, userId, database);
  if (!member) return null;
  const [itinerary, todos, packingItems, members, owners] = await Promise.all([
    findItineraryForTrip(tripId, trip.userId, database),
    findTodosForTrip(tripId, trip.userId, database),
    findPackingItemsForTrip(tripId, trip.userId, database),
    findTripMembers(tripId, database),
    findTripsSharedWithUser(userId, database),
  ]);
  return {
    trip: toSharedTripView(trip),
    role: member.role,
    ownerName: owners.find((row) => row.trip.id === tripId)?.ownerName ?? "the trip owner",
    memberCount: members.length,
    itinerary,
    todos,
    packingItems,
  };
}

function toSharedTripView(trip: TripRecord): SharedTripView {
  return {
    id: trip.id, name: trip.name, destination: trip.destination, countryCode: trip.countryCode,
    startDate: trip.startDate, endDate: trip.endDate, travelerCount: trip.travelerCount, status: trip.status,
  };
}

export function getTravelPackingProgress(items: { packed: boolean }[]) {
  return calculatePackingProgress(items);
}

async function validateSavingsGoal(
  userId: string,
  goalId: string | undefined,
  currency: CurrencyCode,
  database: SavingsDatabaseTransaction | IponlyDatabase,
  allowArchived = false,
) {
  if (!goalId) return null;
  const goal = await findSavingsGoalForUser(goalId, userId, database);
  if (!goal || (goal.status === "archived" && !allowArchived)) throw new TravelRuleError("Choose an active Savings goal that you own.");
  if (goal.currencyCode !== currency) throw new TravelRuleError("The Savings goal currency must match the trip's base currency.");
  return goal;
}

async function findEditableTrip(userId: string, tripId: string, database: Parameters<typeof findTripForUser>[2]) {
  const trip = await findTripForUser(tripId, userId, database);
  if (!trip || trip.archivedAt) throw new TravelRuleError("This trip could not be found or is archived.");
  return trip;
}

async function summarizeTripRows(userId: string, trips: Awaited<ReturnType<typeof findTripsForUser>>, database: IponlyDatabase): Promise<TravelTripSummary[]> {
  if (trips.length === 0) return [];
  const ids = trips.map((trip) => trip.id);
  const [planned, actual] = await Promise.all([
    aggregateTravelPlannedForTrips(userId, ids, database),
    aggregateTravelActualForTrips(userId, ids, database),
  ]);
  const byTrip = new Map<string, { planned: Array<{ currencyCode: CurrencyCode; amountMinor: number }>; actual: Array<{ currencyCode: CurrencyCode; amountMinor: number }> }>();
  for (const trip of trips) byTrip.set(trip.id, { planned: [], actual: [] });
  for (const row of planned) byTrip.get(row.tripId)?.planned.push({
    currencyCode: row.currencyCode,
    amountMinor: databaseAmount(row.amountMinor),
  });
  for (const row of actual) byTrip.get(row.tripId)?.actual.push({
    currencyCode: row.currencyCode,
    amountMinor: databaseAmount(row.amountMinor),
  });
  return trips.map((trip) => {
    const totals = byTrip.get(trip.id)!;
    const plannedMap = new Map(totals.planned.map((row) => [row.currencyCode, row.amountMinor]));
    const actualMap = new Map(totals.actual.map((row) => [row.currencyCode, row.amountMinor]));
    const plannedTotals = [...plannedMap].map(([currencyCode, amountMinor]) => ({ currencyCode, amountMinor }));
    const actualTotals = [...actualMap].map(([currencyCode, amountMinor]) => ({ currencyCode, amountMinor }));
    const plannedBase = plannedMap.get(trip.baseCurrencyCode) ?? 0;
    const actualBase = actualMap.get(trip.baseCurrencyCode) ?? 0;
    return {
      trip,
      plannedTotals,
      actualTotals,
      budgetRemainingMinor: trip.totalBudgetMinor > 0 ? trip.totalBudgetMinor - actualBase : null,
      plannedRemainingMinor: trip.totalBudgetMinor > 0 ? trip.totalBudgetMinor - plannedBase : null,
      utilizationPercent: trip.totalBudgetMinor > 0 ? Number(((actualBase / trip.totalBudgetMinor) * 100).toFixed(1)) : null,
    };
  });
}

function sameTripInput(
  trip: NonNullable<Awaited<ReturnType<typeof findTripByCreationKey>>>,
  input: { name: string; destination: string; countryCode?: string; startDate?: string; endDate?: string; travelerCount: number; baseCurrencyCode: CurrencyCode; linkedSavingsGoalId?: string; status: string; notes?: string },
  budgetMinor: number,
) {
  return trip.name === input.name && trip.destination === input.destination &&
    trip.countryCode === (input.countryCode?.toUpperCase() || null) &&
    trip.startDate === (input.startDate || null) && trip.endDate === (input.endDate || null) &&
    trip.travelerCount === input.travelerCount && trip.baseCurrencyCode === input.baseCurrencyCode &&
    trip.totalBudgetMinor === budgetMinor && trip.linkedSavingsGoalId === (input.linkedSavingsGoalId || null) &&
    trip.status === input.status && trip.notes === (input.notes || null);
}

function databaseAmount(value: string): number {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount)) throw new RangeError("Travel totals exceed the supported money range.");
  return amount;
}

async function findItineraryItem(userId: string, itemId: string, database: IponlyDatabase) {
  const item = await findItineraryItemForUser(itemId, userId, database);
  if (!item) throw new TravelRuleError("This itinerary item could not be found.");
  return item;
}

async function findTodo(userId: string, todoId: string, database: IponlyDatabase) {
  const todo = await findTodoForUser(todoId, userId, database);
  if (!todo) throw new TravelRuleError("This travel task could not be found.");
  return todo;
}

async function findPackingItem(userId: string, itemId: string, database: IponlyDatabase) {
  const item = await findPackingItemForUser(itemId, userId, database);
  if (!item) throw new TravelRuleError("This packing item could not be found.");
  return item;
}

async function findBooking(userId: string, bookingId: string, database: IponlyDatabase) {
  const booking = await findBookingForUser(bookingId, userId, database);
  if (!booking) throw new TravelRuleError("This booking could not be found.");
  return booking;
}
