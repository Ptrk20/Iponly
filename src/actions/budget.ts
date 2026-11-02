"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth-session";
import {
  copyBudgetSchema,
  createBudgetCategorySchema,
  createBudgetExpenseSchema,
  createBudgetIncomeSchema,
  createMonthlyBudgetSchema,
  createSavingsContributionSchema,
  linkDebtPaymentSchema,
  receiveBudgetIncomeSchema,
  reverseBudgetExpenseSchema,
  setBudgetAllocationSchema,
  setBudgetCategoryArchivedSchema,
  setBudgetStatusSchema,
  updateBudgetCategorySchema,
} from "@/lib/validations/budget";
import {
  BudgetRuleError,
  copyMonthlyBudget,
  createBudgetCategory,
  createBudgetExpense,
  createBudgetIncome,
  createBudgetSavingsContribution,
  createMonthlyBudget,
  linkDebtPaymentToBudget,
  markBudgetIncomeReceived,
  reverseBudgetExpense,
  setBudgetAllocation,
  setBudgetCategoryArchived,
  setMonthlyBudgetStatus,
  updateBudgetCategory,
} from "@/services/budget-service";

export interface BudgetActionState {
  ok: boolean;
  message: string;
}

function readFormFields(formData: FormData, names: string[]) {
  return Object.fromEntries(names.map((name) => {
    const value = formData.get(name);
    return [name, typeof value === "string" ? value : ""];
  }));
}

async function runBudgetAction(operation: (userId: string) => Promise<unknown>): Promise<BudgetActionState> {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    console.error("Iponly could not resolve the session for a budget operation.");
    return { ok: false, message: "Your session could not be verified. Please sign in again." };
  }
  if (!user) return { ok: false, message: "Your session has expired. Please sign in again." };

  try {
    await operation(user.id);
    revalidatePath("/budget");
    revalidatePath("/");
    revalidatePath("/analytics");
    revalidatePath("/savings");
    revalidatePath("/savings/[accountId]", "page");
    revalidatePath("/debt");
    revalidatePath("/debt/[debtId]", "page");
    return { ok: true, message: "Your budget has been updated." };
  } catch (error) {
    if (error instanceof BudgetRuleError || error instanceof RangeError) {
      return { ok: false, message: error.message };
    }
    console.error("Iponly failed to complete an authenticated budget operation.");
    return { ok: false, message: "We couldn’t save that change. Please try again." };
  }
}

function validationError(error: { issues: { message: string }[] }): BudgetActionState {
  return { ok: false, message: error.issues[0]?.message ?? "Check the form and try again." };
}

export async function createMonthlyBudgetAction(_previous: BudgetActionState, formData: FormData) {
  const parsed = createMonthlyBudgetSchema.safeParse(readFormFields(formData, [
    "year", "month", "currencyCode", "name", "notes", "idempotencyKey",
  ]));
  if (!parsed.success) return validationError(parsed.error);
  return runBudgetAction(async (userId) => { await createMonthlyBudget(userId, parsed.data); });
}

export async function addBudgetIncomeAction(_previous: BudgetActionState, formData: FormData) {
  const parsed = createBudgetIncomeSchema.safeParse(readFormFields(formData, [
    "budgetId", "name", "incomeType", "plannedAmount", "expectedDate", "notes", "idempotencyKey",
  ]));
  if (!parsed.success) return validationError(parsed.error);
  return runBudgetAction(async (userId) => { await createBudgetIncome(userId, parsed.data); });
}

export async function receiveBudgetIncomeAction(_previous: BudgetActionState, formData: FormData) {
  const parsed = receiveBudgetIncomeSchema.safeParse(readFormFields(formData, ["incomeId", "actualAmount", "receivedDate"]));
  if (!parsed.success) return validationError(parsed.error);
  return runBudgetAction(async (userId) => { await markBudgetIncomeReceived(userId, parsed.data); });
}

export async function updateBudgetAllocationAction(_previous: BudgetActionState, formData: FormData) {
  const parsed = setBudgetAllocationSchema.safeParse(readFormFields(formData, ["budgetId", "categoryId", "plannedAmount"]));
  if (!parsed.success) return validationError(parsed.error);
  return runBudgetAction(async (userId) => { await setBudgetAllocation(userId, parsed.data); });
}

export async function createBudgetCategoryAction(_previous: BudgetActionState, formData: FormData) {
  const parsed = createBudgetCategorySchema.safeParse(readFormFields(formData, ["name", "categoryType", "color"]));
  if (!parsed.success) return validationError(parsed.error);
  return runBudgetAction(async (userId) => { await createBudgetCategory(userId, parsed.data); });
}

export async function updateBudgetCategoryAction(_previous: BudgetActionState, formData: FormData) {
  const parsed = updateBudgetCategorySchema.safeParse(readFormFields(formData, ["categoryId", "name", "color", "icon", "sortOrder"]));
  if (!parsed.success) return validationError(parsed.error);
  return runBudgetAction(async (userId) => { await updateBudgetCategory(userId, parsed.data); });
}

export async function setBudgetCategoryArchivedAction(_previous: BudgetActionState, formData: FormData) {
  const parsed = setBudgetCategoryArchivedSchema.safeParse(readFormFields(formData, ["categoryId", "archived"]));
  if (!parsed.success) return validationError(parsed.error);
  return runBudgetAction(async (userId) => { await setBudgetCategoryArchived(userId, parsed.data.categoryId, parsed.data.archived); });
}

export async function createBudgetExpenseAction(_previous: BudgetActionState, formData: FormData) {
  const parsed = createBudgetExpenseSchema.safeParse(readFormFields(formData, [
    "budgetId", "categoryId", "amount", "transactionDate", "merchant", "description",
    "paymentAccountId", "notes", "idempotencyKey",
  ]));
  if (!parsed.success) return validationError(parsed.error);
  return runBudgetAction(async (userId) => { await createBudgetExpense(userId, parsed.data); });
}

export async function createBudgetSavingsContributionAction(_previous: BudgetActionState, formData: FormData) {
  const parsed = createSavingsContributionSchema.safeParse(readFormFields(formData, [
    "budgetId", "categoryId", "amount", "transactionDate", "accountId", "description", "notes", "idempotencyKey",
  ]));
  if (!parsed.success) return validationError(parsed.error);
  return runBudgetAction(async (userId) => { await createBudgetSavingsContribution(userId, parsed.data); });
}

export async function linkDebtPaymentToBudgetAction(_previous: BudgetActionState, formData: FormData) {
  const parsed = linkDebtPaymentSchema.safeParse(readFormFields(formData, ["budgetId", "paymentId", "categoryId", "idempotencyKey"]));
  if (!parsed.success) return validationError(parsed.error);
  return runBudgetAction(async (userId) => { await linkDebtPaymentToBudget(userId, parsed.data); });
}

export async function reverseBudgetExpenseAction(_previous: BudgetActionState, formData: FormData) {
  const parsed = reverseBudgetExpenseSchema.safeParse(readFormFields(formData, ["expenseId", "reason", "idempotencyKey"]));
  if (!parsed.success) return validationError(parsed.error);
  return runBudgetAction(async (userId) => { await reverseBudgetExpense(userId, parsed.data); });
}

export async function copyMonthlyBudgetAction(_previous: BudgetActionState, formData: FormData) {
  const parsed = copyBudgetSchema.safeParse(readFormFields(formData, ["sourceBudgetId", "targetYear", "targetMonth", "idempotencyKey"]));
  if (!parsed.success) return validationError(parsed.error);
  return runBudgetAction(async (userId) => { await copyMonthlyBudget(userId, parsed.data); });
}

export async function setMonthlyBudgetStatusAction(_previous: BudgetActionState, formData: FormData) {
  const parsed = setBudgetStatusSchema.safeParse(readFormFields(formData, ["budgetId", "status"]));
  if (!parsed.success) return validationError(parsed.error);
  return runBudgetAction(async (userId) => { await setMonthlyBudgetStatus(userId, parsed.data.budgetId, parsed.data.status); });
}
