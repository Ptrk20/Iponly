import type { debtAdjustments, debtInstallments, debtPaymentAllocations, debtPayments, debts } from "@/db/schema/debt";

export type DebtRecord = typeof debts.$inferSelect;
export type DebtInstallmentRecord = typeof debtInstallments.$inferSelect;
export type DebtPaymentRecord = typeof debtPayments.$inferSelect;
export type DebtPaymentAllocationRecord = typeof debtPaymentAllocations.$inferSelect;
export type DebtAdjustmentRecord = typeof debtAdjustments.$inferSelect;

export type DebtStatus = DebtRecord["status"];
export type DebtType = DebtRecord["debtType"];
export type DebtRecurrence = DebtRecord["recurrence"];
export type DebtPaymentType = DebtPaymentRecord["paymentType"];
export type DebtAdjustmentType = DebtAdjustmentRecord["adjustmentType"];

export interface DebtScheduleEntry {
  installmentNumber: number;
  dueDate: string;
  scheduledAmountMinor: number;
}

export interface DebtPaymentAllocationInput {
  installmentId?: string;
  principalAmountMinor: number;
  interestAmountMinor: number;
  feesAmountMinor: number;
  adjustmentAmountMinor: number;
  unapportionedAmountMinor: number;
}
