"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth-session";
import {
  archiveAccountSchema,
  adjustmentSchema,
  createAccountSchema,
  createSavingsGoalSchema,
  depositSchema,
  restoreAccountSchema,
  reverseTransactionSchema,
  transferSchema,
  updateAccountSchema,
  updateSavingsGoalSchema,
  withdrawalSchema,
} from "@/lib/validations/savings";
import { SavingsRuleError } from "@/services/savings-service";
import { getUserPreferences } from "@/services/preferences-service";
import {
  archiveSavingsAccount,
  changeSavingsGoalStatus,
  createSavingsAccount,
  createSavingsGoal,
  recordSavingsAdjustment,
  recordSavingsDeposit,
  recordSavingsWithdrawal,
  restoreSavingsAccount,
  reverseSavingsTransaction,
  transferSavings,
  updateSavingsAccount,
  updateSavingsGoal,
} from "@/services/savings-service";

export interface SavingsActionState {
  ok: boolean;
  message: string;
}

function readFormFields(formData: FormData, names: string[]) {
  return Object.fromEntries(names.map((name) => {
    if (name === "includeInTotal") return [name, formData.get(name) === "true" ? "true" : "false"];
    const value = formData.get(name);
    return [name, typeof value === "string" ? value : ""];
  }));
}

async function runAction(operation: (userId: string) => Promise<void>): Promise<SavingsActionState> {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    console.error("Iponly could not resolve the session for a savings operation.");
    return { ok: false, message: "Your session could not be verified. Please sign in again." };
  }
  if (!user) return { ok: false, message: "Your session has expired. Please sign in again." };

  try {
    await operation(user.id);
    revalidatePath("/savings");
    revalidatePath("/");
    revalidatePath("/savings/[accountId]", "page");
    revalidatePath("/analytics");
    revalidatePath("/budget");
    revalidatePath("/debt");
    revalidatePath("/debt/[debtId]", "page");
    revalidatePath("/travel");
    revalidatePath("/travel/[tripId]", "page");
    return { ok: true, message: "Your savings data has been updated." };
  } catch (error) {
    if (error instanceof SavingsRuleError || error instanceof RangeError) {
      return { ok: false, message: error.message };
    }
    console.error("Iponly failed to complete an authenticated savings operation.");
    return { ok: false, message: "We couldn’t save that change. Please try again." };
  }
}

export async function createSavingsAccountAction(_previous: SavingsActionState, formData: FormData) {
  const parsed = createAccountSchema.safeParse(readFormFields(formData, [
    "name", "institution", "accountType", "currencyCode", "openingBalance",
    "includeInTotal", "color", "icon", "notes", "idempotencyKey",
  ]));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  return runAction(async (userId) => { await createSavingsAccount(userId, parsed.data); });
}

export async function updateSavingsAccountAction(_previous: SavingsActionState, formData: FormData) {
  const parsed = updateAccountSchema.safeParse(readFormFields(formData, [
    "accountId", "name", "institution", "accountType", "includeInTotal", "color", "icon", "notes",
  ]));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  return runAction(async (userId) => { await updateSavingsAccount(userId, parsed.data); });
}

export async function depositSavingsAction(_previous: SavingsActionState, formData: FormData) {
  const parsed = depositSchema.safeParse(readFormFields(formData, [
    "accountId", "amount", "transactionDate", "description", "notes", "idempotencyKey",
  ]));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  return runAction(async (userId) => { await recordSavingsDeposit(userId, parsed.data); });
}

export async function withdrawSavingsAction(_previous: SavingsActionState, formData: FormData) {
  const parsed = withdrawalSchema.safeParse(readFormFields(formData, [
    "accountId", "amount", "transactionDate", "description", "notes", "idempotencyKey",
  ]));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  return runAction(async (userId) => { await recordSavingsWithdrawal(userId, parsed.data); });
}

export async function adjustSavingsAction(_previous: SavingsActionState, formData: FormData) {
  const parsed = adjustmentSchema.safeParse(readFormFields(formData, [
    "accountId", "amount", "transactionDate", "description", "notes", "reason", "direction", "idempotencyKey",
  ]));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  return runAction(async (userId) => { await recordSavingsAdjustment(userId, parsed.data); });
}

export async function transferSavingsAction(_previous: SavingsActionState, formData: FormData) {
  const parsed = transferSchema.safeParse(readFormFields(formData, [
    "sourceAccountId", "destinationAccountId", "amount", "transactionDate", "description", "notes", "idempotencyKey",
  ]));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  return runAction(async (userId) => { await transferSavings(userId, parsed.data); });
}

export async function reverseSavingsTransactionAction(_previous: SavingsActionState, formData: FormData) {
  const parsed = reverseTransactionSchema.safeParse(readFormFields(formData, [
    "transactionId", "reason", "idempotencyKey",
  ]));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  return runAction(async (userId) => { await reverseSavingsTransaction(userId, parsed.data); });
}

export async function createSavingsGoalAction(_previous: SavingsActionState, formData: FormData) {
  const parsed = createSavingsGoalSchema.safeParse(readFormFields(formData, [
    "name", "accountId", "targetAmount", "targetDate", "notes",
  ]));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  return runAction(async (userId) => {
    const preferences = await getUserPreferences(userId);
    await createSavingsGoal(userId, { ...parsed.data, defaultCurrencyCode: preferences.defaultCurrencyCode });
  });
}

export async function updateSavingsGoalAction(_previous: SavingsActionState, formData: FormData) {
  const parsed = updateSavingsGoalSchema.safeParse(readFormFields(formData, [
    "goalId", "name", "accountId", "targetAmount", "targetDate", "notes",
  ]));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  return runAction(async (userId) => { await updateSavingsGoal(userId, parsed.data); });
}

export async function archiveSavingsAccountAction(_previous: SavingsActionState, formData: FormData) {
  const parsed = archiveAccountSchema.safeParse(readFormFields(formData, ["accountId"]));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  return runAction(async (userId) => { await archiveSavingsAccount(userId, parsed.data.accountId); });
}

export async function restoreSavingsAccountAction(_previous: SavingsActionState, formData: FormData) {
  const parsed = restoreAccountSchema.safeParse(readFormFields(formData, ["accountId"]));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  return runAction(async (userId) => { await restoreSavingsAccount(userId, parsed.data.accountId); });
}

export async function completeSavingsGoalAction(_previous: SavingsActionState, formData: FormData) {
  const goalId = formData.get("goalId");
  if (typeof goalId !== "string") return { ok: false, message: "This goal could not be found." };
  return runAction(async (userId) => { await changeSavingsGoalStatus(userId, goalId, "completed"); });
}

export async function archiveSavingsGoalAction(_previous: SavingsActionState, formData: FormData) {
  const goalId = formData.get("goalId");
  if (typeof goalId !== "string") return { ok: false, message: "This goal could not be found." };
  return runAction(async (userId) => { await changeSavingsGoalStatus(userId, goalId, "archived"); });
}
