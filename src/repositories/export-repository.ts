import { eq } from "drizzle-orm";
import { getDatabase, type IponlyDatabase } from "@/db";
import {
  accountTransactions,
  budgetAllocations,
  budgetCategories,
  budgetExpenseTransactions,
  budgetIncomeSources,
  debtAdjustments,
  debtInstallmentReschedules,
  debtInstallments,
  debtPaymentAllocations,
  debtPayments,
  debts,
  financialAccounts,
  monthlyBudgets,
  savingsGoals,
  travelBookings,
  travelExpenses,
  travelItineraryItems,
  travelPackingItems,
  travelPlannedExpenses,
  travelTodos,
  trips,
} from "@/db/schema";

export async function getFinancialRecordsForExport(
  userId: string,
  database: IponlyDatabase = getDatabase(),
) {
  const [
    accounts,
    transactions,
    goals,
    userDebts,
    installments,
    payments,
    paymentAllocations,
    adjustments,
    reschedules,
    budgets,
    incomeSources,
    categories,
    allocations,
    expenses,
    userTrips,
    plannedTravelExpenses,
    travelExpenseRecords,
    itineraryItems,
    todos,
    packingItems,
    bookings,
  ] = await Promise.all([
    database.select().from(financialAccounts).where(eq(financialAccounts.userId, userId)),
    database.select().from(accountTransactions).where(eq(accountTransactions.userId, userId)),
    database.select().from(savingsGoals).where(eq(savingsGoals.userId, userId)),
    database.select().from(debts).where(eq(debts.userId, userId)),
    database.select().from(debtInstallments).where(eq(debtInstallments.userId, userId)),
    database.select().from(debtPayments).where(eq(debtPayments.userId, userId)),
    database.select().from(debtPaymentAllocations).where(eq(debtPaymentAllocations.userId, userId)),
    database.select().from(debtAdjustments).where(eq(debtAdjustments.userId, userId)),
    database.select().from(debtInstallmentReschedules).where(eq(debtInstallmentReschedules.userId, userId)),
    database.select().from(monthlyBudgets).where(eq(monthlyBudgets.userId, userId)),
    database.select().from(budgetIncomeSources).where(eq(budgetIncomeSources.userId, userId)),
    database.select().from(budgetCategories).where(eq(budgetCategories.userId, userId)),
    database.select().from(budgetAllocations).where(eq(budgetAllocations.userId, userId)),
    database.select().from(budgetExpenseTransactions).where(eq(budgetExpenseTransactions.userId, userId)),
    database.select().from(trips).where(eq(trips.userId, userId)),
    database.select().from(travelPlannedExpenses).where(eq(travelPlannedExpenses.userId, userId)),
    database.select().from(travelExpenses).where(eq(travelExpenses.userId, userId)),
    database.select().from(travelItineraryItems).where(eq(travelItineraryItems.userId, userId)),
    database.select().from(travelTodos).where(eq(travelTodos.userId, userId)),
    database.select().from(travelPackingItems).where(eq(travelPackingItems.userId, userId)),
    database.select().from(travelBookings).where(eq(travelBookings.userId, userId)),
  ]);
  const exportedTrips = userTrips.map((trip) => {
    const { shareCode, ...safeTrip } = trip;
    void shareCode;
    return safeTrip;
  });

  return {
    savings: { accounts, transactions, goals },
    debt: { debts: userDebts, installments, payments, paymentAllocations, adjustments, reschedules },
    budget: { budgets, incomeSources, categories, allocations, expenses },
    travel: {
      trips: exportedTrips,
      plannedExpenses: plannedTravelExpenses,
      expenses: travelExpenseRecords,
      itineraryItems,
      todos,
      packingItems,
      bookings,
    },
  };
}
