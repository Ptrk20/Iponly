import { z } from "zod";
import { parseMoneyInput } from "@/lib/money";

const uuid = z.string().uuid();
const currency = z.enum(["PHP", "USD", "EUR", "JPY"]);
const moneyInput = z.string().trim().min(1).max(30).regex(/^\d+(?:\.\d+)?$/, "Enter a valid amount.");
const positiveMoneyInput = moneyInput.superRefine((value, ctx) => {
  const parsed = parseMoneyInput(value, "PHP");
  if (parsed === null || parsed <= 0) {
    ctx.addIssue({ code: "custom", message: "Enter an amount greater than zero." });
  }
});
const name = z.string().trim().min(1, "Enter a name.").max(100);
const notes = z.string().trim().max(1000).optional().or(z.literal(""));

export const createAccountSchema = z.object({
  name,
  institution: z.string().trim().max(100).optional().or(z.literal("")),
  accountType: z.enum(["savings", "checking", "digital_wallet", "cash", "emergency_fund", "travel_fund", "other"]),
  currencyCode: currency,
  openingBalance: moneyInput,
  includeInTotal: z.enum(["true", "false"]).transform((value) => value === "true"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().or(z.literal("")),
  icon: z.string().trim().max(40).optional().or(z.literal("")),
  notes,
  idempotencyKey: uuid,
}).superRefine((value, ctx) => {
  const parsed = parseMoneyInput(value.openingBalance, value.currencyCode);
  if (parsed === null || parsed < 0) {
    ctx.addIssue({ code: "custom", path: ["openingBalance"], message: "Enter a valid opening balance." });
  }
});

export const updateAccountSchema = z.object({
  accountId: uuid,
  name,
  institution: z.string().trim().max(100).optional().or(z.literal("")),
  accountType: z.enum(["savings", "checking", "digital_wallet", "cash", "emergency_fund", "travel_fund", "other"]),
  includeInTotal: z.enum(["true", "false"]).transform((value) => value === "true"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().or(z.literal("")),
  icon: z.string().trim().max(40).optional().or(z.literal("")),
  notes,
});

const transactionCommon = {
  accountId: uuid,
  amount: positiveMoneyInput,
  transactionDate: z.iso.date(),
  description: z.string().trim().min(1, "Enter a description.").max(120),
  notes,
  idempotencyKey: uuid,
};

export const depositSchema = z.object(transactionCommon);
export const withdrawalSchema = z.object(transactionCommon);
export const adjustmentSchema = z.object({
  ...transactionCommon,
  direction: z.enum(["increase", "decrease"]),
  reason: z.string().trim().min(1, "Enter a reason for this adjustment.").max(300),
});

export const transferSchema = z.object({
  sourceAccountId: uuid,
  destinationAccountId: uuid,
  amount: positiveMoneyInput,
  transactionDate: z.iso.date(),
  description: z.string().trim().min(1).max(120),
  notes,
  idempotencyKey: uuid,
}).refine((value) => value.sourceAccountId !== value.destinationAccountId, {
  path: ["destinationAccountId"],
  message: "Choose two different accounts.",
});

export const createSavingsGoalSchema = z.object({
  name,
  accountId: uuid.optional().or(z.literal("")),
  targetAmount: positiveMoneyInput,
  targetDate: z.iso.date().optional().or(z.literal("")),
  notes,
});

export const updateSavingsGoalSchema = z.object({
  goalId: uuid,
  name,
  accountId: uuid.optional().or(z.literal("")),
  targetAmount: positiveMoneyInput,
  targetDate: z.iso.date().optional().or(z.literal("")),
  notes,
});

export const archiveAccountSchema = z.object({ accountId: uuid });
export const restoreAccountSchema = z.object({ accountId: uuid });
export const reverseTransactionSchema = z.object({
  transactionId: uuid,
  reason: z.string().trim().min(1, "Enter a reason for the reversal.").max(300),
  idempotencyKey: uuid,
});
export const transactionFiltersSchema = z.object({
  accountId: uuid.optional(),
  type: z.enum(["all", "opening_balance", "deposit", "withdrawal", "adjustment_increase", "adjustment_decrease", "transfer_in", "transfer_out", "reversal"]).optional(),
  status: z.enum(["all", "posted", "reversed"]).optional(),
  search: z.string().trim().max(100).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
}).refine((value) => !value.from || !value.to || value.from <= value.to, {
  path: ["to"],
  message: "End date must be on or after the start date.",
});

export function amountToMinor(amount: string, currencyCode: "PHP" | "USD" | "EUR" | "JPY", allowZero = false): number {
  const minor = parseMoneyInput(amount, currencyCode);
  if (minor === null || !Number.isSafeInteger(minor) || (allowZero ? minor < 0 : minor <= 0)) {
    throw new RangeError(allowZero ? "Enter a valid amount." : "Enter an amount greater than zero.");
  }
  return minor;
}
