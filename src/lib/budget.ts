import { calculatePercentage } from "@/lib/money";
import type { CurrencyCode } from "@/types/domain";
import type { BudgetSummary } from "@/types/budget";

export interface BudgetIncomeAmount {
  plannedAmountMinor: number;
  actualAmountMinor: number;
  status: "planned" | "received" | "cancelled";
}

export interface BudgetAllocationAmount {
  categoryId: string;
  plannedAmountMinor: number;
}

export interface BudgetExpenseAmount {
  categoryId: string;
  amountMinor: number;
  sourceType: "manual" | "debt_payment" | "savings_contribution" | "linked_account" | "travel" | "system";
  status: "posted" | "reversed";
}

function sumSafe(values: number[]) {
  const total = values.reduce((sum, value) => {
    if (!Number.isSafeInteger(value) || value < 0 || !Number.isSafeInteger(sum + value)) {
      throw new RangeError("Budget amounts must be non-negative safe integers.");
    }
    return sum + value;
  }, 0);
  return total;
}

export function calculateBudgetSummary(
  currencyCode: CurrencyCode,
  incomes: BudgetIncomeAmount[],
  allocations: BudgetAllocationAmount[],
  expenses: BudgetExpenseAmount[],
): BudgetSummary {
  const activeIncome = incomes.filter((income) => income.status !== "cancelled");
  const plannedIncomeMinor = sumSafe(activeIncome.map((income) => income.plannedAmountMinor));
  const actualIncomeMinor = sumSafe(
    incomes.filter((income) => income.status === "received").map((income) => income.actualAmountMinor),
  );
  const totalAllocatedMinor = sumSafe(allocations.map((allocation) => allocation.plannedAmountMinor));
  const postedExpenses = expenses.filter((expense) => expense.status === "posted");
  const actualSpentMinor = sumSafe(postedExpenses.map((expense) => expense.amountMinor));
  const savingsContributionMinor = sumSafe(
    postedExpenses.filter((expense) => expense.sourceType === "savings_contribution").map((expense) => expense.amountMinor),
  );
  const debtPaymentMinor = sumSafe(
    postedExpenses.filter((expense) => expense.sourceType === "debt_payment").map((expense) => expense.amountMinor),
  );
  const spentByCategory = new Map<string, number>();
  for (const expense of postedExpenses) {
    const categoryTotal = (spentByCategory.get(expense.categoryId) ?? 0) + expense.amountMinor;
    if (!Number.isSafeInteger(categoryTotal)) throw new RangeError("Budget totals exceed the supported range.");
    spentByCategory.set(expense.categoryId, categoryTotal);
  }

  const categories = allocations.map((allocation) => {
    const spentMinor = spentByCategory.get(allocation.categoryId) ?? 0;
    const remainingMinor = allocation.plannedAmountMinor - spentMinor;
    return {
      categoryId: allocation.categoryId,
      plannedMinor: allocation.plannedAmountMinor,
      spentMinor,
      remainingMinor,
      utilizationPercent: calculatePercentage(spentMinor, allocation.plannedAmountMinor),
      overBudgetMinor: Math.max(0, -remainingMinor),
    };
  });

  for (const [categoryId, spentMinor] of spentByCategory) {
    if (!allocations.some((allocation) => allocation.categoryId === categoryId)) {
      categories.push({
        categoryId,
        plannedMinor: 0,
        spentMinor,
        remainingMinor: -spentMinor,
        utilizationPercent: spentMinor > 0 ? 0 : 0,
        overBudgetMinor: spentMinor,
      });
    }
  }

  return {
    currencyCode,
    plannedIncomeMinor,
    actualIncomeMinor,
    totalAllocatedMinor,
    unallocatedMinor: plannedIncomeMinor - totalAllocatedMinor,
    actualSpentMinor,
    availableFromActualIncomeMinor: actualIncomeMinor - actualSpentMinor,
    savingsContributionMinor,
    debtPaymentMinor,
    utilizationPercent: calculatePercentage(actualSpentMinor, plannedIncomeMinor),
    categories,
  };
}

export function shiftBudgetMonth(year: number, month: number, offset: number) {
  if (!Number.isInteger(year) || year < 1900 || year > 2200 ||
      !Number.isInteger(month) || month < 1 || month > 12 ||
      !Number.isInteger(offset)) {
    throw new RangeError("Enter a valid budget month and month offset.");
  }
  const shifted = year * 12 + month - 1 + offset;
  return { year: Math.floor(shifted / 12), month: ((shifted % 12) + 12) % 12 + 1 };
}
