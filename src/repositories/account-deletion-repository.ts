import { and, eq, isNotNull } from "drizzle-orm";
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

export async function deleteUserFinancialData(
  userId: string,
  database: IponlyDatabase = getDatabase(),
) {
  await database.transaction(async (transaction) => {
    await transaction.delete(budgetExpenseTransactions).where(eq(budgetExpenseTransactions.userId, userId));

    await transaction.delete(travelExpenses).where(eq(travelExpenses.userId, userId));
    await transaction.delete(travelPlannedExpenses).where(eq(travelPlannedExpenses.userId, userId));
    await transaction.delete(travelBookings).where(eq(travelBookings.userId, userId));
    await transaction.delete(travelItineraryItems).where(eq(travelItineraryItems.userId, userId));
    await transaction.delete(travelTodos).where(eq(travelTodos.userId, userId));
    await transaction.delete(travelPackingItems).where(eq(travelPackingItems.userId, userId));
    await transaction.delete(trips).where(eq(trips.userId, userId));

    await transaction.delete(budgetAllocations).where(eq(budgetAllocations.userId, userId));
    await transaction.delete(budgetIncomeSources).where(eq(budgetIncomeSources.userId, userId));
    await transaction.delete(budgetCategories).where(eq(budgetCategories.userId, userId));
    await transaction.delete(monthlyBudgets).where(eq(monthlyBudgets.userId, userId));

    await transaction
      .delete(debtAdjustments)
      .where(and(eq(debtAdjustments.userId, userId), isNotNull(debtAdjustments.reversalOfAdjustmentId)));
    await transaction.delete(debtAdjustments).where(eq(debtAdjustments.userId, userId));
    await transaction.delete(debtInstallmentReschedules).where(eq(debtInstallmentReschedules.userId, userId));
    await transaction.delete(debtPaymentAllocations).where(eq(debtPaymentAllocations.userId, userId));
    await transaction
      .update(debtPayments)
      .set({ reversedByPaymentId: null })
      .where(eq(debtPayments.userId, userId));
    await transaction
      .delete(debtPayments)
      .where(and(eq(debtPayments.userId, userId), isNotNull(debtPayments.reversalOfPaymentId)));
    await transaction.delete(debtPayments).where(eq(debtPayments.userId, userId));
    await transaction.delete(debtInstallments).where(eq(debtInstallments.userId, userId));
    await transaction.delete(debts).where(eq(debts.userId, userId));

    await transaction.delete(savingsGoals).where(eq(savingsGoals.userId, userId));
    await transaction
      .update(accountTransactions)
      .set({ reversedByTransactionId: null })
      .where(eq(accountTransactions.userId, userId));
    await transaction
      .delete(accountTransactions)
      .where(and(eq(accountTransactions.userId, userId), isNotNull(accountTransactions.reversalOfTransactionId)));
    await transaction.delete(accountTransactions).where(eq(accountTransactions.userId, userId));
    await transaction.delete(financialAccounts).where(eq(financialAccounts.userId, userId));
  });
}
