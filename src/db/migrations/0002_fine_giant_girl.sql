CREATE TYPE "public"."account_transaction_status" AS ENUM('posted', 'reversed');--> statement-breakpoint
CREATE TYPE "public"."account_transaction_type" AS ENUM('opening_balance', 'deposit', 'withdrawal', 'adjustment_increase', 'adjustment_decrease', 'transfer_in', 'transfer_out', 'reversal');--> statement-breakpoint
CREATE TYPE "public"."financial_account_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."financial_account_type" AS ENUM('savings', 'checking', 'digital_wallet', 'cash', 'emergency_fund', 'travel_fund', 'other');--> statement-breakpoint
CREATE TYPE "public"."savings_goal_status" AS ENUM('active', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."transaction_created_by" AS ENUM('user', 'system', 'assistant');--> statement-breakpoint
CREATE TABLE "account_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"account_id" uuid NOT NULL,
	"transaction_type" "account_transaction_type" NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency_code" "currency_preference" NOT NULL,
	"transaction_date" timestamp with time zone NOT NULL,
	"description" text NOT NULL,
	"notes" text,
	"reason" text,
	"transfer_id" uuid,
	"reversal_of_transaction_id" uuid,
	"reversed_by_transaction_id" uuid,
	"status" "account_transaction_status" DEFAULT 'posted' NOT NULL,
	"idempotency_key" text,
	"created_by" "transaction_created_by" DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_transactions_amount_positive_check" CHECK ("account_transactions"."amount_minor" > 0),
	CONSTRAINT "account_transactions_description_nonempty_check" CHECK (length(trim("account_transactions"."description")) > 0)
);
--> statement-breakpoint
CREATE TABLE "financial_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"institution" text,
	"account_type" "financial_account_type" NOT NULL,
	"currency_code" "currency_preference" DEFAULT 'PHP' NOT NULL,
	"include_in_total" boolean DEFAULT true NOT NULL,
	"color" text,
	"icon" text,
	"notes" text,
	"status" "financial_account_status" DEFAULT 'active' NOT NULL,
	"creation_idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "financial_accounts_name_nonempty_check" CHECK (length(trim("financial_accounts"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "savings_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"account_id" uuid,
	"name" text NOT NULL,
	"currency_code" "currency_preference" DEFAULT 'PHP' NOT NULL,
	"target_amount_minor" bigint NOT NULL,
	"target_date" timestamp with time zone,
	"notes" text,
	"status" "savings_goal_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	CONSTRAINT "savings_goals_target_positive_check" CHECK ("savings_goals"."target_amount_minor" > 0),
	CONSTRAINT "savings_goals_name_nonempty_check" CHECK (length(trim("savings_goals"."name")) > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "account_transactions_id_user_id_unique" ON "account_transactions" USING btree ("id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "financial_accounts_id_user_id_unique" ON "financial_accounts" USING btree ("id","user_id");--> statement-breakpoint
ALTER TABLE "account_transactions" ADD CONSTRAINT "account_transactions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_transactions" ADD CONSTRAINT "account_transactions_account_user_fk" FOREIGN KEY ("account_id","user_id") REFERENCES "public"."financial_accounts"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_transactions" ADD CONSTRAINT "account_transactions_reversal_user_fk" FOREIGN KEY ("reversal_of_transaction_id","user_id") REFERENCES "public"."account_transactions"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_transactions" ADD CONSTRAINT "account_transactions_reversed_by_user_fk" FOREIGN KEY ("reversed_by_transaction_id","user_id") REFERENCES "public"."account_transactions"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_goals" ADD CONSTRAINT "savings_goals_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_goals" ADD CONSTRAINT "savings_goals_account_user_fk" FOREIGN KEY ("account_id","user_id") REFERENCES "public"."financial_accounts"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_transactions_user_idempotency_key_unique" ON "account_transactions" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "account_transactions_reversal_of_unique" ON "account_transactions" USING btree ("reversal_of_transaction_id");--> statement-breakpoint
CREATE INDEX "account_transactions_user_date_idx" ON "account_transactions" USING btree ("user_id","transaction_date");--> statement-breakpoint
CREATE INDEX "account_transactions_account_date_idx" ON "account_transactions" USING btree ("account_id","transaction_date");--> statement-breakpoint
CREATE INDEX "account_transactions_user_status_idx" ON "account_transactions" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "account_transactions_transfer_idx" ON "account_transactions" USING btree ("transfer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "financial_accounts_user_creation_key_unique" ON "financial_accounts" USING btree ("user_id","creation_idempotency_key");--> statement-breakpoint
CREATE INDEX "financial_accounts_user_status_created_idx" ON "financial_accounts" USING btree ("user_id","status","created_at");--> statement-breakpoint
CREATE INDEX "savings_goals_user_status_created_idx" ON "savings_goals" USING btree ("user_id","status","created_at");--> statement-breakpoint
CREATE INDEX "savings_goals_account_idx" ON "savings_goals" USING btree ("account_id");