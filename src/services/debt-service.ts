import "server-only";
import { getDatabase, type IponlyDatabase } from "@/db";
import { amountToMinor } from "@/lib/validations/savings";
import {
  allocationTotal,
  calculateDebtBalance,
  calculateDebtProgress,
  calculateInstallmentRemaining,
  calculateInstallmentInterest,
  calculateNextInstallment,
  calculateRemainingInstallmentCount,
  calculateTotalDebt,
  determineDebtStatus,
  determineInstallmentStatus,
  generateDebtSchedule,
  percentageToBasisPoints,
} from "@/lib/debt";
import { formatMoney } from "@/lib/money";
import { createTransactionForUser } from "@/repositories/account-transaction-repository";
import type { SavingsDatabaseTransaction } from "@/repositories/account-transaction-repository";
import {
  findAccountsForUser,
  getBalanceForAccount,
  lockAccountsForUser,
} from "@/repositories/account-repository";
import { reverseSavingsTransactionInTransaction } from "@/services/savings-service";
import {
  reverseDebtPaymentInBudgetTransaction,
  syncDebtPaymentWithBudgetInTransaction,
} from "@/services/budget-service";
import type { CurrencyCode } from "@/types/domain";
import { bulkInstallmentPaymentSchema } from "@/lib/validations/debt";
import type { z } from "zod";
import type { DebtAdjustmentType, DebtPaymentAllocationInput, DebtPaymentType, DebtRecord } from "@/types/debt";
import {
  createAdjustmentForDebtAndUser,
  createDebtForUser,
  createInstallmentForDebtAndUser,
  createInstallmentsForDebtAndUser,
  createInstallmentRescheduleForUser,
  createPaymentAllocationsForUser,
  createPaymentForDebtAndUser,
  findAdjustmentsForDebtAndUser,
  findAdjustmentForUser,
  findAdjustmentReversalForUser,
  findAllocationsForDebtAndUser,
  findAllInstallmentsForUser,
  findDebtAdjustmentsForUser,
  findDebtByCreationKey,
  findDebtForUser,
  findDebtPaymentsForUser,
  findDebtsForUser,
  findInstallmentForUser,
  findInstallmentsForDebtAndUser,
  findInstallmentReschedulesForDebtAndUser,
  findPaymentByIdempotencyKey,
  findPaymentAllocationsForPayments,
  findPaymentForUser,
  findPaymentsForDebtAndUser,
  lockDebtForUser,
  markPaymentReversedForUser,
  setDebtStatusForUser,
  updateDebtDetailsForUser,
  updateInstallmentForUser,
} from "@/repositories/debt-repository";

export class DebtRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DebtRuleError";
  }
}

const adjustmentReversals: Record<DebtAdjustmentType, DebtAdjustmentType> = {
  balance_increase: "balance_decrease",
  balance_decrease: "balance_increase",
  fee_added: "fee_waived",
  fee_waived: "fee_added",
  interest_added: "interest_waived",
  interest_waived: "interest_added",
  principal_correction: "balance_decrease",
};

const dayAtNoonUtc = (date: string) => new Date(`${date}T12:00:00.000Z`);

function minorAmount(amount: string, currency: CurrencyCode, allowZero = false) {
  try {
    return amountToMinor(amount, currency, allowZero);
  } catch {
    throw new DebtRuleError(allowZero ? "Enter a valid amount." : "Enter an amount greater than zero.");
  }
}

function dateKeyInTimezone(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function monthKeyInTimezone(value: Date, timezone: string) {
  return dateKeyInTimezone(value, timezone).slice(0, 7);
}

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function allocateCache(installments: Awaited<ReturnType<typeof findInstallmentsForDebtAndUser>>, allocations: Awaited<ReturnType<typeof findAllocationsForDebtAndUser>>, debt: DebtRecord, now: Date, timezone: string) {
  return installments.map((installment) => {
    const linked = allocations.filter((allocation) => allocation.installmentId === installment.id);
    const amountPaidMinor = linked.reduce((total, allocation) => total + allocationTotal(allocation), 0);
    const status = determineInstallmentStatus(
      { ...installment, amountPaidMinor },
      installment.scheduledAmountMinor,
      debt.gracePeriodDays,
      now,
      timezone,
    );
    return {
      ...installment,
      amountPaidMinor,
      remainingAmountMinor: calculateInstallmentRemaining({ ...installment }, linked),
      status,
    };
  });
}

function balanceForDebt(
  debt: DebtRecord,
  payments: Awaited<ReturnType<typeof findPaymentsForDebtAndUser>>,
  adjustments: Awaited<ReturnType<typeof findAdjustmentsForDebtAndUser>>,
) {
  return calculateDebtBalance(debt.openingBalanceMinor, payments, adjustments);
}

export async function createDebt(
  userId: string,
  input: {
    name: string;
    creditor?: string;
    debtType: DebtRecord["debtType"];
    currencyCode: CurrencyCode;
    originalAmount: string;
    openingBalance: string;
    balanceMode?: "new" | "current" | "";
    annualInterestRate?: string;
    regularInstallmentAmount?: string;
    installmentCount?: number;
    recurrence: DebtRecord["recurrence"];
    recurrenceInterval?: number;
    firstDueDate?: string;
    gracePeriodDays?: number;
    referenceNumber?: string;
    notes?: string;
    includeInTotal: boolean;
    totalScheduledAmount?: string;
    priorPaidInstallmentCount?: number;
    migrationSummary?: string;
    idempotencyKey: string;
  },
  database: IponlyDatabase = getDatabase(),
) {
  const originalPrincipalMinor = minorAmount(input.originalAmount, input.currencyCode);
  const enteredBalanceMinor = minorAmount(input.openingBalance, input.currencyCode, true);
  const regularInstallmentMinor = input.regularInstallmentAmount
    ? minorAmount(input.regularInstallmentAmount, input.currencyCode)
    : null;
  const annualInterestRateBasisPoints = input.annualInterestRate
    ? percentageToBasisPoints(input.annualInterestRate)
    : null;
  if (input.balanceMode === "new" && (input.priorPaidInstallmentCount || input.migrationSummary?.trim())) {
    throw new DebtRuleError("Select existing debt when importing prior payments or a current balance.");
  }
  const inferredInterest = input.balanceMode === "new" && input.recurrence === "monthly" &&
    annualInterestRateBasisPoints === null && regularInstallmentMinor !== null && input.installmentCount
    ? calculateInstallmentInterest(
      originalPrincipalMinor,
      regularInstallmentMinor,
      input.installmentCount,
      input.totalScheduledAmount ? minorAmount(input.totalScheduledAmount, input.currencyCode) : undefined,
    )
    : null;
  const openingBalanceMinor = inferredInterest?.openingBalanceMinor ?? enteredBalanceMinor;
  const notes = [
    input.notes?.trim(),
    inferredInterest
      ? `Inferred total interest from scheduled repayments: ${formatMoney(inferredInterest.interestMinor, input.currencyCode)}. Included in the opening balance; not an annual interest rate.`
      : null,
    input.priorPaidInstallmentCount !== undefined || input.migrationSummary?.trim()
      ? `Migrated from notes: ${input.priorPaidInstallmentCount ?? 0} prior installments reported paid.${input.migrationSummary?.trim() ? ` ${input.migrationSummary.trim()}` : ""} Historical payments are summarized only and are not recorded as Iponly transactions.`
      : null,
  ].filter(Boolean).join("\n\n") || null;
  const installmentCount = input.installmentCount ?? (input.recurrence === "one_time" ? 1 : undefined);

  if (openingBalanceMinor > originalPrincipalMinor && !inferredInterest && input.balanceMode !== "current") {
    throw new DebtRuleError("The remaining balance cannot exceed the original amount.");
  }
  if (!input.firstDueDate) {
    if (input.recurrence !== "custom") throw new DebtRuleError("Enter the first due date.");
  } else if (Number.isNaN(dayAtNoonUtc(input.firstDueDate).getTime())) {
    throw new DebtRuleError("Enter a valid first due date.");
  }
  if (input.recurrence !== "custom" && (!installmentCount || !regularInstallmentMinor || !input.firstDueDate)) {
    throw new DebtRuleError("A generated schedule requires an installment amount, count, and first due date.");
  }

  return database.transaction(async (transaction) => {
    const prior = await findDebtByCreationKey(userId, input.idempotencyKey, transaction);
    if (prior) {
      if (
        prior.name !== input.name ||
        prior.creditor !== (input.creditor || null) ||
        prior.debtType !== input.debtType ||
        prior.currencyCode !== input.currencyCode ||
        prior.originalPrincipalMinor !== originalPrincipalMinor ||
        prior.openingBalanceMinor !== openingBalanceMinor ||
        prior.annualInterestRateBasisPoints !== annualInterestRateBasisPoints ||
        prior.regularInstallmentMinor !== regularInstallmentMinor ||
        prior.expectedInstallmentCount !== (installmentCount ?? null) ||
        prior.recurrence !== input.recurrence ||
        prior.firstDueDate?.toISOString().slice(0, 10) !== (input.firstDueDate ?? null) ||
        prior.notes !== notes ||
        prior.referenceNumber !== (input.referenceNumber || null) ||
        prior.includeInTotal !== input.includeInTotal
      ) {
        throw new DebtRuleError("This submission key was already used for different debt details.");
      }
      return { debtId: prior.id, duplicate: true };
    }

    let schedule: ReturnType<typeof generateDebtSchedule> = [];
    if (input.recurrence !== "custom" && openingBalanceMinor > 0) {
      const totalScheduledAmountMinor = input.totalScheduledAmount
        ? minorAmount(input.totalScheduledAmount, input.currencyCode)
        : undefined;
      try {
        schedule = generateDebtSchedule({
          firstDueDate: input.firstDueDate!,
          recurrence: input.recurrence,
          recurrenceInterval: input.recurrenceInterval,
          installmentCount: installmentCount!,
          regularInstallmentMinor: regularInstallmentMinor!,
          totalScheduledAmountMinor,
        });
      } catch (error) {
        if (error instanceof RangeError) throw new DebtRuleError(error.message);
        throw error;
      }
    }
    const firstDueDate = input.firstDueDate ? dayAtNoonUtc(input.firstDueDate) : null;
    const debt = await createDebtForUser(userId, {
      name: input.name,
      creditor: input.creditor || null,
      debtType: input.debtType,
      currencyCode: input.currencyCode,
      originalPrincipalMinor,
      openingBalanceMinor,
      annualInterestRateBasisPoints,
      regularInstallmentMinor,
      expectedInstallmentCount: installmentCount ?? null,
      firstDueDate,
      maturityDate: schedule.at(-1) ? dayAtNoonUtc(schedule.at(-1)!.dueDate) : null,
      recurrence: input.recurrence,
      recurrenceInterval: input.recurrenceInterval ?? 1,
      dueDay: firstDueDate ? Number(input.firstDueDate!.slice(8, 10)) : null,
      gracePeriodDays: input.gracePeriodDays ?? 0,
      referenceNumber: input.referenceNumber || null,
      notes,
      includeInTotal: input.includeInTotal,
      creationIdempotencyKey: input.idempotencyKey,
      status: openingBalanceMinor === 0 ? "paid" : "active",
      completedAt: openingBalanceMinor === 0 ? new Date() : null,
    }, transaction);
    await createInstallmentsForDebtAndUser(userId, debt.id, schedule.map((entry) => ({
      installmentNumber: entry.installmentNumber,
      dueDate: dayAtNoonUtc(entry.dueDate),
      scheduledAmountMinor: entry.scheduledAmountMinor,
      principalDueMinor: 0,
      interestDueMinor: 0,
      feesDueMinor: 0,
      amountPaidMinor: 0,
      status: "scheduled" as const,
      notes: null,
    })), transaction);
    return { debtId: debt.id, duplicate: false };
  });
}

export async function updateDebtDetails(
  userId: string,
  input: {
    debtId: string;
    name: string;
    creditor?: string;
    debtType: DebtRecord["debtType"];
    annualInterestRate?: string;
    gracePeriodDays: number;
    referenceNumber?: string;
    notes?: string;
    includeInTotal: boolean;
  },
  database: IponlyDatabase = getDatabase(),
) {
  return database.transaction(async (transaction) => {
    const debt = await lockDebtForUser(input.debtId, userId, transaction);
    if (!debt || debt.status === "archived") throw new DebtRuleError("This debt could not be found.");
    const annualInterestRateBasisPoints = input.annualInterestRate
      ? percentageToBasisPoints(input.annualInterestRate)
      : null;
    const values: Parameters<typeof updateDebtDetailsForUser>[2] = {
      name: input.name.trim(),
      debtType: input.debtType,
      gracePeriodDays: input.gracePeriodDays,
      includeInTotal: input.includeInTotal,
    };
    if (input.creditor !== undefined) values.creditor = input.creditor.trim() || null;
    if (input.annualInterestRate !== undefined) values.annualInterestRateBasisPoints = annualInterestRateBasisPoints;
    if (input.referenceNumber !== undefined) values.referenceNumber = input.referenceNumber.trim() || null;
    if (input.notes !== undefined) values.notes = input.notes.trim() || null;
    return updateDebtDetailsForUser(debt.id, userId, values, transaction);
  });
}

export async function createManualInstallment(
  userId: string,
  input: { debtId: string; dueDate: string; amount: string; notes?: string },
  database: IponlyDatabase = getDatabase(),
) {
  return database.transaction(async (transaction) => {
    const debt = await lockDebtForUser(input.debtId, userId, transaction);
    if (!debt || debt.status !== "active") throw new DebtRuleError("This active debt could not be found.");
    const scheduledAmountMinor = minorAmount(input.amount, debt.currencyCode);
    const existing = await findInstallmentsForDebtAndUser(debt.id, userId, transaction);
    const nextNumber = Math.max(0, ...existing.map((installment) => installment.installmentNumber ?? 0)) + 1;
    return createInstallmentForDebtAndUser(userId, debt.id, {
      installmentNumber: nextNumber,
      dueDate: dayAtNoonUtc(input.dueDate),
      scheduledAmountMinor,
      principalDueMinor: 0,
      interestDueMinor: 0,
      feesDueMinor: 0,
      amountPaidMinor: 0,
      status: "scheduled",
      notes: input.notes || null,
    }, transaction);
  });
}

export async function recordDebtPayment(
  userId: string,
  input: {
    debtId: string;
    installmentId?: string;
    amount: string;
    paymentDate: string;
    paymentType: Exclude<DebtPaymentType, "reversal">;
    sourceAccountId?: string;
    description: string;
    referenceNumber?: string;
    notes?: string;
    idempotencyKey: string;
    allocation?: {
      principalAmount: string;
      interestAmount: string;
      feesAmount: string;
      adjustmentAmount: string;
      unapportionedAmount: string;
    };
  },
  database: IponlyDatabase | SavingsDatabaseTransaction = getDatabase(),
) {
  return database.transaction(async (transaction) => {
    const debt = await lockDebtForUser(input.debtId, userId, transaction);
    if (!debt) throw new DebtRuleError("Payments can only be recorded for an active debt.");
    const amountMinor = minorAmount(input.amount, debt.currencyCode);
    const paymentDate = dayAtNoonUtc(input.paymentDate);
    const duplicate = await findPaymentByIdempotencyKey(userId, input.idempotencyKey, transaction);
    if (duplicate) {
      if (
        duplicate.debtId !== debt.id ||
        duplicate.amountMinor !== amountMinor ||
        dateKey(duplicate.paymentDate) !== dateKey(paymentDate) ||
        duplicate.sourceAccountId !== (input.sourceAccountId || null) ||
        duplicate.paymentType !== input.paymentType ||
        duplicate.description !== input.description ||
        duplicate.referenceNumber !== (input.referenceNumber || null) ||
        duplicate.notes !== (input.notes || null)
      ) {
        throw new DebtRuleError("This payment submission key was already used for different payment details.");
      }
      return {
        paymentId: duplicate.id,
        debtBalanceMinor: await calculateCurrentBalance(debt, userId, transaction),
        accountBalanceMinor: duplicate.sourceAccountId ? await getBalanceForAccount(duplicate.sourceAccountId, userId, transaction) : null,
        currencyCode: debt.currencyCode,
        duplicate: true,
      };
    }
    if (debt.status !== "active") throw new DebtRuleError("Payments can only be recorded for an active debt.");

    const payments = await findPaymentsForDebtAndUser(debt.id, userId, transaction);
    const adjustments = await findAdjustmentsForDebtAndUser(debt.id, userId, transaction);
    const currentBalanceMinor = balanceForDebt(debt, payments, adjustments);
    if (amountMinor > currentBalanceMinor) throw new DebtRuleError("The payment exceeds the recorded debt balance.");

    const installment = input.installmentId
      ? await findInstallmentForUser(input.installmentId, userId, transaction)
      : null;
    if (input.installmentId && (!installment || installment.debtId !== debt.id)) {
      throw new DebtRuleError("This installment could not be found.");
    }
    const activeAllocations = await findAllocationsForDebtAndUser(debt.id, userId, transaction);
    const installmentAllocation = installment
      ? activeAllocations.filter((allocation) => allocation.installmentId === installment.id)
      : [];
    const installmentRemaining = installment
      ? calculateInstallmentRemaining(installment, installmentAllocation)
      : 0;
    if (installment && (installment.status === "paid" || installment.status === "waived" || installment.status === "cancelled")) {
      throw new DebtRuleError("This installment is not eligible for payment.");
    }
    const manualAllocation: Omit<DebtPaymentAllocationInput, "installmentId"> | undefined = input.allocation
      ? {
          principalAmountMinor: minorAmount(input.allocation.principalAmount, debt.currencyCode, true),
          interestAmountMinor: minorAmount(input.allocation.interestAmount, debt.currencyCode, true),
          feesAmountMinor: minorAmount(input.allocation.feesAmount, debt.currencyCode, true),
          adjustmentAmountMinor: minorAmount(input.allocation.adjustmentAmount, debt.currencyCode, true),
          unapportionedAmountMinor: minorAmount(input.allocation.unapportionedAmount, debt.currencyCode, true),
        }
      : undefined;
    if (manualAllocation) {
      const total = Object.values(manualAllocation).reduce((sum, amount) => sum + amount, 0);
      if (total !== amountMinor || Object.values(manualAllocation).some((amount) => !Number.isSafeInteger(amount) || amount < 0)) {
        throw new DebtRuleError("Payment allocations must be non-negative and equal the payment amount.");
      }
      if (installment && amountMinor > installmentRemaining) {
        throw new DebtRuleError("Manual installment allocations cannot exceed the remaining scheduled amount.");
      }
    } else if (installment && amountMinor > installmentRemaining) {
      throw new DebtRuleError("The payment exceeds this installment. Record the excess as a separate extra payment.");
    }

    let sourceAccountBalanceMinor: number | null = null;
    let linkedAccountTransactionId: string | null = null;
    if (input.sourceAccountId) {
      const account = (await lockAccountsForUser([input.sourceAccountId], userId, transaction))[0];
      if (!account || account.status !== "active") throw new DebtRuleError("Choose one of your active Savings accounts.");
      if (account.currencyCode !== debt.currencyCode) throw new DebtRuleError("The Savings account currency must match the debt currency.");
      sourceAccountBalanceMinor = await getBalanceForAccount(account.id, userId, transaction);
      if (amountMinor > sourceAccountBalanceMinor) throw new DebtRuleError("The payment exceeds the available Savings balance.");
      const savingsTransaction = await createTransactionForUser(userId, {
        accountId: account.id,
        transactionType: "withdrawal",
        amountMinor,
        currencyCode: account.currencyCode,
        transactionDate: paymentDate,
        description: `Debt payment: ${debt.name}`,
        notes: `Recorded in Iponly as debt payment ${input.idempotencyKey}`,
        idempotencyKey: `${input.idempotencyKey}:savings`,
      }, transaction);
      linkedAccountTransactionId = savingsTransaction.id;
      sourceAccountBalanceMinor -= amountMinor;
    }

    const allocation: DebtPaymentAllocationInput = manualAllocation
      ? { ...manualAllocation, installmentId: installment?.id }
      : {
          installmentId: installment && amountMinor <= installmentRemaining ? installment.id : undefined,
          principalAmountMinor: 0,
          interestAmountMinor: 0,
          feesAmountMinor: 0,
          adjustmentAmountMinor: 0,
          unapportionedAmountMinor: amountMinor,
        };
    const payment = await createPaymentForDebtAndUser(userId, {
      debtId: debt.id,
      sourceAccountId: input.sourceAccountId || null,
      amountMinor,
      currencyCode: debt.currencyCode,
      paymentDate,
      paymentType: input.paymentType,
      allocationMethod: input.allocation ? "manual" : "unapportioned",
      referenceNumber: input.referenceNumber || null,
      description: input.description,
      notes: input.notes || null,
      status: "posted",
      reversalOfPaymentId: null,
      reversedByPaymentId: null,
      linkedAccountTransactionId,
      idempotencyKey: input.idempotencyKey,
      createdBy: "user",
    }, transaction);
    await syncDebtPaymentWithBudgetInTransaction(userId, payment, transaction);
    await createPaymentAllocationsForUser(userId, debt.id, payment.id, [{
      installmentId: allocation.installmentId ?? null,
      principalAmountMinor: allocation.principalAmountMinor,
      interestAmountMinor: allocation.interestAmountMinor,
      feesAmountMinor: allocation.feesAmountMinor,
      adjustmentAmountMinor: allocation.adjustmentAmountMinor,
      unapportionedAmountMinor: allocation.unapportionedAmountMinor,
    }], transaction);

    if (installment && allocation.installmentId === installment.id) {
      const amountPaidMinor = installment.amountPaidMinor + amountMinor;
      const status = amountPaidMinor >= installment.scheduledAmountMinor ? "paid" : "partially_paid";
      await updateInstallmentForUser(installment.id, userId, {
        amountPaidMinor,
        status,
        paidAt: status === "paid" ? paymentDate : null,
      }, transaction);
    }

    const debtBalanceMinor = currentBalanceMinor - amountMinor;
    if (debtBalanceMinor === 0) await setDebtStatusForUser(debt.id, userId, "paid", transaction);
    return {
      paymentId: payment.id,
      debtBalanceMinor,
      accountBalanceMinor: sourceAccountBalanceMinor,
      currencyCode: debt.currencyCode,
      duplicate: false,
    };
  });
}

export async function recordBulkInstallmentPayments(
  userId: string,
  input: z.infer<typeof bulkInstallmentPaymentSchema>,
  database: IponlyDatabase = getDatabase(),
) {
  const parsed = bulkInstallmentPaymentSchema.safeParse(input);
  if (!parsed.success) throw new DebtRuleError(parsed.error.issues[0].message);
  return database.transaction(async (transaction) => {
    const entries = [...parsed.data.installments].sort((a, b) =>
      a.debtId.localeCompare(b.debtId) || a.installmentId.localeCompare(b.installmentId));
    for (const entry of entries) {
      const debt = await lockDebtForUser(entry.debtId, userId, transaction);
      if (!debt) throw new DebtRuleError("This debt could not be found.");
      const duplicate = await findPaymentByIdempotencyKey(userId, entry.idempotencyKey, transaction);
      if (duplicate) {
        const allocations = await findAllocationsForDebtAndUser(debt.id, userId, transaction);
        if (!allocations.some((item) => item.paymentId === duplicate.id && item.installmentId === entry.installmentId)) {
          throw new DebtRuleError("This payment submission key was already used for a different installment.");
        }
      }
      if (!duplicate) {
        const installment = await findInstallmentForUser(entry.installmentId, userId, transaction);
        if (!installment || installment.debtId !== debt.id) throw new DebtRuleError("This installment could not be found.");
        const allocations = await findAllocationsForDebtAndUser(debt.id, userId, transaction);
        const remaining = calculateInstallmentRemaining(installment, allocations.filter((item) => item.installmentId === installment.id));
        if (minorAmount(entry.amount, debt.currencyCode) !== remaining) {
          throw new DebtRuleError("An installment balance has changed. Refresh and review your selection before trying again.");
        }
      }
      await recordDebtPayment(userId, {
        ...entry,
        paymentDate: parsed.data.paymentDate,
        paymentType: "regular",
        description: "Overdue installment marked as paid",
      }, transaction);
    }
  });
}

export async function reverseDebtPayment(
  userId: string,
  input: { paymentId: string; reason: string; idempotencyKey: string },
  database: IponlyDatabase = getDatabase(),
) {
  return database.transaction(async (transaction) => {
    const original = await findPaymentForUser(input.paymentId, userId, transaction);
    if (!original) throw new DebtRuleError("This payment could not be found.");
    const debt = await lockDebtForUser(original.debtId, userId, transaction);
    if (!debt) throw new DebtRuleError("This payment could not be found.");
    const duplicate = await findPaymentByIdempotencyKey(userId, input.idempotencyKey, transaction);
    if (duplicate) {
      if (duplicate.reversalOfPaymentId !== original.id || duplicate.notes !== input.reason) {
        throw new DebtRuleError("This reversal key was already used for a different correction.");
      }
      return {
        paymentId: duplicate.id,
        debtBalanceMinor: await calculateCurrentBalance(debt, userId, transaction),
        accountBalanceMinor: duplicate.sourceAccountId ? await getBalanceForAccount(duplicate.sourceAccountId, userId, transaction) : null,
        currencyCode: debt.currencyCode,
        duplicate: true,
      };
    }
    if (original.paymentType === "reversal" || original.status !== "posted" || original.reversedByPaymentId) {
      throw new DebtRuleError("This payment has already been reversed or cannot be reversed.");
    }
    let linkedSavingsReversalId: string | null = null;
    if (original.linkedAccountTransactionId) {
      const result = await reverseSavingsTransactionInTransaction(userId, {
        transactionId: original.linkedAccountTransactionId,
        reason: input.reason,
        idempotencyKey: `${input.idempotencyKey}:savings`,
      }, transaction);
      linkedSavingsReversalId = result.transactionId ?? null;
    }
    const reversal = await createPaymentForDebtAndUser(userId, {
      debtId: debt.id,
      sourceAccountId: original.sourceAccountId,
      amountMinor: original.amountMinor,
      currencyCode: original.currencyCode,
      paymentDate: dayAtNoonUtc(dateKey(new Date())),
      paymentType: "reversal",
      allocationMethod: original.allocationMethod,
      referenceNumber: null,
      description: `Reversal: ${original.description}`,
      notes: input.reason,
      status: "posted",
      reversalOfPaymentId: original.id,
      reversedByPaymentId: null,
      linkedAccountTransactionId: linkedSavingsReversalId,
      idempotencyKey: input.idempotencyKey,
      createdBy: "user",
    }, transaction);
    const marked = await markPaymentReversedForUser(original.id, userId, reversal.id, transaction);
    if (!marked) throw new DebtRuleError("This payment has already been reversed.");
    await reverseDebtPaymentInBudgetTransaction(userId, original.id, input.reason, input.idempotencyKey, transaction);

    const [installments, allocations, payments] = await Promise.all([
      findInstallmentsForDebtAndUser(debt.id, userId, transaction),
      findAllocationsForDebtAndUser(debt.id, userId, transaction),
      findPaymentsForDebtAndUser(debt.id, userId, transaction),
    ]);
    for (const installment of installments) {
      const linked = allocations.filter((allocation) => allocation.installmentId === installment.id);
      const amountPaidMinor = linked.reduce((total, allocation) => total + allocationTotal(allocation), 0);
      const status = amountPaidMinor >= installment.scheduledAmountMinor
        ? "paid"
        : amountPaidMinor > 0
          ? "partially_paid"
          : "scheduled";
      const lastPaymentDate = status === "paid"
        ? linked
            .map((allocation) => payments.find((payment) => payment.id === allocation.paymentId))
            .filter((payment) => payment?.status === "posted" && payment.paymentType !== "reversal")
            .map((payment) => payment!.paymentDate)
            .sort((left, right) => right.getTime() - left.getTime())[0] ?? null
        : null;
      if (amountPaidMinor !== installment.amountPaidMinor || status !== installment.status) {
        await updateInstallmentForUser(installment.id, userId, {
          amountPaidMinor,
          status,
          paidAt: lastPaymentDate,
        }, transaction);
      } else if (status === "paid" && installment.paidAt?.getTime() !== lastPaymentDate?.getTime()) {
        await updateInstallmentForUser(installment.id, userId, { paidAt: lastPaymentDate }, transaction);
      }
    }
    const newBalance = await calculateCurrentBalance(debt, userId, transaction);
    if (debt.status === "paid" && newBalance > 0) await setDebtStatusForUser(debt.id, userId, "active", transaction);
    const accountBalanceMinor = original.sourceAccountId
      ? await getBalanceForAccount(original.sourceAccountId, userId, transaction)
      : null;
    return { paymentId: reversal.id, debtBalanceMinor: newBalance, accountBalanceMinor, currencyCode: debt.currencyCode, duplicate: false };
  });
}

export async function addDebtAdjustment(
  userId: string,
  input: {
    debtId: string;
    installmentId?: string;
    adjustmentType: "balance_increase" | "balance_decrease" | "fee_added" | "interest_added" | "fee_waived" | "interest_waived" | "principal_correction";
    amount: string;
    effectiveDate: string;
    reason: string;
    notes?: string;
  },
  database: IponlyDatabase = getDatabase(),
) {
  return database.transaction(async (transaction) => {
    const debt = await lockDebtForUser(input.debtId, userId, transaction);
    if (!debt || debt.status === "archived" || debt.status === "paid") {
      throw new DebtRuleError("Adjustments require an active or paused debt.");
    }
    const amountMinor = minorAmount(input.amount, debt.currencyCode);
    if (input.installmentId) {
      const installment = await findInstallmentForUser(input.installmentId, userId, transaction);
      if (!installment || installment.debtId !== debt.id) throw new DebtRuleError("This installment could not be found.");
    }
    const adjustment = await createAdjustmentForDebtAndUser(userId, {
      debtId: debt.id,
      installmentId: input.installmentId || null,
      adjustmentType: input.adjustmentType,
      amountMinor,
      effectiveDate: dayAtNoonUtc(input.effectiveDate),
      reason: input.reason,
      notes: input.notes || null,
      status: "posted",
      reversalOfAdjustmentId: null,
    }, transaction);
    const newBalance = await calculateCurrentBalance(debt, userId, transaction);
    if (newBalance === 0) await setDebtStatusForUser(debt.id, userId, "paid", transaction);
    return { adjustmentId: adjustment.id, debtBalanceMinor: newBalance, currencyCode: debt.currencyCode };
  });
}

export async function reverseDebtAdjustment(
  userId: string,
  input: { adjustmentId: string; reason: string },
  database: IponlyDatabase = getDatabase(),
) {
  return database.transaction(async (transaction) => {
    const adjustment = await findAdjustmentForUser(input.adjustmentId, userId, transaction);
    if (!adjustment) throw new DebtRuleError("This adjustment could not be found.");
    const debt = await lockDebtForUser(adjustment.debtId, userId, transaction);
    if (!debt || debt.status === "archived") throw new DebtRuleError("This debt could not be found.");
    if (adjustment.reversalOfAdjustmentId) throw new DebtRuleError("Adjustment reversals cannot be reversed.");
    if (await findAdjustmentReversalForUser(adjustment.id, userId, transaction)) {
      throw new DebtRuleError("This adjustment has already been reversed.");
    }
    const reversalType = adjustmentReversals[adjustment.adjustmentType];
    const reversal = await createAdjustmentForDebtAndUser(userId, {
      debtId: debt.id,
      installmentId: adjustment.installmentId,
      adjustmentType: reversalType,
      amountMinor: adjustment.amountMinor,
      effectiveDate: dayAtNoonUtc(dateKey(new Date())),
      reason: input.reason,
      notes: `Correction of adjustment ${adjustment.id}`,
      status: "posted",
      reversalOfAdjustmentId: adjustment.id,
    }, transaction);
    const balanceMinor = await calculateCurrentBalance(debt, userId, transaction);
    if (balanceMinor === 0) await setDebtStatusForUser(debt.id, userId, "paid", transaction);
    else if (debt.status === "paid") await setDebtStatusForUser(debt.id, userId, "active", transaction);
    return { adjustmentId: reversal.id, debtBalanceMinor: balanceMinor, currencyCode: debt.currencyCode };
  });
}

export async function rescheduleDebtInstallment(
  userId: string,
  input: { debtId: string; installmentId: string; newDueDate: string; reason: string; notes?: string },
  database: IponlyDatabase = getDatabase(),
) {
  return database.transaction(async (transaction) => {
    const debt = await lockDebtForUser(input.debtId, userId, transaction);
    if (!debt || debt.status === "archived") throw new DebtRuleError("This active debt could not be found.");
    const installment = await findInstallmentForUser(input.installmentId, userId, transaction);
    if (!installment || installment.debtId !== debt.id) throw new DebtRuleError("This installment could not be found.");
    if (installment.status === "paid" || installment.status === "waived" || installment.status === "cancelled") {
      throw new DebtRuleError("Only unpaid installments can be rescheduled.");
    }
    const newDueDate = dayAtNoonUtc(input.newDueDate);
    if (dateKey(newDueDate) === dateKey(installment.dueDate)) throw new DebtRuleError("Choose a different due date.");
    await createInstallmentRescheduleForUser(userId, {
      debtId: debt.id,
      installmentId: installment.id,
      previousDueDate: installment.dueDate,
      newDueDate,
      reason: input.reason,
      notes: input.notes || null,
    }, transaction);
    return updateInstallmentForUser(installment.id, userId, { dueDate: newDueDate }, transaction);
  });
}

export async function markDebtPaid(userId: string, debtId: string, database: IponlyDatabase = getDatabase()) {
  return database.transaction(async (transaction) => {
    const debt = await lockDebtForUser(debtId, userId, transaction);
    if (!debt || debt.status === "archived") throw new DebtRuleError("This debt could not be found.");
    const balanceMinor = await calculateCurrentBalance(debt, userId, transaction);
    if (balanceMinor !== 0) throw new DebtRuleError("Record a final payment or a reasoned balance adjustment before marking this debt paid.");
    return setDebtStatusForUser(debt.id, userId, "paid", transaction);
  });
}

export async function setDebtPaused(userId: string, debtId: string, paused: boolean, database: IponlyDatabase = getDatabase()) {
  return database.transaction(async (transaction) => {
    const debt = await lockDebtForUser(debtId, userId, transaction);
    if (!debt || (debt.status !== "active" && debt.status !== "paused")) {
      throw new DebtRuleError("Only active debts can be paused or resumed.");
    }
    return setDebtStatusForUser(debt.id, userId, paused ? "paused" : "active", transaction);
  });
}

export async function archiveDebt(
  userId: string,
  debtId: string,
  confirmOutstanding: boolean,
  database: IponlyDatabase = getDatabase(),
) {
  return database.transaction(async (transaction) => {
    const debt = await lockDebtForUser(debtId, userId, transaction);
    if (!debt || debt.status === "archived") throw new DebtRuleError("This debt is already archived or could not be found.");
    const balanceMinor = await calculateCurrentBalance(debt, userId, transaction);
    if (balanceMinor > 0 && !confirmOutstanding) {
      throw new DebtRuleError("Confirm that you want to archive this debt with an outstanding balance.");
    }
    return setDebtStatusForUser(debt.id, userId, "archived", transaction);
  });
}

export async function restoreDebt(userId: string, debtId: string, database: IponlyDatabase = getDatabase()) {
  return database.transaction(async (transaction) => {
    const debt = await lockDebtForUser(debtId, userId, transaction);
    if (!debt || debt.status !== "archived") throw new DebtRuleError("This archived debt could not be found.");
    const balanceMinor = await calculateCurrentBalance(debt, userId, transaction);
    return setDebtStatusForUser(debt.id, userId, balanceMinor === 0 ? "paid" : "active", transaction);
  });
}

export async function calculateCurrentBalance(debt: DebtRecord, userId: string, database: SavingsExecutor) {
  const [payments, adjustments] = await Promise.all([
    findPaymentsForDebtAndUser(debt.id, userId, database),
    findAdjustmentsForDebtAndUser(debt.id, userId, database),
  ]);
  return balanceForDebt(debt, payments, adjustments);
}

export async function getDebtDetails(
  userId: string,
  debtId: string,
  options: { database?: IponlyDatabase; now?: Date; timezone?: string } = {},
) {
  const database = options.database ?? getDatabase();
  const debt = await findDebtForUser(debtId, userId, database);
  if (!debt) return null;
  const [payments, adjustments, installments, allocations] = await Promise.all([
    findPaymentsForDebtAndUser(debt.id, userId, database),
    findAdjustmentsForDebtAndUser(debt.id, userId, database),
    findInstallmentsForDebtAndUser(debt.id, userId, database),
    findAllocationsForDebtAndUser(debt.id, userId, database),
  ]);
  const reschedules = await findInstallmentReschedulesForDebtAndUser(debt.id, userId, database);
  const balanceMinor = calculateDebtBalance(debt.openingBalanceMinor, payments, adjustments);
  const derivedInstallments = allocateCache(installments, allocations, debt, options.now ?? new Date(), options.timezone ?? "Asia/Manila");
  return {
    debt: { ...debt, balanceMinor, ...calculateDebtProgress(debt, balanceMinor), status: determineDebtStatus(debt, balanceMinor) },
    installments: derivedInstallments,
    payments,
    adjustments,
    reschedules,
    nextInstallment: calculateNextInstallment(derivedInstallments),
  };
}

export async function getDebtOverview(
  userId: string,
  options: { database?: IponlyDatabase; now?: Date; timezone?: string } = {},
) {
  const database = options.database ?? getDatabase();
  const now = options.now ?? new Date();
  const timezone = options.timezone ?? "Asia/Manila";
  const month = monthKeyInTimezone(now, timezone);
  const [records, archivedDebts] = await Promise.all([
    findDebtsForUser(userId, { database }),
    findDebtsForUser(userId, { archived: true, database }),
  ]);
  const allDebts = [...records, ...archivedDebts];
  const ids = allDebts.map((debt) => debt.id);
  const [payments, adjustments, installments] = await Promise.all([
    findDebtPaymentsForUser(userId, ids, database),
    findDebtAdjustmentsForUser(userId, ids, database),
    findAllInstallmentsForUser(userId, ids, database),
  ]);
  const allocations = await findPaymentAllocationsForPayments(payments.map((payment) => payment.id), userId, database);
  const activeAllocations = allocations;
  const paymentsByDebt = groupBy(payments, (payment) => payment.debtId);
  const adjustmentsByDebt = groupBy(adjustments, (adjustment) => adjustment.debtId);
  const installmentsByDebt = groupBy(installments, (installment) => installment.debtId);
  const viewDebts = allDebts.map((debt) => {
    const debtPayments = paymentsByDebt.get(debt.id) ?? [];
    const debtAdjustments = adjustmentsByDebt.get(debt.id) ?? [];
    const balanceMinor = balanceForDebt(debt, debtPayments, debtAdjustments);
    const debtInstallments = allocateCache(
      installmentsByDebt.get(debt.id) ?? [],
      activeAllocations.filter((allocation) => allocation.debtId === debt.id),
      debt,
      now,
      timezone,
    );
    const status = determineDebtStatus(debt, balanceMinor);
    return {
      ...debt,
      balanceMinor,
      ...calculateDebtProgress(debt, balanceMinor),
      status,
      installments: debtInstallments,
      nextInstallment: calculateNextInstallment(debtInstallments),
      remainingInstallments: calculateRemainingInstallmentCount(debtInstallments),
    };
  });
  const visibleDebts = viewDebts.filter((debt) => debt.status !== "archived");
  const activeDebts = visibleDebts.filter((debt) => debt.status === "active" || debt.status === "paused" || debt.status === "defaulted");
  const dueThisMonthByCurrency = sumInstallmentsByCurrency(activeDebts.flatMap((debt) =>
    debt.installments
      .filter((installment) => dateKey(installment.dueDate).startsWith(month))
      .map((installment) => ({ remainingAmountMinor: installment.remainingAmountMinor, currencyCode: debt.currencyCode })),
  ));
  const overdueInstallments = activeDebts.flatMap((debt) =>
    debt.installments.filter((installment) => installment.status === "overdue")
      .map((installment) => ({ ...installment, debtName: debt.name, creditor: debt.creditor, currencyCode: debt.currencyCode })),
  );
  const calendarInstallments = activeDebts.flatMap((debt) =>
    debt.installments.filter((installment) =>
      installment.status === "scheduled" || installment.status === "partially_paid" || installment.status === "overdue",
    ).map((installment) => ({ ...installment, debtName: debt.name, creditor: debt.creditor, currencyCode: debt.currencyCode })),
  ).sort((left, right) => left.dueDate.getTime() - right.dueDate.getTime());
  const upcomingInstallments = calendarInstallments.slice(0, 10);
  const nextPaymentDebtIds = new Set<string>();
  const nextPaymentsPerDebt = calendarInstallments.filter((installment) => {
    if (
      installment.status === "overdue" ||
      dateKey(installment.dueDate).slice(0, 7) < month ||
      nextPaymentDebtIds.has(installment.debtId)
    ) return false;
    nextPaymentDebtIds.add(installment.debtId);
    return true;
  });
  const totalOutstandingByCurrency = calculateTotalDebt(activeDebts.map((debt) => ({
    balanceMinor: debt.balanceMinor,
    currencyCode: debt.currencyCode,
    includeInTotal: debt.includeInTotal,
  })));
  const paidThisMonthByCurrency = new Map<CurrencyCode, number>();
  for (const payment of payments) {
    if (payment.status !== "posted" || payment.paymentType === "reversal" || dateKeyInTimezone(payment.paymentDate, timezone).slice(0, 7) !== month) continue;
    paidThisMonthByCurrency.set(payment.currencyCode, (paidThisMonthByCurrency.get(payment.currencyCode) ?? 0) + payment.amountMinor);
  }
  return {
    debts: visibleDebts,
    archivedDebts: viewDebts.filter((debt) => debt.status === "archived"),
    totalOutstandingByCurrency,
    dueThisMonthByCurrency,
    overdueInstallments,
    overdueByCurrency: sumInstallmentsByCurrency(overdueInstallments),
    upcomingInstallments,
    nextPaymentsPerDebt,
    calendarInstallments,
    activeCount: activeDebts.filter((debt) => debt.status === "active").length,
    paidThisMonthByCurrency,
    recentPayments: payments.filter((payment) => payment.status === "posted" && payment.paymentType !== "reversal").slice(0, 8),
    currencyCodes: [...new Set(visibleDebts.map((debt) => debt.currencyCode))],
    month,
    today: dateKeyInTimezone(now, timezone),
  };
}

function groupBy<T, K>(items: T[], key: (item: T) => K) {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const group = groups.get(key(item)) ?? [];
    group.push(item);
    groups.set(key(item), group);
  }
  return groups;
}

function sumInstallmentsByCurrency(
  installments: { remainingAmountMinor: number; currencyCode: CurrencyCode }[],
) {
  const totals = new Map<CurrencyCode, number>();
  for (const installment of installments) {
    const total = (totals.get(installment.currencyCode) ?? 0) + installment.remainingAmountMinor;
    if (!Number.isSafeInteger(total)) throw new RangeError("Debt totals exceed the supported range.");
    totals.set(installment.currencyCode, total);
  }
  return totals;
}

type SavingsExecutor = Parameters<typeof findPaymentForUser>[2];

export async function getAvailableDebtPaymentAccounts(userId: string, database = getDatabase()) {
  const accounts = await findAccountsForUser(userId, { database });
  const balances = await Promise.all(accounts.map((account) => getBalanceForAccount(account.id, userId, database)));
  return accounts.map((account, index) => ({ ...account, balanceMinor: balances[index] ?? 0 }));
}

export function formatDebtBalance(balanceMinor: number, currencyCode: CurrencyCode) {
  return formatMoney(balanceMinor, currencyCode);
}
