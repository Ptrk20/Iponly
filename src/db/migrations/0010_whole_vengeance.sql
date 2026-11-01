CREATE TYPE "public"."travel_member_role" AS ENUM('viewer', 'editor');--> statement-breakpoint
CREATE TABLE "travel_trip_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" "travel_member_role" DEFAULT 'viewer' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "share_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "share_code" text;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "share_default_role" "travel_member_role" DEFAULT 'viewer' NOT NULL;--> statement-breakpoint
ALTER TABLE "travel_trip_members" ADD CONSTRAINT "travel_trip_members_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_trip_members" ADD CONSTRAINT "travel_trip_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "travel_trip_members_trip_user_unique" ON "travel_trip_members" USING btree ("trip_id","user_id");--> statement-breakpoint
CREATE INDEX "travel_trip_members_user_idx" ON "travel_trip_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trips_share_code_unique" ON "trips" USING btree ("share_code");--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_share_code_check" CHECK ("trips"."share_code" IS NULL OR "trips"."share_code" ~ '^[A-HJ-NP-Z2-9]{8}$');