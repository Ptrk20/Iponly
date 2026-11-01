import "server-only";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDatabase, type IponlyDatabase } from "@/db";
import {
  budgetCategories,
  budgetExpenseTransactions,
  monthlyBudgets,
  savingsGoals,
  travelBookings,
  travelExpenses,
  travelItineraryItems,
  travelPackingItems,
  travelPlannedExpenses,
  travelTodos,
  travelTripMembers,
  trips,
  user,
} from "@/db/schema";
import type { SavingsExecutor } from "@/repositories/account-repository";

export async function findTripById(tripId: string, database: SavingsExecutor = getDatabase()) {
  const [trip] = await database.select().from(trips).where(eq(trips.id, tripId)).limit(1);
  return trip ?? null;
}

export async function findTripByShareCode(code: string, database: SavingsExecutor = getDatabase()) {
  const [trip] = await database.select().from(trips)
    .where(and(eq(trips.shareCode, code), eq(trips.shareEnabled, true), isNull(trips.archivedAt)))
    .limit(1);
  return trip ?? null;
}

export async function updateTripSharing(
  tripId: string,
  userId: string,
  values: Partial<Pick<typeof trips.$inferInsert, "shareEnabled" | "shareCode" | "shareDefaultRole">>,
  database: SavingsExecutor = getDatabase(),
) {
  const [trip] = await database.update(trips).set({ ...values, updatedAt: new Date() })
    .where(and(eq(trips.id, tripId), eq(trips.userId, userId), isNull(trips.archivedAt)))
    .returning();
  return trip ?? null;
}

export async function findMembership(tripId: string, userId: string, database: SavingsExecutor = getDatabase()) {
  const [member] = await database.select().from(travelTripMembers)
    .where(and(eq(travelTripMembers.tripId, tripId), eq(travelTripMembers.userId, userId)))
    .limit(1);
  return member ?? null;
}

export async function addTripMember(
  tripId: string,
  userId: string,
  role: "viewer" | "editor",
  database: SavingsExecutor = getDatabase(),
) {
  await database.insert(travelTripMembers).values({ tripId, userId, role }).onConflictDoNothing();
}

export async function removeTripMember(tripId: string, userId: string, database: SavingsExecutor = getDatabase()) {
  const removed = await database.delete(travelTripMembers)
    .where(and(eq(travelTripMembers.tripId, tripId), eq(travelTripMembers.userId, userId)))
    .returning({ id: travelTripMembers.id });
  return removed.length > 0;
}

export async function setTripMemberRole(
  tripId: string,
  userId: string,
  role: "viewer" | "editor",
  database: SavingsExecutor = getDatabase(),
) {
  const updated = await database.update(travelTripMembers).set({ role })
    .where(and(eq(travelTripMembers.tripId, tripId), eq(travelTripMembers.userId, userId)))
    .returning({ id: travelTripMembers.id });
  return updated.length > 0;
}

export async function setAllTripMemberRoles(tripId: string, role: "viewer" | "editor", database: SavingsExecutor = getDatabase()) {
  await database.update(travelTripMembers).set({ role }).where(eq(travelTripMembers.tripId, tripId));
}

export async function findTripMembers(tripId: string, database: SavingsExecutor = getDatabase()) {
  return database.select({
    userId: travelTripMembers.userId,
    role: travelTripMembers.role,
    joinedAt: travelTripMembers.joinedAt,
    name: user.name,
  })
    .from(travelTripMembers)
    .innerJoin(user, eq(user.id, travelTripMembers.userId))
    .where(eq(travelTripMembers.tripId, tripId))
    .orderBy(asc(travelTripMembers.joinedAt))
    .limit(100);
}

export async function findTripsSharedWithUser(userId: string, database: SavingsExecutor = getDatabase()) {
  return database.select({ trip: trips, role: travelTripMembers.role, ownerName: user.name })
    .from(travelTripMembers)
    .innerJoin(trips, eq(trips.id, travelTripMembers.tripId))
    .innerJoin(user, eq(user.id, trips.userId))
    .where(and(eq(travelTripMembers.userId, userId), isNull(trips.archivedAt), eq(trips.shareEnabled, true)))
    .orderBy(sql`${trips.startDate} IS NULL`, asc(trips.startDate))
    .limit(100);
}

export async function findTripIdForSharedItem(kind: "itinerary" | "todo" | "packing", itemId: string, database: SavingsExecutor = getDatabase()) {
  const table = kind === "itinerary" ? travelItineraryItems : kind === "todo" ? travelTodos : travelPackingItems;
  const [row] = await database.select({ tripId: table.tripId }).from(table).where(eq(table.id, itemId)).limit(1);
  return row?.tripId ?? null;
}

export async function findTripsForUser(
  userId: string,
  options: { archived?: boolean; limit?: number; database?: SavingsExecutor } = {},
) {
  const database = options.database ?? getDatabase();
  return database.select().from(trips)
    .where(and(
      eq(trips.userId, userId),
      options.archived ? sql`${trips.archivedAt} IS NOT NULL` : isNull(trips.archivedAt),
    ))
    .orderBy(sql`${trips.startDate} IS NULL`, asc(trips.startDate), desc(trips.createdAt))
    .limit(options.limit ?? 100);
}

export async function findTripForUser(tripId: string, userId: string, database: SavingsExecutor = getDatabase()) {
  const [trip] = await database.select().from(trips)
    .where(and(eq(trips.id, tripId), eq(trips.userId, userId)))
    .limit(1);
  return trip ?? null;
}

export async function setTripArchivedForUser(tripId: string, userId: string, archived: boolean, database: SavingsExecutor) {
  const [trip] = await database.update(trips)
    .set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
    .where(and(
      eq(trips.id, tripId),
      eq(trips.userId, userId),
      archived ? isNull(trips.archivedAt) : sql`${trips.archivedAt} IS NOT NULL`,
    ))
    .returning();
  return trip ?? null;
}

export async function findTripByCreationKey(userId: string, key: string, database: SavingsExecutor) {
  const [trip] = await database.select().from(trips)
    .where(and(eq(trips.userId, userId), eq(trips.creationIdempotencyKey, key)))
    .limit(1);
  return trip ?? null;
}

export async function createTripForUser(
  userId: string,
  values: Omit<typeof trips.$inferInsert, "userId">,
  database: SavingsExecutor,
) {
  const [trip] = await database.insert(trips).values({ ...values, userId }).returning();
  if (!trip) throw new Error("The trip could not be created.");
  return trip;
}

export async function updateTripForUser(
  tripId: string,
  userId: string,
  values: Partial<Omit<typeof trips.$inferInsert, "id" | "userId" | "createdAt" | "creationIdempotencyKey">>,
  database: SavingsExecutor = getDatabase(),
) {
  const [trip] = await database.update(trips).set({ ...values, updatedAt: new Date() })
    .where(and(eq(trips.id, tripId), eq(trips.userId, userId), isNull(trips.archivedAt)))
    .returning();
  return trip ?? null;
}

export async function findSavingsGoalForUser(goalId: string, userId: string, database: SavingsExecutor = getDatabase()) {
  const [goal] = await database.select().from(savingsGoals)
    .where(and(eq(savingsGoals.id, goalId), eq(savingsGoals.userId, userId)))
    .limit(1);
  return goal ?? null;
}

export async function findTravelBudgetsForUser(userId: string, database: SavingsExecutor = getDatabase()) {
  return database.select({
    budget: monthlyBudgets,
    category: budgetCategories,
  })
    .from(monthlyBudgets)
    .innerJoin(budgetCategories, and(
      eq(budgetCategories.userId, monthlyBudgets.userId),
      eq(budgetCategories.name, "Travel"),
      eq(budgetCategories.categoryType, "expense"),
      eq(budgetCategories.isActive, true),
    ))
    .where(and(eq(monthlyBudgets.userId, userId), eq(monthlyBudgets.status, "active")))
    .orderBy(desc(monthlyBudgets.year), desc(monthlyBudgets.month))
    .limit(24);
}

export async function findPlannedTravelExpenses(tripId: string, userId: string, database: SavingsExecutor = getDatabase()) {
  return database.select().from(travelPlannedExpenses)
    .where(and(eq(travelPlannedExpenses.tripId, tripId), eq(travelPlannedExpenses.userId, userId)))
    .orderBy(asc(travelPlannedExpenses.expectedDate), asc(travelPlannedExpenses.createdAt))
    .limit(500);
}

export async function findPlannedTravelExpenseForUser(expenseId: string, userId: string, database: SavingsExecutor) {
  const [expense] = await database.select().from(travelPlannedExpenses)
    .where(and(eq(travelPlannedExpenses.id, expenseId), eq(travelPlannedExpenses.userId, userId)))
    .limit(1);
  return expense ?? null;
}

export async function createPlannedTravelExpenseForUser(
  userId: string,
  values: Omit<typeof travelPlannedExpenses.$inferInsert, "userId">,
  database: SavingsExecutor,
) {
  const [expense] = await database.insert(travelPlannedExpenses).values({ ...values, userId }).returning();
  if (!expense) throw new Error("The planned travel expense could not be created.");
  return expense;
}

export async function updatePlannedTravelExpenseForUser(
  expenseId: string,
  userId: string,
  values: Partial<Pick<typeof travelPlannedExpenses.$inferInsert, "category" | "description" | "amountMinor" | "currencyCode" | "expectedDate" | "notes" | "status">>,
  database: SavingsExecutor,
) {
  const [expense] = await database.update(travelPlannedExpenses)
    .set({ ...values, updatedAt: new Date() })
    .where(and(eq(travelPlannedExpenses.id, expenseId), eq(travelPlannedExpenses.userId, userId)))
    .returning();
  return expense ?? null;
}

export async function findTravelExpensesForTrip(tripId: string, userId: string, database: SavingsExecutor = getDatabase()) {
  return database.select().from(travelExpenses)
    .where(and(eq(travelExpenses.tripId, tripId), eq(travelExpenses.userId, userId)))
    .orderBy(desc(travelExpenses.transactionDate), desc(travelExpenses.createdAt))
    .limit(500);
}

export async function findTravelExpenseForUser(expenseId: string, userId: string, database: SavingsExecutor) {
  const [expense] = await database.select().from(travelExpenses)
    .where(and(eq(travelExpenses.id, expenseId), eq(travelExpenses.userId, userId)))
    .limit(1);
  return expense ?? null;
}

export async function findTravelExpenseByIdempotencyKey(userId: string, key: string, database: SavingsExecutor) {
  const [expense] = await database.select().from(travelExpenses)
    .where(and(eq(travelExpenses.userId, userId), eq(travelExpenses.idempotencyKey, key)))
    .limit(1);
  return expense ?? null;
}

export async function findTravelExpenseByReversalKey(userId: string, key: string, database: SavingsExecutor) {
  const [expense] = await database.select().from(travelExpenses)
    .where(and(eq(travelExpenses.userId, userId), eq(travelExpenses.reversalIdempotencyKey, key)))
    .limit(1);
  return expense ?? null;
}

export async function createTravelExpenseForUser(
  userId: string,
  values: Omit<typeof travelExpenses.$inferInsert, "userId">,
  database: SavingsExecutor,
) {
  const [expense] = await database.insert(travelExpenses).values({ ...values, userId }).returning();
  if (!expense) throw new Error("The travel expense could not be recorded.");
  return expense;
}

export async function findBudgetExpenseForTravelExpense(
  travelExpenseId: string,
  userId: string,
  database: SavingsExecutor,
) {
  const [expense] = await database.select().from(budgetExpenseTransactions)
    .where(and(
      eq(budgetExpenseTransactions.linkedTravelExpenseId, travelExpenseId),
      eq(budgetExpenseTransactions.userId, userId),
    ))
    .limit(1);
  return expense ?? null;
}

export async function reverseTravelExpenseForUser(
  expenseId: string,
  userId: string,
  reason: string,
  reversalIdempotencyKey: string,
  database: SavingsExecutor,
) {
  const [expense] = await database.update(travelExpenses)
    .set({
      status: "reversed",
      reversalReason: reason,
      reversedAt: new Date(),
      reversalIdempotencyKey,
      updatedAt: new Date(),
    })
    .where(and(
      eq(travelExpenses.id, expenseId),
      eq(travelExpenses.userId, userId),
      eq(travelExpenses.status, "posted"),
    ))
    .returning();
  return expense ?? null;
}

export async function findItineraryForTrip(tripId: string, userId: string, database: SavingsExecutor = getDatabase()) {
  return database.select().from(travelItineraryItems)
    .where(and(eq(travelItineraryItems.tripId, tripId), eq(travelItineraryItems.userId, userId)))
    .orderBy(asc(travelItineraryItems.date), sql`${travelItineraryItems.startTime} IS NULL`, asc(travelItineraryItems.startTime), asc(travelItineraryItems.sortOrder))
    .limit(500);
}

export async function findItineraryItemForUser(itemId: string, userId: string, database: SavingsExecutor = getDatabase()) {
  const [item] = await database.select().from(travelItineraryItems)
    .where(and(eq(travelItineraryItems.id, itemId), eq(travelItineraryItems.userId, userId)))
    .limit(1);
  return item ?? null;
}

export async function createItineraryItemForUser(userId: string, values: Omit<typeof travelItineraryItems.$inferInsert, "userId">, database: SavingsExecutor) {
  const [item] = await database.insert(travelItineraryItems).values({ ...values, userId }).returning();
  if (!item) throw new Error("The itinerary item could not be created.");
  return item;
}

export async function updateItineraryItemForUser(itemId: string, userId: string, values: Partial<Omit<typeof travelItineraryItems.$inferInsert, "id" | "userId" | "tripId" | "createdAt">>, database: SavingsExecutor) {
  const [item] = await database.update(travelItineraryItems).set({ ...values, updatedAt: new Date() })
    .where(and(eq(travelItineraryItems.id, itemId), eq(travelItineraryItems.userId, userId)))
    .returning();
  return item ?? null;
}

export async function deleteItineraryItemForUser(itemId: string, userId: string, database: SavingsExecutor = getDatabase()) {
  const [item] = await database.delete(travelItineraryItems)
    .where(and(eq(travelItineraryItems.id, itemId), eq(travelItineraryItems.userId, userId)))
    .returning();
  return item ?? null;
}

export async function findTodosForTrip(tripId: string, userId: string, database: SavingsExecutor = getDatabase()) {
  return database.select().from(travelTodos)
    .where(and(eq(travelTodos.tripId, tripId), eq(travelTodos.userId, userId)))
    .orderBy(asc(travelTodos.status), asc(travelTodos.dueDate), asc(travelTodos.sortOrder))
    .limit(500);
}

export async function findTodoForUser(todoId: string, userId: string, database: SavingsExecutor = getDatabase()) {
  const [todo] = await database.select().from(travelTodos)
    .where(and(eq(travelTodos.id, todoId), eq(travelTodos.userId, userId)))
    .limit(1);
  return todo ?? null;
}

export async function createTodoForUser(userId: string, values: Omit<typeof travelTodos.$inferInsert, "userId">, database: SavingsExecutor) {
  const [todo] = await database.insert(travelTodos).values({ ...values, userId }).returning();
  if (!todo) throw new Error("The travel task could not be created.");
  return todo;
}

export async function updateTodoForUser(todoId: string, userId: string, values: Partial<Omit<typeof travelTodos.$inferInsert, "id" | "userId" | "tripId" | "createdAt">>, database: SavingsExecutor = getDatabase()) {
  const [todo] = await database.update(travelTodos).set({ ...values, updatedAt: new Date() })
    .where(and(eq(travelTodos.id, todoId), eq(travelTodos.userId, userId)))
    .returning();
  return todo ?? null;
}

export async function deleteTodoForUser(todoId: string, userId: string, database: SavingsExecutor = getDatabase()) {
  const [todo] = await database.delete(travelTodos)
    .where(and(eq(travelTodos.id, todoId), eq(travelTodos.userId, userId)))
    .returning();
  return todo ?? null;
}

export async function findPackingItemsForTrip(tripId: string, userId: string, database: SavingsExecutor = getDatabase()) {
  return database.select().from(travelPackingItems)
    .where(and(eq(travelPackingItems.tripId, tripId), eq(travelPackingItems.userId, userId)))
    .orderBy(asc(travelPackingItems.category), asc(travelPackingItems.sortOrder), asc(travelPackingItems.createdAt))
    .limit(500);
}

export async function findPackingItemForUser(itemId: string, userId: string, database: SavingsExecutor = getDatabase()) {
  const [item] = await database.select().from(travelPackingItems)
    .where(and(eq(travelPackingItems.id, itemId), eq(travelPackingItems.userId, userId)))
    .limit(1);
  return item ?? null;
}

export async function createPackingItemForUser(userId: string, values: Omit<typeof travelPackingItems.$inferInsert, "userId">, database: SavingsExecutor) {
  const [item] = await database.insert(travelPackingItems).values({ ...values, userId }).returning();
  if (!item) throw new Error("The packing item could not be created.");
  return item;
}

export async function updatePackingItemForUser(itemId: string, userId: string, values: Partial<Omit<typeof travelPackingItems.$inferInsert, "id" | "userId" | "tripId" | "createdAt">>, database: SavingsExecutor = getDatabase()) {
  const [item] = await database.update(travelPackingItems).set({ ...values, updatedAt: new Date() })
    .where(and(eq(travelPackingItems.id, itemId), eq(travelPackingItems.userId, userId)))
    .returning();
  return item ?? null;
}

export async function deletePackingItemForUser(itemId: string, userId: string, database: SavingsExecutor = getDatabase()) {
  const [item] = await database.delete(travelPackingItems)
    .where(and(eq(travelPackingItems.id, itemId), eq(travelPackingItems.userId, userId)))
    .returning();
  return item ?? null;
}

export async function findBookingsForTrip(tripId: string, userId: string, database: SavingsExecutor = getDatabase()) {
  return database.select().from(travelBookings)
    .where(and(eq(travelBookings.tripId, tripId), eq(travelBookings.userId, userId)))
    .orderBy(asc(travelBookings.startDateTime), desc(travelBookings.createdAt))
    .limit(200);
}

export async function findBookingForUser(bookingId: string, userId: string, database: SavingsExecutor = getDatabase()) {
  const [booking] = await database.select().from(travelBookings)
    .where(and(eq(travelBookings.id, bookingId), eq(travelBookings.userId, userId)))
    .limit(1);
  return booking ?? null;
}

export async function createBookingForUser(userId: string, values: Omit<typeof travelBookings.$inferInsert, "userId">, database: SavingsExecutor) {
  const [booking] = await database.insert(travelBookings).values({ ...values, userId }).returning();
  if (!booking) throw new Error("The booking could not be created.");
  return booking;
}

export async function updateBookingForUser(bookingId: string, userId: string, values: Partial<Omit<typeof travelBookings.$inferInsert, "id" | "userId" | "tripId" | "createdAt">>, database: SavingsExecutor = getDatabase()) {
  const [booking] = await database.update(travelBookings).set({ ...values, updatedAt: new Date() })
    .where(and(eq(travelBookings.id, bookingId), eq(travelBookings.userId, userId)))
    .returning();
  return booking ?? null;
}

export async function aggregateTravelPlannedForTrips(userId: string, tripIds: string[], database: SavingsExecutor = getDatabase()) {
  if (!tripIds.length) return [];
  return database.select({
    tripId: travelPlannedExpenses.tripId,
    currencyCode: travelPlannedExpenses.currencyCode,
    amountMinor: sql<string>`coalesce(sum(${travelPlannedExpenses.amountMinor}), 0)::text`,
  })
    .from(travelPlannedExpenses)
    .where(and(
      eq(travelPlannedExpenses.userId, userId),
      inArray(travelPlannedExpenses.tripId, tripIds),
      sql`${travelPlannedExpenses.status} IN ('planned', 'reserved')`,
    ))
    .groupBy(travelPlannedExpenses.tripId, travelPlannedExpenses.currencyCode);
}

export async function aggregateTravelActualForTrips(userId: string, tripIds: string[], database: SavingsExecutor = getDatabase()) {
  if (!tripIds.length) return [];
  return database.select({
    tripId: travelExpenses.tripId,
    currencyCode: travelExpenses.currencyCode,
    amountMinor: sql<string>`coalesce(sum(${travelExpenses.amountMinor}), 0)::text`,
  })
    .from(travelExpenses)
    .where(and(
      eq(travelExpenses.userId, userId),
      inArray(travelExpenses.tripId, tripIds),
      eq(travelExpenses.status, "posted"),
    ))
    .groupBy(travelExpenses.tripId, travelExpenses.currencyCode);
}

export async function findTravelExpensesForAnalytics(userId: string, database: IponlyDatabase = getDatabase()) {
  return database.select({
    expense: travelExpenses,
    tripName: trips.name,
    destination: trips.destination,
  })
    .from(travelExpenses)
    .innerJoin(trips, and(eq(trips.id, travelExpenses.tripId), eq(trips.userId, travelExpenses.userId)))
    .where(and(eq(travelExpenses.userId, userId), eq(travelExpenses.status, "posted")))
    .orderBy(desc(travelExpenses.transactionDate))
    .limit(5000);
}
