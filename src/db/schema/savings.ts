import {
  boolean,
  check,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  bigint,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { currencyPreference, user } from "./auth";

export const financialAccountType = pgEnum("financial_account_type", [
  "savings",
  "checking",
  "digital_wallet",
  "cash",
  "emergency_fund",
  "travel_fund",
  "other",
]);
export const financialAccountStatus = pgEnum("financial_account_status", ["active", "archived"]);
export const accountTransactionType = pgEnum("account_transaction_type", [
  "opening_balance",
  "deposit",
  "withdrawal",
  "adjustment_increase",
  "adjustment_decrease",
  "transfer_in",
  "transfer_out",
  "reversal",
]);
export const accountTransactionStatus = pgEnum("account_transaction_status", ["posted", "reversed"]);
export const transactionCreatedBy = pgEnum("transaction_created_by", ["user", "system", "assistant"]);
export const savingsGoalStatus = pgEnum("savings_goal_status", ["active", "completed", "archived"]);

export const financialAccounts = pgTable(
  "financial_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    institution: text("institution"),
    accountType: financialAccountType("account_type").notNull(),
    currencyCode: currencyPreference("currency_code").notNull().default("PHP"),
    includeInTotal: boolean("include_in_total").notNull().default(true),
    color: text("color"),
    icon: text("icon"),
    notes: text("notes"),
    status: financialAccountStatus("status").notNull().default("active"),
    creationIdempotencyKey: text("creation_idempotency_key"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    uniqueIndex("financial_accounts_id_user_id_unique").on(table.id, table.userId),
    uniqueIndex("financial_accounts_id_user_currency_unique").on(table.id, table.userId, table.currencyCode),
    uniqueIndex("financial_accounts_user_creation_key_unique").on(table.userId, table.creationIdempotencyKey),
    index("financial_accounts_user_status_created_idx").on(table.userId, table.status, table.createdAt),
    check("financial_accounts_name_nonempty_check", sql`length(trim(${table.name})) > 0`),
  ],
);

export const accountTransactions = pgTable(
  "account_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").notNull(),
    transactionType: accountTransactionType("transaction_type").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currencyCode: currencyPreference("currency_code").notNull(),
    transactionDate: timestamp("transaction_date", { withTimezone: true, mode: "date" }).notNull(),
    description: text("description").notNull(),
    notes: text("notes"),
    reason: text("reason"),
    transferId: uuid("transfer_id"),
    reversalOfTransactionId: uuid("reversal_of_transaction_id"),
    reversedByTransactionId: uuid("reversed_by_transaction_id"),
    status: accountTransactionStatus("status").notNull().default("posted"),
    idempotencyKey: text("idempotency_key"),
    createdBy: transactionCreatedBy("created_by").notNull().default("user"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("account_transactions_id_user_id_unique").on(table.id, table.userId),
    uniqueIndex("account_transactions_user_idempotency_key_unique").on(table.userId, table.idempotencyKey),
    uniqueIndex("account_transactions_reversal_of_unique").on(table.reversalOfTransactionId),
    uniqueIndex("account_transactions_reversed_by_unique").on(table.reversedByTransactionId),
    foreignKey({
      name: "account_transactions_account_user_fk",
      columns: [table.accountId, table.userId, table.currencyCode],
      foreignColumns: [financialAccounts.id, financialAccounts.userId, financialAccounts.currencyCode],
    }).onDelete("restrict"),
    foreignKey({
      name: "account_transactions_reversal_user_fk",
      columns: [table.reversalOfTransactionId, table.userId],
      foreignColumns: [table.id, table.userId],
    }).onDelete("restrict"),
    foreignKey({
      name: "account_transactions_reversed_by_user_fk",
      columns: [table.reversedByTransactionId, table.userId],
      foreignColumns: [table.id, table.userId],
    }).onDelete("restrict"),
    index("account_transactions_user_date_idx").on(table.userId, table.transactionDate),
    index("account_transactions_account_date_idx").on(table.accountId, table.transactionDate),
    index("account_transactions_user_status_idx").on(table.userId, table.status),
    index("account_transactions_transfer_idx").on(table.transferId),
    check("account_transactions_amount_positive_check", sql`${table.amountMinor} > 0`),
    check("account_transactions_description_nonempty_check", sql`length(trim(${table.description})) > 0`),
    check(
      "account_transactions_reason_required_check",
      sql`(${table.transactionType} NOT IN ('adjustment_increase', 'adjustment_decrease', 'reversal')) OR length(trim(coalesce(${table.reason}, ''))) > 0`,
    ),
    check(
      "account_transactions_reversal_link_check",
      sql`(${table.transactionType} = 'reversal' AND ${table.reversalOfTransactionId} IS NOT NULL) OR (${table.transactionType} <> 'reversal' AND ${table.reversalOfTransactionId} IS NULL)`,
    ),
    check(
      "account_transactions_transfer_link_check",
      sql`(${table.transactionType} NOT IN ('transfer_in', 'transfer_out')) OR ${table.transferId} IS NOT NULL`,
    ),
  ],
);

export const savingsGoals = pgTable(
  "savings_goals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    accountId: uuid("account_id"),
    name: text("name").notNull(),
    currencyCode: currencyPreference("currency_code").notNull().default("PHP"),
    targetAmountMinor: bigint("target_amount_minor", { mode: "number" }).notNull(),
    targetDate: timestamp("target_date", { withTimezone: true, mode: "date" }),
    notes: text("notes"),
    status: savingsGoalStatus("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
    archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    foreignKey({
      name: "savings_goals_account_user_fk",
      columns: [table.accountId, table.userId, table.currencyCode],
      foreignColumns: [financialAccounts.id, financialAccounts.userId, financialAccounts.currencyCode],
    }).onDelete("restrict"),
    index("savings_goals_user_status_created_idx").on(table.userId, table.status, table.createdAt),
    index("savings_goals_account_idx").on(table.accountId),
    check("savings_goals_target_positive_check", sql`${table.targetAmountMinor} > 0`),
    check("savings_goals_name_nonempty_check", sql`length(trim(${table.name})) > 0`),
  ],
);
