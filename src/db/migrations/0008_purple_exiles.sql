CREATE TYPE "public"."planned_travel_expense_status" AS ENUM('planned', 'reserved', 'cancelled', 'converted_to_actual');--> statement-breakpoint
CREATE TYPE "public"."travel_booking_status" AS ENUM('planned', 'booked', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."travel_booking_type" AS ENUM('flight', 'hotel', 'transport', 'activity', 'restaurant', 'insurance', 'other');--> statement-breakpoint
CREATE TYPE "public"."travel_expense_category" AS ENUM('flights', 'accommodation', 'local_transportation', 'food', 'activities', 'shopping', 'insurance', 'visa', 'connectivity', 'emergency', 'other');--> statement-breakpoint
CREATE TYPE "public"."travel_expense_status" AS ENUM('posted', 'reversed');--> statement-breakpoint
CREATE TYPE "public"."travel_itinerary_category" AS ENUM('flight', 'accommodation', 'transport', 'food', 'activity', 'sightseeing', 'shopping', 'free_time', 'other');--> statement-breakpoint
CREATE TYPE "public"."travel_itinerary_status" AS ENUM('planned', 'confirmed', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."travel_packing_category" AS ENUM('documents', 'clothing', 'electronics', 'toiletries', 'medicine', 'money', 'travel_gear', 'other');--> statement-breakpoint
CREATE TYPE "public"."travel_todo_priority" AS ENUM('low', 'normal', 'high');--> statement-breakpoint
CREATE TYPE "public"."travel_todo_status" AS ENUM('pending', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."trip_status" AS ENUM('idea', 'planning', 'booked', 'ongoing', 'completed', 'cancelled');--> statement-breakpoint
ALTER TYPE "public"."budget_expense_source" ADD VALUE 'travel' BEFORE 'system';--> statement-breakpoint
CREATE TABLE "travel_bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"trip_id" uuid NOT NULL,
	"booking_type" "travel_booking_type" DEFAULT 'other' NOT NULL,
	"provider" text,
	"title" text NOT NULL,
	"confirmation_number" text,
	"booking_date" date,
	"start_date_time" timestamp with time zone,
	"end_date_time" timestamp with time zone,
	"amount_minor" bigint,
	"currency_code" "currency_preference",
	"status" "travel_booking_status" DEFAULT 'planned' NOT NULL,
	"link" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "travel_bookings_title_nonempty_check" CHECK (length(trim("travel_bookings"."title")) > 0),
	CONSTRAINT "travel_bookings_amount_nonnegative_check" CHECK ("travel_bookings"."amount_minor" IS NULL OR "travel_bookings"."amount_minor" >= 0),
	CONSTRAINT "travel_bookings_amount_currency_pair_check" CHECK (("travel_bookings"."amount_minor" IS NULL AND "travel_bookings"."currency_code" IS NULL) OR ("travel_bookings"."amount_minor" IS NOT NULL AND "travel_bookings"."currency_code" IS NOT NULL)),
	CONSTRAINT "travel_bookings_datetime_order_check" CHECK ("travel_bookings"."start_date_time" IS NULL OR "travel_bookings"."end_date_time" IS NULL OR "travel_bookings"."end_date_time" >= "travel_bookings"."start_date_time")
);
--> statement-breakpoint
CREATE TABLE "travel_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"trip_id" uuid NOT NULL,
	"planned_expense_id" uuid,
	"category" "travel_expense_category" DEFAULT 'other' NOT NULL,
	"description" text NOT NULL,
	"merchant" text,
	"amount_minor" bigint NOT NULL,
	"currency_code" "currency_preference" NOT NULL,
	"transaction_date" date NOT NULL,
	"linked_account_transaction_id" uuid,
	"notes" text,
	"status" "travel_expense_status" DEFAULT 'posted' NOT NULL,
	"reversal_reason" text,
	"reversed_at" timestamp with time zone,
	"reversal_idempotency_key" text,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "travel_expenses_description_nonempty_check" CHECK (length(trim("travel_expenses"."description")) > 0),
	CONSTRAINT "travel_expenses_amount_positive_check" CHECK ("travel_expenses"."amount_minor" > 0),
	CONSTRAINT "travel_expenses_reversal_fields_check" CHECK (("travel_expenses"."status" = 'reversed' AND length(trim(coalesce("travel_expenses"."reversal_reason", ''))) > 0 AND "travel_expenses"."reversed_at" IS NOT NULL AND "travel_expenses"."reversal_idempotency_key" IS NOT NULL) OR ("travel_expenses"."status" = 'posted' AND "travel_expenses"."reversal_reason" IS NULL AND "travel_expenses"."reversed_at" IS NULL AND "travel_expenses"."reversal_idempotency_key" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "travel_itinerary_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"trip_id" uuid NOT NULL,
	"date" date NOT NULL,
	"start_time" time(0),
	"end_time" time(0),
	"title" text NOT NULL,
	"location" text,
	"category" "travel_itinerary_category" DEFAULT 'other' NOT NULL,
	"description" text,
	"confirmation_reference" text,
	"link" text,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" "travel_itinerary_status" DEFAULT 'planned' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "travel_itinerary_items_title_nonempty_check" CHECK (length(trim("travel_itinerary_items"."title")) > 0),
	CONSTRAINT "travel_itinerary_items_time_order_check" CHECK ("travel_itinerary_items"."start_time" IS NULL OR "travel_itinerary_items"."end_time" IS NULL OR "travel_itinerary_items"."end_time" >= "travel_itinerary_items"."start_time"),
	CONSTRAINT "travel_itinerary_items_sort_order_nonnegative_check" CHECK ("travel_itinerary_items"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "travel_packing_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"trip_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" "travel_packing_category" DEFAULT 'other' NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"packed" boolean DEFAULT false NOT NULL,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "travel_packing_items_name_nonempty_check" CHECK (length(trim("travel_packing_items"."name")) > 0),
	CONSTRAINT "travel_packing_items_quantity_positive_check" CHECK ("travel_packing_items"."quantity" > 0),
	CONSTRAINT "travel_packing_items_sort_order_nonnegative_check" CHECK ("travel_packing_items"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "travel_planned_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"trip_id" uuid NOT NULL,
	"category" "travel_expense_category" DEFAULT 'other' NOT NULL,
	"description" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency_code" "currency_preference" NOT NULL,
	"expected_date" date,
	"notes" text,
	"status" "planned_travel_expense_status" DEFAULT 'planned' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "travel_planned_expenses_description_nonempty_check" CHECK (length(trim("travel_planned_expenses"."description")) > 0),
	CONSTRAINT "travel_planned_expenses_amount_positive_check" CHECK ("travel_planned_expenses"."amount_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "travel_todos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"trip_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"due_date" date,
	"priority" "travel_todo_priority" DEFAULT 'normal' NOT NULL,
	"status" "travel_todo_status" DEFAULT 'pending' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "travel_todos_title_nonempty_check" CHECK (length(trim("travel_todos"."title")) > 0),
	CONSTRAINT "travel_todos_sort_order_nonnegative_check" CHECK ("travel_todos"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"destination" text NOT NULL,
	"country_code" text,
	"start_date" date,
	"end_date" date,
	"traveler_count" integer DEFAULT 1 NOT NULL,
	"base_currency_code" "currency_preference" DEFAULT 'PHP' NOT NULL,
	"total_budget_minor" bigint DEFAULT 0 NOT NULL,
	"linked_savings_goal_id" uuid,
	"status" "trip_status" DEFAULT 'idea' NOT NULL,
	"notes" text,
	"creation_idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	CONSTRAINT "trips_name_nonempty_check" CHECK (length(trim("trips"."name")) > 0),
	CONSTRAINT "trips_destination_nonempty_check" CHECK (length(trim("trips"."destination")) > 0),
	CONSTRAINT "trips_date_order_check" CHECK ("trips"."start_date" IS NULL OR "trips"."end_date" IS NULL OR "trips"."end_date" >= "trips"."start_date"),
	CONSTRAINT "trips_traveler_count_positive_check" CHECK ("trips"."traveler_count" > 0),
	CONSTRAINT "trips_budget_nonnegative_check" CHECK ("trips"."total_budget_minor" >= 0),
	CONSTRAINT "trips_country_code_check" CHECK ("trips"."country_code" IS NULL OR "trips"."country_code" ~ '^[A-Za-z]{2}$')
);
--> statement-breakpoint
ALTER TABLE "budget_expense_transactions" ADD COLUMN "linked_travel_expense_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "account_transactions_id_user_currency_unique" ON "account_transactions" USING btree ("id","user_id","currency_code");--> statement-breakpoint
CREATE UNIQUE INDEX "savings_goals_id_user_currency_unique" ON "savings_goals" USING btree ("id","user_id","currency_code");--> statement-breakpoint
CREATE UNIQUE INDEX "travel_expenses_id_user_currency_unique" ON "travel_expenses" USING btree ("id","user_id","currency_code");--> statement-breakpoint
CREATE UNIQUE INDEX "travel_planned_expenses_id_user_trip_currency_unique" ON "travel_planned_expenses" USING btree ("id","user_id","trip_id","currency_code");--> statement-breakpoint
CREATE UNIQUE INDEX "trips_id_user_unique" ON "trips" USING btree ("id","user_id");--> statement-breakpoint
ALTER TABLE "travel_bookings" ADD CONSTRAINT "travel_bookings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_bookings" ADD CONSTRAINT "travel_bookings_trip_user_fk" FOREIGN KEY ("trip_id","user_id") REFERENCES "public"."trips"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_expenses" ADD CONSTRAINT "travel_expenses_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_expenses" ADD CONSTRAINT "travel_expenses_trip_user_fk" FOREIGN KEY ("trip_id","user_id") REFERENCES "public"."trips"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_expenses" ADD CONSTRAINT "travel_expenses_planned_user_trip_currency_fk" FOREIGN KEY ("planned_expense_id","user_id","trip_id","currency_code") REFERENCES "public"."travel_planned_expenses"("id","user_id","trip_id","currency_code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_expenses" ADD CONSTRAINT "travel_expenses_account_transaction_user_currency_fk" FOREIGN KEY ("linked_account_transaction_id","user_id","currency_code") REFERENCES "public"."account_transactions"("id","user_id","currency_code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_itinerary_items" ADD CONSTRAINT "travel_itinerary_items_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_itinerary_items" ADD CONSTRAINT "travel_itinerary_items_trip_user_fk" FOREIGN KEY ("trip_id","user_id") REFERENCES "public"."trips"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_packing_items" ADD CONSTRAINT "travel_packing_items_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_packing_items" ADD CONSTRAINT "travel_packing_items_trip_user_fk" FOREIGN KEY ("trip_id","user_id") REFERENCES "public"."trips"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_planned_expenses" ADD CONSTRAINT "travel_planned_expenses_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_planned_expenses" ADD CONSTRAINT "travel_planned_expenses_trip_user_fk" FOREIGN KEY ("trip_id","user_id") REFERENCES "public"."trips"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_todos" ADD CONSTRAINT "travel_todos_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_todos" ADD CONSTRAINT "travel_todos_trip_user_fk" FOREIGN KEY ("trip_id","user_id") REFERENCES "public"."trips"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_savings_goal_user_currency_fk" FOREIGN KEY ("linked_savings_goal_id","user_id","base_currency_code") REFERENCES "public"."savings_goals"("id","user_id","currency_code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "travel_bookings_id_user_unique" ON "travel_bookings" USING btree ("id","user_id");--> statement-breakpoint
CREATE INDEX "travel_bookings_user_trip_start_idx" ON "travel_bookings" USING btree ("user_id","trip_id","start_date_time");--> statement-breakpoint
CREATE UNIQUE INDEX "travel_expenses_user_idempotency_unique" ON "travel_expenses" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "travel_expenses_user_reversal_key_unique" ON "travel_expenses" USING btree ("user_id","reversal_idempotency_key") WHERE "travel_expenses"."reversal_idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "travel_expenses_account_transaction_unique" ON "travel_expenses" USING btree ("linked_account_transaction_id") WHERE "travel_expenses"."linked_account_transaction_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "travel_expenses_user_trip_date_idx" ON "travel_expenses" USING btree ("user_id","trip_id","transaction_date");--> statement-breakpoint
CREATE INDEX "travel_expenses_user_status_date_idx" ON "travel_expenses" USING btree ("user_id","status","transaction_date");--> statement-breakpoint
CREATE UNIQUE INDEX "travel_itinerary_items_id_user_unique" ON "travel_itinerary_items" USING btree ("id","user_id");--> statement-breakpoint
CREATE INDEX "travel_itinerary_items_user_trip_date_order_idx" ON "travel_itinerary_items" USING btree ("user_id","trip_id","date","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "travel_packing_items_id_user_unique" ON "travel_packing_items" USING btree ("id","user_id");--> statement-breakpoint
CREATE INDEX "travel_packing_items_user_trip_category_idx" ON "travel_packing_items" USING btree ("user_id","trip_id","category","sort_order");--> statement-breakpoint
CREATE INDEX "travel_planned_expenses_user_trip_status_idx" ON "travel_planned_expenses" USING btree ("user_id","trip_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "travel_todos_id_user_unique" ON "travel_todos" USING btree ("id","user_id");--> statement-breakpoint
CREATE INDEX "travel_todos_user_trip_status_due_idx" ON "travel_todos" USING btree ("user_id","trip_id","status","due_date");--> statement-breakpoint
CREATE UNIQUE INDEX "trips_user_creation_key_unique" ON "trips" USING btree ("user_id","creation_idempotency_key");--> statement-breakpoint
CREATE INDEX "trips_user_status_start_idx" ON "trips" USING btree ("user_id","status","start_date");--> statement-breakpoint
CREATE INDEX "trips_user_archive_start_idx" ON "trips" USING btree ("user_id","archived_at","start_date");--> statement-breakpoint
ALTER TABLE "budget_expense_transactions" ADD CONSTRAINT "budget_expenses_travel_expense_user_currency_fk" FOREIGN KEY ("linked_travel_expense_id","user_id","currency_code") REFERENCES "public"."travel_expenses"("id","user_id","currency_code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "budget_expenses_linked_travel_expense_unique" ON "budget_expense_transactions" USING btree ("linked_travel_expense_id") WHERE "budget_expense_transactions"."linked_travel_expense_id" IS NOT NULL;--> statement-breakpoint