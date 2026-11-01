import {
  bigint,
  foreignKey,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { currencyPreference, user } from "./auth";

export const aiActionType = pgEnum("ai_action_type", [
  "savings_deposit",
  "savings_withdrawal",
  "account_transfer",
  "budget_expense",
  "budget_income",
  "debt_payment",
  "travel_expense",
  "travel_todo",
  "itinerary_item",
]);

export const aiActionProposalStatus = pgEnum("ai_action_proposal_status", [
  "pending_confirmation",
  "confirmed",
  "executing",
  "completed",
  "cancelled",
  "expired",
  "failed",
  "superseded",
]);

export const aiActionAuditEvent = pgEnum("ai_action_audit_event", [
  "proposed",
  "viewed",
  "confirmed",
  "cancelled",
  "expired",
  "execution_started",
  "completed",
  "failed",
  "superseded",
]);

export const aiActionProposals = pgTable(
  "ai_action_proposals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id"),
    messageId: text("message_id"),
    actionType: aiActionType("action_type").notNull(),
    status: aiActionProposalStatus("status").notNull().default("pending_confirmation"),
    normalizedPayload: jsonb("normalized_payload").notNull(),
    displayPayload: jsonb("display_payload").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true, mode: "date" }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true, mode: "date" }),
    executedAt: timestamp("executed_at", { withTimezone: true, mode: "date" }),
    failedAt: timestamp("failed_at", { withTimezone: true, mode: "date" }),
    failureCode: text("failure_code"),
    resultReferenceType: text("result_reference_type"),
    resultReferenceId: text("result_reference_id"),
    resultPayload: jsonb("result_payload"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("ai_action_proposals_user_id_unique").on(table.id, table.userId),
    uniqueIndex("ai_action_proposals_user_idempotency_unique").on(table.userId, table.idempotencyKey),
    index("ai_action_proposals_user_status_created_idx").on(table.userId, table.status, table.createdAt),
    index("ai_action_proposals_status_expiry_idx").on(table.status, table.expiresAt),
  ],
);

export const aiActionAudits = pgTable(
  "ai_action_audits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    proposalId: uuid("proposal_id").notNull(),
    actionType: aiActionType("action_type").notNull(),
    eventType: aiActionAuditEvent("event_type").notNull(),
    status: aiActionProposalStatus("status").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    amountMinor: bigint("amount_minor", { mode: "number" }),
    currencyCode: currencyPreference("currency_code"),
    errorCode: text("error_code"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "ai_action_audits_proposal_owner_fk",
      columns: [table.proposalId, table.userId],
      foreignColumns: [aiActionProposals.id, aiActionProposals.userId],
    }).onDelete("cascade"),
    index("ai_action_audits_user_created_idx").on(table.userId, table.createdAt),
    index("ai_action_audits_proposal_created_idx").on(table.proposalId, table.createdAt),
  ],
);
