CREATE TYPE "public"."budget_category_type" AS ENUM('expense', 'savings', 'debt', 'other');--> statement-breakpoint
CREATE TYPE "public"."budget_expense_source" AS ENUM('manual', 'debt_payment', 'savings_contribution', 'linked_account', 'system');--> statement-breakpoint
CREATE TYPE "public"."budget_expense_status" AS ENUM('posted', 'reversed');--> statement-breakpoint
CREATE TYPE "public"."budget_income_status" AS ENUM('planned', 'received', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."budget_income_type" AS ENUM('salary', 'bonus', 'freelance', 'allowance', 'reimbursement', 'business', 'interest', 'gift', 'other');--> statement-breakpoint
CREATE TYPE "public"."monthly_budget_status" AS ENUM('active', 'closed', 'archived');--> statement-breakpoint
CREATE TABLE "budget_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"budget_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"planned_amount_minor" bigint DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_allocations_planned_nonnegative_check" CHECK ("budget_allocations"."planned_amount_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "budget_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"category_type" "budget_category_type" DEFAULT 'expense' NOT NULL,
	"icon" text,
	"color" text DEFAULT '#6b8f71' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_system_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "budget_categories_name_nonempty_check" CHECK (length(trim("budget_categories"."name")) > 0),
	CONSTRAINT "budget_categories_color_format_check" CHECK ("budget_categories"."color" ~ '^#[0-9a-fA-F]{6}$')
);
--> statement-breakpoint
CREATE TABLE "budget_expense_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"budget_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency_code" "currency_preference" NOT NULL,
	"transaction_date" date NOT NULL,
	"merchant" text,
	"description" text NOT NULL,
	"notes" text,
	"linked_account_transaction_id" uuid,
	"linked_debt_payment_id" uuid,
	"source_type" "budget_expense_source" DEFAULT 'manual' NOT NULL,
	"status" "budget_expense_status" DEFAULT 'posted' NOT NULL,
	"reversal_reason" text,
	"reversed_at" timestamp with time zone,
	"idempotency_key" text NOT NULL,
	"created_by" "transaction_created_by" DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_expenses_amount_positive_check" CHECK ("budget_expense_transactions"."amount_minor" > 0),
	CONSTRAINT "budget_expenses_description_nonempty_check" CHECK (length(trim("budget_expense_transactions"."description")) > 0),
	CONSTRAINT "budget_expenses_reversal_fields_check" CHECK (("budget_expense_transactions"."status" = 'reversed' AND length(trim(coalesce("budget_expense_transactions"."reversal_reason", ''))) > 0 AND "budget_expense_transactions"."reversed_at" IS NOT NULL) OR ("budget_expense_transactions"."status" = 'posted' AND "budget_expense_transactions"."reversal_reason" IS NULL AND "budget_expense_transactions"."reversed_at" IS NULL)),
	CONSTRAINT "budget_expenses_debt_source_link_check" CHECK (("budget_expense_transactions"."source_type" = 'debt_payment' AND "budget_expense_transactions"."linked_debt_payment_id" IS NOT NULL) OR "budget_expense_transactions"."source_type" <> 'debt_payment')
);
--> statement-breakpoint
CREATE TABLE "budget_income_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"budget_id" uuid NOT NULL,
	"name" text NOT NULL,
	"income_type" "budget_income_type" DEFAULT 'other' NOT NULL,
	"planned_amount_minor" bigint DEFAULT 0 NOT NULL,
	"actual_amount_minor" bigint DEFAULT 0 NOT NULL,
	"expected_date" date,
	"received_date" date,
	"notes" text,
	"status" "budget_income_status" DEFAULT 'planned' NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_income_name_nonempty_check" CHECK (length(trim("budget_income_sources"."name")) > 0),
	CONSTRAINT "budget_income_planned_nonnegative_check" CHECK ("budget_income_sources"."planned_amount_minor" >= 0),
	CONSTRAINT "budget_income_actual_nonnegative_check" CHECK ("budget_income_sources"."actual_amount_minor" >= 0),
	CONSTRAINT "budget_income_received_fields_check" CHECK (("budget_income_sources"."status" = 'received' AND "budget_income_sources"."received_date" IS NOT NULL) OR ("budget_income_sources"."status" <> 'received'))
);
--> statement-breakpoint
CREATE TABLE "monthly_budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"currency_code" "currency_preference" DEFAULT 'PHP' NOT NULL,
	"name" text NOT NULL,
	"notes" text,
	"creation_idempotency_key" text NOT NULL,
	"status" "monthly_budget_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "monthly_budgets_year_range_check" CHECK ("monthly_budgets"."year" BETWEEN 1900 AND 2200),
	CONSTRAINT "monthly_budgets_month_range_check" CHECK ("monthly_budgets"."month" BETWEEN 1 AND 12),
	CONSTRAINT "monthly_budgets_name_nonempty_check" CHECK (length(trim("monthly_budgets"."name")) > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "budget_allocations_budget_category_unique" ON "budget_allocations" USING btree ("budget_id","category_id");--> statement-breakpoint
CREATE INDEX "budget_allocations_user_budget_idx" ON "budget_allocations" USING btree ("user_id","budget_id");--> statement-breakpoint
CREATE UNIQUE INDEX "budget_categories_id_user_unique" ON "budget_categories" USING btree ("id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "budget_categories_user_name_unique" ON "budget_categories" USING btree ("user_id",lower("name"));--> statement-breakpoint
CREATE INDEX "budget_categories_user_active_order_idx" ON "budget_categories" USING btree ("user_id","is_active","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "budget_expenses_id_user_unique" ON "budget_expense_transactions" USING btree ("id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "budget_expenses_user_idempotency_unique" ON "budget_expense_transactions" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "budget_expenses_linked_debt_payment_unique" ON "budget_expense_transactions" USING btree ("linked_debt_payment_id") WHERE "budget_expense_transactions"."linked_debt_payment_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "budget_expenses_linked_account_transaction_unique" ON "budget_expense_transactions" USING btree ("linked_account_transaction_id") WHERE "budget_expense_transactions"."linked_account_transaction_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "budget_expenses_user_budget_date_idx" ON "budget_expense_transactions" USING btree ("user_id","budget_id","transaction_date");--> statement-breakpoint
CREATE INDEX "budget_expenses_user_category_date_idx" ON "budget_expense_transactions" USING btree ("user_id","category_id","transaction_date");--> statement-breakpoint
CREATE INDEX "budget_expenses_user_status_date_idx" ON "budget_expense_transactions" USING btree ("user_id","status","transaction_date");--> statement-breakpoint
CREATE INDEX "budget_expenses_source_date_idx" ON "budget_expense_transactions" USING btree ("source_type","transaction_date");--> statement-breakpoint
CREATE UNIQUE INDEX "budget_income_id_user_unique" ON "budget_income_sources" USING btree ("id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "budget_income_user_idempotency_unique" ON "budget_income_sources" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "budget_income_budget_status_idx" ON "budget_income_sources" USING btree ("budget_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "monthly_budgets_id_user_unique" ON "monthly_budgets" USING btree ("id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "monthly_budgets_id_user_currency_unique" ON "monthly_budgets" USING btree ("id","user_id","currency_code");--> statement-breakpoint
CREATE UNIQUE INDEX "monthly_budgets_user_creation_key_unique" ON "monthly_budgets" USING btree ("user_id","creation_idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "monthly_budgets_user_period_currency_unique" ON "monthly_budgets" USING btree ("user_id","year","month","currency_code");--> statement-breakpoint
CREATE INDEX "monthly_budgets_user_period_status_idx" ON "monthly_budgets" USING btree ("user_id","year","month","status");--> statement-breakpoint
ALTER TABLE "budget_allocations" ADD CONSTRAINT "budget_allocations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_allocations" ADD CONSTRAINT "budget_allocations_budget_user_fk" FOREIGN KEY ("budget_id","user_id") REFERENCES "public"."monthly_budgets"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_allocations" ADD CONSTRAINT "budget_allocations_category_user_fk" FOREIGN KEY ("category_id","user_id") REFERENCES "public"."budget_categories"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_categories" ADD CONSTRAINT "budget_categories_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_expense_transactions" ADD CONSTRAINT "budget_expense_transactions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_expense_transactions" ADD CONSTRAINT "budget_expenses_budget_user_currency_fk" FOREIGN KEY ("budget_id","user_id","currency_code") REFERENCES "public"."monthly_budgets"("id","user_id","currency_code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_expense_transactions" ADD CONSTRAINT "budget_expenses_category_user_fk" FOREIGN KEY ("category_id","user_id") REFERENCES "public"."budget_categories"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_expense_transactions" ADD CONSTRAINT "budget_expenses_account_transaction_user_fk" FOREIGN KEY ("linked_account_transaction_id","user_id") REFERENCES "public"."account_transactions"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_expense_transactions" ADD CONSTRAINT "budget_expenses_debt_payment_user_fk" FOREIGN KEY ("linked_debt_payment_id","user_id") REFERENCES "public"."debt_payments"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_income_sources" ADD CONSTRAINT "budget_income_sources_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_income_sources" ADD CONSTRAINT "budget_income_budget_user_fk" FOREIGN KEY ("budget_id","user_id") REFERENCES "public"."monthly_budgets"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_budgets" ADD CONSTRAINT "monthly_budgets_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;