export type CurrencyCode = "PHP" | "USD" | "EUR" | "JPY";

export type AccountType = "bank" | "e-wallet" | "cash" | "savings";
export type SavingsAccountType =
  | "savings"
  | "checking"
  | "digital_wallet"
  | "cash"
  | "emergency_fund"
  | "travel_fund"
  | "other";
export type SavingsTransactionType =
  | "opening_balance"
  | "deposit"
  | "withdrawal"
  | "adjustment_increase"
  | "adjustment_decrease"
  | "transfer_in"
  | "transfer_out"
  | "reversal";
export type FinancialAccountStatus = "active" | "archived";
export type SavingsGoalStatus = "active" | "completed" | "archived";

export interface SavingsAccountRecord {
  id: string;
  userId: string;
  name: string;
  institution: string | null;
  accountType: SavingsAccountType;
  currencyCode: CurrencyCode;
  includeInTotal: boolean;
  color: string | null;
  icon: string | null;
  notes: string | null;
  status: FinancialAccountStatus;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
}

export interface SavingsTransactionRecord {
  id: string;
  userId: string;
  accountId: string;
  transactionType: SavingsTransactionType;
  amountMinor: number;
  currencyCode: CurrencyCode;
  transactionDate: Date;
  description: string;
  notes: string | null;
  reason: string | null;
  transferId: string | null;
  reversalOfTransactionId: string | null;
  reversedByTransactionId: string | null;
  status: "posted" | "reversed";
  idempotencyKey: string | null;
  createdBy: "user" | "system" | "assistant";
  createdAt: Date;
  updatedAt: Date;
}

export interface SavingsGoalRecord {
  id: string;
  userId: string;
  accountId: string | null;
  name: string;
  currencyCode: CurrencyCode;
  targetAmountMinor: number;
  targetDate: Date | null;
  notes: string | null;
  status: SavingsGoalStatus;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  archivedAt: Date | null;
}

export type AccountTransactionType =
  | "income"
  | "expense"
  | "savings"
  | "debt-payment"
  | "adjustment"
  | "transfer";

export interface FinancialAccount {
  id: string;
  name: string;
  institution: string;
  accountType: AccountType;
  balanceMinor: number;
  currencyCode: CurrencyCode;
  goalId?: string;
}

export interface AccountTransaction {
  id: string;
  accountId: string;
  description: string;
  type: AccountTransactionType;
  amountMinor: number;
  currencyCode: CurrencyCode;
  occurredAt: string;
}

export interface SavingsGoal {
  id: string;
  name: string;
  targetMinor: number;
  savedMinor: number;
  currencyCode: CurrencyCode;
  targetDate: string;
}

export type DebtStatus = "active" | "paid" | "overdue" | "paused" | "archived";

export interface Debt {
  id: string;
  name: string;
  creditor: string;
  originalAmountMinor: number;
  balanceMinor: number;
  installmentAmountMinor: number;
  remainingInstallments: number;
  currencyCode: CurrencyCode;
  nextDueDate: string;
  status: DebtStatus;
}

export type InstallmentStatus = "upcoming" | "due" | "paid" | "overdue";

export interface Installment {
  id: string;
  debtId: string;
  dueDate: string;
  amountMinor: number;
  currencyCode: CurrencyCode;
  status: InstallmentStatus;
}

export interface BudgetCategory {
  id: string;
  name: string;
  color: string;
}

export interface BudgetAllocation {
  id: string;
  categoryId: string;
  plannedMinor: number;
  spentMinor: number;
  currencyCode: CurrencyCode;
}

export interface MonthlyBudget {
  id: string;
  month: string;
  incomeMinor: number;
  currencyCode: CurrencyCode;
  allocations: BudgetAllocation[];
}

export interface ExpenseTransaction {
  id: string;
  description: string;
  categoryId: string;
  amountMinor: number;
  currencyCode: CurrencyCode;
  occurredAt: string;
}

export type TripStatus =
  | "idea"
  | "planning"
  | "booked"
  | "ongoing"
  | "completed"
  | "cancelled";

export interface Trip {
  id: string;
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
  travelers: number;
  currencyCode: CurrencyCode;
  budgetMinor: number;
  status: TripStatus;
  notes: string;
}

export interface TravelExpense {
  id: string;
  tripId: string;
  name: string;
  category: string;
  plannedMinor: number;
  actualMinor: number;
  currencyCode: CurrencyCode;
  monthlyBudgetCategoryId?: string;
}

export interface TravelTodo {
  id: string;
  tripId: string;
  title: string;
  dueDate?: string;
  completed: boolean;
  list: "to-do" | "packing";
}

export interface ItineraryItem {
  id: string;
  tripId: string;
  date: string;
  time: string;
  title: string;
  location: string;
  notes?: string;
}

export interface DemoProfile {
  firstName: string;
  fullName: string;
  email: string;
}