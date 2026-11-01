import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import type { IponlyDatabase } from "@/db";
import { findCategoriesForUser } from "@/repositories/budget-repository";
import {
  createBudgetIncome,
  createMonthlyBudget,
  linkDebtPaymentToBudget,
  markBudgetIncomeReceived,
} from "@/services/budget-service";
import { getAnalyticsDashboardData } from "@/services/analytics-service";
import { createDebt, recordDebtPayment } from "@/services/debt-service";
import { createSavingsAccount, recordSavingsDeposit } from "@/services/savings-service";

describe("authenticated analytics service", () => {
  let client: PGlite;
  let database: IponlyDatabase;

  beforeEach(async () => {
    client = new PGlite();
    const testDatabase = drizzle({ client, schema });
    database = testDatabase as unknown as IponlyDatabase;
    await migrate(testDatabase, { migrationsFolder: "src/db/migrations" });
    await testDatabase.insert(schema.user).values([
      { id: "analytics-user-a", name: "Alex A", email: "analytics-a@example.test" },
      { id: "analytics-user-b", name: "Bailey B", email: "analytics-b@example.test" },
    ]);
  });

  afterEach(async () => {
    await client.close();
  });

  it("counts a Debt payment linked to a Savings withdrawal and Budget expense only once", async () => {
    const userId = "analytics-user-a";
    const budget = await createMonthlyBudget(userId, {
      year: 2026,
      month: 10,
      currencyCode: "PHP",
      idempotencyKey: crypto.randomUUID(),
    }, database);
    const categories = await findCategoriesForUser(userId, true, database);
    const debtCategory = categories.find((category) => category.categoryType === "debt")!;
    const salary = await createBudgetIncome(userId, {
      budgetId: budget.id,
      name: "Salary",
      incomeType: "salary",
      plannedAmount: "50000",
      expectedDate: "2026-10-25",
      idempotencyKey: crypto.randomUUID(),
    }, database);
    await markBudgetIncomeReceived(userId, {
      incomeId: salary.id,
      actualAmount: "49850",
      receivedDate: "2026-10-25",
    }, database);

    const account = await createSavingsAccount(userId, {
      name: "BDO Savings",
      accountType: "savings",
      currencyCode: "PHP",
      openingBalance: "0",
      includeInTotal: true,
      idempotencyKey: crypto.randomUUID(),
    }, database);
    await recordSavingsDeposit(userId, {
      accountId: account.accountId,
      amount: "20000",
      transactionDate: "2026-10-01",
      description: "Starting funds",
      idempotencyKey: crypto.randomUUID(),
    }, database);
    const debt = await createDebt(userId, {
      name: "Laptop installment",
      creditor: "Store",
      debtType: "installment",
      currencyCode: "PHP",
      originalAmount: "10000",
      openingBalance: "10000",
      recurrence: "monthly",
      firstDueDate: "2026-10-31",
      regularInstallmentAmount: "5000",
      installmentCount: 2,
      includeInTotal: true,
      idempotencyKey: crypto.randomUUID(),
    }, database);
    const payment = await recordDebtPayment(userId, {
      debtId: debt.debtId,
      amount: "5000",
      paymentDate: "2026-10-20",
      paymentType: "regular",
      sourceAccountId: account.accountId,
      description: "Laptop installment",
      idempotencyKey: crypto.randomUUID(),
    }, database);
    await linkDebtPaymentToBudget(userId, {
      budgetId: budget.id,
      paymentId: payment.paymentId,
      categoryId: debtCategory.id,
      idempotencyKey: crypto.randomUUID(),
    }, database);

    const result = await getAnalyticsDashboardData(userId, {
      period: "custom",
      customStart: "2026-10-01",
      customEnd: "2026-10-31",
      timezone: "Asia/Manila",
      defaultCurrencyCode: "PHP",
      now: new Date("2026-11-01T04:00:00.000Z"),
      database,
    });

    expect(result.budget.actualSpending).toEqual([{ currencyCode: "PHP", amountMinor: 500_000 }]);
    expect(result.budget.debtPayments).toEqual([{ currencyCode: "PHP", amountMinor: 500_000 }]);
    expect(result.savings.balances).toEqual([{ currencyCode: "PHP", amountMinor: 1_500_000 }]);
    expect(result.savings.change).toEqual([{ currencyCode: "PHP", amountMinor: 1_500_000 }]);
    expect(result.budget.actualIncome).toEqual([{ currencyCode: "PHP", amountMinor: 4_985_000 }]);
    expect(result.budget.incomeBySource).toEqual([{
      name: "Salary",
      incomeType: "salary",
      currencyCode: "PHP",
      plannedMinor: 5_000_000,
      receivedMinor: 4_985_000,
    }]);
    expect(result.budget.categories.filter((category) => category.name === "Debt Payments")).toHaveLength(1);
  });

  it("never includes another user's Savings, Budget, or Debt aggregates", async () => {
    const userB = "analytics-user-b";
    const budget = await createMonthlyBudget(userB, {
      year: 2026,
      month: 10,
      currencyCode: "PHP",
      idempotencyKey: crypto.randomUUID(),
    }, database);
    const income = await createBudgetIncome(userB, {
      budgetId: budget.id,
      name: "Private income",
      incomeType: "salary",
      plannedAmount: "999999",
      expectedDate: "2026-10-15",
      idempotencyKey: crypto.randomUUID(),
    }, database);
    await markBudgetIncomeReceived(userB, {
      incomeId: income.id,
      actualAmount: "999999",
      receivedDate: "2026-10-15",
    }, database);
    const account = await createSavingsAccount(userB, {
      name: "Private account",
      accountType: "savings",
      currencyCode: "PHP",
      openingBalance: "100000",
      includeInTotal: true,
      idempotencyKey: crypto.randomUUID(),
    }, database);
    await recordSavingsDeposit(userB, {
      accountId: account.accountId,
      amount: "50000",
      transactionDate: "2026-10-15",
      description: "Private deposit",
      idempotencyKey: crypto.randomUUID(),
    }, database);
    await createDebt(userB, {
      name: "Private debt",
      debtType: "personal_loan",
      currencyCode: "PHP",
      originalAmount: "25000",
      openingBalance: "25000",
      recurrence: "monthly",
      firstDueDate: "2026-10-30",
      regularInstallmentAmount: "25000",
      installmentCount: 1,
      includeInTotal: true,
      idempotencyKey: crypto.randomUUID(),
    }, database);

    const result = await getAnalyticsDashboardData("analytics-user-a", {
      period: "custom",
      customStart: "2026-10-01",
      customEnd: "2026-10-31",
      timezone: "Asia/Manila",
      defaultCurrencyCode: "PHP",
      now: new Date("2026-11-01T04:00:00.000Z"),
      database,
    });

    expect(result.savings.balances).toEqual([]);
    expect(result.budget.actualIncome).toEqual([]);
    expect(result.debt.outstanding).toEqual([]);
  });
});
