import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  bigint,
} from "drizzle-orm/pg-core";
import { currencyPreference, user } from "./auth";
import { accountTransactions, financialAccounts, transactionCreatedBy } from "./savings";

export const debtType = pgEnum("debt_type", [
  "installment",
  "credit_card",
  "personal_loan",
  "housing_loan",
  "vehicle_loan",
  "buy_now_pay_later",
  "family_loan",
  "one_time",
  "other",
]);
export const debtStatus = pgEnum("debt_status", ["draft", "active", "paid", "paused", "defaulted", "archived"]);
export const debtRecurrence = pgEnum("debt_recurrence", ["one_time", "weekly", "biweekly", "monthly", "custom"]);
export const debtInstallmentStatus = pgEnum("debt_installment_status", ["scheduled", "partially_paid", "paid", "overdue", "waived", "cancelled"]);
export const debtPaymentType = pgEnum("debt_payment_type", ["regular", "partial", "extra", "payoff", "adjustment", "fee_payment", "reversal"]);
export const debtPaymentStatus = pgEnum("debt_payment_status", ["posted", "reversed"]);
export const debtPaymentAllocationMethod = pgEnum("debt_payment_allocation_method", ["unapportioned", "manual"]);
export const debtAdjustmentType = pgEnum("debt_adjustment_type", [
  "balance_increase",
  "balance_decrease",
  "fee_added",
  "interest_added",
  "fee_waived",
  "interest_waived",
  "principal_correction",
]);
export const debtAdjustmentStatus = pgEnum("debt_adjustment_status", ["posted", "reversed"]);

export const debts = pgTable(
  "debts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    creditor: text("creditor"),
    debtType: debtType("debt_type").notNull(),
    currencyCode: currencyPreference("currency_code").notNull().default("PHP"),
    originalPrincipalMinor: bigint("original_principal_minor", { mode: "number" }).notNull(),
    openingBalanceMinor: bigint("opening_balance_minor", { mode: "number" }).notNull(),
    annualInterestRateBasisPoints: integer("annual_interest_rate_basis_points"),
    regularInstallmentMinor: bigint("regular_installment_minor", { mode: "number" }),
    expectedInstallmentCount: integer("expected_installment_count"),
    firstDueDate: date("first_due_date", { mode: "date" }),
    maturityDate: date("maturity_date", { mode: "date" }),
    recurrence: debtRecurrence("recurrence").notNull().default("one_time"),
    recurrenceInterval: integer("recurrence_interval").notNull().default(1),
    dueDay: integer("due_day"),
    gracePeriodDays: integer("grace_period_days").notNull().default(0),
    referenceNumber: text("reference_number"),
    notes: text("notes"),
    status: debtStatus("status").notNull().default("active"),
    includeInTotal: boolean("include_in_total").notNull().default(true),
    creationIdempotencyKey: text("creation_idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
    archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    uniqueIndex("debts_id_user_id_unique").on(table.id, table.userId),
    uniqueIndex("debts_user_creation_key_unique").on(table.userId, table.creationIdempotencyKey),
    index("debts_user_status_created_idx").on(table.userId, table.status, table.createdAt),
    index("debts_user_due_date_idx").on(table.userId, table.firstDueDate),
    index("debts_user_type_idx").on(table.userId, table.debtType),
    check("debts_name_nonempty_check", sql`length(trim(${table.name})) > 0`),
    check("debts_original_principal_nonnegative_check", sql`${table.originalPrincipalMinor} >= 0`),
    check("debts_opening_balance_nonnegative_check", sql`${table.openingBalanceMinor} >= 0`),
    check(
      "debts_interest_rate_nonnegative_check",
      sql`${table.annualInterestRateBasisPoints} IS NULL OR ${table.annualInterestRateBasisPoints} >= 0`,
    ),
    check(
      "debts_regular_installment_positive_check",
      sql`${table.regularInstallmentMinor} IS NULL OR ${table.regularInstallmentMinor} > 0`,
    ),
    check(
      "debts_installment_count_positive_check",
      sql`${table.expectedInstallmentCount} IS NULL OR ${table.expectedInstallmentCount} > 0`,
    ),
    check("debts_recurrence_interval_positive_check", sql`${table.recurrenceInterval} > 0`),
    check("debts_due_day_range_check", sql`${table.dueDay} IS NULL OR ${table.dueDay} BETWEEN 1 AND 31`),
    check("debts_grace_period_nonnegative_check", sql`${table.gracePeriodDays} >= 0`),
  ],
);

export const debtInstallments = pgTable(
  "debt_installments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    debtId: uuid("debt_id").notNull(),
    installmentNumber: integer("installment_number"),
    dueDate: date("due_date", { mode: "date" }).notNull(),
    scheduledAmountMinor: bigint("scheduled_amount_minor", { mode: "number" }).notNull(),
    principalDueMinor: bigint("principal_due_minor", { mode: "number" }).notNull().default(0),
    interestDueMinor: bigint("interest_due_minor", { mode: "number" }).notNull().default(0),
    feesDueMinor: bigint("fees_due_minor", { mode: "number" }).notNull().default(0),
    amountPaidMinor: bigint("amount_paid_minor", { mode: "number" }).notNull().default(0),
    status: debtInstallmentStatus("status").notNull().default("scheduled"),
    paidAt: timestamp("paid_at", { withTimezone: true, mode: "date" }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("debt_installments_id_debt_user_unique").on(table.id, table.debtId, table.userId),
    uniqueIndex("debt_installments_debt_number_unique").on(table.debtId, table.installmentNumber),
    foreignKey({
      name: "debt_installments_debt_user_fk",
      columns: [table.debtId, table.userId],
      foreignColumns: [debts.id, debts.userId],
    }).onDelete("cascade"),
    index("debt_installments_user_due_status_idx").on(table.userId, table.dueDate, table.status),
    index("debt_installments_debt_due_idx").on(table.debtId, table.dueDate),
    check("debt_installments_scheduled_positive_check", sql`${table.scheduledAmountMinor} > 0`),
    check("debt_installments_principal_nonnegative_check", sql`${table.principalDueMinor} >= 0`),
    check("debt_installments_interest_nonnegative_check", sql`${table.interestDueMinor} >= 0`),
    check("debt_installments_fees_nonnegative_check", sql`${table.feesDueMinor} >= 0`),
    check("debt_installments_paid_nonnegative_check", sql`${table.amountPaidMinor} >= 0`),
  ],
);

export const debtPayments = pgTable(
  "debt_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    debtId: uuid("debt_id").notNull(),
    sourceAccountId: uuid("source_account_id"),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currencyCode: currencyPreference("currency_code").notNull(),
    paymentDate: date("payment_date", { mode: "date" }).notNull(),
    paymentType: debtPaymentType("payment_type").notNull(),
    allocationMethod: debtPaymentAllocationMethod("allocation_method").notNull().default("unapportioned"),
    referenceNumber: text("reference_number"),
    description: text("description").notNull(),
    notes: text("notes"),
    status: debtPaymentStatus("status").notNull().default("posted"),
    reversalOfPaymentId: uuid("reversal_of_payment_id"),
    reversedByPaymentId: uuid("reversed_by_payment_id"),
    linkedAccountTransactionId: uuid("linked_account_transaction_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    createdBy: transactionCreatedBy("created_by").notNull().default("user"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("debt_payments_id_user_debt_unique").on(table.id, table.userId, table.debtId),
    uniqueIndex("debt_payments_id_user_unique").on(table.id, table.userId),
    uniqueIndex("debt_payments_user_idempotency_unique").on(table.userId, table.idempotencyKey),
    uniqueIndex("debt_payments_reversal_of_unique").on(table.reversalOfPaymentId),
    uniqueIndex("debt_payments_reversed_by_unique").on(table.reversedByPaymentId),
    uniqueIndex("debt_payments_linked_transaction_unique").on(table.linkedAccountTransactionId),
    foreignKey({
      name: "debt_payments_debt_user_fk",
      columns: [table.debtId, table.userId],
      foreignColumns: [debts.id, debts.userId],
    }).onDelete("restrict"),
    foreignKey({
      name: "debt_payments_source_account_user_currency_fk",
      columns: [table.sourceAccountId, table.userId, table.currencyCode],
      foreignColumns: [financialAccounts.id, financialAccounts.userId, financialAccounts.currencyCode],
    }).onDelete("restrict"),
    foreignKey({
      name: "debt_payments_linked_transaction_user_fk",
      columns: [table.linkedAccountTransactionId, table.userId],
      foreignColumns: [accountTransactions.id, accountTransactions.userId],
    }).onDelete("restrict"),
    foreignKey({
      name: "debt_payments_reversal_user_fk",
      columns: [table.reversalOfPaymentId, table.userId, table.debtId],
      foreignColumns: [table.id, table.userId, table.debtId],
    }).onDelete("restrict"),
    foreignKey({
      name: "debt_payments_reversed_by_user_fk",
      columns: [table.reversedByPaymentId, table.userId],
      foreignColumns: [table.id, table.userId],
    }).onDelete("restrict"),
    index("debt_payments_user_date_idx").on(table.userId, table.paymentDate),
    index("debt_payments_user_debt_date_idx").on(table.userId, table.debtId, table.paymentDate),
    index("debt_payments_user_status_idx").on(table.userId, table.status),
    index("debt_payments_source_account_idx").on(table.sourceAccountId),
    check("debt_payments_amount_positive_check", sql`${table.amountMinor} > 0`),
    check("debt_payments_description_nonempty_check", sql`length(trim(${table.description})) > 0`),
    check(
      "debt_payments_reversal_link_check",
      sql`(${table.paymentType} = 'reversal' AND ${table.reversalOfPaymentId} IS NOT NULL) OR (${table.paymentType} <> 'reversal' AND ${table.reversalOfPaymentId} IS NULL)`,
    ),
  ],
);

export const debtPaymentAllocations = pgTable(
  "debt_payment_allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    debtId: uuid("debt_id").notNull(),
    paymentId: uuid("payment_id").notNull(),
    installmentId: uuid("installment_id"),
    principalAmountMinor: bigint("principal_amount_minor", { mode: "number" }).notNull().default(0),
    interestAmountMinor: bigint("interest_amount_minor", { mode: "number" }).notNull().default(0),
    feesAmountMinor: bigint("fees_amount_minor", { mode: "number" }).notNull().default(0),
    adjustmentAmountMinor: bigint("adjustment_amount_minor", { mode: "number" }).notNull().default(0),
    unapportionedAmountMinor: bigint("unapportioned_amount_minor", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "debt_payment_allocations_payment_user_fk",
      columns: [table.paymentId, table.userId, table.debtId],
      foreignColumns: [debtPayments.id, debtPayments.userId, debtPayments.debtId],
    }).onDelete("restrict"),
    foreignKey({
      name: "debt_payment_allocations_installment_debt_user_fk",
      columns: [table.installmentId, table.debtId, table.userId],
      foreignColumns: [debtInstallments.id, debtInstallments.debtId, debtInstallments.userId],
    }).onDelete("restrict"),
    index("debt_payment_allocations_payment_idx").on(table.paymentId),
    index("debt_payment_allocations_installment_idx").on(table.installmentId),
    check("debt_payment_allocations_principal_nonnegative_check", sql`${table.principalAmountMinor} >= 0`),
    check("debt_payment_allocations_interest_nonnegative_check", sql`${table.interestAmountMinor} >= 0`),
    check("debt_payment_allocations_fees_nonnegative_check", sql`${table.feesAmountMinor} >= 0`),
    check("debt_payment_allocations_adjustment_nonnegative_check", sql`${table.adjustmentAmountMinor} >= 0`),
    check("debt_payment_allocations_unapportioned_nonnegative_check", sql`${table.unapportionedAmountMinor} >= 0`),
    check(
      "debt_payment_allocations_nonzero_check",
      sql`${table.principalAmountMinor} + ${table.interestAmountMinor} + ${table.feesAmountMinor} + ${table.adjustmentAmountMinor} + ${table.unapportionedAmountMinor} > 0`,
    ),
  ],
);

export const debtAdjustments = pgTable(
  "debt_adjustments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    debtId: uuid("debt_id").notNull(),
    installmentId: uuid("installment_id"),
    adjustmentType: debtAdjustmentType("adjustment_type").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    effectiveDate: date("effective_date", { mode: "date" }).notNull(),
    reason: text("reason").notNull(),
    notes: text("notes"),
    status: debtAdjustmentStatus("status").notNull().default("posted"),
    reversalOfAdjustmentId: uuid("reversal_of_adjustment_id"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("debt_adjustments_id_debt_user_unique").on(table.id, table.debtId, table.userId),
    uniqueIndex("debt_adjustments_id_user_unique").on(table.id, table.userId),
    uniqueIndex("debt_adjustments_reversal_of_unique").on(table.reversalOfAdjustmentId),
    foreignKey({
      name: "debt_adjustments_debt_user_fk",
      columns: [table.debtId, table.userId],
      foreignColumns: [debts.id, debts.userId],
    }).onDelete("restrict"),
    foreignKey({
      name: "debt_adjustments_installment_debt_user_fk",
      columns: [table.installmentId, table.debtId, table.userId],
      foreignColumns: [debtInstallments.id, debtInstallments.debtId, debtInstallments.userId],
    }).onDelete("restrict"),
    foreignKey({
      name: "debt_adjustments_reversal_user_fk",
      columns: [table.reversalOfAdjustmentId, table.debtId, table.userId],
      foreignColumns: [table.id, table.debtId, table.userId],
    }).onDelete("restrict"),
    index("debt_adjustments_user_debt_date_idx").on(table.userId, table.debtId, table.effectiveDate),
    check("debt_adjustments_amount_positive_check", sql`${table.amountMinor} > 0`),
    check("debt_adjustments_reason_nonempty_check", sql`length(trim(${table.reason})) > 0`),
  ],
);

export const debtInstallmentReschedules = pgTable(
  "debt_installment_reschedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    debtId: uuid("debt_id").notNull(),
    installmentId: uuid("installment_id").notNull(),
    previousDueDate: date("previous_due_date", { mode: "date" }).notNull(),
    newDueDate: date("new_due_date", { mode: "date" }).notNull(),
    reason: text("reason").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "debt_installment_reschedules_installment_debt_user_fk",
      columns: [table.installmentId, table.debtId, table.userId],
      foreignColumns: [debtInstallments.id, debtInstallments.debtId, debtInstallments.userId],
    }).onDelete("restrict"),
    index("debt_installment_reschedules_user_installment_idx").on(table.userId, table.installmentId, table.createdAt),
    check("debt_installment_reschedules_reason_nonempty_check", sql`length(trim(${table.reason})) > 0`),
  ],
);
