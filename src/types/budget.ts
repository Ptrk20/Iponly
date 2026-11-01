import type {
  budgetAllocations,
  budgetCategories,
  budgetExpenseTransactions,
  budgetIncomeSources,
  monthlyBudgets,
} from "@/db/schema";
import type { CurrencyCode } from "@/types/domain";

export type MonthlyBudgetRecord = typeof monthlyBudgets.$inferSelect;
export type BudgetIncomeRecord = typeof budgetIncomeSources.$inferSelect;
export type BudgetCategoryRecord = typeof budgetCategories.$inferSelect;
export type BudgetAllocationRecord = typeof budgetAllocations.$inferSelect;
export type BudgetExpenseRecord = typeof budgetExpenseTransactions.$inferSelect;

export interface BudgetCategorySummary {
  categoryId: string;
  plannedMinor: number;
  spentMinor: number;
  remainingMinor: number;
  utilizationPercent: number;
  overBudgetMinor: number;
}

export interface BudgetSummary {
  currencyCode: CurrencyCode;
  plannedIncomeMinor: number;
  actualIncomeMinor: number;
  totalAllocatedMinor: number;
  unallocatedMinor: number;
  actualSpentMinor: number;
  availableFromActualIncomeMinor: number;
  savingsContributionMinor: number;
  debtPaymentMinor: number;
  utilizationPercent: number;
  categories: BudgetCategorySummary[];
}
