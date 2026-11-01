import { z } from "zod";
import { parseMoneyInput } from "@/lib/money";

const uuid = z.string().uuid();
const currency = z.enum(["PHP", "USD", "EUR", "JPY"]);
const notes = z.string().trim().max(2000).optional().or(z.literal(""));
const positiveAmount = z.string().trim().min(1, "Enter an amount.").max(30)
  .regex(/^\d+(?:\.\d+)?$/, "Enter a valid amount.");
const calendarDate = z.iso.date();
const monthInteger = z.preprocess((value) => Number(value), z.number().int().min(1).max(12));
const yearInteger = z.preprocess((value) => Number(value), z.number().int().min(1900).max(2200));

export const createMonthlyBudgetSchema = z.object({
  year: yearInteger,
  month: monthInteger,
  currencyCode: currency,
  name: z.string().trim().max(100).optional().or(z.literal("")),
  notes,
  idempotencyKey: uuid,
});

export const budgetMonthSchema = z.object({
  year: yearInteger,
  month: monthInteger,
});

export const createBudgetIncomeSchema = z.object({
  budgetId: uuid,
  name: z.string().trim().min(1, "Enter an income name.").max(100),
  incomeType: z.enum(["salary", "bonus", "freelance", "allowance", "reimbursement", "business", "interest", "gift", "other"]),
  plannedAmount: positiveAmount,
  expectedDate: calendarDate.optional().or(z.literal("")),
  notes,
  idempotencyKey: uuid,
}).superRefine((value, ctx) => {
  if (parseMoneyInput(value.plannedAmount, "PHP") === null) {
    ctx.addIssue({ code: "custom", path: ["plannedAmount"], message: "Enter a valid amount." });
  }
});

export const receiveBudgetIncomeSchema = z.object({
  incomeId: uuid,
  actualAmount: positiveAmount,
  receivedDate: calendarDate,
}).superRefine((value, ctx) => {
  if (parseMoneyInput(value.actualAmount, "PHP") === null) {
    ctx.addIssue({ code: "custom", path: ["actualAmount"], message: "Enter a valid amount." });
  }
});

export const setBudgetAllocationSchema = z.object({
  budgetId: uuid,
  categoryId: uuid,
  plannedAmount: z.string().trim().max(30).regex(/^\d+(?:\.\d+)?$/, "Enter a valid amount."),
}).superRefine((value, ctx) => {
  if (parseMoneyInput(value.plannedAmount, "PHP") === null) {
    ctx.addIssue({ code: "custom", path: ["plannedAmount"], message: "Enter a valid amount." });
  }
});

export const createBudgetCategorySchema = z.object({
  name: z.string().trim().min(1, "Enter a category name.").max(60),
  categoryType: z.enum(["expense", "savings", "debt", "other"]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#6b8f71"),
});

export const updateBudgetCategorySchema = z.object({
  categoryId: uuid,
  name: z.string().trim().min(1, "Enter a category name.").max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  icon: z.string().trim().max(40).optional().or(z.literal("")),
  sortOrder: z.preprocess((value) => Number(value), z.number().int().min(0).max(1000)),
});

export const setBudgetCategoryArchivedSchema = z.object({
  categoryId: uuid,
  archived: z.enum(["true", "false"]).transform((value) => value === "true"),
});

export const createBudgetExpenseSchema = z.object({
  budgetId: uuid,
  categoryId: uuid,
  amount: positiveAmount,
  transactionDate: calendarDate,
  merchant: z.string().trim().max(100).optional().or(z.literal("")),
  description: z.string().trim().min(1, "Enter a description.").max(120),
  paymentAccountId: uuid.optional().or(z.literal("")),
  notes,
  idempotencyKey: uuid,
}).superRefine((value, ctx) => {
  if (parseMoneyInput(value.amount, "PHP") === null) {
    ctx.addIssue({ code: "custom", path: ["amount"], message: "Enter a valid amount." });
  }
});

export const createSavingsContributionSchema = z.object({
  budgetId: uuid,
  categoryId: uuid,
  amount: positiveAmount,
  transactionDate: calendarDate,
  accountId: uuid.optional().or(z.literal("")),
  description: z.string().trim().min(1, "Enter a description.").max(120),
  notes,
  idempotencyKey: uuid,
}).superRefine((value, ctx) => {
  if (parseMoneyInput(value.amount, "PHP") === null) {
    ctx.addIssue({ code: "custom", path: ["amount"], message: "Enter a valid amount." });
  }
});

export const reverseBudgetExpenseSchema = z.object({
  expenseId: uuid,
  reason: z.string().trim().min(1, "Enter a reason for the reversal.").max(300),
  idempotencyKey: uuid,
});

export const copyBudgetSchema = z.object({
  sourceBudgetId: uuid,
  targetYear: yearInteger,
  targetMonth: monthInteger,
  idempotencyKey: uuid,
});

export const linkDebtPaymentSchema = z.object({
  budgetId: uuid,
  paymentId: uuid,
  categoryId: uuid,
  idempotencyKey: uuid,
});

export const setBudgetStatusSchema = z.object({
  budgetId: uuid,
  status: z.enum(["active", "closed", "archived"]),
});
