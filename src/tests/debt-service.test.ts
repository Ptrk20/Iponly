import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import type { IponlyDatabase } from "@/db";
import { createSavingsAccount, getSavingsAccountDetails } from "@/services/savings-service";
import {
  archiveDebt,
  createDebt,
  getDebtDetails,
  getDebtOverview,
  markDebtPaid,
  recordDebtPayment,
  recordBulkInstallmentPayments,
  rescheduleDebtInstallment,
  reverseDebtPayment,
  updateDebtDetails,
} from "@/services/debt-service";

describe("authenticated debt service", () => {
  let client: PGlite;
  let database: IponlyDatabase;

  beforeEach(async () => {
    client = new PGlite();
    const testDatabase = drizzle({ client, schema });
    database = testDatabase as unknown as IponlyDatabase;
    await migrate(testDatabase, { migrationsFolder: "src/db/migrations" });
    await testDatabase.insert(schema.user).values([
      { id: "debt-user-a", name: "Alex A", email: "debt-a@example.test" },
      { id: "debt-user-b", name: "Bailey B", email: "debt-b@example.test" },
    ]);
  });

  afterEach(async () => {
    await client.close();
  });

  async function addDebt(userId = "debt-user-a", idempotencyKey = crypto.randomUUID()) {
    return createDebt(userId, {
      name: "Laptop installment",
      creditor: "Store",
      debtType: "installment",
      currencyCode: "PHP",
      originalAmount: "60000",
      openingBalance: "60000",
      regularInstallmentAmount: "5000",
      installmentCount: 12,
      recurrence: "monthly",
      recurrenceInterval: 1,
      firstDueDate: "2026-01-31",
      gracePeriodDays: 3,
      includeInTotal: true,
      idempotencyKey,
    }, database);
  }

  it("creates a user-owned debt and a calendar-safe schedule idempotently", async () => {
    const key = crypto.randomUUID();
    const created = await addDebt("debt-user-a", key);
    const replay = await addDebt("debt-user-a", key);
    const details = await getDebtDetails("debt-user-a", created.debtId, { database });

    expect(replay).toEqual({ debtId: created.debtId, duplicate: true });
    expect(details?.installments).toHaveLength(12);
    expect(details?.installments.slice(0, 4).map((item) => item.dueDate.toISOString().slice(0, 10)))
      .toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
    expect(await getDebtDetails("debt-user-b", created.debtId, { database })).toBeNull();
  });

  it("records selected installments atomically and replays without duplicate payments", async () => {
    const created = await addDebt();
    const details = await getDebtDetails("debt-user-a", created.debtId, { database });
    const installments = details!.installments.map((item) => ({
      debtId: created.debtId, installmentId: item.id, amount: "5000", idempotencyKey: crypto.randomUUID(),
    }));
    const input = { installments, paymentDate: "2026-11-02" };
    await recordBulkInstallmentPayments("debt-user-a", input, database);
    await recordBulkInstallmentPayments("debt-user-a", input, database);
    const updated = await getDebtDetails("debt-user-a", created.debtId, { database });
    expect(updated?.payments).toHaveLength(12);
    expect(updated?.debt.balanceMinor).toBe(0);
    expect(updated?.debt.status).toBe("paid");
    expect(updated?.installments.every((item) => item.remainingAmountMinor === 0)).toBe(true);
  });

  it("rolls back all selected payments when a later row has a stale balance or belongs to another user", async () => {
    const own = await addDebt();
    const other = await addDebt("debt-user-b");
    const details = await getDebtDetails("debt-user-a", own.debtId, { database });
    const [first, second] = [...details!.installments].sort((a, b) => a.id.localeCompare(b.id));
    for (const invalid of [
      { debtId: own.debtId, installmentId: second.id, amount: "4999", idempotencyKey: crypto.randomUUID() },
      { debtId: other.debtId, installmentId: second.id, amount: "5000", idempotencyKey: crypto.randomUUID() },
    ]) {
      await expect(recordBulkInstallmentPayments("debt-user-a", {
        paymentDate: "2026-11-02",
        installments: [
          { debtId: own.debtId, installmentId: first.id, amount: "5000", idempotencyKey: crypto.randomUUID() },
          invalid,
        ],
      }, database)).rejects.toThrow();
      expect((await getDebtDetails("debt-user-a", own.debtId, { database }))?.payments).toHaveLength(0);
    }
  });

  it("includes inferred interest only for new monthly debts with no supplied rate", async () => {
    const input = {
      name: "New monthly loan",
      debtType: "installment" as const,
      currencyCode: "PHP" as const,
      originalAmount: "10000",
      openingBalance: "10000",
      regularInstallmentAmount: "1000",
      installmentCount: 12,
      recurrence: "monthly" as const,
      firstDueDate: "2026-11-15",
      includeInTotal: true,
      balanceMode: "new" as const,
      idempotencyKey: crypto.randomUUID(),
    };
    const created = await createDebt("debt-user-a", input, database);
    const details = await getDebtDetails("debt-user-a", created.debtId, { database });
    expect(details?.debt).toMatchObject({
      originalPrincipalMinor: 1000000, openingBalanceMinor: 1200000, balanceMinor: 1200000,
      annualInterestRateBasisPoints: null,
    });
    expect(details?.debt.notes).toContain("Inferred total interest");
    expect(details?.adjustments).toHaveLength(0);
    expect(details?.installments.reduce((sum, item) => sum + item.scheduledAmountMinor, 0)).toBe(1200000);
    expect(await createDebt("debt-user-a", input, database)).toMatchObject({ debtId: created.debtId, duplicate: true });
    for (const annualInterestRate of ["0", "12"]) {
      const withRate = await createDebt("debt-user-a", {
        ...input, annualInterestRate, idempotencyKey: crypto.randomUUID(),
      }, database);
      expect((await getDebtDetails("debt-user-a", withRate.debtId, { database }))?.debt.openingBalanceMinor).toBe(1000000);
    }
    const imported = await createDebt("debt-user-a", {
      ...input, balanceMode: "current", openingBalance: "11000",
      priorPaidInstallmentCount: 1, idempotencyKey: crypto.randomUUID(),
    }, database);
    expect((await getDebtDetails("debt-user-a", imported.debtId, { database }))?.debt.openingBalanceMinor).toBe(1100000);
  });

  it("provides calendar due dates beyond the next ten while excluding paid and archived obligations", async () => {
    const created = await addDebt();
    const options = { database, now: new Date("2026-01-30T17:00:00Z"), timezone: "Asia/Manila" };
    const overview = await getDebtOverview("debt-user-a", options);
    expect(overview.upcomingInstallments).toHaveLength(10);
    expect(overview.calendarInstallments).toHaveLength(12);
    expect(overview.today).toBe("2026-01-31");
    expect((await getDebtOverview("debt-user-b", options)).calendarInstallments).toHaveLength(0);
    const first = overview.calendarInstallments[0]!;
    await recordDebtPayment("debt-user-a", {
      debtId: created.debtId,
      installmentId: first.id,
      amount: "5000",
      paymentDate: "2026-01-31",
      paymentType: "regular",
      description: "First installment paid",
      idempotencyKey: crypto.randomUUID(),
    }, database);
    const second = overview.calendarInstallments[1]!;
    await rescheduleDebtInstallment("debt-user-a", {
      debtId: created.debtId,
      installmentId: second.id,
      newDueDate: "2026-03-05",
      reason: "Changed due date",
    }, database);
    const updated = await getDebtOverview("debt-user-a", options);
    expect(updated.calendarInstallments).toHaveLength(11);
    expect(updated.calendarInstallments.some((item) => item.id === first.id)).toBe(false);
    expect(updated.calendarInstallments.find((item) => item.id === second.id)?.dueDate.toISOString().slice(0, 10)).toBe("2026-03-05");
    await archiveDebt("debt-user-a", created.debtId, true, database);
    expect((await getDebtOverview("debt-user-a", options)).calendarInstallments).toHaveLength(0);
  });

  it("shows one current-month payment per debt and advances only after full payment", async () => {
    const firstDebt = await addDebt();
    const secondDebt = await addDebt();
    const options = { database, now: new Date("2026-01-30T17:00:00Z"), timezone: "Asia/Manila" };
    const overview = await getDebtOverview("debt-user-a", options);
    expect(overview.nextPaymentsPerDebt).toHaveLength(2);
    expect(overview.nextPaymentsPerDebt.map((item) => item.dueDate.toISOString().slice(0, 10)))
      .toEqual(["2026-01-31", "2026-01-31"]);
    const first = overview.nextPaymentsPerDebt.find((item) => item.debtId === firstDebt.debtId)!;
    const payment = {
      debtId: firstDebt.debtId,
      installmentId: first.id,
      amount: "1000",
      paymentDate: "2026-01-31",
      paymentType: "partial" as const,
      description: "Installment payment",
      idempotencyKey: crypto.randomUUID(),
    };
    await recordDebtPayment("debt-user-a", payment, database);
    const partial = await getDebtOverview("debt-user-a", options);
    expect(partial.nextPaymentsPerDebt.find((item) => item.debtId === firstDebt.debtId))
      .toMatchObject({ id: first.id, remainingAmountMinor: 400000 });
    await recordDebtPayment("debt-user-a", {
      ...payment, amount: "4000", idempotencyKey: crypto.randomUUID(),
    }, database);
    const paid = await getDebtOverview("debt-user-a", options);
    expect(paid.nextPaymentsPerDebt).toHaveLength(2);
    expect(paid.nextPaymentsPerDebt.find((item) => item.debtId === firstDebt.debtId)?.dueDate.toISOString().slice(0, 10))
      .toBe("2026-02-28");
    expect(paid.nextPaymentsPerDebt.find((item) => item.debtId === secondDebt.debtId)?.dueDate.toISOString().slice(0, 10))
      .toBe("2026-01-31");
    expect((await getDebtOverview("debt-user-b", options)).nextPaymentsPerDebt).toHaveLength(0);
    await reverseDebtPayment("debt-user-a", {
      paymentId: (await getDebtDetails("debt-user-a", firstDebt.debtId, { database }))!.payments
        .find((item) => item.idempotencyKey === payment.idempotencyKey)!.id,
      reason: "Correct payment",
      idempotencyKey: crypto.randomUUID(),
    }, database);
    expect((await getDebtOverview("debt-user-a", options)).nextPaymentsPerDebt
      .find((item) => item.debtId === firstDebt.debtId)?.id).toBe(first.id);
  });

  it("selects each debt from the full schedule while keeping overdue entries separate", async () => {
    await addDebt();
    await addDebt();
    const overview = await getDebtOverview("debt-user-a", {
      database, now: new Date("2026-07-05T00:00:00Z"), timezone: "Asia/Manila",
    });
    expect(overview.upcomingInstallments.every((item) => item.status === "overdue")).toBe(true);
    expect(overview.nextPaymentsPerDebt).toHaveLength(2);
    expect(overview.nextPaymentsPerDebt.every((item) =>
      item.dueDate.toISOString().slice(0, 10) === "2026-07-31")).toBe(true);
    expect(overview.overdueInstallments.length).toBeGreaterThan(10);
  });

  it("supports guided note migration and metadata edits without rewriting the ledger", async () => {
    const created = await createDebt("debt-user-a", {
      name: "Phone plan",
      debtType: "installment",
      currencyCode: "PHP",
      originalAmount: "24000",
      openingBalance: "14000",
      regularInstallmentAmount: "2000",
      installmentCount: 7,
      recurrence: "monthly",
      firstDueDate: "2026-04-15",
      includeInTotal: true,
      priorPaidInstallmentCount: 5,
      migrationSummary: "Five installments were paid before tracking began.",
      idempotencyKey: crypto.randomUUID(),
    }, database);
    const debt = await updateDebtDetails("debt-user-a", {
      debtId: created.debtId,
      name: "Updated phone plan",
      creditor: "Device store",
      debtType: "installment",
      annualInterestRate: "5.25",
      gracePeriodDays: 2,
      includeInTotal: true,
    }, database);
    const details = await getDebtDetails("debt-user-a", created.debtId, { database });

    expect(debt?.name).toBe("Updated phone plan");
    expect(debt?.annualInterestRateBasisPoints).toBe(525);
    expect(details?.debt.balanceMinor).toBe(1_400_000);
    expect(details?.installments).toHaveLength(7);
    expect(details?.debt.notes).toContain("5 prior installments reported paid");
    expect(details?.payments).toHaveLength(0);
    await expect(updateDebtDetails("debt-user-b", {
      debtId: created.debtId,
      name: "Unauthorized",
      debtType: "installment",
      gracePeriodDays: 0,
      includeInTotal: true,
    }, database)).rejects.toThrow("could not be found");
  });

  it("allows a fully paid debt to be recorded without creating unpaid installments", async () => {
    const created = await createDebt("debt-user-a", {
      name: "Previously paid bill",
      debtType: "one_time",
      currencyCode: "PHP",
      originalAmount: "5000",
      openingBalance: "0",
      recurrence: "custom",
      includeInTotal: true,
      idempotencyKey: crypto.randomUUID(),
    }, database);
    const details = await getDebtDetails("debt-user-a", created.debtId, { database });

    expect(details?.debt.status).toBe("paid");
    expect(details?.installments).toHaveLength(0);
  });

  it("records partial payments and derives the current installment amount", async () => {
    const debt = await addDebt();
    const details = await getDebtDetails("debt-user-a", debt.debtId, { database });
    const installment = details!.installments[0]!;
    const payment = await recordDebtPayment("debt-user-a", {
      debtId: debt.debtId,
      installmentId: installment.id,
      amount: "2500",
      paymentDate: "2026-01-31",
      paymentType: "partial",
      description: "Partial January payment",
      idempotencyKey: crypto.randomUUID(),
    }, database);
    const updated = await getDebtDetails("debt-user-a", debt.debtId, {
      database,
      now: new Date("2026-01-30T12:00:00.000Z"),
    });

    expect(payment.debtBalanceMinor).toBe(5_750_000);
    expect(updated?.installments[0]).toMatchObject({
      amountPaidMinor: 250_000,
      remainingAmountMinor: 250_000,
      status: "partially_paid",
    });
  });

  it("settles only the remaining installment through quick payment without deducting Savings", async () => {
    const debt = await addDebt();
    const options = { database, now: new Date("2026-01-31T04:00:00Z"), timezone: "Asia/Manila" };
    const installment = (await getDebtOverview("debt-user-a", options)).upcomingInstallments[0]!;
    await recordDebtPayment("debt-user-a", {
      debtId: debt.debtId,
      installmentId: installment.id,
      amount: "2500",
      paymentDate: "2026-01-31",
      paymentType: "partial",
      description: "Partial payment",
      idempotencyKey: crypto.randomUUID(),
    }, database);
    const input = {
      debtId: debt.debtId,
      installmentId: installment.id,
      amount: "2500",
      paymentDate: "2026-01-31",
      paymentType: "regular" as const,
      description: "Installment due 2026-01-31 paid",
      idempotencyKey: crypto.randomUUID(),
    };
    await expect(recordDebtPayment("debt-user-b", input, database)).rejects.toThrow("active debt");
    await expect(recordDebtPayment("debt-user-a", { ...input, amount: "5000" }, database))
      .rejects.toThrow("exceeds this installment");
    const payment = await recordDebtPayment("debt-user-a", input, database);
    const replay = await recordDebtPayment("debt-user-a", input, database);
    expect(replay).toMatchObject({ paymentId: payment.paymentId, duplicate: true });
    const updated = await getDebtDetails("debt-user-a", debt.debtId, options);
    expect(updated?.debt.balanceMinor).toBe(5_500_000);
    expect(updated?.installments[0]).toMatchObject({ status: "paid", remainingAmountMinor: 0 });
    expect(updated?.payments).toHaveLength(2);
    expect(updated?.payments.every((item) => item.sourceAccountId === null && item.linkedAccountTransactionId === null)).toBe(true);
    expect((await getDebtOverview("debt-user-a", options)).upcomingInstallments.some((item) => item.id === installment.id)).toBe(false);
    await expect(recordDebtPayment("debt-user-a", { ...input, idempotencyKey: crypto.randomUUID() }, database))
      .rejects.toThrow("not eligible");
  });

  it("atomically links a payment to Savings and restores both ledgers on reversal", async () => {
    const debt = await addDebt();
    const account = await createSavingsAccount("debt-user-a", {
      name: "BDO Savings",
      accountType: "savings",
      currencyCode: "PHP",
      openingBalance: "10000",
      includeInTotal: true,
      idempotencyKey: crypto.randomUUID(),
    }, database);
    const details = await getDebtDetails("debt-user-a", debt.debtId, { database });
    const installment = details!.installments[0]!;
    const payment = await recordDebtPayment("debt-user-a", {
      debtId: debt.debtId,
      installmentId: installment.id,
      amount: "5000",
      paymentDate: "2026-01-31",
      paymentType: "regular",
      sourceAccountId: account.accountId,
      description: "Laptop installment",
      idempotencyKey: crypto.randomUUID(),
    }, database);
    expect(payment.accountBalanceMinor).toBe(500_000);

    const reversal = await reverseDebtPayment("debt-user-a", {
      paymentId: payment.paymentId,
      reason: "Recorded against the wrong installment.",
      idempotencyKey: crypto.randomUUID(),
    }, database);
    const savings = await getSavingsAccountDetails("debt-user-a", account.accountId, database);
    const restoredDebt = await getDebtDetails("debt-user-a", debt.debtId, {
      database,
      now: new Date("2026-01-30T12:00:00.000Z"),
    });

    expect(reversal.debtBalanceMinor).toBe(6_000_000);
    expect(reversal.accountBalanceMinor).toBe(1_000_000);
    expect(savings?.balanceMinor).toBe(1_000_000);
    expect(restoredDebt?.installments[0]?.amountPaidMinor).toBe(0);
    expect(restoredDebt?.installments[0]?.status).toBe("scheduled");
  });

  it("rejects cross-user payment access and atomically rejects insufficient Savings funds", async () => {
    const debt = await addDebt();
    const otherAccount = await createSavingsAccount("debt-user-b", {
      name: "Private account",
      accountType: "savings",
      currencyCode: "PHP",
      openingBalance: "10000",
      includeInTotal: true,
      idempotencyKey: crypto.randomUUID(),
    }, database);
    await expect(recordDebtPayment("debt-user-b", {
      debtId: debt.debtId,
      amount: "100",
      paymentDate: "2026-01-31",
      paymentType: "regular",
      description: "Unauthorized",
      idempotencyKey: crypto.randomUUID(),
    }, database)).rejects.toThrow("active debt");

    const ownDebt = await addDebt("debt-user-b");
    await expect(recordDebtPayment("debt-user-b", {
      debtId: ownDebt.debtId,
      amount: "11000",
      paymentDate: "2026-01-31",
      paymentType: "regular",
      sourceAccountId: otherAccount.accountId,
      description: "Too much",
      idempotencyKey: crypto.randomUUID(),
    }, database)).rejects.toThrow("available Savings balance");
    expect((await getDebtDetails("debt-user-b", ownDebt.debtId, { database }))?.payments).toHaveLength(0);
  });

  it("supports rescheduling and refuses to mark an outstanding debt paid", async () => {
    const debt = await addDebt();
    const details = await getDebtDetails("debt-user-a", debt.debtId, { database });
    const installment = details!.installments[0]!;
    await rescheduleDebtInstallment("debt-user-a", {
      debtId: debt.debtId,
      installmentId: installment.id,
      newDueDate: "2026-02-05",
      reason: "Payday changed.",
    }, database);
    const rescheduled = await getDebtDetails("debt-user-a", debt.debtId, { database });
    expect(rescheduled?.installments[0]?.dueDate.toISOString().slice(0, 10)).toBe("2026-02-05");
    await expect(markDebtPaid("debt-user-a", debt.debtId, database)).rejects.toThrow("balance adjustment");
    await expect(archiveDebt("debt-user-a", debt.debtId, false, database)).rejects.toThrow("Confirm");
  });
});
