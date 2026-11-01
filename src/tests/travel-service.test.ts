import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import type { IponlyDatabase } from "@/db";
import { findCategoriesForUser } from "@/repositories/budget-repository";
import { getBalanceForAccount } from "@/repositories/account-repository";
import { getAnalyticsDashboardData } from "@/services/analytics-service";
import { createMonthlyBudget } from "@/services/budget-service";
import { createSavingsAccount, recordSavingsDeposit } from "@/services/savings-service";
import {
  changeMemberRole,
  createPlannedExpense,
  createTrip,
  createTravelTodo,
  getSharedTripDetail,
  getTravelTripDetail,
  joinTripByCode,
  setTripSharing,
  recordTravelExpense,
  reverseTravelExpense,
  TravelRuleError,
} from "@/services/travel-service";

describe("authenticated Travel service", () => {
  let client: PGlite;
  let database: IponlyDatabase;

  beforeEach(async () => {
    client = new PGlite();
    const testDatabase = drizzle({ client, schema });
    database = testDatabase as unknown as IponlyDatabase;
    await migrate(testDatabase, { migrationsFolder: "src/db/migrations" });
    await testDatabase.insert(schema.user).values([
      { id: "travel-user-a", name: "Alex A", email: "travel-a@example.test" },
      { id: "travel-user-b", name: "Bailey B", email: "travel-b@example.test" },
    ]);
  });

  afterEach(async () => {
    await client.close();
  });

  it("records a linked Travel, Savings, and Budget expense once and reverses the complete transaction", async () => {
    const userId = "travel-user-a";
    const trip = await createTrip(userId, {
      name: "Tokyo trip",
      destination: "Tokyo, Japan",
      countryCode: "JP",
      startDate: "2026-10-01",
      endDate: "2026-10-08",
      travelerCount: 1,
      baseCurrencyCode: "PHP",
      totalBudget: "5000",
      status: "planning",
      idempotencyKey: crypto.randomUUID(),
    }, database);
    const planned = await createPlannedExpense(userId, {
      tripId: trip.id,
      category: "accommodation",
      description: "Hotel",
      amount: "250",
      currencyCode: "PHP",
      expectedDate: "2026-10-03",
    }, database);
    const account = await createSavingsAccount(userId, {
      name: "Travel fund",
      accountType: "savings",
      currencyCode: "PHP",
      openingBalance: "1000",
      includeInTotal: true,
      idempotencyKey: crypto.randomUUID(),
    }, database);
    await recordSavingsDeposit(userId, {
      accountId: account.accountId,
      amount: "500",
      transactionDate: "2026-09-01",
      description: "Trip savings",
      idempotencyKey: crypto.randomUUID(),
    }, database);
    const budget = await createMonthlyBudget(userId, {
      year: 2026,
      month: 10,
      currencyCode: "PHP",
      idempotencyKey: crypto.randomUUID(),
    }, database);
    const travelCategory = (await findCategoriesForUser(userId, true, database))
      .find((category) => category.name === "Travel")!;
    const idempotencyKey = crypto.randomUUID();
    const input = {
      tripId: trip.id,
      plannedExpenseId: planned.id,
      category: "accommodation" as const,
      description: "Hotel deposit",
      merchant: "Stay Co.",
      amount: "250",
      currencyCode: "PHP" as const,
      transactionDate: "2026-10-03",
      paymentAccountId: account.accountId,
      budgetId: budget.id,
      budgetCategoryId: travelCategory.id,
      idempotencyKey,
    };
    const recorded = await recordTravelExpense(userId, input, database);
    expect(recorded.duplicate).toBe(false);
    expect((await recordTravelExpense(userId, input, database)).duplicate).toBe(true);

    const balanceAfterExpense = await getBalanceForAccount(account.accountId, userId, database);
    expect(balanceAfterExpense).toBe(125_000);
    const analytics = await getAnalyticsDashboardData(userId, {
      period: "custom",
      customStart: "2026-10-01",
      customEnd: "2026-10-31",
      timezone: "Asia/Manila",
      defaultCurrencyCode: "PHP",
      now: new Date("2026-10-20T04:00:00.000Z"),
      database,
    });
    expect(analytics.budget.actualSpending).toEqual([{ currencyCode: "PHP", amountMinor: 25_000 }]);
    expect(analytics.travel.actualSpending).toEqual([{ currencyCode: "PHP", amountMinor: 25_000 }]);
    expect(analytics.travel.planned).toEqual([]);
    expect(analytics.budget.spendingByCategory).toEqual([expect.objectContaining({ name: "Travel", amountMinor: 25_000 })]);

    const reversed = await reverseTravelExpense(userId, {
      expenseId: recorded.expense.id,
      reason: "Refunded by hotel",
      idempotencyKey: crypto.randomUUID(),
    }, database);
    expect(reversed.status).toBe("reversed");
    expect(await getBalanceForAccount(account.accountId, userId, database)).toBe(150_000);
    const detail = await getTravelTripDetail(trip.id, userId, database);
    expect(detail?.expenses[0]?.status).toBe("reversed");
    const afterReversal = await getAnalyticsDashboardData(userId, {
      period: "custom",
      customStart: "2026-10-01",
      customEnd: "2026-10-31",
      timezone: "Asia/Manila",
      defaultCurrencyCode: "PHP",
      now: new Date("2026-10-20T04:00:00.000Z"),
      database,
    });
    expect(afterReversal.budget.actualSpending).toEqual([]);
    expect(afterReversal.travel.actualSpending).toEqual([]);
  });

  it("rolls back a Savings withdrawal if linking the Travel expense to an invalid Budget category fails", async () => {
    const userId = "travel-user-a";
    const trip = await createTrip(userId, {
      name: "Cebu",
      destination: "Cebu",
      travelerCount: 1,
      baseCurrencyCode: "PHP",
      status: "planning",
      idempotencyKey: crypto.randomUUID(),
    }, database);
    const account = await createSavingsAccount(userId, {
      name: "Cash",
      accountType: "cash",
      currencyCode: "PHP",
      openingBalance: "1000",
      includeInTotal: true,
      idempotencyKey: crypto.randomUUID(),
    }, database);
    const budget = await createMonthlyBudget(userId, {
      year: 2026,
      month: 10,
      currencyCode: "PHP",
      idempotencyKey: crypto.randomUUID(),
    }, database);
    await expect(recordTravelExpense(userId, {
      tripId: trip.id,
      category: "food",
      description: "Dinner",
      amount: "100",
      currencyCode: "PHP",
      transactionDate: "2026-10-03",
      paymentAccountId: account.accountId,
      budgetId: budget.id,
      budgetCategoryId: crypto.randomUUID(),
      idempotencyKey: crypto.randomUUID(),
    }, database)).rejects.toBeInstanceOf(TravelRuleError);
    expect(await getBalanceForAccount(account.accountId, userId, database)).toBe(100_000);
    expect((await getTravelTripDetail(trip.id, userId, database))?.expenses).toHaveLength(0);
  });

  it("enforces trip ownership when reading and recording Travel data", async () => {
    const trip = await createTrip("travel-user-a", {
      name: "Private trip",
      destination: "Somewhere",
      travelerCount: 1,
      baseCurrencyCode: "PHP",
      status: "planning",
      idempotencyKey: crypto.randomUUID(),
    }, database);
    expect(await getTravelTripDetail(trip.id, "travel-user-b", database)).toBeNull();
    const analytics = await getAnalyticsDashboardData("travel-user-b", {
      period: "custom",
      customStart: "2026-10-01",
      customEnd: "2026-10-31",
      timezone: "Asia/Manila",
      defaultCurrencyCode: "PHP",
      now: new Date("2026-10-20T04:00:00.000Z"),
      database,
    });
    expect(analytics.travel.planned).toEqual([]);
    expect(analytics.travel.actualSpending).toEqual([]);
    await expect(createPlannedExpense("travel-user-b", {
      tripId: trip.id,
      category: "food",
      description: "Private",
      amount: "10",
      currencyCode: "PHP",
    }, database)).rejects.toBeInstanceOf(TravelRuleError);
  });

  it("shares a trip by code with owner-controlled access and no money data", async () => {
    const trip = await createTrip("travel-user-a", {
      name: "Group trip", destination: "Cebu", travelerCount: 3, baseCurrencyCode: "PHP",
      status: "planning", totalBudget: "50000", idempotencyKey: crypto.randomUUID(),
    }, database);
    await expect(joinTripByCode("travel-user-b", "ABCDEFGH", database)).rejects.toBeInstanceOf(TravelRuleError);

    const shared = await setTripSharing("travel-user-a", trip.id, { enabled: true }, database);
    const code = shared.shareCode!;
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    await expect(joinTripByCode("travel-user-a", code, database)).rejects.toBeInstanceOf(TravelRuleError);

    await joinTripByCode("travel-user-b", code, database);
    const view = await getSharedTripDetail(trip.id, "travel-user-b", database);
    expect(view?.role).toBe("viewer");
    expect(JSON.stringify(view)).not.toContain("totalBudgetMinor");
    expect(await getTravelTripDetail(trip.id, "travel-user-b", database)).toBeNull();
    await expect(createTravelTodo("travel-user-b", { tripId: trip.id, title: "Book", priority: "normal" }, database))
      .rejects.toBeInstanceOf(TravelRuleError);

    await changeMemberRole("travel-user-a", trip.id, "travel-user-b", "editor", database);
    const todo = await createTravelTodo("travel-user-b", { tripId: trip.id, title: "Book hotel", priority: "normal" }, database);
    expect(todo.userId).toBe("travel-user-a");
    expect((await getSharedTripDetail(trip.id, "travel-user-b", database))?.todos).toHaveLength(1);

    await setTripSharing("travel-user-a", trip.id, { regenerate: true, enabled: true }, database);
    await expect(joinTripByCode("travel-user-b", code, database)).rejects.toBeInstanceOf(TravelRuleError);

    await setTripSharing("travel-user-a", trip.id, { enabled: false }, database);
    expect(await getSharedTripDetail(trip.id, "travel-user-b", database)).toBeNull();
    await expect(createTravelTodo("travel-user-b", { tripId: trip.id, title: "Nope", priority: "low" }, database))
      .rejects.toBeInstanceOf(TravelRuleError);
  });
});
