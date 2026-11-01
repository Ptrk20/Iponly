CREATE TYPE "public"."ai_action_audit_event" AS ENUM('proposed', 'viewed', 'confirmed', 'cancelled', 'expired', 'execution_started', 'completed', 'failed', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."ai_action_proposal_status" AS ENUM('pending_confirmation', 'confirmed', 'executing', 'completed', 'cancelled', 'expired', 'failed', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."ai_action_type" AS ENUM('savings_deposit', 'savings_withdrawal', 'account_transfer', 'budget_expense', 'budget_income', 'debt_payment', 'travel_expense', 'travel_todo', 'itinerary_item');--> statement-breakpoint
CREATE TABLE "ai_action_audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"proposal_id" uuid NOT NULL,
	"action_type" "ai_action_type" NOT NULL,
	"event_type" "ai_action_audit_event" NOT NULL,
	"status" "ai_action_proposal_status" NOT NULL,
	"target_type" text,
	"target_id" text,
	"amount_minor" bigint,
	"currency_code" "currency_preference",
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_action_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"conversation_id" text,
	"message_id" text,
	"action_type" "ai_action_type" NOT NULL,
	"status" "ai_action_proposal_status" DEFAULT 'pending_confirmation' NOT NULL,
	"normalized_payload" jsonb NOT NULL,
	"display_payload" jsonb NOT NULL,
	"idempotency_key" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"confirmed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"executed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"failure_code" text,
	"result_reference_type" text,
	"result_reference_id" text,
	"result_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "ai_actions_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "travel_itinerary_items" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "travel_todos" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "ai_action_audits" ADD CONSTRAINT "ai_action_audits_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_action_audits" ADD CONSTRAINT "ai_action_audits_proposal_id_ai_action_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."ai_action_proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_action_proposals" ADD CONSTRAINT "ai_action_proposals_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_action_audits_user_created_idx" ON "ai_action_audits" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_action_audits_proposal_created_idx" ON "ai_action_audits" USING btree ("proposal_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_action_proposals_user_id_unique" ON "ai_action_proposals" USING btree ("id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_action_proposals_user_idempotency_unique" ON "ai_action_proposals" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "ai_action_proposals_user_status_created_idx" ON "ai_action_proposals" USING btree ("user_id","status","created_at");--> statement-breakpoint
CREATE INDEX "ai_action_proposals_status_expiry_idx" ON "ai_action_proposals" USING btree ("status","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "travel_itinerary_items_user_idempotency_unique" ON "travel_itinerary_items" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "travel_todos_user_idempotency_unique" ON "travel_todos" USING btree ("user_id","idempotency_key");