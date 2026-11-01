ALTER TABLE "debt_adjustments" DROP CONSTRAINT "debt_adjustments_reversal_user_fk";
--> statement-breakpoint
ALTER TABLE "debt_payments" DROP CONSTRAINT "debt_payments_reversal_user_fk";
--> statement-breakpoint
ALTER TABLE "debt_adjustments" ADD CONSTRAINT "debt_adjustments_reversal_user_fk" FOREIGN KEY ("reversal_of_adjustment_id","debt_id","user_id") REFERENCES "public"."debt_adjustments"("id","debt_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_reversal_user_fk" FOREIGN KEY ("reversal_of_payment_id","user_id","debt_id") REFERENCES "public"."debt_payments"("id","user_id","debt_id") ON DELETE restrict ON UPDATE no action;