export type AIActionProposalStatus =
  | "pending_confirmation"
  | "confirmed"
  | "executing"
  | "completed"
  | "cancelled"
  | "expired"
  | "failed"
  | "superseded";
