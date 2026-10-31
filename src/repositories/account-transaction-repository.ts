import "server-only";
import { and, desc, eq, ilike, gte, inArray, lte, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDatabase, type IponlyDatabase } from "@/db";
import { accountTransactions, financialAccounts } from "@/db/schema";
import type { SavingsTransactionType } from "@/types/domain";
import type { SavingsExecutor } from "./account-repository";

export async function createTransactionForUser(
  userId: string,
  input: {
    accountId: string;
    transactionType: SavingsTransactionType;
    amountMinor: number;
    currencyCode: "PHP" | "USD" | "EUR" | "JPY";
    transactionDate: Date;
    description: string;
    notes: string | null;
    reason?: string | null;
    transferId?: string | null;
    reversalOfTransactionId?: string | null;
    idempotencyKey: string;
  },
  database: SavingsExecutor = getDatabase(),
) {
  const [transaction] = await database.insert(accountTransactions).values({
    ...input,
    userId,
    status: "posted",
    createdBy: "user",
  }).returning();
  if (!transaction) throw new Error("The transaction could not be recorded.");
  return transaction;
}

export async function findTransactionByIdForUser(
  transactionId: string,
  userId: string,
  database: SavingsExecutor = getDatabase(),
) {
  const [transaction] = await database.select().from(accountTransactions)
    .where(and(eq(accountTransactions.id, transactionId), eq(accountTransactions.userId, userId))).limit(1);
  return transaction ?? null;
}

export async function findTransactionByIdempotencyKey(
  userId: string,
  idempotencyKey: string,
  database: SavingsExecutor = getDatabase(),
) {
  const [transaction] = await database.select().from(accountTransactions)
    .where(and(eq(accountTransactions.userId, userId), eq(accountTransactions.idempotencyKey, idempotencyKey))).limit(1);
  return transaction ?? null;
}

export async function findTransferForUser(
  transferId: string,
  userId: string,
  database: SavingsExecutor = getDatabase(),
) {
  return database.select().from(accountTransactions)
    .where(and(
      eq(accountTransactions.transferId, transferId),
      eq(accountTransactions.userId, userId),
      inArray(accountTransactions.transactionType, ["transfer_in", "transfer_out"]),
    ))
    .orderBy(accountTransactions.transactionType);
}

export async function markTransactionReversedForUser(
  transactionId: string,
  userId: string,
  reversalId: string,
  database: SavingsExecutor,
) {
  const [transaction] = await database.update(accountTransactions)
    .set({ status: "reversed", reversedByTransactionId: reversalId, updatedAt: new Date() })
    .where(and(
      eq(accountTransactions.id, transactionId),
      eq(accountTransactions.userId, userId),
      eq(accountTransactions.status, "posted"),
      sql`${accountTransactions.reversedByTransactionId} is null`,
    ))
    .returning();
  return transaction ?? null;
}

export async function findTransactionsForAccount(
  accountId: string,
  userId: string,
  limit = 50,
  database: SavingsExecutor = getDatabase(),
  offset = 0,
) {
  return database.select().from(accountTransactions)
    .where(and(eq(accountTransactions.accountId, accountId), eq(accountTransactions.userId, userId)))
    .orderBy(desc(accountTransactions.transactionDate), desc(accountTransactions.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function findRecentTransactionsForUser(
  userId: string,
  options: {
    limit?: number;
    offset?: number;
    accountId?: string;
    type?: SavingsTransactionType;
    status?: "posted" | "reversed";
    search?: string;
    from?: Date;
    to?: Date;
    database?: SavingsExecutor;
  } = {},
) {
  const database = options.database ?? getDatabase();
  const conditions = [
    eq(accountTransactions.userId, userId),
    options.accountId ? eq(accountTransactions.accountId, options.accountId) : undefined,
    options.type ? eq(accountTransactions.transactionType, options.type) : undefined,
    options.status ? eq(accountTransactions.status, options.status) : undefined,
    options.from ? gte(accountTransactions.transactionDate, options.from) : undefined,
    options.to ? lte(accountTransactions.transactionDate, options.to) : undefined,
    options.search ? or(ilike(accountTransactions.description, `%${escapeLike(options.search)}%`), ilike(accountTransactions.notes, `%${escapeLike(options.search)}%`)) : undefined,
  ].filter((condition) => condition !== undefined);
  return database.select({
    transaction: accountTransactions,
    accountName: financialAccounts.name,
    accountCurrency: financialAccounts.currencyCode,
  })
    .from(accountTransactions)
    .innerJoin(financialAccounts, and(
      eq(accountTransactions.accountId, financialAccounts.id),
      eq(accountTransactions.userId, financialAccounts.userId),
    ))
    .where(and(...conditions))
    .orderBy(desc(accountTransactions.transactionDate), desc(accountTransactions.createdAt))
    .limit(options.limit ?? 50)
    .offset(options.offset ?? 0);
}

export async function findLastActivityForUser(userId: string, database: SavingsExecutor = getDatabase()) {
  const rows = await database.select({
    accountId: accountTransactions.accountId,
    transactionDate: sql<Date>`max(${accountTransactions.transactionDate})`.mapWith(accountTransactions.transactionDate),
  })
    .from(accountTransactions)
    .where(eq(accountTransactions.userId, userId))
    .groupBy(accountTransactions.accountId);
  return new Map(rows.map((row) => [row.accountId, row.transactionDate]));
}

export async function findRecentSavingsActivity(
  userId: string,
  since: Date,
  database: SavingsExecutor = getDatabase(),
  accountId?: string,
) {
  const original = alias(accountTransactions, "activity_original");
  return database.select({
    transaction: accountTransactions,
    originalType: original.transactionType,
  })
    .from(accountTransactions)
    .innerJoin(financialAccounts, and(
      eq(accountTransactions.accountId, financialAccounts.id),
      eq(accountTransactions.userId, financialAccounts.userId),
    ))
    .leftJoin(original, eq(accountTransactions.reversalOfTransactionId, original.id))
    .where(and(
      eq(accountTransactions.userId, userId),
      gte(accountTransactions.transactionDate, since),
      accountId ? eq(accountTransactions.accountId, accountId) : undefined,
    ))
    .orderBy(desc(accountTransactions.transactionDate))
    .limit(1200);
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

export type SavingsDatabaseTransaction = Parameters<Parameters<IponlyDatabase["transaction"]>[0]>[0];
