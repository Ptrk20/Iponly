import { addMoney, calculatePercentage, subtractMoney } from "@/lib/money";
import type {
  BudgetCategory,
  Debt,
  FinancialAccount,
  Installment,
  MonthlyBudget,
  TravelExpense,
  Trip,
} from "@/types/domain";

export function summarizeAccounts(accounts: FinancialAccount[]) {
  const currencyCode = accounts[0]?.currencyCode ?? "PHP";
  const balance = accounts.reduce(
    (total, account) =>
      addMoney(total, { amountMinor: account.balanceMinor, currencyCode: account.currencyCode }),
    { amountMinor: 0, currencyCode },
  );

  return { totalSavingsMinor: balance.amountMinor, currencyCode };
}

export function summarizeInstallments(installmentList: Installment[], month: string) {
  const due = installmentList.filter((installment) => installment.dueDate.startsWith(month));
  const currencyCode = due[0]?.currencyCode ?? "PHP";
  const total = due.reduce(
    (amount, installment) =>
      addMoney(amount, { amountMinor: installment.amountMinor, currencyCode: installment.currencyCode }),
    { amountMinor: 0, currencyCode },
  );

  return { dueCount: due.length, dueMinor: total.amountMinor, installments: due };
}

export function getSpendingBreakdown(budget: MonthlyBudget, categories: BudgetCategory[]) {
  const categoryById = new Map(categories.map((category) => [category.id, category]));

  return budget.allocations.flatMap((allocation) => {
    const category = categoryById.get(allocation.categoryId);
    if (!category || allocation.spentMinor <= 0) return [];

    return [{ name: category.name, value: allocation.spentMinor, color: category.color }];
  });
}

export function summarizeBudget(budget: MonthlyBudget) {
  const currencyCode = budget.currencyCode;
  const totalAllocated = budget.allocations.reduce(
    (total, allocation) =>
      addMoney(total, {
        amountMinor: allocation.plannedMinor,
        currencyCode: allocation.currencyCode,
      }),
    { amountMinor: 0, currencyCode },
  );
  const actualSpent = budget.allocations.reduce(
    (total, allocation) =>
      addMoney(total, {
        amountMinor: allocation.spentMinor,
        currencyCode: allocation.currencyCode,
      }),
    { amountMinor: 0, currencyCode },
  );
  const income = { amountMinor: budget.incomeMinor, currencyCode };
  const remaining = subtractMoney(income, actualSpent);
  const unallocated = subtractMoney(income, totalAllocated);

  return {
    totalAllocatedMinor: totalAllocated.amountMinor,
    actualSpentMinor: actualSpent.amountMinor,
    remainingMinor: remaining.amountMinor,
    unallocatedMinor: unallocated.amountMinor,
    utilizationPercent: calculatePercentage(actualSpent.amountMinor, budget.incomeMinor),
  };
}

export function summarizeDebts(debtList: Debt[]) {
  const currencyCode = debtList[0]?.currencyCode ?? "PHP";
  const totalOutstanding = debtList.reduce(
    (total, debt) =>
      addMoney(total, { amountMinor: debt.balanceMinor, currencyCode: debt.currencyCode }),
    { amountMinor: 0, currencyCode },
  );

  return {
    totalOutstandingMinor: totalOutstanding.amountMinor,
    activeCount: debtList.filter((debt) => debt.status === "active").length,
  };
}

export function summarizeTrip(trip: Trip, expenses: TravelExpense[]) {
  const tripExpenses = expenses.filter((expense) => expense.tripId === trip.id);
  const totals = tripExpenses.reduce(
    (summary, expense) => ({
      planned: addMoney(summary.planned, {
        amountMinor: expense.plannedMinor,
        currencyCode: expense.currencyCode,
      }),
      actual: addMoney(summary.actual, {
        amountMinor: expense.actualMinor,
        currencyCode: expense.currencyCode,
      }),
    }),
    {
      planned: { amountMinor: 0, currencyCode: trip.currencyCode },
      actual: { amountMinor: 0, currencyCode: trip.currencyCode },
    },
  );
  const remaining = subtractMoney(
    { amountMinor: trip.budgetMinor, currencyCode: trip.currencyCode },
    totals.actual,
  );

  return {
    plannedMinor: totals.planned.amountMinor,
    actualMinor: totals.actual.amountMinor,
    remainingMinor: remaining.amountMinor,
    utilizationPercent: calculatePercentage(totals.actual.amountMinor, trip.budgetMinor),
  };
}