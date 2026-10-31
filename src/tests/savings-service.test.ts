import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { IponlyDatabase } from "@/db";
import {
  archiveSavingsAccount,
  changeSavingsGoalStatus,
  createSavingsAccount,
  createSavingsGoal,
  getSavingsAccountDetails,
  getSavingsOverview,
  recordSavingsAdjustment,
  recordSavingsDeposit,
  recordSavingsWithdrawal,
  restoreSavingsAccount,
  reverseSavingsTransaction,
  transferSavings,
  updateSavingsAccount,
  updateSavingsGoal,
} from "@/services/savings-service";

describe("authenticated savings service with isolated PostgreSQL", () => {
  let client: PGlite;
  let database: IponlyDatabase;

  beforeEach(async () => {
    client = new PGlite();
    const testDatabase = drizzle({ client, schema });
    database = testDatabase as unknown as IponlyDatabase;
    await migrate(testDatabase, { migrationsFolder: "src/db/migrations" });
    await testDatabase.insert(schema.user).values([
      { id: "user-a", name: "Alex A", email: "alex-a@example.test" },
      { id: "user-b", name: "Bailey B", email: "bailey-b@example.test" },
    ]);
  });

  it("serializes concurrent withdrawals so they cannot overspend", async () => {
    const account = await createAccount("user-a", "Concurrent account", "100.00");
    const withdraw = (description: string) => recordSavingsWithdrawal("user-a", {
      accountId: account.accountId,
      amount: "60.00",
      transactionDate: "2026-10-30",
      description,
      idempotencyKey: crypto.randomUUID(),
    }, database);
    const results = await Promise.allSettled([withdraw("First"), withdraw("Second")]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect((await getSavingsAccountDetails("user-a", account.accountId, database))?.balanceMinor).toBe(4_000);
  });

  afterEach(async () => {
    await client.close();
  });

  async function createAccount(
    userId: string,
    name: string,
    openingBalance = "0",
    currencyCode: "PHP" | "USD" = "PHP",
  ) {
    return createSavingsAccount(userId, {
      name,
      accountType: "savings",
      currencyCode,
      openingBalance,
      includeInTotal: true,
      idempotencyKey: crypto.randomUUID(),
    }, database);
  }

  it("creates an account and opening balance atomically and replays its idempotency key", async () => {
    const idempotencyKey = crypto.randomUUID();
    const input = {
      name: "BDO Savings",
      institution: "BDO",
      accountType: "savings" as const,
      currencyCode: "PHP" as const,
      openingBalance: "10000.00",
      includeInTotal: true,
      idempotencyKey,
    };
    const first = await createSavingsAccount("user-a", input, database);
    const replay = await createSavingsAccount("user-a", input, database);
    const rows = await database.select().from(schema.accountTransactions)
      .where(eq(schema.accountTransactions.accountId, first.accountId));
    expect(first.balanceMinor).toBe(1_000_000);
    expect(replay).toMatchObject({ accountId: first.accountId, balanceMinor: 1_000_000, duplicate: true });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.transactionType).toBe("opening_balance");
  });

  it("returns the latest activity as a Date only for the user's accounts with transactions", async () => {
    const account = await createAccount("user-a", "Active account");
    const emptyAccount = await createAccount("user-a", "Empty account");
    const otherUserAccount = await createAccount("user-b", "Private account", "100.00");

    for (const transactionDate of ["2026-10-30", "2026-10-29"]) {
      await recordSavingsDeposit("user-a", {
        accountId: account.accountId,
        amount: "100.00",
        transactionDate,
        description: "Savings deposit",
        idempotencyKey: crypto.randomUUID(),
      }, database);
    }

    const overview = await getSavingsOverview("user-a", database);
    const lastActivity = overview.lastActivity.get(account.accountId);

    expect(lastActivity).toBeInstanceOf(Date);
    expect(lastActivity?.toISOString()).toBe("2026-10-30T12:00:00.000Z");
    expect(overview.lastActivity.has(emptyAccount.accountId)).toBe(false);
    expect(overview.lastActivity.has(otherUserAccount.accountId)).toBe(false);
  });

  it("records deposits, withdrawals, and reasoned adjustments while preventing negative balances", async () => {
    const account = await createAccount("user-a", "Main", "10000.00");
    const deposit = await recordSavingsDeposit("user-a", {
      accountId: account.accountId,
      amount: "2500.00",
      transactionDate: "2026-10-30",
      description: "Payday deposit",
      idempotencyKey: crypto.randomUUID(),
    }, database);
    expect(deposit.balanceMinor).toBe(1_250_000);
    const withdrawal = await recordSavingsWithdrawal("user-a", {
      accountId: account.accountId,
      amount: "1000.00",
      transactionDate: "2026-10-30",
      description: "Cash withdrawal",
      idempotencyKey: crypto.randomUUID(),
    }, database);
    expect(withdrawal.balanceMinor).toBe(1_150_000);
    const increase = await recordSavingsAdjustment("user-a", {
      accountId: account.accountId,
      amount: "50.00",
      transactionDate: "2026-10-30",
      description: "Balance correction",
      direction: "increase",
      reason: "Bank statement reconciliation",
      idempotencyKey: crypto.randomUUID(),
    }, database);
    expect(increase.balanceMinor).toBe(1_155_000);
    await expect(recordSavingsWithdrawal("user-a", {
      accountId: account.accountId,
      amount: "20000.00",
      transactionDate: "2026-10-30",
      description: "Too much",
      idempotencyKey: crypto.randomUUID(),
    }, database)).rejects.toThrow("exceeds the available balance");
    await expect(recordSavingsAdjustment("user-a", {
      accountId: account.accountId,
      amount: "20000.00",
      transactionDate: "2026-10-30",
      description: "Invalid decrease",
      direction: "decrease",
      reason: "Correction",
      idempotencyKey: crypto.randomUUID(),
    }, database)).rejects.toThrow("exceeds the available balance");
  });

  it("transfers atomically between owned accounts without changing total savings", async () => {
    const source = await createAccount("user-a", "Source", "10000.00");
    const destination = await createAccount("user-a", "Destination", "200.00");
    const before = await getSavingsOverview("user-a", database);
    const transfer = await transferSavings("user-a", {
      sourceAccountId: source.accountId,
      destinationAccountId: destination.accountId,
      amount: "1000.00",
      transactionDate: "2026-10-30",
      description: "Move to Maya",
      idempotencyKey: crypto.randomUUID(),
    }, database);
    const after = await getSavingsOverview("user-a", database);
    const legs = await database.select().from(schema.accountTransactions)
      .where(eq(schema.accountTransactions.transferId, transfer.transferId!));
    expect(legs.map((row) => row.transactionType).sort()).toEqual(["transfer_in", "transfer_out"]);
    expect(transfer.sourceBalanceMinor).toBe(900_000);
    expect(transfer.destinationBalanceMinor).toBe(120_000);
    expect(after.totals.get("PHP")).toBe(before.totals.get("PHP"));
  });

  it("rejects self, cross-currency, insufficient-funds, and unauthorized transfers", async () => {
    const source = await createAccount("user-a", "Source", "500.00");
    const destination = await createAccount("user-a", "USD wallet", "0", "USD");
    const otherUserAccount = await createAccount("user-b", "Private account", "100.00");
    const common = {
      sourceAccountId: source.accountId,
      destinationAccountId: destination.accountId,
      amount: "1.00",
      transactionDate: "2026-10-30",
      description: "Transfer",
      idempotencyKey: crypto.randomUUID(),
    };
    await expect(transferSavings("user-a", { ...common, destinationAccountId: source.accountId }, database)).rejects.toThrow();
    await expect(transferSavings("user-a", common, database)).rejects.toThrow("different currencies");
    await expect(transferSavings("user-a", {
      ...common,
      destinationAccountId: source.accountId,
      amount: "1000.00",
    }, database)).rejects.toThrow();
    await expect(transferSavings("user-a", {
      ...common,
      destinationAccountId: otherUserAccount.accountId,
    }, database)).rejects.toThrow("could not be found");
    await expect(updateSavingsAccount("user-b", {
      accountId: source.accountId,
      name: "Stolen",
      accountType: "savings",
      includeInTotal: true,
    }, database)).rejects.toThrow("could not be found");
    await expect(archiveSavingsAccount("user-b", source.accountId, database)).rejects.toThrow("could not be found");
    await expect(recordSavingsDeposit("user-b", {
      accountId: source.accountId,
      amount: "1.00",
      transactionDate: "2026-10-30",
      description: "Unauthorized",
      idempotencyKey: crypto.randomUUID(),
    }, database)).rejects.toThrow("could not be found");
    expect(await getSavingsAccountDetails("user-b", source.accountId, database)).toBeNull();
  });

  it("rolls back both transfer legs when the second insertion violates a constraint", async () => {
    const source = await createAccount("user-a", "Rollback source", "100.00");
    const destination = await createAccount("user-a", "Rollback destination");
    await client.exec(`ALTER TABLE account_transactions ADD CONSTRAINT reject_transfer_in CHECK (transaction_type <> 'transfer_in')`);
    await expect(transferSavings("user-a", {
      sourceAccountId: source.accountId,
      destinationAccountId: destination.accountId,
      amount: "20.00",
      transactionDate: "2026-10-30",
      description: "Valid transfer",
      idempotencyKey: crypto.randomUUID(),
    }, database)).rejects.toBeDefined();
    const legs = await database.select().from(schema.accountTransactions)
      .where(eq(schema.accountTransactions.userId, "user-a"));
    expect(legs.filter((row) => row.transactionType.startsWith("transfer_"))).toHaveLength(0);
    expect((await getSavingsAccountDetails("user-a", source.accountId, database))?.balanceMinor).toBe(10_000);
  });

  it("prevents duplicate deposits and reverses posted transactions without deleting history", async () => {
    const account = await createAccount("user-a", "Reversal account", "100.00");
    const idempotencyKey = crypto.randomUUID();
    const input = {
      accountId: account.accountId,
      amount: "25.00",
      transactionDate: "2026-10-30",
      description: "Duplicate-safe deposit",
      idempotencyKey,
    };
    const first = await recordSavingsDeposit("user-a", input, database);
    const replay = await recordSavingsDeposit("user-a", input, database);
    expect(replay).toMatchObject({ transactionId: first.transactionId, balanceMinor: 12_500, duplicate: true });
    const reversal = await reverseSavingsTransaction("user-a", {
      transactionId: first.transactionId,
      reason: "Entered twice",
      idempotencyKey: crypto.randomUUID(),
    }, database);
    expect(reversal.balanceMinor).toBe(10_000);
    await expect(reverseSavingsTransaction("user-a", {
      transactionId: first.transactionId,
      reason: "Second attempt",
      idempotencyKey: crypto.randomUUID(),
    }, database)).rejects.toThrow("already been reversed");
    const history = await database.select().from(schema.accountTransactions)
      .where(eq(schema.accountTransactions.accountId, account.accountId));
    expect(history).toHaveLength(3);
    expect(history.find((row) => row.id === first.transactionId)?.status).toBe("reversed");
  });

  it("reverses both transfer legs as one correction", async () => {
    const source = await createAccount("user-a", "Transfer source", "100.00");
    const destination = await createAccount("user-a", "Transfer destination");
    const transfer = await transferSavings("user-a", {
      sourceAccountId: source.accountId,
      destinationAccountId: destination.accountId,
      amount: "40.00",
      transactionDate: "2026-10-30",
      description: "Transfer to reverse",
      idempotencyKey: crypto.randomUUID(),
    }, database);
    const [outgoing] = await database.select().from(schema.accountTransactions)
      .where(eq(schema.accountTransactions.transferId, transfer.transferId!));
    const result = await reverseSavingsTransaction("user-a", {
      transactionId: outgoing!.id,
      reason: "Wrong account",
      idempotencyKey: crypto.randomUUID(),
    }, database);
    expect(result.balanceMinor).toBe(10_000);
    expect((await getSavingsAccountDetails("user-a", destination.accountId, database))?.balanceMinor).toBe(0);
    const transferRows = await database.select().from(schema.accountTransactions)
      .where(eq(schema.accountTransactions.transferId, transfer.transferId!));
    expect(transferRows).toHaveLength(4);
    expect(transferRows.filter((row) => row.transactionType === "reversal")).toHaveLength(2);
  });

  it("creates and updates goals with same-user account ownership and currency", async () => {
    const usdAccount = await createAccount("user-a", "Dollar wallet", "0", "USD");
    const goal = await createSavingsGoal("user-a", {
      name: "New laptop",
      accountId: usdAccount.accountId,
      targetAmount: "200.00",
    }, database);
    expect(goal).toMatchObject({ currencyCode: "USD", targetAmountMinor: 20_000 });
    const updated = await (await import("@/services/savings-service")).updateSavingsGoal("user-a", {
      goalId: goal.id,
      name: "Updated laptop",
      accountId: usdAccount.accountId,
      targetAmount: "250.00",
    }, database);
    expect(updated).toMatchObject({ name: "Updated laptop", targetAmountMinor: 25_000, currencyCode: "USD" });
    await expect(createSavingsGoal("user-b", {
      name: "Forged link",
      accountId: usdAccount.accountId,
      targetAmount: "10.00",
    }, database)).rejects.toThrow("active accounts");
    await expect(updateSavingsGoal("user-b", {
      goalId: goal.id,
      name: "Hijacked goal",
      targetAmount: "300.00",
    }, database)).rejects.toThrow("could not be found");
  });

  it("archives only zero-balance accounts without active linked goals and restores them", async () => {
    const account = await createAccount("user-a", "Archive candidate");
    const goal = await createSavingsGoal("user-a", {
      name: "Small buffer",
      accountId: account.accountId,
      targetAmount: "100.00",
    }, database);
    await expect(archiveSavingsAccount("user-a", account.accountId, database)).rejects.toThrow("active goals");
    await changeSavingsGoalStatus("user-a", goal.id, "archived", database);
    await archiveSavingsAccount("user-a", account.accountId, database);
    expect(await getSavingsAccountDetails("user-a", account.accountId, database)).toMatchObject({ account: { status: "archived" } });
    await restoreSavingsAccount("user-a", account.accountId, database);
    expect(await getSavingsAccountDetails("user-a", account.accountId, database)).toMatchObject({ account: { status: "active" } });
  });
});
