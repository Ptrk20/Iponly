import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDatabase, type IponlyDatabase } from "@/db";
import { accountTransactions, financialAccounts } from "@/db/schema";
import type { SavingsAccountType } from "@/types/domain";

type SavingsTransaction = Parameters<Parameters<IponlyDatabase["transaction"]>[0]>[0];
export type SavingsExecutor = IponlyDatabase | SavingsTransaction;

const inwardTypes = ["opening_balance", "deposit", "adjustment_increase", "transfer_in"] as const;
const outwardTypes = ["withdrawal", "adjustment_decrease", "transfer_out"] as const;

const originalTransaction = alias(accountTransactions, "original_transaction");

const balanceEffect = sql`CASE
  WHEN ${accountTransactions.transactionType} IN ('opening_balance', 'deposit', 'adjustment_increase', 'transfer_in') THEN ${accountTransactions.amountMinor}
  WHEN ${accountTransactions.transactionType} IN ('withdrawal', 'adjustment_decrease', 'transfer_out') THEN -${accountTransactions.amountMinor}
  WHEN ${accountTransactions.transactionType} = 'reversal' AND ${originalTransaction.transactionType} IN ('opening_balance', 'deposit', 'adjustment_increase', 'transfer_in') THEN -${accountTransactions.amountMinor}
  WHEN ${accountTransactions.transactionType} = 'reversal' AND ${originalTransaction.transactionType} IN ('withdrawal', 'adjustment_decrease', 'transfer_out') THEN ${accountTransactions.amountMinor}
  ELSE 0
END`;

export async function createAccountForUser(
  userId: string,
  input: {
    name: string;
    institution: string | null;
    accountType: SavingsAccountType;
    currencyCode: "PHP" | "USD" | "EUR" | "JPY";
    includeInTotal: boolean;
    color: string | null;
    icon: string | null;
    notes: string | null;
    creationIdempotencyKey: string;
  },
  database: SavingsExecutor = getDatabase(),
) {
  const [account] = await database.insert(financialAccounts).values({ ...input, userId }).returning();
  if (!account) throw new Error("The account could not be created.");
  return account;
}

export async function findAccountCreationForUser(
  userId: string,
  creationIdempotencyKey: string,
  database: SavingsExecutor = getDatabase(),
) {
  const [account] = await database.select().from(financialAccounts)
    .where(and(eq(financialAccounts.userId, userId), eq(financialAccounts.creationIdempotencyKey, creationIdempotencyKey))).limit(1);
  return account ?? null;
}

export async function findAccountForUser(
  accountId: string,
  userId: string,
  database: SavingsExecutor = getDatabase(),
) {
  const [account] = await database.select().from(financialAccounts)
    .where(and(eq(financialAccounts.id, accountId), eq(financialAccounts.userId, userId))).limit(1);
  return account ?? null;
}

export async function findAccountsForUser(
  userId: string,
  options: { archived?: boolean; database?: SavingsExecutor } = {},
) {
  const database = options.database ?? getDatabase();
  const rows = await database.select().from(financialAccounts)
    .where(and(eq(financialAccounts.userId, userId), eq(financialAccounts.status, options.archived ? "archived" : "active")))
    .orderBy(desc(financialAccounts.createdAt));
  return rows;
}

export async function updateAccountForUser(
  accountId: string,
  userId: string,
  input: {
    name: string;
    institution: string | null;
    accountType: SavingsAccountType;
    includeInTotal: boolean;
    color: string | null;
    icon: string | null;
    notes: string | null;
  },
  database: SavingsExecutor = getDatabase(),
) {
  const [account] = await database.update(financialAccounts)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(financialAccounts.id, accountId), eq(financialAccounts.userId, userId), eq(financialAccounts.status, "active")))
    .returning();
  return account ?? null;
}

export async function setAccountArchivedForUser(
  accountId: string,
  userId: string,
  archived: boolean,
  database: SavingsExecutor = getDatabase(),
) {
  const [account] = await database.update(financialAccounts)
    .set({ status: archived ? "archived" : "active", archivedAt: archived ? new Date() : null, updatedAt: new Date() })
    .where(and(eq(financialAccounts.id, accountId), eq(financialAccounts.userId, userId), eq(financialAccounts.status, archived ? "active" : "archived")))
    .returning();
  return account ?? null;
}

export async function lockAccountsForUser(
  accountIds: string[],
  userId: string,
  database: SavingsExecutor,
) {
  if (accountIds.length === 0) return [];
  return database.select().from(financialAccounts)
    .where(and(eq(financialAccounts.userId, userId), inArray(financialAccounts.id, accountIds)))
    .orderBy(financialAccounts.id)
    .for("update");
}

export async function getBalancesForUser(userId: string, database: SavingsExecutor = getDatabase()) {
  const rows = await database.select({
    accountId: accountTransactions.accountId,
    balanceMinor: sql<string>`coalesce(sum(${balanceEffect}), 0)::text`,
  })
    .from(accountTransactions)
    .leftJoin(originalTransaction, eq(accountTransactions.reversalOfTransactionId, originalTransaction.id))
    .where(eq(accountTransactions.userId, userId))
    .groupBy(accountTransactions.accountId);

  return new Map(rows.map((row) => [row.accountId, parseBalance(row.balanceMinor)]));
}

export async function getBalanceForAccount(
  accountId: string,
  userId: string,
  database: SavingsExecutor = getDatabase(),
) {
  const rows = await database.select({
    balanceMinor: sql<string>`coalesce(sum(${balanceEffect}), 0)::text`,
  })
    .from(accountTransactions)
    .leftJoin(originalTransaction, eq(accountTransactions.reversalOfTransactionId, originalTransaction.id))
    .where(and(eq(accountTransactions.accountId, accountId), eq(accountTransactions.userId, userId)));

  return parseBalance(rows[0]?.balanceMinor ?? "0");
}

function parseBalance(value: string) {
  const balance = Number(value);
  if (!Number.isSafeInteger(balance)) throw new RangeError("The account balance exceeds the supported range.");
  return balance;
}

export const balanceTransactionTypes = { inwardTypes, outwardTypes };
