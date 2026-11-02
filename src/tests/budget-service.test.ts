import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import type { IponlyDatabase } from "@/db";
import { findCategoriesForUser } from "@/repositories/budget-repository";
import {
  copyMonthlyBudget,
  createBudgetExpense,
  createBudgetIncome,
  createBudgetSavingsContribution,
  createMonthlyBudget,
  getBudgetPageData,
  linkDebtPaymentToBudget,
  markBudgetIncomeReceived,
  reconcileBudgetLinks,
  reverseBudgetExpense,
  setBudgetAllocation,
} from "@/services/budget-service";
import { recordDebtPayment, reverseDebtPayment as reverseRecordedDebtPayment } from "@/services/debt-service";
import { createSavingsAccount, getSavingsAccountDetails } from "@/services/savings-service";

describe("budget service with isolated PostgreSQL", () => {
  let client: PGlite;
  let database: IponlyDatabase;

  beforeEach(async () => {
    client = new PGlite();
    const testDatabase = drizzle({ client, schema });
    database = testDatabase as unknown as IponlyDatabase;
    await migrate(testDatabase, { migrationsFolder: "src/db/migrations" });
    await testDatabase.insert(schema.user).values([
      { id: "budget-user-a", name: "Alex A", email: "budget-a@example.test" },
      { id: "budget-user-b", name: "Bailey B", email: "budget-b@example.test" },
    ]);
  });

  afterEach(async () => {
    await client.close();
  });

  it("creates owned budgets and categories, records income and allocations, links one Savings expense, and reverses atomically", async () => {
    const budget = await createMonthlyBudget("budget-user-a", {
      year: 2026,
      month: 10,
      currencyCode: "PHP",
      idempotencyKey: crypto.randomUUID(),
    }, database);
    const categories = await findCategoriesForUser("budget-user-a", true, database);
    expect(categories).toHaveLength(16);
    const pets = categories.find((category) => category.name === "Pets");
    expect(pets).toMatchObject({ categoryType: "expense", isActive: true });
    await expect(createMonthlyBudget("budget-user-a", {
      year: 2026,
      month: 10,
      currencyCode: "PHP",
      idempotencyKey: crypto.randomUUID(),
    }, database)).rejects.toThrow("already exists");

    const income = await createBudgetIncome("budget-user-a", {
      budgetId: budget.id,
      name: "Salary",
      incomeType: "salary",
      plannedAmount: "50000",
      expectedDate: "2026-10-25",
      idempotencyKey: crypto.randomUUID(),
    }, database);
    await markBudgetIncomeReceived("budget-user-a", {
      incomeId: income.id,
      actualAmount: "49850",
      receivedDate: "2026-10-25",
    }, database);

    const groceries = categories.find((category) => category.name === "Groceries")!;
    const savings = categories.find((category) => category.name === "Savings")!;
    await setBudgetAllocation("budget-user-a", { budgetId: budget.id, categoryId: groceries.id, plannedAmount: "8000" }, database);
    await setBudgetAllocation("budget-user-a", { budgetId: budget.id, categoryId: savings.id, plannedAmount: "5000" }, database);

    const account = await createSavingsAccount("budget-user-a", {
      name: "Maya",
      accountType: "digital_wallet",
      currencyCode: "PHP",
      openingBalance: "10000",
      includeInTotal: true,
      idempotencyKey: crypto.randomUUID(),
    }, database);
    const expense = await createBudgetExpense("budget-user-a", {
      budgetId: budget.id,
      categoryId: groceries.id,
      amount: "2350",
      transactionDate: "2026-10-23",
      merchant: "SM Supermarket",
      description: "Weekly groceries",
      paymentAccountId: account.accountId,
      idempotencyKey: crypto.randomUUID(),
    }, database);
    const savingsAccountBeforeReverse = await getSavingsAccountDetails("budget-user-a", account.accountId, database);
    expect(savingsAccountBeforeReverse?.balanceMinor).toBe(765_000);

    await createBudgetSavingsContribution("budget-user-a", {
      budgetId: budget.id,
      categoryId: savings.id,
      amount: "5000",
      transactionDate: "2026-10-24",
      accountId: account.accountId,
      description: "Monthly savings contribution",
      idempotencyKey: crypto.randomUUID(),
    }, database);
    const debtCategory = categories.find((category) => category.categoryType === "debt")!;
    const [debt] = await database.insert(schema.debts).values({
      userId: "budget-user-a",
      name: "Laptop",
      debtType: "installment",
      currencyCode: "PHP",
      originalPrincipalMinor: 6_000_000,
      openingBalanceMinor: 6_000_000,
      creationIdempotencyKey: crypto.randomUUID(),
    }).returning();
    const payment = await recordDebtPayment("budget-user-a", {
      debtId: debt!.id,
      amount: "5000",
      paymentDate: "2026-10-20",
      paymentType: "regular",
      description: "Laptop installment",
      idempotencyKey: crypto.randomUUID(),
    }, database);
    await linkDebtPaymentToBudget("budget-user-a", {
      budgetId: budget.id,
      paymentId: payment.paymentId,
      categoryId: debtCategory.id,
      idempotencyKey: crypto.randomUUID(),
    }, database);

    let data = await getBudgetPageData("budget-user-a", 2026, 10, "PHP", database);
    expect(data.summary).toMatchObject({
      plannedIncomeMinor: 5_000_000,
      actualIncomeMinor: 4_985_000,
      actualSpentMinor: 1_235_000,
      savingsContributionMinor: 500_000,
      debtPaymentMinor: 500_000,
    });
    expect(data.expenses.filter((item) => item.linkedDebtPaymentId === payment.paymentId)).toHaveLength(1);
    expect(await reconcileBudgetLinks("budget-user-a", budget.id, database)).toMatchObject({ issues: [] });
    await database.update(schema.accountTransactions)
      .set({ amountMinor: 235_001 })
      .where(eq(schema.accountTransactions.id, expense.linkedAccountTransactionId!));
    expect((await reconcileBudgetLinks("budget-user-a", budget.id, database)).issues).toContain(
      `Budget transaction ${expense.id} does not match its linked Savings transaction.`,
    );
    await database.update(schema.accountTransactions)
      .set({ amountMinor: 235_000 })
      .where(eq(schema.accountTransactions.id, expense.linkedAccountTransactionId!));

    const reversalKey = crypto.randomUUID();
    await reverseBudgetExpense("budget-user-a", {
      expenseId: expense.id,
      reason: "Wrong transaction",
      idempotencyKey: reversalKey,
    }, database);
    await reverseBudgetExpense("budget-user-a", {
      expenseId: expense.id,
      reason: "Wrong transaction",
      idempotencyKey: reversalKey,
    }, database);
    const restoredAccount = await getSavingsAccountDetails("budget-user-a", account.accountId, database);
    expect(restoredAccount?.balanceMinor).toBe(1_500_000);
    data = await getBudgetPageData("budget-user-a", 2026, 10, "PHP", database);
    expect(data.summary?.actualSpentMinor).toBe(1_000_000);
    await reverseRecordedDebtPayment("budget-user-a", {
      paymentId: payment.paymentId,
      reason: "Payment recorded in error",
      idempotencyKey: crypto.randomUUID(),
    }, database);
    data = await getBudgetPageData("budget-user-a", 2026, 10, "PHP", database);
    expect(data.summary?.actualSpentMinor).toBe(500_000);
    expect(data.summary?.debtPaymentMinor).toBe(0);

    const copied = await copyMonthlyBudget("budget-user-a", {
      sourceBudgetId: budget.id,
      targetYear: 2026,
      targetMonth: 11,
      idempotencyKey: crypto.randomUUID(),
    }, database);
    const nextMonth = await getBudgetPageData("budget-user-a", 2026, 11, "PHP", database);
    expect(copied.copiedAllocations).toBe(2);
    expect(copied.copiedPlannedIncome).toBe(0);
    expect(nextMonth.expenses).toHaveLength(0);
    expect(nextMonth.summary?.totalAllocatedMinor).toBe(1_300_000);
  });

  it("rejects cross-user budget, category, account, and debt-payment access", async () => {
    const owned = await createMonthlyBudget("budget-user-a", {
      year: 2026, month: 10, currencyCode: "PHP", idempotencyKey: crypto.randomUUID(),
    }, database);
    const other = await createMonthlyBudget("budget-user-b", {
      year: 2026, month: 10, currencyCode: "PHP", idempotencyKey: crypto.randomUUID(),
    }, database);
    const ownerCategories = await findCategoriesForUser("budget-user-a", true, database);
    const otherCategories = await findCategoriesForUser("budget-user-b", true, database);
    const ownerAccount = await createSavingsAccount("budget-user-a", {
      name: "Private account",
      accountType: "savings",
      currencyCode: "PHP",
      openingBalance: "1000",
      includeInTotal: true,
      idempotencyKey: crypto.randomUUID(),
    }, database);
    const privateCategory = ownerCategories.find((category) => category.name === "Groceries")!;
    const otherCategory = otherCategories.find((category) => category.name === "Groceries")!;

    await expect(setBudgetAllocation("budget-user-b", {
      budgetId: owned.id,
      categoryId: privateCategory.id,
      plannedAmount: "100",
    }, database)).rejects.toThrow();
    await expect(createBudgetExpense("budget-user-b", {
      budgetId: other.id,
      categoryId: otherCategory.id,
      amount: "10",
      transactionDate: "2026-10-20",
      description: "Forged account",
      paymentAccountId: ownerAccount.accountId,
      idempotencyKey: crypto.randomUUID(),
    }, database)).rejects.toThrow("active Savings accounts");
    expect(await getBudgetPageData("budget-user-b", 2026, 10, "PHP", database)).not.toMatchObject({ budget: owned });
  });
});
