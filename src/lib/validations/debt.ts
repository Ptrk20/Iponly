import { z } from "zod";
import { parseMoneyInput } from "@/lib/money";

const uuid = z.string().uuid();
const currency = z.enum(["PHP", "USD", "EUR", "JPY"]);
const money = z.string().trim().min(1, "Enter an amount.").max(30).regex(/^\d+(?:\.\d+)?$/, "Enter a valid amount.");
const optionalMoney = z.string().trim().max(30).regex(/^\d+(?:\.\d+)?$/, "Enter a valid amount.").optional().or(z.literal(""));
const optionalCount = z.preprocess(
  (value) => value === "" || value === undefined ? undefined : Number(value),
  z.number().int().min(1).max(600).optional(),
);
const optionalInterval = z.preprocess(
  (value) => value === "" || value === undefined ? undefined : Number(value),
  z.number().int().min(1).max(52).optional(),
);
const optionalGrace = z.preprocess(
  (value) => value === "" || value === undefined ? 0 : Number(value),
  z.number().int().min(0).max(365),
);
const notes = z.string().trim().max(2000).optional().or(z.literal(""));

export const bulkInstallmentPaymentSchema = z.object({
  paymentDate: z.iso.date(),
  installments: z.array(z.object({
    debtId: uuid,
    installmentId: uuid,
    amount: money,
    idempotencyKey: uuid,
  })).min(1, "Select at least one installment.").max(100, "Select up to 100 installments at a time."),
}).refine((value) => new Set(value.installments.map((item) => item.installmentId)).size === value.installments.length, {
  message: "Each installment can only be selected once.",
}).refine((value) => new Set(value.installments.map((item) => item.idempotencyKey)).size === value.installments.length, {
  message: "Each installment requires a separate payment submission key.",
});

export const createDebtSchema = z.object({
  name: z.string().trim().min(1, "Enter a debt name.").max(100),
  creditor: z.string().trim().max(100).optional().or(z.literal("")),
  debtType: z.enum(["installment", "credit_card", "personal_loan", "housing_loan", "vehicle_loan", "buy_now_pay_later", "family_loan", "one_time", "other"]),
  currencyCode: currency,
  originalAmount: money,
  openingBalance: money,
  balanceMode: z.enum(["new", "current"]).optional().or(z.literal("")),
  annualInterestRate: optionalMoney,
  regularInstallmentAmount: optionalMoney,
  installmentCount: optionalCount,
  recurrence: z.enum(["one_time", "weekly", "biweekly", "monthly", "custom"]),
  recurrenceInterval: optionalInterval,
  firstDueDate: z.iso.date().optional().or(z.literal("")),
  gracePeriodDays: optionalGrace,
  referenceNumber: z.string().trim().max(120).optional().or(z.literal("")),
  notes,
  includeInTotal: z.enum(["true", "false"]).transform((value) => value === "true"),
  totalScheduledAmount: optionalMoney,
  priorPaidInstallmentCount: z.preprocess(
    (value) => value === "" || value === undefined ? undefined : Number(value),
    z.number().int().min(0).max(600).optional(),
  ),
  migrationSummary: notes,
  idempotencyKey: uuid,
}).superRefine((value, ctx) => {
  for (const field of ["originalAmount", "openingBalance"] as const) {
    const amount = parseMoneyInput(value[field], value.currencyCode);
    if (amount === null || (field === "originalAmount" ? amount <= 0 : amount < 0)) {
      ctx.addIssue({ code: "custom", path: [field], message: "Enter a valid amount for this currency." });
    }
  }
  for (const field of ["regularInstallmentAmount", "totalScheduledAmount"] as const) {
    if (!value[field]) continue;
    const amount = parseMoneyInput(value[field], value.currencyCode);
    if (amount === null || amount <= 0) {
      ctx.addIssue({ code: "custom", path: [field], message: "Enter an amount greater than zero." });
    }
  }
  if (value.annualInterestRate && !/^\d+(?:\.\d{1,2})?$/.test(value.annualInterestRate)) {
    ctx.addIssue({ code: "custom", path: ["annualInterestRate"], message: "Enter a percentage with up to two decimal places." });
  }
  if (value.recurrence !== "custom") {
    if (!value.firstDueDate) ctx.addIssue({ code: "custom", path: ["firstDueDate"], message: "Enter the first due date." });
    if (!value.regularInstallmentAmount) ctx.addIssue({ code: "custom", path: ["regularInstallmentAmount"], message: "Enter an installment amount." });
    if (!value.installmentCount && value.recurrence !== "one_time") {
      ctx.addIssue({ code: "custom", path: ["installmentCount"], message: "Enter the number of installments." });
    }
  }
});

export const updateDebtDetailsSchema = z.object({
  debtId: uuid,
  name: z.string().trim().min(1, "Enter a debt name.").max(100),
  creditor: z.string().trim().max(100).optional().or(z.literal("")),
  debtType: z.enum(["installment", "credit_card", "personal_loan", "housing_loan", "vehicle_loan", "buy_now_pay_later", "family_loan", "one_time", "other"]),
  annualInterestRate: optionalMoney,
  gracePeriodDays: optionalGrace,
  referenceNumber: z.string().trim().max(120).optional().or(z.literal("")),
  notes,
  includeInTotal: z.enum(["true", "false"]).transform((value) => value === "true"),
}).superRefine((value, ctx) => {
  if (value.annualInterestRate && !/^\d+(?:\.\d{1,2})?$/.test(value.annualInterestRate)) {
    ctx.addIssue({ code: "custom", path: ["annualInterestRate"], message: "Enter a percentage with up to two decimal places." });
  }
});

export const createManualInstallmentSchema = z.object({
  debtId: uuid,
  dueDate: z.iso.date(),
  amount: money,
  notes,
});

export const recordDebtPaymentSchema = z.object({
  debtId: uuid,
  installmentId: uuid.optional().or(z.literal("")),
  amount: money,
  paymentDate: z.iso.date(),
  paymentType: z.enum(["regular", "partial", "extra", "payoff", "adjustment", "fee_payment"]),
  sourceAccountId: uuid.optional().or(z.literal("")),
  description: z.string().trim().min(1, "Enter a payment description.").max(120),
  referenceNumber: z.string().trim().max(120).optional().or(z.literal("")),
  notes,
  idempotencyKey: uuid,
  principalAmount: optionalMoney,
  interestAmount: optionalMoney,
  feesAmount: optionalMoney,
  adjustmentAmount: optionalMoney,
  unapportionedAmount: optionalMoney,
}).superRefine((value, ctx) => {
  if (/^0+(?:\.0+)?$/.test(value.amount)) {
    ctx.addIssue({ code: "custom", path: ["amount"], message: "Enter an amount greater than zero." });
  }
  const allocation = [
    value.principalAmount,
    value.interestAmount,
    value.feesAmount,
    value.adjustmentAmount,
    value.unapportionedAmount,
  ].filter((entry) => entry !== undefined && entry !== "");
  for (const entry of allocation) {
    if (typeof entry !== "string" || !/^\d+(?:\.\d+)?$/.test(entry)) {
      ctx.addIssue({ code: "custom", path: ["principalAmount"], message: "Enter valid payment allocations." });
      return;
    }
  }
});

export const reverseDebtPaymentSchema = z.object({
  paymentId: uuid,
  reason: z.string().trim().min(1, "Enter a reason for the reversal.").max(300),
  idempotencyKey: uuid,
});

export const reverseDebtAdjustmentSchema = z.object({
  adjustmentId: uuid,
  reason: z.string().trim().min(1, "Enter a reason for the adjustment correction.").max(300),
});

export const addDebtAdjustmentSchema = z.object({
  debtId: uuid,
  installmentId: uuid.optional().or(z.literal("")),
  adjustmentType: z.enum(["balance_increase", "balance_decrease", "fee_added", "interest_added", "fee_waived", "interest_waived", "principal_correction"]),
  amount: money,
  effectiveDate: z.iso.date(),
  reason: z.string().trim().min(1, "Enter a reason for the adjustment.").max(300),
  notes,
});

export const rescheduleDebtInstallmentSchema = z.object({
  debtId: uuid,
  installmentId: uuid,
  newDueDate: z.iso.date(),
  reason: z.string().trim().min(1, "Enter a reason for the reschedule.").max(300),
  notes,
});

export const debtIdSchema = z.object({ debtId: uuid });
export const debtPauseSchema = z.object({
  debtId: uuid,
  paused: z.enum(["true", "false"]).transform((value) => value === "true"),
});
export const archiveDebtSchema = z.object({
  debtId: uuid,
  confirmOutstanding: z.enum(["true", "false"]).transform((value) => value === "true"),
});
