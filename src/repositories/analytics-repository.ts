import "server-only";
import { and, eq, gte, inArray, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDatabase, type IponlyDatabase } from "@/db";
import {
  accountTransactions,
  budgetAllocations,
  budgetCategories,
  budgetExpenseTransactions,
  budgetIncomeSources,
  debtPayments,
  financialAccounts,
  monthlyBudgets,
  savingsGoals,
  travelExpenses,
  travelPlannedExpenses,
  trips,
} from "@/db/schema";
import type { AnalyticsDateRange } from "@/types/analytics";

const originalTransaction = alias(accountTransactions, "analytics_original_transaction");

const transactionEffect = sql`CASE
  WHEN ${accountTransactions.transactionType} IN ('opening_balance', 'deposit', 'adjustment_increase', 'transfer_in') THEN ${accountTransactions.amountMinor}
  WHEN ${accountTransactions.transactionType} IN ('withdrawal', 'adjustment_decrease', 'transfer_out') THEN -${accountTransactions.amountMinor}
  WHEN ${accountTransactions.transactionType} = 'reversal' AND ${originalTransaction.transactionType} IN ('opening_balance', 'deposit', 'adjustment_increase', 'transfer_in') THEN -${accountTransactions.amountMinor}
  WHEN ${accountTransactions.transactionType} = 'reversal' AND ${originalTransaction.transactionType} IN ('withdrawal', 'adjustment_decrease', 'transfer_out') THEN ${accountTransactions.amountMinor}
  ELSE 0
END`;

export async function findAnalyticsSavingsAccounts(userId: string, database: IponlyDatabase = getDatabase()) {
  return database.select().from(financialAccounts)
    .where(eq(financialAccounts.userId, userId));
}

export async function findAnalyticsSavingsGoals(userId: string, database: IponlyDatabase = getDatabase()) {
  return database.select().from(savingsGoals)
    .where(and(
      eq(savingsGoals.userId, userId),
      inArray(savingsGoals.status, ["active", "completed"]),
    ));
}

export async function aggregateSavingsBalanceBefore(
  userId: string,
  range: AnalyticsDateRange,
  database: IponlyDatabase = getDatabase(),
) {
  return database.select({
    currencyCode: accountTransactions.currencyCode,
    amountMinor: sql<string>`coalesce(sum(${transactionEffect}), 0)::text`,
  })
    .from(accountTransactions)
    .innerJoin(financialAccounts, and(
      eq(accountTransactions.accountId, financialAccounts.id),
      eq(accountTransactions.userId, financialAccounts.userId),
      eq(financialAccounts.includeInTotal, true),
    ))
    .leftJoin(originalTransaction, eq(accountTransactions.reversalOfTransactionId, originalTransaction.id))
    .where(and(
      eq(accountTransactions.userId, userId),
      lt(accountTransactions.transactionDate, range.startInclusive),
    ))
    .groupBy(accountTransactions.currencyCode);
}

export async function aggregateSavingsBalanceChanges(
  userId: string,
  range: AnalyticsDateRange,
  timezone: string,
  database: IponlyDatabase = getDatabase(),
) {
  const localDay = sql<string>`to_char((${accountTransactions.transactionDate} AT TIME ZONE ${timezone})::date, 'YYYY-MM-DD')`;
  return database.select({
    period: localDay,
    currencyCode: accountTransactions.currencyCode,
    amountMinor: sql<string>`coalesce(sum(${transactionEffect}), 0)::text`,
  })
    .from(accountTransactions)
    .innerJoin(financialAccounts, and(
      eq(accountTransactions.accountId, financialAccounts.id),
      eq(accountTransactions.userId, financialAccounts.userId),
      eq(financialAccounts.includeInTotal, true),
    ))
    .leftJoin(originalTransaction, eq(accountTransactions.reversalOfTransactionId, originalTransaction.id))
    .where(and(
      eq(accountTransactions.userId, userId),
      gte(accountTransactions.transactionDate, range.startInclusive),
      lt(accountTransactions.transactionDate, range.endExclusive),
    ))
    .groupBy(sql.raw("1"), accountTransactions.currencyCode);
}

export async function aggregateSavingsActivity(
  userId: string,
  range: AnalyticsDateRange,
  database: IponlyDatabase = getDatabase(),
) {
  return database.select({
    currencyCode: accountTransactions.currencyCode,
    deposits: sql<string>`coalesce(sum(case when ${accountTransactions.transactionType} = 'deposit' and ${accountTransactions.status} = 'posted' then ${accountTransactions.amountMinor} else 0 end), 0)::text`,
    withdrawals: sql<string>`coalesce(sum(case when ${accountTransactions.transactionType} = 'withdrawal' and ${accountTransactions.status} = 'posted' then ${accountTransactions.amountMinor} else 0 end), 0)::text`,
  })
    .from(accountTransactions)
    .innerJoin(financialAccounts, and(
      eq(accountTransactions.accountId, financialAccounts.id),
      eq(accountTransactions.userId, financialAccounts.userId),
      eq(financialAccounts.includeInTotal, true),
    ))
    .where(and(
      eq(accountTransactions.userId, userId),
      gte(accountTransactions.transactionDate, range.startInclusive),
      lt(accountTransactions.transactionDate, range.endExclusive),
    ))
    .groupBy(accountTransactions.currencyCode);
}

export async function findAnalyticsBudgets(
  userId: string,
  range: AnalyticsDateRange,
  database: IponlyDatabase = getDatabase(),
) {
  const start = range.startDate.slice(0, 7).replace("-", "");
  const end = range.endDate.slice(0, 7).replace("-", "");
  const startPeriod = Number(start.slice(0, 4)) * 12 + Number(start.slice(4, 6));
  const endPeriod = Number(end.slice(0, 4)) * 12 + Number(end.slice(4, 6));
  return database.select().from(monthlyBudgets)
    .where(and(
      eq(monthlyBudgets.userId, userId),
      sql`(${monthlyBudgets.year} * 12 + ${monthlyBudgets.month}) BETWEEN ${startPeriod} AND ${endPeriod}`,
    ));
}

export async function findAnalyticsBudgetDetails(
  userId: string,
  budgetIds: string[],
  range: AnalyticsDateRange,
  database: IponlyDatabase = getDatabase(),
) {
  if (budgetIds.length === 0) return { allocations: [], incomes: [], expenses: [] };
  const [allocations, incomes, expenses] = await Promise.all([
    database.select({ allocation: budgetAllocations, category: budgetCategories })
      .from(budgetAllocations)
      .innerJoin(budgetCategories, and(
        eq(budgetAllocations.categoryId, budgetCategories.id),
        eq(budgetAllocations.userId, budgetCategories.userId),
      ))
      .where(and(eq(budgetAllocations.userId, userId), inArray(budgetAllocations.budgetId, budgetIds))),
    database.select().from(budgetIncomeSources)
      .where(and(eq(budgetIncomeSources.userId, userId), inArray(budgetIncomeSources.budgetId, budgetIds))),
    database.select({ expense: budgetExpenseTransactions, category: budgetCategories })
      .from(budgetExpenseTransactions)
      .innerJoin(budgetCategories, and(
        eq(budgetExpenseTransactions.categoryId, budgetCategories.id),
        eq(budgetExpenseTransactions.userId, budgetCategories.userId),
      ))
      .where(and(
        eq(budgetExpenseTransactions.userId, userId),
        inArray(budgetExpenseTransactions.budgetId, budgetIds),
        gte(budgetExpenseTransactions.transactionDate, range.startDate),
        lte(budgetExpenseTransactions.transactionDate, range.endDate),
      )),
  ]);
  return { allocations, incomes, expenses };
}

export async function findAnalyticsDebtPayments(
  userId: string,
  range: AnalyticsDateRange,
  database: IponlyDatabase = getDatabase(),
) {
  return database.select({
    payment: debtPayments,
    linkedExpenseId: budgetExpenseTransactions.id,
  })
    .from(debtPayments)
    .leftJoin(budgetExpenseTransactions, and(
      eq(budgetExpenseTransactions.linkedDebtPaymentId, debtPayments.id),
      eq(budgetExpenseTransactions.userId, debtPayments.userId),
    ))
    .where(and(
      eq(debtPayments.userId, userId),
      eq(debtPayments.status, "posted"),
      ne(debtPayments.paymentType, "reversal"),
      gte(debtPayments.paymentDate, new Date(`${range.startDate}T12:00:00.000Z`)),
      lte(debtPayments.paymentDate, new Date(`${range.endDate}T12:00:00.000Z`)),
    ));
}

export async function findAnalyticsTravelData(
  userId: string,
  range: AnalyticsDateRange,
  database: IponlyDatabase = getDatabase(),
) {
  const [actual, planned] = await Promise.all([
    database.select({
      expense: travelExpenses,
      tripId: trips.id,
      tripName: trips.name,
      destination: trips.destination,
    })
      .from(travelExpenses)
      .innerJoin(trips, and(eq(trips.id, travelExpenses.tripId), eq(trips.userId, travelExpenses.userId)))
      .where(and(
        eq(travelExpenses.userId, userId),
        eq(travelExpenses.status, "posted"),
        gte(travelExpenses.transactionDate, range.startDate),
        lte(travelExpenses.transactionDate, range.endDate),
      )),
    database.select({
      expense: travelPlannedExpenses,
      tripId: trips.id,
      tripName: trips.name,
      destination: trips.destination,
      tripStartDate: trips.startDate,
    })
      .from(travelPlannedExpenses)
      .innerJoin(trips, and(eq(trips.id, travelPlannedExpenses.tripId), eq(trips.userId, travelPlannedExpenses.userId)))
      .where(and(
        eq(travelPlannedExpenses.userId, userId),
        inArray(travelPlannedExpenses.status, ["planned", "reserved"]),
        or(
          and(gte(travelPlannedExpenses.expectedDate, range.startDate), lte(travelPlannedExpenses.expectedDate, range.endDate)),
          and(isNull(travelPlannedExpenses.expectedDate), gte(trips.startDate, range.startDate), lte(trips.startDate, range.endDate)),
        ),
      )),
  ]);
  return { actual, planned };
}
