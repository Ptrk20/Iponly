ALTER TABLE "ai_action_audits" DROP CONSTRAINT "ai_action_audits_proposal_id_ai_action_proposals_id_fk";
--> statement-breakpoint
ALTER TABLE "ai_action_audits" ADD CONSTRAINT "ai_action_audits_proposal_owner_fk" FOREIGN KEY ("proposal_id","user_id") REFERENCES "public"."ai_action_proposals"("id","user_id") ON DELETE cascade ON UPDATE no action;