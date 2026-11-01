import type { CurrencyCode } from "@/types/domain";

export interface BudgetSpendingSource {
  id: string;
  categoryId: string;
  categoryName: string;
  color: string;
  categoryType: "expense" | "savings" | "debt" | "other";
  sourceType: "manual" | "debt_payment" | "savings_contribution" | "linked_account" | "travel" | "system";
  status: "posted" | "reversed";
  linkedDebtPaymentId: string | null;
  linkedTravelExpenseId: string | null;
  date: string;
  amountMinor: number;
  currencyCode: CurrencyCode;
}

export interface DebtPaymentSpendingSource {
  id: string;
  date: string;
  amountMinor: number;
  currencyCode: CurrencyCode;
}

export interface TravelSpendingSource {
  id: string;
  category: string;
  date: string;
  amountMinor: number;
  currencyCode: CurrencyCode;
}

export interface NormalizedSpendingEvent {
  canonicalId: string;
  categoryId: string;
  categoryName: string;
  color: string;
  date: string;
  amountMinor: number;
  currencyCode: CurrencyCode;
}

export function normalizeSpendingEvents(
  budgetExpenses: BudgetSpendingSource[],
  debtPayments: DebtPaymentSpendingSource[],
  travelExpenses: TravelSpendingSource[] = [],
): NormalizedSpendingEvent[] {
  const linkedPaymentIds = new Set(
    budgetExpenses
      .map((expense) => expense.linkedDebtPaymentId)
      .filter((id): id is string => id !== null),
  );
  const linkedTravelExpenseIds = new Set(
    budgetExpenses
      .map((expense) => expense.linkedTravelExpenseId)
      .filter((id): id is string => id !== null),
  );
  const events: NormalizedSpendingEvent[] = budgetExpenses
    .filter((expense) =>
      expense.status === "posted" &&
      expense.sourceType !== "savings_contribution" &&
      expense.categoryType !== "savings",
    )
    .map((expense) => ({
      canonicalId: expense.linkedTravelExpenseId ?? expense.linkedDebtPaymentId ?? expense.id,
      categoryId: expense.categoryId,
      categoryName: expense.categoryName,
      color: expense.color,
      date: expense.date,
      amountMinor: expense.amountMinor,
      currencyCode: expense.currencyCode,
    }));

  for (const payment of debtPayments) {
    if (linkedPaymentIds.has(payment.id)) continue;
    events.push({
      canonicalId: payment.id,
      categoryId: "unlinked-debt-payment",
      categoryName: "Debt Payments",
      color: "var(--chart-debt)",
      date: payment.date,
      amountMinor: payment.amountMinor,
      currencyCode: payment.currencyCode,
    });
  }
  for (const expense of travelExpenses) {
    if (linkedTravelExpenseIds.has(expense.id)) continue;
    events.push({
      canonicalId: expense.id,
      categoryId: `travel:${expense.category}`,
      categoryName: expense.category.replaceAll("_", " "),
      color: "var(--chart-travel)",
      date: expense.date,
      amountMinor: expense.amountMinor,
      currencyCode: expense.currencyCode,
    });
  }
  return events;
}
