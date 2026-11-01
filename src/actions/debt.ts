"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth-session";
import {
  addDebtAdjustmentSchema,
  archiveDebtSchema,
  createDebtSchema,
  createManualInstallmentSchema,
  debtIdSchema,
  debtPauseSchema,
  recordDebtPaymentSchema,
  reverseDebtAdjustmentSchema,
  rescheduleDebtInstallmentSchema,
  reverseDebtPaymentSchema,
  updateDebtDetailsSchema,
} from "@/lib/validations/debt";
import {
  addDebtAdjustment,
  archiveDebt,
  createDebt,
  createManualInstallment,
  markDebtPaid,
  recordDebtPayment,
  reverseDebtAdjustment,
  rescheduleDebtInstallment,
  restoreDebt,
  reverseDebtPayment,
  setDebtPaused,
  updateDebtDetails,
  DebtRuleError,
} from "@/services/debt-service";

export interface DebtActionState {
  ok: boolean;
  message: string;
  debtId?: string;
  paymentId?: string;
}

function formValues(formData: FormData, names: string[]) {
  return Object.fromEntries(names.map((name) => {
    const value = formData.get(name);
    return [name, typeof value === "string" ? value : ""];
  }));
}

async function runDebtAction(operation: (userId: string) => Promise<{ debtId?: string; paymentId?: string } | void>): Promise<DebtActionState> {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    console.error("Iponly could not resolve the session for a debt operation.");
    return { ok: false, message: "Your session could not be verified. Please sign in again." };
  }
  if (!user) return { ok: false, message: "Your session has expired. Please sign in again." };

  try {
    const result = await operation(user.id);
    revalidatePath("/debt");
    revalidatePath("/");
    revalidatePath("/savings");
    revalidatePath("/analytics");
    if (result?.debtId) revalidatePath(`/debt/${result.debtId}`);
    return { ok: true, message: "Your debt information has been updated.", ...result };
  } catch (error) {
    if (error instanceof DebtRuleError || error instanceof RangeError) {
      return { ok: false, message: error.message };
    }
    console.error("Iponly failed to complete an authenticated debt operation.");
    return { ok: false, message: "We couldn’t save that change. Please try again." };
  }
}

function validationError(error: { issues: { message: string }[] }) {
  return { ok: false, message: error.issues[0]?.message ?? "Check the form and try again." };
}

export async function createDebtAction(_previous: DebtActionState, formData: FormData): Promise<DebtActionState> {
  const parsed = createDebtSchema.safeParse(formValues(formData, [
    "name", "creditor", "debtType", "currencyCode", "originalAmount", "openingBalance",
    "annualInterestRate", "regularInstallmentAmount", "installmentCount", "recurrence",
    "recurrenceInterval", "firstDueDate", "gracePeriodDays", "referenceNumber", "notes",
    "includeInTotal", "totalScheduledAmount", "priorPaidInstallmentCount", "migrationSummary", "idempotencyKey",
  ]));
  if (!parsed.success) return validationError(parsed.error);
  return runDebtAction(async (userId) => {
    const result = await createDebt(userId, parsed.data);
    return { debtId: result.debtId };
  });
}

export async function updateDebtDetailsAction(_previous: DebtActionState, formData: FormData): Promise<DebtActionState> {
  const parsed = updateDebtDetailsSchema.safeParse(formValues(formData, [
    "debtId", "name", "creditor", "debtType", "annualInterestRate", "gracePeriodDays",
    "referenceNumber", "notes", "includeInTotal",
  ]));
  if (!parsed.success) return validationError(parsed.error);
  return runDebtAction(async (userId) => {
    const debt = await updateDebtDetails(userId, parsed.data);
    return { debtId: debt?.id };
  });
}

export async function createManualInstallmentAction(_previous: DebtActionState, formData: FormData): Promise<DebtActionState> {
  const parsed = createManualInstallmentSchema.safeParse(formValues(formData, ["debtId", "dueDate", "amount", "notes"]));
  if (!parsed.success) return validationError(parsed.error);
  return runDebtAction(async (userId) => {
    const installment = await createManualInstallment(userId, parsed.data);
    return { debtId: installment.debtId };
  });
}

export async function recordDebtPaymentAction(_previous: DebtActionState, formData: FormData): Promise<DebtActionState> {
  const parsed = recordDebtPaymentSchema.safeParse(formValues(formData, [
    "debtId", "installmentId", "amount", "paymentDate", "paymentType", "sourceAccountId",
    "description", "referenceNumber", "notes", "idempotencyKey",
    "principalAmount", "interestAmount", "feesAmount", "adjustmentAmount", "unapportionedAmount",
  ]));
  if (!parsed.success) return validationError(parsed.error);
  const allocationValues = [
    parsed.data.principalAmount,
    parsed.data.interestAmount,
    parsed.data.feesAmount,
    parsed.data.adjustmentAmount,
    parsed.data.unapportionedAmount,
  ];
  const hasAllocation = allocationValues.some((value) => value !== undefined && value !== "");
  return runDebtAction(async (userId) => {
    const payment = await recordDebtPayment(userId, {
      ...parsed.data,
      installmentId: parsed.data.installmentId || undefined,
      sourceAccountId: parsed.data.sourceAccountId || undefined,
      allocation: hasAllocation ? {
        principalAmount: parsed.data.principalAmount || "0",
        interestAmount: parsed.data.interestAmount || "0",
        feesAmount: parsed.data.feesAmount || "0",
        adjustmentAmount: parsed.data.adjustmentAmount || "0",
        unapportionedAmount: parsed.data.unapportionedAmount || "0",
      } : undefined,
    });
    return { debtId: parsed.data.debtId, paymentId: payment.paymentId };
  });
}

export async function reverseDebtPaymentAction(_previous: DebtActionState, formData: FormData): Promise<DebtActionState> {
  const parsed = reverseDebtPaymentSchema.safeParse(formValues(formData, ["paymentId", "reason", "idempotencyKey"]));
  if (!parsed.success) return validationError(parsed.error);
  return runDebtAction(async (userId) => {
    const result = await reverseDebtPayment(userId, parsed.data);
    return { paymentId: result.paymentId };
  });
}

export async function reverseDebtAdjustmentAction(_previous: DebtActionState, formData: FormData): Promise<DebtActionState> {
  const parsed = reverseDebtAdjustmentSchema.safeParse(formValues(formData, ["adjustmentId", "reason"]));
  if (!parsed.success) return validationError(parsed.error);
  return runDebtAction(async (userId) => {
    await reverseDebtAdjustment(userId, parsed.data);
  });
}

export async function addDebtAdjustmentAction(_previous: DebtActionState, formData: FormData): Promise<DebtActionState> {
  const parsed = addDebtAdjustmentSchema.safeParse(formValues(formData, [
    "debtId", "installmentId", "adjustmentType", "amount", "effectiveDate", "reason", "notes",
  ]));
  if (!parsed.success) return validationError(parsed.error);
  return runDebtAction(async (userId) => {
    await addDebtAdjustment(userId, { ...parsed.data, installmentId: parsed.data.installmentId || undefined });
    return { debtId: parsed.data.debtId };
  });
}

export async function rescheduleDebtInstallmentAction(_previous: DebtActionState, formData: FormData): Promise<DebtActionState> {
  const parsed = rescheduleDebtInstallmentSchema.safeParse(formValues(formData, [
    "debtId", "installmentId", "newDueDate", "reason", "notes",
  ]));
  if (!parsed.success) return validationError(parsed.error);
  return runDebtAction(async (userId) => {
    await rescheduleDebtInstallment(userId, parsed.data);
    return { debtId: parsed.data.debtId };
  });
}

export async function markDebtPaidAction(_previous: DebtActionState, formData: FormData): Promise<DebtActionState> {
  const parsed = debtIdSchema.safeParse(formValues(formData, ["debtId"]));
  if (!parsed.success) return validationError(parsed.error);
  return runDebtAction(async (userId) => {
    await markDebtPaid(userId, parsed.data.debtId);
    return { debtId: parsed.data.debtId };
  });
}

export async function archiveDebtAction(_previous: DebtActionState, formData: FormData): Promise<DebtActionState> {
  const parsed = archiveDebtSchema.safeParse(formValues(formData, ["debtId", "confirmOutstanding"]));
  if (!parsed.success) return validationError(parsed.error);
  return runDebtAction(async (userId) => {
    await archiveDebt(userId, parsed.data.debtId, parsed.data.confirmOutstanding);
    return { debtId: parsed.data.debtId };
  });
}

export async function restoreDebtAction(_previous: DebtActionState, formData: FormData): Promise<DebtActionState> {
  const parsed = debtIdSchema.safeParse(formValues(formData, ["debtId"]));
  if (!parsed.success) return validationError(parsed.error);
  return runDebtAction(async (userId) => {
    await restoreDebt(userId, parsed.data.debtId);
    return { debtId: parsed.data.debtId };
  });
}

export async function setDebtPausedAction(_previous: DebtActionState, formData: FormData): Promise<DebtActionState> {
  const parsed = debtPauseSchema.safeParse(formValues(formData, ["debtId", "paused"]));
  if (!parsed.success) return validationError(parsed.error);
  return runDebtAction(async (userId) => {
    await setDebtPaused(userId, parsed.data.debtId, parsed.data.paused);
    return { debtId: parsed.data.debtId };
  });
}
