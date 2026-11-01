import { sql } from "drizzle-orm";
import {
  bigint,
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
} from "drizzle-orm/pg-core";
import { currencyPreference, user } from "./auth";
import { accountTransactions, transactionCreatedBy } from "./savings";
import { debtPayments } from "./debt";
import { travelExpenses } from "./travel";

export const monthlyBudgetStatus = pgEnum("monthly_budget_status", ["active", "closed", "archived"]);
export const budgetIncomeType = pgEnum("budget_income_type", [
  "salary",
  "bonus",
  "freelance",
  "allowance",
  "reimbursement",
  "business",
  "interest",
  "gift",
  "other",
]);
export const budgetIncomeStatus = pgEnum("budget_income_status", ["planned", "received", "cancelled"]);
export const budgetCategoryType = pgEnum("budget_category_type", ["expense", "savings", "debt", "other"]);
export const budgetExpenseSource = pgEnum("budget_expense_source", [
  "manual",
  "debt_payment",
  "savings_contribution",
  "linked_account",
  "travel",
  "system",
]);
export const budgetExpenseStatus = pgEnum("budget_expense_status", ["posted", "reversed"]);

export const monthlyBudgets = pgTable(
  "monthly_budgets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    month: integer("month").notNull(),
    currencyCode: currencyPreference("currency_code").notNull().default("PHP"),
    name: text("name").notNull(),
    notes: text("notes"),
    creationIdempotencyKey: text("creation_idempotency_key").notNull(),
    status: monthlyBudgetStatus("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    uniqueIndex("monthly_budgets_id_user_unique").on(table.id, table.userId),
    uniqueIndex("monthly_budgets_id_user_currency_unique").on(table.id, table.userId, table.currencyCode),
    uniqueIndex("monthly_budgets_user_creation_key_unique").on(table.userId, table.creationIdempotencyKey),
    uniqueIndex("monthly_budgets_user_period_currency_unique").on(table.userId, table.year, table.month, table.currencyCode),
    index("monthly_budgets_user_period_status_idx").on(table.userId, table.year, table.month, table.status),
    check("monthly_budgets_year_range_check", sql`${table.year} BETWEEN 1900 AND 2200`),
    check("monthly_budgets_month_range_check", sql`${table.month} BETWEEN 1 AND 12`),
    check("monthly_budgets_name_nonempty_check", sql`length(trim(${table.name})) > 0`),
  ],
);

export const budgetIncomeSources = pgTable(
  "budget_income_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    budgetId: uuid("budget_id").notNull(),
    name: text("name").notNull(),
    incomeType: budgetIncomeType("income_type").notNull().default("other"),
    plannedAmountMinor: bigint("planned_amount_minor", { mode: "number" }).notNull().default(0),
    actualAmountMinor: bigint("actual_amount_minor", { mode: "number" }).notNull().default(0),
    expectedDate: date("expected_date", { mode: "string" }),
    receivedDate: date("received_date", { mode: "string" }),
    notes: text("notes"),
    status: budgetIncomeStatus("status").notNull().default("planned"),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("budget_income_id_user_unique").on(table.id, table.userId),
    uniqueIndex("budget_income_user_idempotency_unique").on(table.userId, table.idempotencyKey),
    foreignKey({
      name: "budget_income_budget_user_fk",
      columns: [table.budgetId, table.userId],
      foreignColumns: [monthlyBudgets.id, monthlyBudgets.userId],
    }).onDelete("cascade"),
    index("budget_income_budget_status_idx").on(table.budgetId, table.status),
    check("budget_income_name_nonempty_check", sql`length(trim(${table.name})) > 0`),
    check("budget_income_planned_nonnegative_check", sql`${table.plannedAmountMinor} >= 0`),
    check("budget_income_actual_nonnegative_check", sql`${table.actualAmountMinor} >= 0`),
    check(
      "budget_income_received_fields_check",
      sql`(${table.status} = 'received' AND ${table.receivedDate} IS NOT NULL) OR (${table.status} <> 'received')`,
    ),
  ],
);

export const budgetCategories = pgTable(
  "budget_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    categoryType: budgetCategoryType("category_type").notNull().default("expense"),
    icon: text("icon"),
    color: text("color").notNull().default("#6b8f71"),
    sortOrder: integer("sort_order").notNull().default(0),
    isSystemDefault: boolean("is_system_default").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    uniqueIndex("budget_categories_id_user_unique").on(table.id, table.userId),
    uniqueIndex("budget_categories_user_name_unique").on(table.userId, sql`lower(${table.name})`),
    index("budget_categories_user_active_order_idx").on(table.userId, table.isActive, table.sortOrder),
    check("budget_categories_name_nonempty_check", sql`length(trim(${table.name})) > 0`),
    check("budget_categories_color_format_check", sql`${table.color} ~ '^#[0-9a-fA-F]{6}$'`),
  ],
);

export const budgetAllocations = pgTable(
  "budget_allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    budgetId: uuid("budget_id").notNull(),
    categoryId: uuid("category_id").notNull(),
    plannedAmountMinor: bigint("planned_amount_minor", { mode: "number" }).notNull().default(0),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("budget_allocations_budget_category_unique").on(table.budgetId, table.categoryId),
    foreignKey({
      name: "budget_allocations_budget_user_fk",
      columns: [table.budgetId, table.userId],
      foreignColumns: [monthlyBudgets.id, monthlyBudgets.userId],
    }).onDelete("cascade"),
    foreignKey({
      name: "budget_allocations_category_user_fk",
      columns: [table.categoryId, table.userId],
      foreignColumns: [budgetCategories.id, budgetCategories.userId],
    }).onDelete("restrict"),
    index("budget_allocations_user_budget_idx").on(table.userId, table.budgetId),
    check("budget_allocations_planned_nonnegative_check", sql`${table.plannedAmountMinor} >= 0`),
  ],
);

export const budgetExpenseTransactions = pgTable(
  "budget_expense_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    budgetId: uuid("budget_id").notNull(),
    categoryId: uuid("category_id").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currencyCode: currencyPreference("currency_code").notNull(),
    transactionDate: date("transaction_date", { mode: "string" }).notNull(),
    merchant: text("merchant"),
    description: text("description").notNull(),
    notes: text("notes"),
    linkedAccountTransactionId: uuid("linked_account_transaction_id"),
    linkedTravelExpenseId: uuid("linked_travel_expense_id"),
    linkedDebtPaymentId: uuid("linked_debt_payment_id"),
    sourceType: budgetExpenseSource("source_type").notNull().default("manual"),
    status: budgetExpenseStatus("status").notNull().default("posted"),
    reversalReason: text("reversal_reason"),
    reversedAt: timestamp("reversed_at", { withTimezone: true, mode: "date" }),
    reversalIdempotencyKey: text("reversal_idempotency_key"),
    idempotencyKey: text("idempotency_key").notNull(),
    createdBy: transactionCreatedBy("created_by").notNull().default("user"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("budget_expenses_id_user_unique").on(table.id, table.userId),
    uniqueIndex("budget_expenses_user_idempotency_unique").on(table.userId, table.idempotencyKey),
    uniqueIndex("budget_expenses_linked_debt_payment_unique").on(table.linkedDebtPaymentId).where(sql`${table.linkedDebtPaymentId} IS NOT NULL`),
    uniqueIndex("budget_expenses_linked_account_transaction_unique").on(table.linkedAccountTransactionId).where(sql`${table.linkedAccountTransactionId} IS NOT NULL`),
    uniqueIndex("budget_expenses_linked_travel_expense_unique").on(table.linkedTravelExpenseId).where(sql`${table.linkedTravelExpenseId} IS NOT NULL`),
    uniqueIndex("budget_expenses_user_reversal_key_unique").on(table.userId, table.reversalIdempotencyKey).where(sql`${table.reversalIdempotencyKey} IS NOT NULL`),
    foreignKey({
      name: "budget_expenses_budget_user_currency_fk",
      columns: [table.budgetId, table.userId, table.currencyCode],
      foreignColumns: [monthlyBudgets.id, monthlyBudgets.userId, monthlyBudgets.currencyCode],
    }).onDelete("cascade"),
    foreignKey({
      name: "budget_expenses_category_user_fk",
      columns: [table.categoryId, table.userId],
      foreignColumns: [budgetCategories.id, budgetCategories.userId],
    }).onDelete("restrict"),
    foreignKey({
      name: "budget_expenses_account_transaction_user_fk",
      columns: [table.linkedAccountTransactionId, table.userId],
      foreignColumns: [accountTransactions.id, accountTransactions.userId],
    }).onDelete("restrict"),
    foreignKey({
      name: "budget_expenses_debt_payment_user_fk",
      columns: [table.linkedDebtPaymentId, table.userId],
      foreignColumns: [debtPayments.id, debtPayments.userId],
    }).onDelete("restrict"),
    foreignKey({
      name: "budget_expenses_travel_expense_user_currency_fk",
      columns: [table.linkedTravelExpenseId, table.userId, table.currencyCode],
      foreignColumns: [travelExpenses.id, travelExpenses.userId, travelExpenses.currencyCode],
    }).onDelete("restrict"),
    index("budget_expenses_user_budget_date_idx").on(table.userId, table.budgetId, table.transactionDate),
    index("budget_expenses_user_category_date_idx").on(table.userId, table.categoryId, table.transactionDate),
    index("budget_expenses_user_status_date_idx").on(table.userId, table.status, table.transactionDate),
    index("budget_expenses_source_date_idx").on(table.sourceType, table.transactionDate),
    check("budget_expenses_amount_positive_check", sql`${table.amountMinor} > 0`),
    check("budget_expenses_description_nonempty_check", sql`length(trim(${table.description})) > 0`),
    check(
      "budget_expenses_reversal_fields_check",
      sql`(${table.status} = 'reversed' AND length(trim(coalesce(${table.reversalReason}, ''))) > 0 AND ${table.reversedAt} IS NOT NULL AND ${table.reversalIdempotencyKey} IS NOT NULL) OR (${table.status} = 'posted' AND ${table.reversalReason} IS NULL AND ${table.reversedAt} IS NULL AND ${table.reversalIdempotencyKey} IS NULL)`,
    ),
    check(
      "budget_expenses_debt_source_link_check",
      sql`(${table.sourceType} = 'debt_payment' AND ${table.linkedDebtPaymentId} IS NOT NULL) OR ${table.sourceType} <> 'debt_payment'`,
    ),
    check(
      "budget_expenses_travel_source_link_check",
      sql`(${table.sourceType}::text = 'travel' AND ${table.linkedTravelExpenseId} IS NOT NULL) OR (${table.sourceType}::text <> 'travel' AND ${table.linkedTravelExpenseId} IS NULL)`,
    ),
  ],
);
