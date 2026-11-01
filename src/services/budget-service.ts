import "server-only";
import { and, eq } from "drizzle-orm";
import { getDatabase, type IponlyDatabase } from "@/db";
import { debtPayments } from "@/db/schema";
import { amountToMinor } from "@/lib/validations/savings";
import { calculateBudgetSummary, shiftBudgetMonth } from "@/lib/budget";
import {
  copyAllocationsForBudget,
  copyPlannedIncomeForBudget,
  attachDebtPaymentToExpenseForUser,
  createBudgetForUser,
  createCategoriesForUser,
  createCategoryForUser,
  createExpenseForBudgetAndUser,
  createIncomeForBudgetAndUser,
  findAccountsWithBudgetBalance,
  findAllocationsForBudgetAndUser,
  findBudgetCategoryByName,
  findBudgetForMonthForUser,
  findBudgetForUser,
  findBudgetsForUser,
  findCategoriesForUser,
  findCategoryForUser,
  findBudgetByIdempotencyKey,
  findExpenseByIdempotencyKey,
  findExpenseForDebtPayment,
  findExpenseForAccountTransaction,
  findExpenseReversalByIdempotencyKey,
  findExpenseForUser,
  findExpensesForBudgetAndUser,
  findIncomeByIdempotencyKey,
  findIncomeForBudgetAndUser,
  findIncomeForUser,
  findUnlinkedDebtPaymentsForMonth,
  getCopyCountsForBudget,
  markExpenseReversedForUser,
  markIncomeReceivedForUser,
  setBudgetStatusForUser,
  updateCategoryForUser,
  upsertAllocationForBudgetAndUser,
} from "@/repositories/budget-repository";
import { getBalancesForUser, getBalanceForAccount, lockAccountsForUser } from "@/repositories/account-repository";
import { createTransactionForUser, findTransactionByIdForUser } from "@/repositories/account-transaction-repository";
import { reverseSavingsTransactionInTransaction } from "@/services/savings-service";
import type { SavingsDatabaseTransaction } from "@/repositories/account-transaction-repository";
import type { CurrencyCode } from "@/types/domain";

export class BudgetRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BudgetRuleError";
  }
}

const defaultCategories = [
  { name: "Housing", type: "expense", color: "#5b8f71" },
  { name: "Utilities", type: "expense", color: "#6d9fc6" },
  { name: "Groceries", type: "expense", color: "#90a955" },
  { name: "Transportation", type: "expense", color: "#d49a54" },
  { name: "Insurance", type: "expense", color: "#8e79b8" },
  { name: "Healthcare", type: "expense", color: "#d87979" },
  { name: "Debt Payments", type: "debt", color: "#a47670" },
  { name: "Savings", type: "savings", color: "#48a88a" },
  { name: "Family Support", type: "expense", color: "#c27a9b" },
  { name: "Subscriptions", type: "expense", color: "#7b83a8" },
  { name: "Dining", type: "expense", color: "#da8854" },
  { name: "Shopping", type: "expense", color: "#c27c72" },
  { name: "Entertainment", type: "expense", color: "#c5a447" },
  { name: "Travel", type: "expense", color: "#568f9c" },
  { name: "Other", type: "other", color: "#82918c" },
] as const;

function monthDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function assertInBudgetMonth(budget: { year: number; month: number }, date: string) {
  if (!date.startsWith(`${budget.year}-${String(budget.month).padStart(2, "0")}-`)) {
    throw new BudgetRuleError("Use a date within the selected budget month.");
  }
}

function assertBudgetEditable(budget: { status: string }) {
  if (budget.status !== "active") throw new BudgetRuleError("Reopen this budget before making changes.");
}

function asIsoDate(value: Date | string) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

export async function initializeBudgetCategories(userId: string, database: IponlyDatabase = getDatabase()) {
  await createCategoriesForUser(userId, defaultCategories.map((category, sortOrder) => ({
    name: category.name,
    categoryType: category.type,
    color: category.color,
    sortOrder,
    isSystemDefault: true,
    isActive: true,
  })), database);
  return findCategoriesForUser(userId, false, database);
}

export async function createMonthlyBudget(
  userId: string,
  input: {
    year: number;
    month: number;
    currencyCode: CurrencyCode;
    name?: string;
    notes?: string;
    idempotencyKey: string;
  },
  database: IponlyDatabase = getDatabase(),
) {
  await initializeBudgetCategories(userId, database);
  return database.transaction(async (transaction) => {
    const replay = await findBudgetByIdempotencyKey(userId, input.idempotencyKey, transaction);
    if (replay) {
      if (replay.year !== input.year || replay.month !== input.month || replay.currencyCode !== input.currencyCode) {
        throw new BudgetRuleError("This submission key was already used for a different budget.");
      }
      return replay;
    }
    const duplicate = await findBudgetForMonthForUser(userId, input.year, input.month, input.currencyCode, transaction);
    if (duplicate) throw new BudgetRuleError("A budget already exists for this month and currency.");
    return createBudgetForUser(userId, {
      year: input.year,
      month: input.month,
      currencyCode: input.currencyCode,
      name: input.name?.trim() || `${new Intl.DateTimeFormat("en", { month: "long" }).format(new Date(Date.UTC(input.year, input.month - 1, 1)))} ${input.year} Budget`,
      notes: input.notes || null,
      creationIdempotencyKey: input.idempotencyKey,
      status: "active",
    }, transaction);
  });
}

export async function getBudgetPageData(
  userId: string,
  year: number,
  month: number,
  currencyCode: CurrencyCode,
  database: IponlyDatabase = getDatabase(),
) {
  const previous = shiftBudgetMonth(year, month, -1);
  const [categories, budgets, budget, copySourceBudget] = await Promise.all([
    initializeBudgetCategories(userId, database),
    findBudgetsForUser(userId, 24, database),
    findBudgetForMonthForUser(userId, year, month, currencyCode, database),
    findBudgetForMonthForUser(userId, previous.year, previous.month, currencyCode, database),
  ]);
  const previousCopyCounts = copySourceBudget ? await getCopyCountsForBudget(copySourceBudget.id, userId, database) : null;
  const accounts = await findAccountsWithBudgetBalance(userId, currencyCode, database);
  const balances = await getBalancesForUser(userId, database);

  if (!budget) {
    return {
      budget: null,
      budgets,
      copySourceBudget,
      previousCopyCounts,
      categories,
      incomes: [],
      allocations: [],
      expenses: [],
      accounts: accounts.map((account) => ({ ...account, balanceMinor: balances.get(account.id) ?? 0 })),
      unlinkedDebtPayments: [],
      summary: null,
      copyCounts: null,
    };
  }

  const [incomes, allocations, expenseRows, unlinkedDebtPayments, copyCounts] = await Promise.all([
    findIncomeForBudgetAndUser(budget.id, userId, database),
    findAllocationsForBudgetAndUser(budget.id, userId, database),
    findExpensesForBudgetAndUser(budget.id, userId, database),
    findUnlinkedDebtPaymentsForMonth(
      userId,
      monthDate(year, month, 1),
      monthDate(year, month, new Date(Date.UTC(year, month, 0)).getUTCDate()),
      database,
    ),
    getCopyCountsForBudget(budget.id, userId, database),
  ]);
  const expenses = expenseRows.map(({ expense, category }) => ({ ...expense, categoryName: category.name }));
  const summary = calculateBudgetSummary(
    budget.currencyCode,
    incomes,
    allocations.map(({ allocation }) => allocation),
    expenses,
  );
  return {
    budget,
    budgets,
    copySourceBudget,
    previousCopyCounts,
    categories,
    incomes,
    allocations,
    expenses,
    accounts: accounts.map((account) => ({ ...account, balanceMinor: balances.get(account.id) ?? 0 })),
    unlinkedDebtPayments: unlinkedDebtPayments.map(({ payment, debt }) => ({
      ...payment,
      paymentDate: asIsoDate(payment.paymentDate),
      debtName: debt.name,
      linkedAccountTransactionId: payment.linkedAccountTransactionId,
    })),
    summary,
    copyCounts,
  };
}

export async function createBudgetIncome(
  userId: string,
  input: {
    budgetId: string;
    name: string;
    incomeType: "salary" | "bonus" | "freelance" | "allowance" | "reimbursement" | "business" | "interest" | "gift" | "other";
    plannedAmount: string;
    expectedDate?: string;
    receivedDate?: string;
    notes?: string;
    idempotencyKey: string;
  },
  database: IponlyDatabase = getDatabase(),
) {
  return database.transaction(async (transaction) => {
    const budget = await findBudgetForUser(input.budgetId, userId, transaction);
    if (!budget) throw new BudgetRuleError("This budget could not be found.");
    assertBudgetEditable(budget);
    if (input.expectedDate) assertInBudgetMonth(budget, input.expectedDate);
    if (input.receivedDate) assertInBudgetMonth(budget, input.receivedDate);
    const amountMinor = amountToMinor(input.plannedAmount, budget.currencyCode, true);
    const replay = await findIncomeByIdempotencyKey(userId, input.idempotencyKey, transaction);
    if (replay) {
        if (replay.budgetId !== budget.id || replay.name !== input.name || replay.plannedAmountMinor !== amountMinor ||
            replay.incomeType !== input.incomeType || replay.expectedDate !== (input.expectedDate || null) ||
            replay.receivedDate !== (input.receivedDate || null)) {
        throw new BudgetRuleError("This submission key was already used for different income.");
      }
      return replay;
    }
    return createIncomeForBudgetAndUser(userId, {
      budgetId: budget.id,
      name: input.name,
      incomeType: input.incomeType,
      plannedAmountMinor: amountMinor,
      actualAmountMinor: input.receivedDate ? amountMinor : 0,
      expectedDate: input.expectedDate || null,
      receivedDate: input.receivedDate || null,
      notes: input.notes || null,
      status: input.receivedDate ? "received" : "planned",
      idempotencyKey: input.idempotencyKey,
    }, transaction);
  });
}

export async function markBudgetIncomeReceived(
  userId: string,
  input: { incomeId: string; actualAmount: string; receivedDate: string },
  database: IponlyDatabase = getDatabase(),
) {
  return database.transaction(async (transaction) => {
    const income = await findIncomeForUser(input.incomeId, userId, transaction);
    if (!income) throw new BudgetRuleError("This income entry could not be found.");
    const budget = await findBudgetForUser(income.budgetId, userId, transaction);
    if (!budget) throw new BudgetRuleError("This budget could not be found.");
    assertBudgetEditable(budget);
    assertInBudgetMonth(budget, input.receivedDate);
    const amountMinor = amountToMinor(input.actualAmount, budget.currencyCode, true);
    if (income.status === "received") {
      if (income.actualAmountMinor === amountMinor && income.receivedDate === input.receivedDate) return income;
      throw new BudgetRuleError("Received income cannot be changed; create a correcting income entry instead.");
    }
    const updated = await markIncomeReceivedForUser(input.incomeId, userId, {
      actualAmountMinor: amountMinor,
      receivedDate: input.receivedDate,
    }, transaction);
    if (!updated) throw new BudgetRuleError("This income entry is no longer available.");
    return updated;
  });
}

export async function setBudgetAllocation(
  userId: string,
  input: { budgetId: string; categoryId: string; plannedAmount: string },
  database: IponlyDatabase = getDatabase(),
) {
  return database.transaction(async (transaction) => {
    const budget = await findBudgetForUser(input.budgetId, userId, transaction);
    const category = await findCategoryForUser(input.categoryId, userId, transaction);
    if (!budget || !category || !category.isActive) throw new BudgetRuleError("Choose a category in one of your budgets.");
    assertBudgetEditable(budget);
    const amountMinor = amountToMinor(input.plannedAmount, budget.currencyCode, true);
    return upsertAllocationForBudgetAndUser(userId, {
      budgetId: budget.id,
      categoryId: category.id,
      plannedAmountMinor: amountMinor,
    }, transaction);
  });
}

export async function createBudgetCategory(
  userId: string,
  input: { name: string; categoryType: "expense" | "savings" | "debt" | "other"; color: string },
) {
  const name = input.name.trim();
  const existing = await findBudgetCategoryByName(userId, name, getDatabase());
  if (existing) {
    throw new BudgetRuleError(existing.isActive
      ? "A category with this name already exists."
      : "This category is archived. Restore it instead of creating a duplicate.");
  }
  return createCategoryForUser(userId, {
    name,
    categoryType: input.categoryType,
    color: input.color,
    sortOrder: 100,
    isSystemDefault: false,
    isActive: true,
  });
}

export async function updateBudgetCategory(
  userId: string,
  input: { categoryId: string; name: string; color: string; icon?: string; sortOrder: number },
) {
  const category = await findCategoryForUser(input.categoryId, userId);
  if (!category) throw new BudgetRuleError("This category could not be found.");
  if (category.isSystemDefault && category.name !== input.name) {
    throw new BudgetRuleError("Default category names cannot be changed.");
  }
  const updated = await updateCategoryForUser(category.id, userId, {
    name: input.name,
    color: input.color,
    icon: input.icon || null,
    sortOrder: input.sortOrder,
  }, getDatabase());
  if (!updated) throw new BudgetRuleError("This category could not be updated.");
  return updated;
}

export async function setBudgetCategoryArchived(userId: string, categoryId: string, archived: boolean) {
  const category = await findCategoryForUser(categoryId, userId);
  if (!category) throw new BudgetRuleError("This category could not be found.");
  const updated = await updateCategoryForUser(categoryId, userId, {
    isActive: !archived,
    archivedAt: archived ? new Date() : null,
  }, getDatabase());
  if (!updated) throw new BudgetRuleError("This category could not be updated.");
  return updated;
}

export async function createBudgetExpense(
  userId: string,
  input: {
    budgetId: string;
    categoryId: string;
    amount: string;
    transactionDate: string;
    merchant?: string;
    description: string;
    paymentAccountId?: string;
    notes?: string;
    idempotencyKey: string;
  },
  database: IponlyDatabase = getDatabase(),
) {
  return database.transaction(async (transaction) => {
    const budget = await findBudgetForUser(input.budgetId, userId, transaction);
    const category = await findCategoryForUser(input.categoryId, userId, transaction);
    if (!budget || !category || !category.isActive || category.categoryType === "savings" || category.categoryType === "debt") {
      throw new BudgetRuleError("Choose an active expense category from this budget.");
    }
    assertBudgetEditable(budget);
    assertInBudgetMonth(budget, input.transactionDate);
    const amountMinor = amountToMinor(input.amount, budget.currencyCode);
    const replay = await findExpenseByIdempotencyKey(userId, input.idempotencyKey, transaction);
    if (replay) {
      if (replay.budgetId !== budget.id || replay.categoryId !== category.id || replay.amountMinor !== amountMinor ||
          replay.transactionDate !== input.transactionDate || replay.description !== input.description ||
          replay.merchant !== (input.merchant || null) || Boolean(replay.linkedAccountTransactionId) !== Boolean(input.paymentAccountId)) {
        throw new BudgetRuleError("This submission key was already used for a different expense.");
      }
      if (input.paymentAccountId && replay.linkedAccountTransactionId) {
        const linkedTransaction = await findTransactionByIdForUser(replay.linkedAccountTransactionId, userId, transaction);
        if (linkedTransaction?.accountId !== input.paymentAccountId) {
          throw new BudgetRuleError("This submission key was already used for a different Savings account.");
        }
      }
      return replay;
    }

    let linkedAccountTransactionId: string | null = null;
    if (input.paymentAccountId) {
      const account = (await lockAccountsForUser([input.paymentAccountId], userId, transaction))[0];
      if (!account || account.status !== "active") throw new BudgetRuleError("Choose one of your active Savings accounts.");
      if (account.currencyCode !== budget.currencyCode) throw new BudgetRuleError("The Savings account currency must match this budget.");
      const balanceMinor = await getBalanceForAccount(account.id, userId, transaction);
      if (amountMinor > balanceMinor) throw new BudgetRuleError("This expense exceeds the available account balance.");
      const transactionDate = new Date(`${input.transactionDate}T12:00:00.000Z`);
      const accountTransaction = await createTransactionForUser(userId, {
        accountId: account.id,
        transactionType: "withdrawal",
        amountMinor,
        currencyCode: budget.currencyCode,
        transactionDate,
        description: input.description,
        notes: `Linked Iponly budget expense${input.notes ? `: ${input.notes}` : ""}`,
        idempotencyKey: `${input.idempotencyKey}:account`,
      }, transaction);
      linkedAccountTransactionId = accountTransaction.id;
    }
    return createExpenseForBudgetAndUser(userId, {
      budgetId: budget.id,
      categoryId: category.id,
      amountMinor,
      currencyCode: budget.currencyCode,
      transactionDate: input.transactionDate,
      merchant: input.merchant || null,
      description: input.description,
      notes: input.notes || null,
      linkedAccountTransactionId,
      linkedDebtPaymentId: null,
      sourceType: linkedAccountTransactionId ? "linked_account" : "manual",
      status: "posted",
      reversalReason: null,
      reversedAt: null,
      idempotencyKey: input.idempotencyKey,
      createdBy: "user",
    }, transaction);
  });
}

export async function createBudgetSavingsContribution(
  userId: string,
  input: {
    budgetId: string;
    categoryId: string;
    amount: string;
    transactionDate: string;
    accountId?: string;
    description: string;
    notes?: string;
    idempotencyKey: string;
  },
  database: IponlyDatabase = getDatabase(),
) {
  return database.transaction(async (transaction) => {
    const budget = await findBudgetForUser(input.budgetId, userId, transaction);
    const category = await findCategoryForUser(input.categoryId, userId, transaction);
    if (!budget || !category || !category.isActive || category.categoryType !== "savings") {
      throw new BudgetRuleError("Choose an active Savings category.");
    }
    assertBudgetEditable(budget);
    assertInBudgetMonth(budget, input.transactionDate);
    const amountMinor = amountToMinor(input.amount, budget.currencyCode);
    const replay = await findExpenseByIdempotencyKey(userId, input.idempotencyKey, transaction);
    if (replay) {
      if (replay.budgetId !== budget.id || replay.categoryId !== category.id || replay.amountMinor !== amountMinor ||
          replay.transactionDate !== input.transactionDate || replay.sourceType !== "savings_contribution" ||
          replay.description !== input.description || Boolean(replay.linkedAccountTransactionId) !== Boolean(input.accountId)) {
        throw new BudgetRuleError("This submission key was already used for a different contribution.");
      }
      if (input.accountId && replay.linkedAccountTransactionId) {
        const linkedTransaction = await findTransactionByIdForUser(replay.linkedAccountTransactionId, userId, transaction);
        if (linkedTransaction?.accountId !== input.accountId) {
          throw new BudgetRuleError("This submission key was already used for a different Savings account.");
        }
      }
      return replay;
    }
    let linkedAccountTransactionId: string | null = null;
    if (input.accountId) {
      const account = (await lockAccountsForUser([input.accountId], userId, transaction))[0];
      if (!account || account.status !== "active") throw new BudgetRuleError("Choose one of your active Savings accounts.");
      if (account.currencyCode !== budget.currencyCode) throw new BudgetRuleError("The Savings account currency must match this budget.");
      const accountTransaction = await createTransactionForUser(userId, {
        accountId: account.id,
        transactionType: "deposit",
        amountMinor,
        currencyCode: budget.currencyCode,
        transactionDate: new Date(`${input.transactionDate}T12:00:00.000Z`),
        description: input.description,
        notes: "Savings contribution from monthly budget.",
        idempotencyKey: `${input.idempotencyKey}:account`,
      }, transaction);
      linkedAccountTransactionId = accountTransaction.id;
    }
    return createExpenseForBudgetAndUser(userId, {
      budgetId: budget.id,
      categoryId: category.id,
      amountMinor,
      currencyCode: budget.currencyCode,
      transactionDate: input.transactionDate,
      merchant: null,
      description: input.description,
      notes: input.notes || null,
      linkedAccountTransactionId,
      linkedDebtPaymentId: null,
      sourceType: "savings_contribution",
      status: "posted",
      reversalReason: null,
      reversedAt: null,
      idempotencyKey: input.idempotencyKey,
      createdBy: "user",
    }, transaction);
  });
}

export async function linkDebtPaymentToBudget(
  userId: string,
  input: { budgetId: string; paymentId: string; categoryId: string; idempotencyKey: string },
  database: IponlyDatabase = getDatabase(),
) {
  return database.transaction(async (transaction) => {
    const budget = await findBudgetForUser(input.budgetId, userId, transaction);
    const category = await findCategoryForUser(input.categoryId, userId, transaction);
    if (!budget || !category || !category.isActive || category.categoryType !== "debt") {
      throw new BudgetRuleError("Choose an active Debt category.");
    }
    assertBudgetEditable(budget);
    const [payment] = await transaction.select().from(debtPayments)
      .where(and(eq(debtPayments.id, input.paymentId), eq(debtPayments.userId, userId)))
      .limit(1);
    if (!payment || payment.status !== "posted") throw new BudgetRuleError("This debt payment could not be found.");
    if (payment.currencyCode !== budget.currencyCode) {
      throw new BudgetRuleError("This transaction uses a different currency and cannot be included without conversion data.");
    }
    const paymentDate = asIsoDate(payment.paymentDate);
    assertInBudgetMonth(budget, paymentDate);
    const existing = await findExpenseForDebtPayment(payment.id, userId, transaction);
    if (existing) {
      if (existing.budgetId === budget.id && existing.categoryId === category.id) return existing;
      throw new BudgetRuleError("This debt payment is already linked to a different monthly budget.");
    }
    if (payment.linkedAccountTransactionId) {
      const accountExpense = await findExpenseForAccountTransaction(payment.linkedAccountTransactionId, userId, transaction);
      if (accountExpense) {
        if (accountExpense.budgetId !== budget.id || accountExpense.amountMinor !== payment.amountMinor ||
            accountExpense.currencyCode !== payment.currencyCode || accountExpense.transactionDate !== paymentDate) {
          throw new BudgetRuleError("This payment conflicts with an existing Budget entry. Review the linked transactions before continuing.");
        }
        const linked = await attachDebtPaymentToExpenseForUser(accountExpense.id, userId, {
          categoryId: category.id,
          debtPaymentId: payment.id,
          description: payment.description,
          notes: payment.notes,
        }, transaction);
        if (!linked) throw new BudgetRuleError("The existing Budget entry could not be linked.");
        return linked;
      }
    }
    const replay = await findExpenseByIdempotencyKey(userId, input.idempotencyKey, transaction);
    if (replay && replay.linkedDebtPaymentId !== payment.id) {
      throw new BudgetRuleError("This submission key was already used for a different transaction.");
    }
    return createExpenseForBudgetAndUser(userId, {
      budgetId: budget.id,
      categoryId: category.id,
      amountMinor: payment.amountMinor,
      currencyCode: payment.currencyCode,
      transactionDate: paymentDate,
      merchant: null,
      description: payment.description,
      notes: payment.notes,
      linkedAccountTransactionId: payment.linkedAccountTransactionId,
      linkedDebtPaymentId: payment.id,
      sourceType: "debt_payment",
      status: "posted",
      reversalReason: null,
      reversedAt: null,
      idempotencyKey: input.idempotencyKey,
      createdBy: "user",
    }, transaction);
  });
}

export async function syncDebtPaymentWithBudgetInTransaction(
  userId: string,
  payment: typeof debtPayments.$inferSelect,
  transaction: SavingsDatabaseTransaction,
) {
  if (payment.status !== "posted") return null;
  const paymentDate = asIsoDate(payment.paymentDate);
  const [year, month] = paymentDate.split("-").map(Number);
  const budget = await findBudgetForMonthForUser(userId, year!, month!, payment.currencyCode, transaction);
  if (!budget) return null;
  const category = await findBudgetCategoryByName(userId, "Debt Payments", transaction);
  if (!category || !category.isActive) return null;
  const existing = await findExpenseForDebtPayment(payment.id, userId, transaction);
  if (existing) return existing;
  if (payment.linkedAccountTransactionId) {
    const accountExpense = await findExpenseForAccountTransaction(payment.linkedAccountTransactionId, userId, transaction);
    if (accountExpense) {
      if (accountExpense.budgetId !== budget.id || accountExpense.amountMinor !== payment.amountMinor ||
          accountExpense.currencyCode !== payment.currencyCode || accountExpense.transactionDate !== paymentDate) {
        throw new BudgetRuleError("This Debt payment conflicts with an existing Budget entry.");
      }
      const linked = await attachDebtPaymentToExpenseForUser(accountExpense.id, userId, {
        categoryId: category.id,
        debtPaymentId: payment.id,
        description: payment.description,
        notes: payment.notes,
      }, transaction);
      if (!linked) throw new BudgetRuleError("The existing Budget entry could not be linked.");
      return linked;
    }
  }
  return createExpenseForBudgetAndUser(userId, {
    budgetId: budget.id,
    categoryId: category.id,
    amountMinor: payment.amountMinor,
    currencyCode: payment.currencyCode,
    transactionDate: paymentDate,
    merchant: null,
    description: payment.description,
    notes: payment.notes,
    linkedAccountTransactionId: payment.linkedAccountTransactionId,
    linkedDebtPaymentId: payment.id,
    sourceType: "debt_payment",
    status: "posted",
    reversalReason: null,
    reversedAt: null,
    idempotencyKey: `debt-payment:${payment.id}`,
    createdBy: "system",
  }, transaction);
}

export async function reverseDebtPaymentInBudgetTransaction(
  userId: string,
  paymentId: string,
  reason: string,
  idempotencyKey: string,
  transaction: SavingsDatabaseTransaction,
) {
  const replay = await findExpenseReversalByIdempotencyKey(userId, idempotencyKey, transaction);
  if (replay && replay.linkedDebtPaymentId !== paymentId) {
    throw new BudgetRuleError("This reversal key was already used for a different Budget transaction.");
  }
  const expense = await findExpenseForDebtPayment(paymentId, userId, transaction);
  if (!expense || expense.status === "reversed") return expense;
  const reversed = await markExpenseReversedForUser(expense.id, userId, reason, idempotencyKey, transaction);
  if (!reversed) throw new BudgetRuleError("The linked budget payment could not be reversed.");
  return reversed;
}

export async function reverseBudgetExpense(
  userId: string,
  input: { expenseId: string; reason: string; idempotencyKey: string },
  database: IponlyDatabase = getDatabase(),
) {
  return database.transaction(async (transaction) => {
    const expense = await findExpenseForUser(input.expenseId, userId, transaction);
    if (!expense) throw new BudgetRuleError("This budget transaction could not be found.");
    if (expense.sourceType === "debt_payment") throw new BudgetRuleError("Reverse this transaction from the Debt page to keep linked records in sync.");
    if (expense.sourceType === "travel") throw new BudgetRuleError("Reverse this transaction from the Travel page to keep linked records in sync.");
    const replay = await findExpenseReversalByIdempotencyKey(userId, input.idempotencyKey, transaction);
    if (replay && replay.id !== expense.id) {
      throw new BudgetRuleError("This reversal key was already used for a different transaction.");
    }
    if (expense.status === "reversed") {
      if (expense.reversalIdempotencyKey === input.idempotencyKey) return expense;
      throw new BudgetRuleError("This transaction has already been reversed.");
    }
    if (expense.linkedAccountTransactionId) {
      await reverseSavingsTransactionInTransaction(userId, {
        transactionId: expense.linkedAccountTransactionId,
        reason: input.reason,
        idempotencyKey: `${input.idempotencyKey}:account`,
      }, transaction);
    }
    const reversed = await markExpenseReversedForUser(expense.id, userId, input.reason, input.idempotencyKey, transaction);
    if (!reversed) throw new BudgetRuleError("This transaction has already been reversed.");
    return reversed;
  });
}

export async function copyMonthlyBudget(
  userId: string,
  input: { sourceBudgetId: string; targetYear: number; targetMonth: number; idempotencyKey: string },
  database: IponlyDatabase = getDatabase(),
) {
  return database.transaction(async (transaction) => {
    const source = await findBudgetForUser(input.sourceBudgetId, userId, transaction);
    if (!source) throw new BudgetRuleError("The source budget could not be found.");
    const replay = await findBudgetByIdempotencyKey(userId, input.idempotencyKey, transaction);
    if (replay) {
      if (replay.year !== input.targetYear || replay.month !== input.targetMonth || replay.currencyCode !== source.currencyCode) {
        throw new BudgetRuleError("This submission key was already used for a different copy.");
      }
      return { budget: replay, copiedAllocations: 0, copiedPlannedIncome: 0 };
    }
    const existing = await findBudgetForMonthForUser(userId, input.targetYear, input.targetMonth, source.currencyCode, transaction);
    if (existing) throw new BudgetRuleError("A budget already exists for this month and currency.");
    const { year, month } = source;
    const counts = await getCopyCountsForBudget(source.id, userId, transaction);
    const destination = await createBudgetForUser(userId, {
      year: input.targetYear,
      month: input.targetMonth,
      currencyCode: source.currencyCode,
      name: `${new Intl.DateTimeFormat("en", { month: "long" }).format(new Date(Date.UTC(input.targetYear, input.targetMonth - 1, 1)))} ${input.targetYear} Budget`,
      notes: `Copied from ${year}-${String(month).padStart(2, "0")}.`,
      creationIdempotencyKey: input.idempotencyKey,
      status: "active",
    }, transaction);
    await copyAllocationsForBudget(source.id, destination.id, userId, transaction);
    await copyPlannedIncomeForBudget(source.id, destination.id, userId, transaction);
    return { budget: destination, copiedAllocations: counts.allocationCount, copiedPlannedIncome: counts.plannedIncomeCount };
  });
}

export async function getBudgetCopyPreview(userId: string, sourceBudgetId: string) {
  const source = await findBudgetForUser(sourceBudgetId, userId);
  if (!source) throw new BudgetRuleError("The source budget could not be found.");
  const counts = await getCopyCountsForBudget(source.id, userId);
  return { source, ...counts };
}

export async function setMonthlyBudgetStatus(
  userId: string,
  budgetId: string,
  status: "active" | "closed" | "archived",
) {
  const budget = await setBudgetStatusForUser(budgetId, userId, status, getDatabase());
  if (!budget) throw new BudgetRuleError("This budget could not be found.");
  return budget;
}

export async function getCurrentBudgetSummary(userId: string, currencyCode: CurrencyCode, timezone = "Asia/Manila") {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit" })
    .formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const data = await getBudgetPageData(userId, year, month, currencyCode);
  return data.budget && data.budget.status !== "archived" && data.summary
    ? { ...data.summary, budget: data.budget, expenses: data.expenses }
    : null;
}

export async function getBudgetAnalytics(userId: string, currencyCode: CurrencyCode) {
  const budgets = (await findBudgetsForUser(userId, 24)).filter((budget) => budget.currencyCode === currencyCode).slice(0, 6).reverse();
  const data = await Promise.all(budgets.map((budget) => getBudgetPageData(userId, budget.year, budget.month, currencyCode)));
  return data.map((item) => ({
    month: `${item.budget?.year}-${String(item.budget?.month).padStart(2, "0")}`,
    income: item.summary?.actualIncomeMinor ?? 0,
    spending: item.summary?.actualSpentMinor ?? 0,
    planned: item.summary?.plannedIncomeMinor ?? 0,
    allocated: item.summary?.totalAllocatedMinor ?? 0,
  }));
}

export async function reconcileBudgetLinks(userId: string, budgetId: string, database: IponlyDatabase = getDatabase()) {
  const budget = await findBudgetForUser(budgetId, userId, database);
  if (!budget) throw new BudgetRuleError("This budget could not be found.");
  const expenseRows = await findExpensesForBudgetAndUser(budgetId, userId, database);
  const issues: string[] = [];
  for (const { expense } of expenseRows) {
    if (expense.linkedAccountTransactionId) {
      const accountTransaction = await findTransactionByIdForUser(expense.linkedAccountTransactionId, userId, database);
      if (!accountTransaction) issues.push(`Budget transaction ${expense.id} has no matching Savings transaction.`);
      else if (accountTransaction.amountMinor !== expense.amountMinor || accountTransaction.currencyCode !== expense.currencyCode) {
        issues.push(`Budget transaction ${expense.id} does not match its linked Savings transaction.`);
      } else if (expense.status === "posted" && accountTransaction.status === "reversed") {
        issues.push(`Budget transaction ${expense.id} is posted but its Savings transaction was reversed.`);
      } else if (
        (expense.sourceType === "linked_account" || expense.sourceType === "debt_payment") &&
        accountTransaction.transactionType !== "withdrawal"
      ) {
        issues.push(`Budget transaction ${expense.id} links to a Savings transaction that is not a withdrawal.`);
      } else if (expense.sourceType === "savings_contribution" && accountTransaction.transactionType !== "deposit") {
        issues.push(`Savings contribution ${expense.id} does not link to a Savings deposit.`);
      }
    }
    if (expense.linkedDebtPaymentId) {
      const [payment] = await database.select().from(debtPayments)
        .where(and(
          eq(debtPayments.id, expense.linkedDebtPaymentId),
          eq(debtPayments.userId, userId),
        ))
        .limit(1);
      if (!payment) issues.push(`Budget transaction ${expense.id} has no matching Debt payment.`);
      else if (payment.amountMinor !== expense.amountMinor || payment.currencyCode !== expense.currencyCode) {
        issues.push(`Budget transaction ${expense.id} does not match its linked Debt payment.`);
      } else if (expense.status === "posted" && payment.status === "reversed") {
        issues.push(`Budget transaction ${expense.id} is posted but its Debt payment was reversed.`);
      }
    }
  }
  return { budgetId, issues };
}
