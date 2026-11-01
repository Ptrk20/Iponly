import "server-only";
import { and, eq } from "drizzle-orm";
import { getDatabase, type IponlyDatabase } from "@/db";
import { accountTransactions, savingsGoals } from "@/db/schema";
import {
  createAccountForUser,
  findAccountCreationForUser,
  findAccountForUser,
  findAccountsForUser,
  getBalanceForAccount,
  getBalancesForUser,
  lockAccountsForUser,
  setAccountArchivedForUser,
  updateAccountForUser,
} from "@/repositories/account-repository";
import {
  createTransactionForUser,
  findLastActivityForUser,
  findRecentSavingsActivity,
  findRecentTransactionsForUser,
  findTransactionByIdForUser,
  findTransactionByIdempotencyKey,
  findTransactionsForAccount,
  findTransferForUser,
  markTransactionReversedForUser,
  type SavingsDatabaseTransaction,
} from "@/repositories/account-transaction-repository";
import {
  createGoalForUser,
  findGoalForUser,
  findGoalsForUser,
  setGoalStatusForUser,
  updateGoalForUser,
} from "@/repositories/savings-goal-repository";
import { amountToMinor } from "@/lib/validations/savings";
import {
  calculateGoalProgress,
  calculateSavingsChange,
  calculateTotalSavings,
  groupTransactionsByPeriod,
} from "@/lib/savings";
import type {
  CurrencyCode,
  SavingsTransactionRecord,
  SavingsTransactionType,
} from "@/types/domain";

export class SavingsRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SavingsRuleError";
  }
}

export type SavingsTrendPeriod = "month" | "3m" | "6m" | "year";

function dayAtNoonUtc(date: string) {
  return new Date(`${date}T12:00:00.000Z`);
}

function beginningOfManilaMonth(now = new Date()) {
  const manilaDate = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return new Date(Date.UTC(manilaDate.getUTCFullYear(), manilaDate.getUTCMonth(), 1) - 8 * 60 * 60 * 1000);
}

function getActivityStart(period: SavingsTrendPeriod, now = new Date()) {
  const monthStart = beginningOfManilaMonth(now);
  if (period === "year") {
    const manilaDate = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    return new Date(Date.UTC(manilaDate.getUTCFullYear(), 0, 1) - 8 * 60 * 60 * 1000);
  }
  const months = period === "month" ? 1 : period === "3m" ? 3 : period === "6m" ? 6 : 12;
  monthStart.setUTCMonth(monthStart.getUTCMonth() - months + 1, 1);
  return monthStart;
}

function asTransaction(record: typeof accountTransactions.$inferSelect): SavingsTransactionRecord {
  return record;
}

export async function createSavingsAccount(
  userId: string,
  input: {
    name: string;
    institution?: string;
    accountType: "savings" | "checking" | "digital_wallet" | "cash" | "emergency_fund" | "travel_fund" | "other";
    currencyCode: CurrencyCode;
    openingBalance: string;
    includeInTotal: boolean;
    color?: string;
    icon?: string;
    notes?: string;
    idempotencyKey: string;
  },
  database: IponlyDatabase = getDatabase(),
) {
  const openingAmountMinor = input.openingBalance === "0" ? 0 : amountToMinor(input.openingBalance, input.currencyCode, true);

  return database.transaction(async (transaction) => {
    const existing = await findAccountCreationForUser(userId, input.idempotencyKey, transaction);
    if (existing) {
      if (
        existing.name !== input.name ||
        existing.institution !== (input.institution || null) ||
        existing.accountType !== input.accountType ||
        existing.currencyCode !== input.currencyCode ||
        existing.includeInTotal !== input.includeInTotal ||
        existing.color !== (input.color || null) ||
        existing.icon !== (input.icon || null) ||
        existing.notes !== (input.notes || null)
      ) {
        throw new SavingsRuleError("This account submission key was already used for different account details.");
      }
      const existingOpening = await findTransactionByIdempotencyKey(userId, `${input.idempotencyKey}:opening`, transaction);
      if ((existingOpening?.amountMinor ?? 0) !== openingAmountMinor) {
        throw new SavingsRuleError("This account submission key was already used with a different opening balance.");
      }
      return {
        accountId: existing.id,
        balanceMinor: await getBalanceForAccount(existing.id, userId, transaction),
        currencyCode: existing.currencyCode,
        duplicate: true,
      };
    }

    const account = await createAccountForUser(userId, {
      name: input.name,
      institution: input.institution || null,
      accountType: input.accountType,
      currencyCode: input.currencyCode,
      includeInTotal: input.includeInTotal,
      color: input.color || null,
      icon: input.icon || null,
      notes: input.notes || null,
      creationIdempotencyKey: input.idempotencyKey,
    }, transaction);

    if (openingAmountMinor > 0) {
      await createTransactionForUser(userId, {
        accountId: account.id,
        transactionType: "opening_balance",
        amountMinor: openingAmountMinor,
        currencyCode: account.currencyCode,
        transactionDate: new Date(),
        description: "Opening balance",
        notes: "Starting balance when this account was created.",
        idempotencyKey: `${input.idempotencyKey}:opening`,
      }, transaction);
    }
    return {
      accountId: account.id,
      balanceMinor: openingAmountMinor,
      currencyCode: account.currencyCode,
      duplicate: false,
    };
  });
}

export async function updateSavingsAccount(
  userId: string,
  input: {
    accountId: string;
    name: string;
    institution?: string;
    accountType: "savings" | "checking" | "digital_wallet" | "cash" | "emergency_fund" | "travel_fund" | "other";
    includeInTotal: boolean;
    color?: string;
    icon?: string;
    notes?: string;
  },
  database = getDatabase(),
) {
  const account = await updateAccountForUser(input.accountId, userId, {
    name: input.name,
    institution: input.institution || null,
    accountType: input.accountType,
    includeInTotal: input.includeInTotal,
    color: input.color || null,
    icon: input.icon || null,
    notes: input.notes || null,
  }, database);
  if (!account) throw new SavingsRuleError("This account could not be found or is archived.");
  return account;
}

export async function recordSavingsDeposit(
  userId: string,
  input: { accountId: string; amount: string; transactionDate: string; description: string; notes?: string; idempotencyKey: string },
  database: IponlyDatabase = getDatabase(),
) {
  return recordSingleTransaction(userId, input, "deposit", undefined, database);
}

export async function recordSavingsWithdrawal(
  userId: string,
  input: { accountId: string; amount: string; transactionDate: string; description: string; notes?: string; idempotencyKey: string },
  database: IponlyDatabase = getDatabase(),
) {
  return recordSingleTransaction(userId, input, "withdrawal", undefined, database);
}

export async function recordSavingsAdjustment(
  userId: string,
  input: {
    accountId: string;
    amount: string;
    transactionDate: string;
    description: string;
    notes?: string;
    reason: string;
    direction: "increase" | "decrease";
    idempotencyKey: string;
  },
  database: IponlyDatabase = getDatabase(),
) {
  return recordSingleTransaction(
    userId,
    input,
    input.direction === "increase" ? "adjustment_increase" : "adjustment_decrease",
    input.reason,
    database,
  );
}

async function recordSingleTransaction(
  userId: string,
  input: { accountId: string; amount: string; transactionDate: string; description: string; notes?: string; idempotencyKey: string },
  transactionType: "deposit" | "withdrawal" | "adjustment_increase" | "adjustment_decrease",
  reason?: string,
  database = getDatabase(),
) {
  return database.transaction(async (transaction) => {
    const locked = await lockAccountsForUser([input.accountId], userId, transaction);
    const account = locked[0];
    if (!account) throw new SavingsRuleError("This account could not be found.");
    if (account.status !== "active") throw new SavingsRuleError("Archived accounts cannot receive transactions.");

    const amountMinor = amountToMinor(input.amount, account.currencyCode);
    const transactionDate = dayAtNoonUtc(input.transactionDate);
    if (amountMinor <= 0) throw new SavingsRuleError("Enter an amount greater than zero.");
    const duplicate = await findTransactionByIdempotencyKey(userId, input.idempotencyKey, transaction);
    if (duplicate) {
      if (
        duplicate.accountId !== account.id ||
        duplicate.transactionType !== transactionType ||
        duplicate.amountMinor !== amountMinor ||
        duplicate.transactionDate.getTime() !== transactionDate.getTime() ||
        duplicate.description !== input.description ||
        duplicate.notes !== (input.notes || null) ||
        duplicate.reason !== (reason ?? null)
      ) {
        throw new SavingsRuleError("This submission key was already used for a different transaction.");
      }
      return { transactionId: duplicate.id, balanceMinor: await getBalanceForAccount(account.id, userId, transaction), currencyCode: account.currencyCode, duplicate: true };
    }

    const previousBalance = await getBalanceForAccount(account.id, userId, transaction);
    if ((transactionType === "withdrawal" || transactionType === "adjustment_decrease") && amountMinor > previousBalance) {
      throw new SavingsRuleError("This amount exceeds the available balance.");
    }

    const change = transactionType === "deposit" || transactionType === "adjustment_increase" ? amountMinor : -amountMinor;
    if (!Number.isSafeInteger(previousBalance + change)) {
      throw new SavingsRuleError("This transaction would exceed the supported balance range.");
    }
    const created = await createTransactionForUser(userId, {
      accountId: account.id,
      transactionType,
      amountMinor,
      currencyCode: account.currencyCode,
      transactionDate,
      description: input.description,
      notes: input.notes || null,
      reason: reason ?? null,
      idempotencyKey: input.idempotencyKey,
    }, transaction);
    return { transactionId: created.id, balanceMinor: previousBalance + change, currencyCode: account.currencyCode, duplicate: false };
  });
}

export async function transferSavings(
  userId: string,
  input: {
    sourceAccountId: string;
    destinationAccountId: string;
    amount: string;
    transactionDate: string;
    description: string;
    notes?: string;
    idempotencyKey: string;
  },
  database: IponlyDatabase = getDatabase(),
) {
  return database.transaction(async (transaction) => {
    const accounts = await lockAccountsForUser([input.sourceAccountId, input.destinationAccountId], userId, transaction);
    const source = accounts.find((account) => account.id === input.sourceAccountId);
    const destination = accounts.find((account) => account.id === input.destinationAccountId);
    if (!source || !destination) throw new SavingsRuleError("One or both accounts could not be found.");
    if (source.status !== "active" || destination.status !== "active") throw new SavingsRuleError("Transfers require two active accounts.");
    if (source.id === destination.id) throw new SavingsRuleError("Choose two different accounts.");
    if (source.currencyCode !== destination.currencyCode) throw new SavingsRuleError("Transfers between different currencies are not supported.");

    const amountMinor = amountToMinor(input.amount, source.currencyCode);
    if (amountMinor <= 0) throw new SavingsRuleError("Enter an amount greater than zero.");
    const transactionDate = dayAtNoonUtc(input.transactionDate);
    const outKey = `${input.idempotencyKey}:out`;
    const inKey = `${input.idempotencyKey}:in`;
    const previousOut = await findTransactionByIdempotencyKey(userId, outKey, transaction);
    const previousIn = await findTransactionByIdempotencyKey(userId, inKey, transaction);
    if (previousOut || previousIn) {
      if (
        !previousOut ||
        !previousIn ||
        previousOut.accountId !== source.id ||
        previousIn.accountId !== destination.id ||
        previousOut.amountMinor !== amountMinor ||
        previousIn.amountMinor !== amountMinor ||
        previousOut.transactionDate.getTime() !== transactionDate.getTime() ||
        previousIn.transactionDate.getTime() !== transactionDate.getTime() ||
        previousOut.description !== input.description ||
        previousIn.description !== input.description ||
        previousOut.notes !== (input.notes || null) ||
        previousIn.notes !== (input.notes || null) ||
        previousOut.transferId !== previousIn.transferId
      ) {
        throw new SavingsRuleError("This transfer submission could not be safely replayed.");
      }
      return {
        transferId: previousOut.transferId,
        sourceBalanceMinor: await getBalanceForAccount(source.id, userId, transaction),
        destinationBalanceMinor: await getBalanceForAccount(destination.id, userId, transaction),
        currencyCode: source.currencyCode,
        duplicate: true,
      };
    }

    const sourceBalanceMinor = await getBalanceForAccount(source.id, userId, transaction);
    const destinationBalanceMinor = await getBalanceForAccount(destination.id, userId, transaction);
    if (amountMinor > sourceBalanceMinor) throw new SavingsRuleError("This transfer exceeds the available balance.");
    if (!Number.isSafeInteger(destinationBalanceMinor + amountMinor)) {
      throw new SavingsRuleError("This transfer would exceed the destination account's supported balance range.");
    }

    const transferId = crypto.randomUUID();
    const shared = {
      amountMinor,
      currencyCode: source.currencyCode,
      transactionDate,
      description: input.description,
      notes: input.notes || null,
      transferId,
    };
    await createTransactionForUser(userId, {
      ...shared,
      accountId: source.id,
      transactionType: "transfer_out",
      idempotencyKey: outKey,
    }, transaction);
    await createTransactionForUser(userId, {
      ...shared,
      accountId: destination.id,
      transactionType: "transfer_in",
      idempotencyKey: inKey,
    }, transaction);
    return {
      transferId,
      sourceBalanceMinor: sourceBalanceMinor - amountMinor,
      destinationBalanceMinor: destinationBalanceMinor + amountMinor,
      currencyCode: source.currencyCode,
      duplicate: false,
    };
  });
}

export async function reverseSavingsTransaction(
  userId: string,
  input: { transactionId: string; reason: string; idempotencyKey: string },
  database: IponlyDatabase = getDatabase(),
) {
  return database.transaction((transaction) =>
    reverseSavingsTransactionInTransaction(userId, input, transaction));
}

export async function reverseSavingsTransactionInTransaction(
  userId: string,
  input: { transactionId: string; reason: string; idempotencyKey: string },
  transaction: SavingsDatabaseTransaction,
) {
  const original = await findTransactionByIdForUser(input.transactionId, userId, transaction);
  if (!original) throw new SavingsRuleError("This transaction could not be found.");
  const duplicate = await findTransactionByIdempotencyKey(userId, input.idempotencyKey, transaction);
  if (duplicate) {
    const matchesOriginal = duplicate.reversalOfTransactionId === original.id ||
      Boolean(original.transferId && duplicate.transferId === original.transferId && duplicate.transactionType === "reversal");
    if (!matchesOriginal || duplicate.reason !== input.reason) {
      throw new SavingsRuleError("This reversal submission key was already used for a different correction.");
    }
    return { transactionId: duplicate.id, balanceMinor: await getBalanceForAccount(duplicate.accountId, userId, transaction), currencyCode: duplicate.currencyCode, duplicate: true };
  }
  if (original.transactionType === "reversal") throw new SavingsRuleError("Reversal records cannot be reversed again.");
  if (original.transactionType === "opening_balance") {
    throw new SavingsRuleError("Opening balances cannot be reversed. Record a balance adjustment instead.");
  }

  let originals = [original];
  if (original.transferId) {
    originals = await findTransferForUser(original.transferId, userId, transaction);
    if (originals.length !== 2) throw new SavingsRuleError("This transfer cannot be safely reversed.");
  }
  if (originals.some((item) => item.status !== "posted" || item.reversedByTransactionId)) {
    throw new SavingsRuleError("This transaction has already been reversed.");
  }
  const locked = await lockAccountsForUser(originals.map((item) => item.accountId), userId, transaction);
  if (locked.length !== originals.length) throw new SavingsRuleError("This transaction could not be found.");

  const reversalRows: Array<{ originalId: string; reversalId: string; accountId: string }> = [];
  for (const [index, item] of originals.entries()) {
    const reversal = await createTransactionForUser(userId, {
      accountId: item.accountId,
      transactionType: "reversal",
      amountMinor: item.amountMinor,
      currencyCode: item.currencyCode,
      transactionDate: new Date(),
      description: `Reversal: ${item.description}`,
      notes: input.reason,
      reason: input.reason,
      transferId: item.transferId,
      reversalOfTransactionId: item.id,
      idempotencyKey: `${input.idempotencyKey}:${index}`,
    }, transaction);
    const marked = await markTransactionReversedForUser(item.id, userId, reversal.id, transaction);
    if (!marked) throw new SavingsRuleError("This transaction has already been reversed.");
    reversalRows.push({ originalId: item.id, reversalId: reversal.id, accountId: item.accountId });
  }
  const accountId = original.accountId;
  return {
    transactionId: reversalRows[0]?.reversalId,
    balanceMinor: await getBalanceForAccount(accountId, userId, transaction),
    currencyCode: original.currencyCode,
    duplicate: false,
  };
}

export async function archiveSavingsAccount(userId: string, accountId: string, database = getDatabase()) {
  return database.transaction(async (transaction) => {
    const locked = await lockAccountsForUser([accountId], userId, transaction);
    const account = locked[0];
    if (!account) throw new SavingsRuleError("This account could not be found.");
    if (account.status !== "active") throw new SavingsRuleError("This account is already archived.");
    if ((await getBalanceForAccount(accountId, userId, transaction)) !== 0) {
      throw new SavingsRuleError("Move or adjust the remaining balance to zero before archiving this account.");
    }
    const [activeGoals] = await transaction.select({ count: savingsGoals.id }).from(savingsGoals)
      .where(and(eq(savingsGoals.accountId, accountId), eq(savingsGoals.userId, userId), eq(savingsGoals.status, "active")))
      .limit(1);
    if (activeGoals) throw new SavingsRuleError("Complete, move, or archive active goals before archiving this account.");
    return setAccountArchivedForUser(accountId, userId, true, transaction);
  });
}

export async function restoreSavingsAccount(userId: string, accountId: string, database = getDatabase()) {
  const account = await setAccountArchivedForUser(accountId, userId, false, database);
  if (!account) throw new SavingsRuleError("This archived account could not be found.");
  return account;
}

export async function createSavingsGoal(
  userId: string,
  input: { name: string; accountId?: string; targetAmount: string; targetDate?: string; notes?: string; defaultCurrencyCode?: CurrencyCode },
  database = getDatabase(),
) {
  const accountId = input.accountId || null;
  return database.transaction(async (transaction) => {
    let currencyCode = input.defaultCurrencyCode ?? "PHP";
    if (accountId) {
      const account = (await lockAccountsForUser([accountId], userId, transaction))[0];
      if (!account || account.status !== "active") throw new SavingsRuleError("Choose one of your active accounts.");
      currencyCode = account.currencyCode;
    }
    return createGoalForUser(userId, {
      accountId,
      name: input.name,
      currencyCode,
      targetAmountMinor: amountToMinor(input.targetAmount, currencyCode),
      targetDate: input.targetDate ? dayAtNoonUtc(input.targetDate) : null,
      notes: input.notes || null,
    }, transaction);
  });
}

export async function updateSavingsGoal(
  userId: string,
  input: { goalId: string; name: string; accountId?: string; targetAmount: string; targetDate?: string; notes?: string; defaultCurrencyCode?: CurrencyCode },
  database = getDatabase(),
) {
  const accountId = input.accountId || null;
  return database.transaction(async (transaction) => {
    const existing = await findGoalForUser(input.goalId, userId, transaction);
    if (!existing || existing.status !== "active") throw new SavingsRuleError("This active goal could not be found.");
    const accountIds = [existing.accountId, accountId].filter((id): id is string => id !== null);
    const lockedAccounts = await lockAccountsForUser(accountIds, userId, transaction);
    let currencyCode: CurrencyCode = existing.currencyCode;
    if (accountId) {
      const account = lockedAccounts.find((item) => item.id === accountId);
      if (!account || account.status !== "active") throw new SavingsRuleError("Choose one of your active accounts.");
      currencyCode = account.currencyCode;
    }
    const goal = await updateGoalForUser(input.goalId, userId, {
      accountId,
      name: input.name,
      currencyCode,
      targetAmountMinor: amountToMinor(input.targetAmount, currencyCode),
      targetDate: input.targetDate ? dayAtNoonUtc(input.targetDate) : null,
      notes: input.notes || null,
    }, transaction);
    if (!goal) throw new SavingsRuleError("This active goal could not be found.");
    return goal;
  });
}

export async function changeSavingsGoalStatus(userId: string, goalId: string, status: "completed" | "archived" | "active", database = getDatabase()) {
  const goal = await setGoalStatusForUser(goalId, userId, status, database);
  if (!goal) throw new SavingsRuleError("This goal could not be found or has already changed.");
  return goal;
}

export async function getSavingsAccountDetails(
  userId: string,
  accountId: string,
  database = getDatabase(),
  transactionOffset = 0,
) {
  const account = await findAccountForUser(accountId, userId, database);
  if (!account) return null;
  const [balanceMinor, transactions, goals, accounts] = await Promise.all([
    getBalanceForAccount(account.id, userId, database),
    findTransactionsForAccount(account.id, userId, 51, database, transactionOffset),
    findGoalsForUser(userId, { database }),
    findAccountsForUser(userId, { database }),
  ]);
  const activityStart = getActivityStart("6m");
  const activityRows = await findRecentSavingsActivity(userId, activityStart, database, accountId);
  const accountTransactions = activityRows.map((row) => asTransaction(row.transaction));
  const originals = new Map<string, SavingsTransactionType>();
  for (const row of activityRows) {
    if (row.transaction.reversalOfTransactionId && row.originalType) {
      originals.set(row.transaction.reversalOfTransactionId, row.originalType);
    }
  }
  const monthlyGroups = groupTransactionsByPeriod(accountTransactions, originals);
  const trend = activityRows.length > 0
    ? buildTrend(new Map([[account.currencyCode, balanceMinor]]), monthlyGroups, activityStart)
    : [];
  return {
    account,
    accounts,
    balanceMinor,
    transactions: transactions.slice(0, 50),
    hasMoreTransactions: transactions.length > 50,
    trend,
    goals: goals.filter((goal) => goal.accountId === account.id).map((goal) => ({
      ...goal,
      ...calculateGoalProgress(goal, balanceMinor),
    })),
  };
}

export async function getSavingsOverview(
  userId: string,
  database = getDatabase(),
  period: SavingsTrendPeriod = "6m",
) {
  const [accounts, archivedAccounts, goals, balances, recentRows, lastActivity] = await Promise.all([
    findAccountsForUser(userId, { database }),
    findAccountsForUser(userId, { archived: true, database }),
    findGoalsForUser(userId, { database }),
    getBalancesForUser(userId, database),
    findRecentTransactionsForUser(userId, { limit: 20, database }),
    findLastActivityForUser(userId, database),
  ]);
  const allAccounts = [...accounts, ...archivedAccounts];
  const currentAccountIds = new Set(allAccounts.filter((account) => account.includeInTotal).map((account) => account.id));
  const totals = calculateTotalSavings(allAccounts, balances);

  const periodStart = beginningOfManilaMonth();
  const activityStart = getActivityStart(period);
  const [activityRows, accountGoals] = await Promise.all([
    findRecentSavingsActivity(userId, activityStart, database),
    Promise.resolve(goals),
  ]);
  const transactions = activityRows.map((row) => asTransaction(row.transaction));
  const originalTypes = new Map<string, SavingsTransactionType>();
  for (const row of activityRows) {
    if (row.transaction.reversalOfTransactionId && row.originalType) {
      originalTypes.set(row.transaction.reversalOfTransactionId, row.originalType);
    }
  }
  const includedActivity = transactions.filter((item) => currentAccountIds.has(item.accountId));
  const monthTransactions = includedActivity.filter((item) => item.transactionDate >= periodStart);
  const change = calculateSavingsChange(monthTransactions, currentAccountIds, originalTypes);
  const monthlyGroups = groupTransactionsByPeriod(includedActivity, originalTypes);
  const trend = includedActivity.length > 0 ? buildTrend(totals, monthlyGroups, activityStart) : [];
  const balanceByAccount = new Map(allAccounts.map((account) => [account.id, balances.get(account.id) ?? 0]));

  return {
    accounts,
    archivedAccounts,
    balances: balanceByAccount,
    lastActivity,
    totals,
    change,
    goals: accountGoals.map((goal) => ({
      ...goal,
      ...calculateGoalProgress(goal, goal.accountId ? balanceByAccount.get(goal.accountId) ?? 0 : 0),
    })),
    recentTransactions: recentRows.map((row) => ({
      ...row.transaction,
      accountName: row.accountName,
      accountCurrency: row.accountCurrency,
    })),
    trend,
    trendPeriod: period,
  };
}

function buildTrend(
  totals: ReadonlyMap<CurrencyCode, number>,
  groups: ReadonlyMap<string, ReadonlyMap<CurrencyCode, number>>,
  startDate: Date,
) {
  const periods: string[] = [];
  const month = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1));
  const now = new Date();
  const finalMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  while (month.getTime() <= finalMonth) {
    periods.push(month.toISOString().slice(0, 7));
    month.setUTCMonth(month.getUTCMonth() + 1);
  }
  const currencies = [...totals.keys()];
  return currencies.map((currencyCode) => {
    const netChange = periods.reduce((sum, period) => sum + (groups.get(period)?.get(currencyCode) ?? 0), 0);
    let running = (totals.get(currencyCode) ?? 0) - netChange;
    return {
      currencyCode,
      data: periods.map((period) => {
        running += groups.get(period)?.get(currencyCode) ?? 0;
        return { month: period.slice(5), balanceMinor: running };
      }),
    };
  });
}
