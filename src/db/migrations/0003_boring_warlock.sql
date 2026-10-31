ALTER TABLE "account_transactions" DROP CONSTRAINT "account_transactions_account_user_fk";
--> statement-breakpoint
ALTER TABLE "savings_goals" DROP CONSTRAINT "savings_goals_account_user_fk";
--> statement-breakpoint
CREATE UNIQUE INDEX "financial_accounts_id_user_currency_unique" ON "financial_accounts" USING btree ("id","user_id","currency_code");--> statement-breakpoint
ALTER TABLE "account_transactions" ADD CONSTRAINT "account_transactions_account_user_fk" FOREIGN KEY ("account_id","user_id","currency_code") REFERENCES "public"."financial_accounts"("id","user_id","currency_code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_goals" ADD CONSTRAINT "savings_goals_account_user_fk" FOREIGN KEY ("account_id","user_id","currency_code") REFERENCES "public"."financial_accounts"("id","user_id","currency_code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_transactions_reversed_by_unique" ON "account_transactions" USING btree ("reversed_by_transaction_id");--> statement-breakpoint
ALTER TABLE "account_transactions" ADD CONSTRAINT "account_transactions_reason_required_check" CHECK (("account_transactions"."transaction_type" NOT IN ('adjustment_increase', 'adjustment_decrease', 'reversal')) OR length(trim(coalesce("account_transactions"."reason", ''))) > 0);--> statement-breakpoint
ALTER TABLE "account_transactions" ADD CONSTRAINT "account_transactions_reversal_link_check" CHECK (("account_transactions"."transaction_type" = 'reversal' AND "account_transactions"."reversal_of_transaction_id" IS NOT NULL) OR ("account_transactions"."transaction_type" <> 'reversal' AND "account_transactions"."reversal_of_transaction_id" IS NULL));--> statement-breakpoint
ALTER TABLE "account_transactions" ADD CONSTRAINT "account_transactions_transfer_link_check" CHECK (("account_transactions"."transaction_type" NOT IN ('transfer_in', 'transfer_out')) OR "account_transactions"."transfer_id" IS NOT NULL);