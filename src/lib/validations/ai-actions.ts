import { z } from "zod";

const uuid = z.string().uuid();
const date = z.iso.date();
const money = z.number().int().positive().safe();
const currency = z.enum(["PHP", "USD", "EUR", "JPY"]);
const notes = z.string().max(1000).optional();

export const aiActionPayloadSchemas = {
  savings_deposit: z.object({
    accountId: uuid,
    amountMinor: money,
    currencyCode: currency,
    transactionDate: date,
    description: z.string().trim().min(1).max(120),
    notes,
  }).strict(),
  savings_withdrawal: z.object({
    accountId: uuid,
    amountMinor: money,
    currencyCode: currency,
    transactionDate: date,
    description: z.string().trim().min(1).max(120),
    notes,
  }).strict(),
  account_transfer: z.object({
    sourceAccountId: uuid,
    destinationAccountId: uuid,
    amountMinor: money,
    currencyCode: currency,
    transactionDate: date,
    description: z.string().trim().min(1).max(120),
    notes,
  }).strict(),
  budget_expense: z.object({
    budgetId: uuid,
    categoryId: uuid,
    amountMinor: money,
    currencyCode: currency,
    transactionDate: date,
    description: z.string().trim().min(1).max(120),
    merchant: z.string().trim().max(100).optional(),
    paymentAccountId: uuid.optional(),
    notes,
  }).strict(),
  budget_income: z.object({
    budgetId: uuid,
    amountMinor: money,
    currencyCode: currency,
    receivedDate: date.optional(),
    expectedDate: date.optional(),
    name: z.string().trim().min(1).max(100),
    incomeType: z.enum(["salary", "bonus", "freelance", "allowance", "reimbursement", "business", "interest", "gift", "other"]),
  }).strict(),
  debt_payment: z.object({
    debtId: uuid,
    installmentId: uuid.optional(),
    amountMinor: money,
    currencyCode: currency,
    paymentDate: date,
    paymentType: z.enum(["regular", "partial"]),
    sourceAccountId: uuid.optional(),
    description: z.string().trim().min(1).max(120),
  }).strict(),
  travel_expense: z.object({
    tripId: uuid,
    category: z.enum(["flights", "accommodation", "local_transportation", "food", "activities", "shopping", "insurance", "visa", "connectivity", "emergency", "other"]),
    amountMinor: money,
    currencyCode: currency,
    transactionDate: date,
    description: z.string().trim().min(1).max(120),
    paymentAccountId: uuid.optional(),
    budgetId: uuid.optional(),
    budgetCategoryId: uuid.optional(),
    notes,
  }).strict().refine((value) => Boolean(value.budgetId) === Boolean(value.budgetCategoryId)),
  travel_todo: z.object({
    tripId: uuid,
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().max(1000).optional(),
    dueDate: date.optional(),
    priority: z.enum(["low", "normal", "high"]),
  }).strict(),
  itinerary_item: z.object({
    tripId: uuid,
    date,
    startTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).optional(),
    endTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).optional(),
    title: z.string().trim().min(1).max(120),
    location: z.string().trim().max(160).optional(),
    category: z.enum(["flight", "accommodation", "transport", "food", "activity", "sightseeing", "shopping", "free_time", "other"]),
    description: z.string().trim().max(1000).optional(),
  }).strict().refine((value) => !value.startTime || !value.endTime || value.endTime >= value.startTime),
} as const;

export type AIActionType = keyof typeof aiActionPayloadSchemas;
export type AIActionPayloadMap = {
  [K in AIActionType]: z.infer<(typeof aiActionPayloadSchemas)[K]>;
};

export const aiActionDisplayPayloadSchema = z.object({
  title: z.string().min(1).max(120),
  summary: z.string().min(1).max(240),
  details: z.array(z.object({
    label: z.string().min(1).max(60),
    value: z.string().min(1).max(240),
  }).strict()).max(12),
  warning: z.string().max(240).optional(),
  href: z.enum(["/savings", "/budget", "/debt", "/travel"]),
  confirmLabel: z.string().min(1).max(40),
});

export type AIActionDisplayPayload = z.infer<typeof aiActionDisplayPayloadSchema>;
