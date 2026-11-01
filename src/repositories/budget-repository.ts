import "server-only";
import { and, asc, desc, eq, gte, lte, notExists, sql } from "drizzle-orm";
import { getDatabase } from "@/db";
import {
  budgetAllocations,
  budgetCategories,
  budgetExpenseTransactions,
  budgetIncomeSources,
  debtPayments,
  debts,
  financialAccounts,
  monthlyBudgets,
} from "@/db/schema";
import type { SavingsExecutor } from "@/repositories/account-repository";

export async function findBudgetForMonthForUser(
  userId: string,
  year: number,
  month: number,
  currencyCode: "PHP" | "USD" | "EUR" | "JPY",
  database: SavingsExecutor = getDatabase(),
) {
  const [budget] = await database.select().from(monthlyBudgets)
    .where(and(
      eq(monthlyBudgets.userId, userId),
      eq(monthlyBudgets.year, year),
      eq(monthlyBudgets.month, month),
      eq(monthlyBudgets.currencyCode, currencyCode),
    ))
    .limit(1);
  return budget ?? null;
}

export async function findBudgetForUser(budgetId: string, userId: string, database: SavingsExecutor = getDatabase()) {
  const [budget] = await database.select().from(monthlyBudgets)
    .where(and(eq(monthlyBudgets.id, budgetId), eq(monthlyBudgets.userId, userId)))
    .limit(1);
  return budget ?? null;
}

export async function findBudgetByIdempotencyKey(userId: string, key: string, database: SavingsExecutor = getDatabase()) {
  const [budget] = await database.select().from(monthlyBudgets)
    .where(and(eq(monthlyBudgets.userId, userId), eq(monthlyBudgets.creationIdempotencyKey, key)))
    .limit(1);
  return budget ?? null;
}

export async function createBudgetForUser(
  userId: string,
  values: Omit<typeof monthlyBudgets.$inferInsert, "userId">,
  database: SavingsExecutor,
) {
  const [budget] = await database.insert(monthlyBudgets).values({ ...values, userId }).returning();
  if (!budget) throw new Error("The monthly budget could not be created.");
  return budget;
}

export async function findBudgetsForUser(userId: string, limit = 24, database: SavingsExecutor = getDatabase()) {
  return database.select().from(monthlyBudgets)
    .where(and(eq(monthlyBudgets.userId, userId), sql`${monthlyBudgets.status} <> 'archived'`))
    .orderBy(desc(monthlyBudgets.year), desc(monthlyBudgets.month))
    .limit(limit);
}

export async function setBudgetStatusForUser(
  budgetId: string,
  userId: string,
  status: "active" | "closed" | "archived",
  database: SavingsExecutor,
) {
  const [budget] = await database.update(monthlyBudgets)
    .set({
      status,
      archivedAt: status === "archived" ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(and(eq(monthlyBudgets.id, budgetId), eq(monthlyBudgets.userId, userId)))
    .returning();
  return budget ?? null;
}

export async function findCategoriesForUser(
  userId: string,
  activeOnly = true,
  database: SavingsExecutor = getDatabase(),
) {
  return database.select().from(budgetCategories)
    .where(and(eq(budgetCategories.userId, userId), activeOnly ? eq(budgetCategories.isActive, true) : undefined))
    .orderBy(asc(budgetCategories.sortOrder), asc(budgetCategories.name));
}

export async function findCategoryForUser(categoryId: string, userId: string, database: SavingsExecutor = getDatabase()) {
  const [category] = await database.select().from(budgetCategories)
    .where(and(eq(budgetCategories.id, categoryId), eq(budgetCategories.userId, userId)))
    .limit(1);
  return category ?? null;
}

export async function createCategoriesForUser(
  userId: string,
  values: Array<Omit<typeof budgetCategories.$inferInsert, "userId">>,
  database: SavingsExecutor,
) {
  if (!values.length) return [];
  return database.insert(budgetCategories).values(values.map((value) => ({ ...value, userId })))
    .onConflictDoNothing()
    .returning();
}

export async function createCategoryForUser(
  userId: string,
  values: Omit<typeof budgetCategories.$inferInsert, "userId">,
  database: SavingsExecutor = getDatabase(),
) {
  const [category] = await database.insert(budgetCategories).values({ ...values, userId }).returning();
  if (!category) throw new Error("The budget category could not be created.");
  return category;
}

export async function updateCategoryForUser(
  categoryId: string,
  userId: string,
  values: Partial<Pick<typeof budgetCategories.$inferInsert, "name" | "categoryType" | "icon" | "color" | "sortOrder" | "isActive" | "archivedAt">>,
  database: SavingsExecutor,
) {
  const [category] = await database.update(budgetCategories)
    .set({ ...values, updatedAt: new Date() })
    .where(and(eq(budgetCategories.id, categoryId), eq(budgetCategories.userId, userId)))
    .returning();
  return category ?? null;
}

export async function findAllocationsForBudgetAndUser(budgetId: string, userId: string, database: SavingsExecutor = getDatabase()) {
  return database.select({ allocation: budgetAllocations, category: budgetCategories })
    .from(budgetAllocations)
    .innerJoin(budgetCategories, and(
      eq(budgetAllocations.categoryId, budgetCategories.id),
      eq(budgetAllocations.userId, budgetCategories.userId),
    ))
    .where(and(eq(budgetAllocations.budgetId, budgetId), eq(budgetAllocations.userId, userId)))
    .orderBy(asc(budgetCategories.sortOrder), asc(budgetCategories.name));
}

export async function upsertAllocationForBudgetAndUser(
  userId: string,
  values: { budgetId: string; categoryId: string; plannedAmountMinor: number },
  database: SavingsExecutor,
) {
  const [allocation] = await database.insert(budgetAllocations).values({
    userId,
    ...values,
  }).onConflictDoUpdate({
    target: [budgetAllocations.budgetId, budgetAllocations.categoryId],
    set: { plannedAmountMinor: values.plannedAmountMinor, updatedAt: new Date() },
  }).returning();
  if (!allocation) throw new Error("The budget allocation could not be saved.");
  return allocation;
}

export async function findIncomeForBudgetAndUser(budgetId: string, userId: string, database: SavingsExecutor = getDatabase()) {
  return database.select().from(budgetIncomeSources)
    .where(and(eq(budgetIncomeSources.budgetId, budgetId), eq(budgetIncomeSources.userId, userId)))
    .orderBy(asc(budgetIncomeSources.createdAt));
}

export async function findIncomeForUser(incomeId: string, userId: string, database: SavingsExecutor) {
  const [income] = await database.select().from(budgetIncomeSources)
    .where(and(eq(budgetIncomeSources.id, incomeId), eq(budgetIncomeSources.userId, userId)))
    .limit(1);
  return income ?? null;
}

export async function findIncomeByIdempotencyKey(userId: string, key: string, database: SavingsExecutor) {
  const [income] = await database.select().from(budgetIncomeSources)
    .where(and(eq(budgetIncomeSources.userId, userId), eq(budgetIncomeSources.idempotencyKey, key)))
    .limit(1);
  return income ?? null;
}

export async function createIncomeForBudgetAndUser(
  userId: string,
  values: Omit<typeof budgetIncomeSources.$inferInsert, "userId">,
  database: SavingsExecutor,
) {
  const [income] = await database.insert(budgetIncomeSources).values({ ...values, userId }).returning();
  if (!income) throw new Error("The income source could not be created.");
  return income;
}

export async function markIncomeReceivedForUser(
  incomeId: string,
  userId: string,
  values: { actualAmountMinor: number; receivedDate: string },
  database: SavingsExecutor,
) {
  const [income] = await database.update(budgetIncomeSources)
    .set({ ...values, status: "received", updatedAt: new Date() })
    .where(and(
      eq(budgetIncomeSources.id, incomeId),
      eq(budgetIncomeSources.userId, userId),
      sql`${budgetIncomeSources.status} <> 'cancelled'`,
    ))
    .returning();
  return income ?? null;
}

export async function findExpensesForBudgetAndUser(budgetId: string, userId: string, database: SavingsExecutor = getDatabase()) {
  return database.select({ expense: budgetExpenseTransactions, category: budgetCategories })
    .from(budgetExpenseTransactions)
    .innerJoin(budgetCategories, and(
      eq(budgetExpenseTransactions.categoryId, budgetCategories.id),
      eq(budgetExpenseTransactions.userId, budgetCategories.userId),
    ))
    .where(and(
      eq(budgetExpenseTransactions.budgetId, budgetId),
      eq(budgetExpenseTransactions.userId, userId),
    ))
    .orderBy(desc(budgetExpenseTransactions.transactionDate), desc(budgetExpenseTransactions.createdAt))
    .limit(200);
}

export async function findExpenseForUser(expenseId: string, userId: string, database: SavingsExecutor) {
  const [expense] = await database.select().from(budgetExpenseTransactions)
    .where(and(eq(budgetExpenseTransactions.id, expenseId), eq(budgetExpenseTransactions.userId, userId)))
    .limit(1);
  return expense ?? null;
}

export async function findExpenseByIdempotencyKey(userId: string, key: string, database: SavingsExecutor) {
  const [expense] = await database.select().from(budgetExpenseTransactions)
    .where(and(eq(budgetExpenseTransactions.userId, userId), eq(budgetExpenseTransactions.idempotencyKey, key)))
    .limit(1);
  return expense ?? null;
}

export async function findExpenseForDebtPayment(paymentId: string, userId: string, database: SavingsExecutor) {
  const [expense] = await database.select().from(budgetExpenseTransactions)
    .where(and(
      eq(budgetExpenseTransactions.linkedDebtPaymentId, paymentId),
      eq(budgetExpenseTransactions.userId, userId),
    ))
    .limit(1);
  return expense ?? null;
}

export async function findExpenseForAccountTransaction(transactionId: string, userId: string, database: SavingsExecutor) {
  const [expense] = await database.select().from(budgetExpenseTransactions)
    .where(and(
      eq(budgetExpenseTransactions.linkedAccountTransactionId, transactionId),
      eq(budgetExpenseTransactions.userId, userId),
    ))
    .limit(1);
  return expense ?? null;
}

export async function attachDebtPaymentToExpenseForUser(
  expenseId: string,
  userId: string,
  values: { categoryId: string; debtPaymentId: string; description: string; notes: string | null },
  database: SavingsExecutor,
) {
  const [expense] = await database.update(budgetExpenseTransactions)
    .set({
      categoryId: values.categoryId,
      linkedDebtPaymentId: values.debtPaymentId,
      description: values.description,
      notes: values.notes,
      sourceType: "debt_payment",
      updatedAt: new Date(),
    })
    .where(and(
      eq(budgetExpenseTransactions.id, expenseId),
      eq(budgetExpenseTransactions.userId, userId),
      eq(budgetExpenseTransactions.status, "posted"),
    ))
    .returning();
  return expense ?? null;
}

export async function createExpenseForBudgetAndUser(
  userId: string,
  values: Omit<typeof budgetExpenseTransactions.$inferInsert, "userId">,
  database: SavingsExecutor,
) {
  const [expense] = await database.insert(budgetExpenseTransactions).values({ ...values, userId }).returning();
  if (!expense) throw new Error("The budget transaction could not be created.");
  return expense;
}

export async function markExpenseReversedForUser(
  expenseId: string,
  userId: string,
  reason: string,
  reversalIdempotencyKey: string,
  database: SavingsExecutor,
) {
  const [expense] = await database.update(budgetExpenseTransactions)
    .set({
      status: "reversed",
      reversalReason: reason,
      reversedAt: new Date(),
      reversalIdempotencyKey,
      updatedAt: new Date(),
    })
    .where(and(
      eq(budgetExpenseTransactions.id, expenseId),
      eq(budgetExpenseTransactions.userId, userId),
      eq(budgetExpenseTransactions.status, "posted"),
    ))
    .returning();
  return expense ?? null;
}

export async function findExpenseReversalByIdempotencyKey(userId: string, key: string, database: SavingsExecutor) {
  const [expense] = await database.select().from(budgetExpenseTransactions)
    .where(and(
      eq(budgetExpenseTransactions.userId, userId),
      eq(budgetExpenseTransactions.reversalIdempotencyKey, key),
    ))
    .limit(1);
  return expense ?? null;
}

export async function findAccountsWithBudgetBalance(userId: string, currencyCode: "PHP" | "USD" | "EUR" | "JPY", database: SavingsExecutor = getDatabase()) {
  return database.select().from(financialAccounts)
    .where(and(
      eq(financialAccounts.userId, userId),
      eq(financialAccounts.status, "active"),
      eq(financialAccounts.currencyCode, currencyCode),
    ))
    .orderBy(asc(financialAccounts.name));
}

export async function findUnlinkedDebtPaymentsForMonth(
  userId: string,
  from: string,
  to: string,
  database: SavingsExecutor = getDatabase(),
) {
  return database.select({ payment: debtPayments, debt: debts })
    .from(debtPayments)
    .innerJoin(debts, and(eq(debtPayments.debtId, debts.id), eq(debtPayments.userId, debts.userId)))
    .where(and(
      eq(debtPayments.userId, userId),
      eq(debtPayments.status, "posted"),
      gte(debtPayments.paymentDate, new Date(`${from}T12:00:00.000Z`)),
      lte(debtPayments.paymentDate, new Date(`${to}T12:00:00.000Z`)),
      notExists(database.select({ id: budgetExpenseTransactions.id })
        .from(budgetExpenseTransactions)
        .where(and(
          eq(budgetExpenseTransactions.userId, userId),
          eq(budgetExpenseTransactions.linkedDebtPaymentId, debtPayments.id),
        ))),
    ))
    .orderBy(desc(debtPayments.paymentDate))
    .limit(100);
}

export async function findBudgetCategoryByName(userId: string, name: string, database: SavingsExecutor) {
  const [category] = await database.select().from(budgetCategories)
    .where(and(eq(budgetCategories.userId, userId), sql`lower(${budgetCategories.name}) = lower(${name})`))
    .limit(1);
  return category ?? null;
}

export async function findPreviousBudgetForUser(userId: string, year: number, month: number, database: SavingsExecutor = getDatabase()) {
  const period = year * 12 + month;
  const budgets = await database.select().from(monthlyBudgets)
    .where(and(
      eq(monthlyBudgets.userId, userId),
      sql`${monthlyBudgets.status} <> 'archived'`,
      sql`(${monthlyBudgets.year} * 12 + ${monthlyBudgets.month}) < ${period}`,
    ))
    .orderBy(desc(monthlyBudgets.year), desc(monthlyBudgets.month))
    .limit(1);
  return budgets[0] ?? null;
}

export async function copyAllocationsForBudget(
  sourceBudgetId: string,
  destinationBudgetId: string,
  userId: string,
  database: SavingsExecutor,
) {
  const allocations = await database.select().from(budgetAllocations)
    .where(and(eq(budgetAllocations.budgetId, sourceBudgetId), eq(budgetAllocations.userId, userId)));
  if (!allocations.length) return 0;
  await database.insert(budgetAllocations).values(allocations.map((allocation) => ({
    userId,
    budgetId: destinationBudgetId,
    categoryId: allocation.categoryId,
    plannedAmountMinor: allocation.plannedAmountMinor,
    notes: allocation.notes,
  })));
  return allocations.length;
}

export async function copyPlannedIncomeForBudget(
  sourceBudgetId: string,
  destinationBudgetId: string,
  userId: string,
  database: SavingsExecutor,
) {
  const incomes = await database.select().from(budgetIncomeSources)
    .where(and(
      eq(budgetIncomeSources.budgetId, sourceBudgetId),
      eq(budgetIncomeSources.userId, userId),
      eq(budgetIncomeSources.status, "planned"),
    ));
  for (const [index, income] of incomes.entries()) {
    await database.insert(budgetIncomeSources).values({
      userId,
      budgetId: destinationBudgetId,
      name: income.name,
      incomeType: income.incomeType,
      plannedAmountMinor: income.plannedAmountMinor,
      actualAmountMinor: 0,
      expectedDate: null,
      receivedDate: null,
      notes: income.notes,
      status: "planned",
      idempotencyKey: `copy:${sourceBudgetId}:${destinationBudgetId}:${index}`,
    });
  }
  return incomes.length;
}

export async function getCopyCountsForBudget(sourceBudgetId: string, userId: string, database: SavingsExecutor = getDatabase()) {
  const [allocationCount] = await database.select({ count: sql<number>`count(*)::int` })
    .from(budgetAllocations)
    .where(and(eq(budgetAllocations.budgetId, sourceBudgetId), eq(budgetAllocations.userId, userId)));
  const [plannedIncomeCount] = await database.select({ count: sql<number>`count(*)::int` })
    .from(budgetIncomeSources)
    .where(and(
      eq(budgetIncomeSources.budgetId, sourceBudgetId),
      eq(budgetIncomeSources.userId, userId),
      eq(budgetIncomeSources.status, "planned"),
    ));
  const [expenseCount] = await database.select({ count: sql<number>`count(*)::int` })
    .from(budgetExpenseTransactions)
    .where(and(eq(budgetExpenseTransactions.budgetId, sourceBudgetId), eq(budgetExpenseTransactions.userId, userId)));
  return {
    allocationCount: allocationCount?.count ?? 0,
    plannedIncomeCount: plannedIncomeCount?.count ?? 0,
    expenseCount: expenseCount?.count ?? 0,
  };
}

export async function findLatestMonthForBudgetId(budgetId: string, userId: string, database: SavingsExecutor) {
  const [budget] = await database.select({ year: monthlyBudgets.year, month: monthlyBudgets.month })
    .from(monthlyBudgets)
    .where(and(eq(monthlyBudgets.id, budgetId), eq(monthlyBudgets.userId, userId)))
    .limit(1);
  return budget ?? null;
}

export async function findExpenseDatesInRange(
  userId: string,
  from: string,
  to: string,
  currencyCode: "PHP" | "USD" | "EUR" | "JPY",
  database: SavingsExecutor = getDatabase(),
) {
  return database.select({
    expense: budgetExpenseTransactions,
    category: budgetCategories,
  })
    .from(budgetExpenseTransactions)
    .innerJoin(budgetCategories, eq(budgetExpenseTransactions.categoryId, budgetCategories.id))
    .innerJoin(monthlyBudgets, eq(budgetExpenseTransactions.budgetId, monthlyBudgets.id))
    .where(and(
      eq(budgetExpenseTransactions.userId, userId),
      eq(monthlyBudgets.currencyCode, currencyCode),
      eq(budgetExpenseTransactions.status, "posted"),
      gte(budgetExpenseTransactions.transactionDate, from),
      lte(budgetExpenseTransactions.transactionDate, to),
    ))
    .orderBy(asc(budgetExpenseTransactions.transactionDate));
}

export async function findIncomeDateRange(
  userId: string,
  year: number,
  month: number,
  currencyCode: "PHP" | "USD" | "EUR" | "JPY",
  database: SavingsExecutor = getDatabase(),
) {
  return database.select().from(budgetIncomeSources)
    .innerJoin(monthlyBudgets, eq(budgetIncomeSources.budgetId, monthlyBudgets.id))
    .where(and(
      eq(budgetIncomeSources.userId, userId),
      eq(monthlyBudgets.year, year),
      eq(monthlyBudgets.month, month),
      eq(monthlyBudgets.currencyCode, currencyCode),
    ));
}
