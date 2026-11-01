CREATE TYPE "public"."debt_adjustment_status" AS ENUM('posted', 'reversed');--> statement-breakpoint
CREATE TYPE "public"."debt_adjustment_type" AS ENUM('balance_increase', 'balance_decrease', 'fee_added', 'interest_added', 'fee_waived', 'interest_waived', 'principal_correction');--> statement-breakpoint
CREATE TYPE "public"."debt_installment_status" AS ENUM('scheduled', 'partially_paid', 'paid', 'overdue', 'waived', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."debt_payment_allocation_method" AS ENUM('unapportioned', 'manual');--> statement-breakpoint
CREATE TYPE "public"."debt_payment_status" AS ENUM('posted', 'reversed');--> statement-breakpoint
CREATE TYPE "public"."debt_payment_type" AS ENUM('regular', 'partial', 'extra', 'payoff', 'adjustment', 'fee_payment', 'reversal');--> statement-breakpoint
CREATE TYPE "public"."debt_recurrence" AS ENUM('one_time', 'weekly', 'biweekly', 'monthly', 'custom');--> statement-breakpoint
CREATE TYPE "public"."debt_status" AS ENUM('draft', 'active', 'paid', 'paused', 'defaulted', 'archived');--> statement-breakpoint
CREATE TYPE "public"."debt_type" AS ENUM('installment', 'credit_card', 'personal_loan', 'housing_loan', 'vehicle_loan', 'buy_now_pay_later', 'family_loan', 'one_time', 'other');--> statement-breakpoint
CREATE TABLE "debt_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"debt_id" uuid NOT NULL,
	"installment_id" uuid,
	"adjustment_type" "debt_adjustment_type" NOT NULL,
	"amount_minor" bigint NOT NULL,
	"effective_date" date NOT NULL,
	"reason" text NOT NULL,
	"notes" text,
	"status" "debt_adjustment_status" DEFAULT 'posted' NOT NULL,
	"reversal_of_adjustment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "debt_adjustments_amount_positive_check" CHECK ("debt_adjustments"."amount_minor" > 0),
	CONSTRAINT "debt_adjustments_reason_nonempty_check" CHECK (length(trim("debt_adjustments"."reason")) > 0)
);
--> statement-breakpoint
CREATE TABLE "debt_installment_reschedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"debt_id" uuid NOT NULL,
	"installment_id" uuid NOT NULL,
	"previous_due_date" date NOT NULL,
	"new_due_date" date NOT NULL,
	"reason" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "debt_installment_reschedules_reason_nonempty_check" CHECK (length(trim("debt_installment_reschedules"."reason")) > 0)
);
--> statement-breakpoint
CREATE TABLE "debt_installments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"debt_id" uuid NOT NULL,
	"installment_number" integer,
	"due_date" date NOT NULL,
	"scheduled_amount_minor" bigint NOT NULL,
	"principal_due_minor" bigint DEFAULT 0 NOT NULL,
	"interest_due_minor" bigint DEFAULT 0 NOT NULL,
	"fees_due_minor" bigint DEFAULT 0 NOT NULL,
	"amount_paid_minor" bigint DEFAULT 0 NOT NULL,
	"status" "debt_installment_status" DEFAULT 'scheduled' NOT NULL,
	"paid_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "debt_installments_scheduled_positive_check" CHECK ("debt_installments"."scheduled_amount_minor" > 0),
	CONSTRAINT "debt_installments_principal_nonnegative_check" CHECK ("debt_installments"."principal_due_minor" >= 0),
	CONSTRAINT "debt_installments_interest_nonnegative_check" CHECK ("debt_installments"."interest_due_minor" >= 0),
	CONSTRAINT "debt_installments_fees_nonnegative_check" CHECK ("debt_installments"."fees_due_minor" >= 0),
	CONSTRAINT "debt_installments_paid_nonnegative_check" CHECK ("debt_installments"."amount_paid_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "debt_payment_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"debt_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"installment_id" uuid,
	"principal_amount_minor" bigint DEFAULT 0 NOT NULL,
	"interest_amount_minor" bigint DEFAULT 0 NOT NULL,
	"fees_amount_minor" bigint DEFAULT 0 NOT NULL,
	"adjustment_amount_minor" bigint DEFAULT 0 NOT NULL,
	"unapportioned_amount_minor" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "debt_payment_allocations_principal_nonnegative_check" CHECK ("debt_payment_allocations"."principal_amount_minor" >= 0),
	CONSTRAINT "debt_payment_allocations_interest_nonnegative_check" CHECK ("debt_payment_allocations"."interest_amount_minor" >= 0),
	CONSTRAINT "debt_payment_allocations_fees_nonnegative_check" CHECK ("debt_payment_allocations"."fees_amount_minor" >= 0),
	CONSTRAINT "debt_payment_allocations_adjustment_nonnegative_check" CHECK ("debt_payment_allocations"."adjustment_amount_minor" >= 0),
	CONSTRAINT "debt_payment_allocations_unapportioned_nonnegative_check" CHECK ("debt_payment_allocations"."unapportioned_amount_minor" >= 0),
	CONSTRAINT "debt_payment_allocations_nonzero_check" CHECK ("debt_payment_allocations"."principal_amount_minor" + "debt_payment_allocations"."interest_amount_minor" + "debt_payment_allocations"."fees_amount_minor" + "debt_payment_allocations"."adjustment_amount_minor" + "debt_payment_allocations"."unapportioned_amount_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "debt_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"debt_id" uuid NOT NULL,
	"source_account_id" uuid,
	"amount_minor" bigint NOT NULL,
	"currency_code" "currency_preference" NOT NULL,
	"payment_date" date NOT NULL,
	"payment_type" "debt_payment_type" NOT NULL,
	"allocation_method" "debt_payment_allocation_method" DEFAULT 'unapportioned' NOT NULL,
	"reference_number" text,
	"description" text NOT NULL,
	"notes" text,
	"status" "debt_payment_status" DEFAULT 'posted' NOT NULL,
	"reversal_of_payment_id" uuid,
	"reversed_by_payment_id" uuid,
	"linked_account_transaction_id" uuid,
	"idempotency_key" text NOT NULL,
	"created_by" "transaction_created_by" DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "debt_payments_amount_positive_check" CHECK ("debt_payments"."amount_minor" > 0),
	CONSTRAINT "debt_payments_description_nonempty_check" CHECK (length(trim("debt_payments"."description")) > 0),
	CONSTRAINT "debt_payments_reversal_link_check" CHECK (("debt_payments"."payment_type" = 'reversal' AND "debt_payments"."reversal_of_payment_id" IS NOT NULL) OR ("debt_payments"."payment_type" <> 'reversal' AND "debt_payments"."reversal_of_payment_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "debts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"creditor" text,
	"debt_type" "debt_type" NOT NULL,
	"currency_code" "currency_preference" DEFAULT 'PHP' NOT NULL,
	"original_principal_minor" bigint NOT NULL,
	"opening_balance_minor" bigint NOT NULL,
	"annual_interest_rate_basis_points" integer,
	"regular_installment_minor" bigint,
	"expected_installment_count" integer,
	"first_due_date" date,
	"maturity_date" date,
	"recurrence" "debt_recurrence" DEFAULT 'one_time' NOT NULL,
	"recurrence_interval" integer DEFAULT 1 NOT NULL,
	"due_day" integer,
	"grace_period_days" integer DEFAULT 0 NOT NULL,
	"reference_number" text,
	"notes" text,
	"status" "debt_status" DEFAULT 'active' NOT NULL,
	"include_in_total" boolean DEFAULT true NOT NULL,
	"creation_idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	CONSTRAINT "debts_name_nonempty_check" CHECK (length(trim("debts"."name")) > 0),
	CONSTRAINT "debts_original_principal_nonnegative_check" CHECK ("debts"."original_principal_minor" >= 0),
	CONSTRAINT "debts_opening_balance_nonnegative_check" CHECK ("debts"."opening_balance_minor" >= 0),
	CONSTRAINT "debts_interest_rate_nonnegative_check" CHECK ("debts"."annual_interest_rate_basis_points" IS NULL OR "debts"."annual_interest_rate_basis_points" >= 0),
	CONSTRAINT "debts_regular_installment_positive_check" CHECK ("debts"."regular_installment_minor" IS NULL OR "debts"."regular_installment_minor" > 0),
	CONSTRAINT "debts_installment_count_positive_check" CHECK ("debts"."expected_installment_count" IS NULL OR "debts"."expected_installment_count" > 0),
	CONSTRAINT "debts_recurrence_interval_positive_check" CHECK ("debts"."recurrence_interval" > 0),
	CONSTRAINT "debts_due_day_range_check" CHECK ("debts"."due_day" IS NULL OR "debts"."due_day" BETWEEN 1 AND 31),
	CONSTRAINT "debts_grace_period_nonnegative_check" CHECK ("debts"."grace_period_days" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "debts_id_user_id_unique" ON "debts" USING btree ("id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "debt_installments_id_debt_user_unique" ON "debt_installments" USING btree ("id","debt_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "debt_payments_id_user_debt_unique" ON "debt_payments" USING btree ("id","user_id","debt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "debt_payments_id_user_unique" ON "debt_payments" USING btree ("id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "debt_adjustments_id_debt_user_unique" ON "debt_adjustments" USING btree ("id","debt_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "debt_adjustments_id_user_unique" ON "debt_adjustments" USING btree ("id","user_id");--> statement-breakpoint
ALTER TABLE "debt_adjustments" ADD CONSTRAINT "debt_adjustments_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_adjustments" ADD CONSTRAINT "debt_adjustments_debt_user_fk" FOREIGN KEY ("debt_id","user_id") REFERENCES "public"."debts"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_adjustments" ADD CONSTRAINT "debt_adjustments_installment_debt_user_fk" FOREIGN KEY ("installment_id","debt_id","user_id") REFERENCES "public"."debt_installments"("id","debt_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_adjustments" ADD CONSTRAINT "debt_adjustments_reversal_user_fk" FOREIGN KEY ("reversal_of_adjustment_id","user_id") REFERENCES "public"."debt_adjustments"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_installment_reschedules" ADD CONSTRAINT "debt_installment_reschedules_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_installment_reschedules" ADD CONSTRAINT "debt_installment_reschedules_installment_debt_user_fk" FOREIGN KEY ("installment_id","debt_id","user_id") REFERENCES "public"."debt_installments"("id","debt_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_installments" ADD CONSTRAINT "debt_installments_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_installments" ADD CONSTRAINT "debt_installments_debt_user_fk" FOREIGN KEY ("debt_id","user_id") REFERENCES "public"."debts"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_payment_allocations" ADD CONSTRAINT "debt_payment_allocations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_payment_allocations" ADD CONSTRAINT "debt_payment_allocations_payment_user_fk" FOREIGN KEY ("payment_id","user_id","debt_id") REFERENCES "public"."debt_payments"("id","user_id","debt_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_payment_allocations" ADD CONSTRAINT "debt_payment_allocations_installment_debt_user_fk" FOREIGN KEY ("installment_id","debt_id","user_id") REFERENCES "public"."debt_installments"("id","debt_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_debt_user_fk" FOREIGN KEY ("debt_id","user_id") REFERENCES "public"."debts"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_source_account_user_currency_fk" FOREIGN KEY ("source_account_id","user_id","currency_code") REFERENCES "public"."financial_accounts"("id","user_id","currency_code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_linked_transaction_user_fk" FOREIGN KEY ("linked_account_transaction_id","user_id") REFERENCES "public"."account_transactions"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_reversal_user_fk" FOREIGN KEY ("reversal_of_payment_id","user_id") REFERENCES "public"."debt_payments"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_reversed_by_user_fk" FOREIGN KEY ("reversed_by_payment_id","user_id") REFERENCES "public"."debt_payments"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debts" ADD CONSTRAINT "debts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "debt_adjustments_reversal_of_unique" ON "debt_adjustments" USING btree ("reversal_of_adjustment_id");--> statement-breakpoint
CREATE INDEX "debt_adjustments_user_debt_date_idx" ON "debt_adjustments" USING btree ("user_id","debt_id","effective_date");--> statement-breakpoint
CREATE INDEX "debt_installment_reschedules_user_installment_idx" ON "debt_installment_reschedules" USING btree ("user_id","installment_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "debt_installments_debt_number_unique" ON "debt_installments" USING btree ("debt_id","installment_number");--> statement-breakpoint
CREATE INDEX "debt_installments_user_due_status_idx" ON "debt_installments" USING btree ("user_id","due_date","status");--> statement-breakpoint
CREATE INDEX "debt_installments_debt_due_idx" ON "debt_installments" USING btree ("debt_id","due_date");--> statement-breakpoint
CREATE INDEX "debt_payment_allocations_payment_idx" ON "debt_payment_allocations" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "debt_payment_allocations_installment_idx" ON "debt_payment_allocations" USING btree ("installment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "debt_payments_user_idempotency_unique" ON "debt_payments" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "debt_payments_reversal_of_unique" ON "debt_payments" USING btree ("reversal_of_payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "debt_payments_reversed_by_unique" ON "debt_payments" USING btree ("reversed_by_payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "debt_payments_linked_transaction_unique" ON "debt_payments" USING btree ("linked_account_transaction_id");--> statement-breakpoint
CREATE INDEX "debt_payments_user_date_idx" ON "debt_payments" USING btree ("user_id","payment_date");--> statement-breakpoint
CREATE INDEX "debt_payments_user_debt_date_idx" ON "debt_payments" USING btree ("user_id","debt_id","payment_date");--> statement-breakpoint
CREATE INDEX "debt_payments_user_status_idx" ON "debt_payments" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "debt_payments_source_account_idx" ON "debt_payments" USING btree ("source_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "debts_user_creation_key_unique" ON "debts" USING btree ("user_id","creation_idempotency_key");--> statement-breakpoint
CREATE INDEX "debts_user_status_created_idx" ON "debts" USING btree ("user_id","status","created_at");--> statement-breakpoint
CREATE INDEX "debts_user_due_date_idx" ON "debts" USING btree ("user_id","first_due_date");--> statement-breakpoint
CREATE INDEX "debts_user_type_idx" ON "debts" USING btree ("user_id","debt_type");