import { majorToMinor } from "@/lib/money";
import type {
  AccountTransaction,
  BudgetCategory,
  Debt,
  DemoProfile,
  ExpenseTransaction,
  FinancialAccount,
  Installment,
  ItineraryItem,
  MonthlyBudget,
  SavingsGoal,
  TravelExpense,
  TravelTodo,
  Trip,
} from "@/types/domain";

const php = (amount: string) => majorToMinor(amount, "PHP");

export const demoProfile: DemoProfile = {
  firstName: "Patrick",
  fullName: "Patrick Reyes",
  email: "patrick@example.test",
};

export const savingsGoals: SavingsGoal[] = [
  {
    id: "goal-emergency",
    name: "Emergency fund",
    targetMinor: php("100000"),
    savedMinor: php("68500"),
    currencyCode: "PHP",
    targetDate: "2027-06-30",
  },
  {
    id: "goal-japan",
    name: "Japan 2027",
    targetMinor: php("160000"),
    savedMinor: php("42000"),
    currencyCode: "PHP",
    targetDate: "2027-03-01",
  },
];

export const financialAccounts: FinancialAccount[] = [
  {
    id: "account-bdo",
    name: "BDO Savings",
    institution: "BDO Unibank",
    accountType: "bank",
    balanceMinor: php("78500"),
    currencyCode: "PHP",
  },
  {
    id: "account-maya",
    name: "Maya Savings",
    institution: "Maya",
    accountType: "e-wallet",
    balanceMinor: php("25000"),
    currencyCode: "PHP",
  },
  {
    id: "account-gcash",
    name: "GCash",
    institution: "GCash",
    accountType: "e-wallet",
    balanceMinor: php("6800"),
    currencyCode: "PHP",
  },
  {
    id: "account-emergency",
    name: "Emergency Fund",
    institution: "BDO Unibank",
    accountType: "savings",
    balanceMinor: php("68500"),
    currencyCode: "PHP",
    goalId: "goal-emergency",
  },
  {
    id: "account-travel",
    name: "Travel Fund",
    institution: "Maya",
    accountType: "savings",
    balanceMinor: php("42000"),
    currencyCode: "PHP",
    goalId: "goal-japan",
  },
];

export const accountTransactions: AccountTransaction[] = [
  {
    id: "transaction-salary",
    accountId: "account-bdo",
    description: "Monthly salary",
    type: "income",
    amountMinor: php("50000"),
    currencyCode: "PHP",
    occurredAt: "2026-10-25T09:00:00+08:00",
  },
  {
    id: "transaction-savings",
    accountId: "account-emergency",
    description: "Emergency fund contribution",
    type: "savings",
    amountMinor: php("5000"),
    currencyCode: "PHP",
    occurredAt: "2026-10-24T11:30:00+08:00",
  },
  {
    id: "transaction-groceries",
    accountId: "account-gcash",
    description: "Weekly groceries",
    type: "expense",
    amountMinor: php("2350"),
    currencyCode: "PHP",
    occurredAt: "2026-10-23T16:15:00+08:00",
  },
  {
    id: "transaction-laptop",
    accountId: "account-bdo",
    description: "Laptop installment",
    type: "debt-payment",
    amountMinor: php("5000"),
    currencyCode: "PHP",
    occurredAt: "2026-10-20T08:30:00+08:00",
  },
  {
    id: "transaction-dining",
    accountId: "account-maya",
    description: "Dinner with family",
    type: "expense",
    amountMinor: php("1280"),
    currencyCode: "PHP",
    occurredAt: "2026-10-18T19:00:00+08:00",
  },
];

export const debts: Debt[] = [
  {
    id: "debt-laptop",
    name: "Laptop installment",
    creditor: "Home Credit",
    originalAmountMinor: php("60000"),
    balanceMinor: php("40000"),
    installmentAmountMinor: php("5000"),
    remainingInstallments: 8,
    currencyCode: "PHP",
    nextDueDate: "2026-11-15",
    status: "active",
  },
  {
    id: "debt-phone",
    name: "Smartphone installment",
    creditor: "Home Credit",
    originalAmountMinor: php("40000"),
    balanceMinor: php("15000"),
    installmentAmountMinor: php("2500"),
    remainingInstallments: 6,
    currencyCode: "PHP",
    nextDueDate: "2026-11-21",
    status: "active",
  },
  {
    id: "debt-card",
    name: "Credit card balance",
    creditor: "BPI",
    originalAmountMinor: php("22000"),
    balanceMinor: php("8200"),
    installmentAmountMinor: php("2000"),
    remainingInstallments: 4,
    currencyCode: "PHP",
    nextDueDate: "2026-12-05",
    status: "active",
  },
];

export const installments: Installment[] = [
  {
    id: "installment-laptop-nov",
    debtId: "debt-laptop",
    dueDate: "2026-11-15",
    amountMinor: php("5000"),
    currencyCode: "PHP",
    status: "upcoming",
  },
  {
    id: "installment-phone-nov",
    debtId: "debt-phone",
    dueDate: "2026-11-21",
    amountMinor: php("2500"),
    currencyCode: "PHP",
    status: "upcoming",
  },
  {
    id: "installment-card-dec",
    debtId: "debt-card",
    dueDate: "2026-12-05",
    amountMinor: php("2000"),
    currencyCode: "PHP",
    status: "upcoming",
  },
];

export const budgetCategories: BudgetCategory[] = [
  { id: "housing", name: "Housing", color: "var(--chart-housing)" },
  { id: "utilities", name: "Utilities", color: "var(--chart-utilities)" },
  { id: "groceries", name: "Groceries", color: "var(--chart-groceries)" },
  { id: "transport", name: "Transportation", color: "var(--chart-transport)" },
  { id: "insurance", name: "Insurance", color: "var(--chart-insurance)" },
  { id: "healthcare", name: "Healthcare", color: "var(--chart-healthcare)" },
  { id: "debt-payments", name: "Debt payments", color: "var(--chart-debt)" },
  { id: "savings", name: "Savings", color: "var(--chart-savings)" },
  { id: "family", name: "Family support", color: "var(--chart-family)" },
  { id: "subscriptions", name: "Subscriptions", color: "var(--chart-subscriptions)" },
  { id: "dining", name: "Dining", color: "var(--chart-dining)" },
  { id: "shopping", name: "Shopping", color: "var(--chart-shopping)" },
  { id: "entertainment", name: "Entertainment", color: "var(--chart-entertainment)" },
  { id: "travel", name: "Travel", color: "var(--chart-travel)" },
  { id: "other", name: "Other", color: "var(--chart-other)" },
];

const plannedAmounts = [
  "10000",
  "2500",
  "7000",
  "3500",
  "2000",
  "1000",
  "6000",
  "5000",
  "3000",
  "1000",
  "2000",
  "1000",
  "1000",
  "2000",
  "1000",
];

const spentAmounts = [
  "10000",
  "1800",
  "5600",
  "2100",
  "2000",
  "500",
  "5000",
  "0",
  "3000",
  "1000",
  "1800",
  "500",
  "300",
  "900",
  "250",
];

export const monthlyBudget: MonthlyBudget = {
  id: "budget-2026-10",
  month: "2026-10",
  incomeMinor: php("50000"),
  currencyCode: "PHP",
  allocations: budgetCategories.map((category, index) => ({
    id: `allocation-${category.id}`,
    categoryId: category.id,
    plannedMinor: php(plannedAmounts[index]),
    spentMinor: php(spentAmounts[index]),
    currencyCode: "PHP",
  })),
};

export const expenseTransactions: ExpenseTransaction[] = [
  { id: "expense-rent", description: "Monthly rent", categoryId: "housing", amountMinor: php("10000"), currencyCode: "PHP", occurredAt: "2026-10-01" },
  { id: "expense-groceries", description: "Weekly groceries", categoryId: "groceries", amountMinor: php("2350"), currencyCode: "PHP", occurredAt: "2026-10-03" },
  { id: "expense-power", description: "Electricity bill", categoryId: "utilities", amountMinor: php("1800"), currencyCode: "PHP", occurredAt: "2026-10-04" },
  { id: "expense-transit", description: "Commute reload", categoryId: "transport", amountMinor: php("850"), currencyCode: "PHP", occurredAt: "2026-10-05" },
  { id: "expense-dinner", description: "Dinner with family", categoryId: "dining", amountMinor: php("1280"), currencyCode: "PHP", occurredAt: "2026-10-06" },
];

export const japanTrip: Trip = {
  id: "trip-japan-2027",
  name: "Japan 2027",
  destination: "Tokyo, Japan",
  startDate: "2027-03-12",
  endDate: "2027-03-20",
  travelers: 2,
  currencyCode: "PHP",
  budgetMinor: php("160000"),
  status: "planning",
  notes: "Spring trip with a Tokyo stay and a day trip to Hakone.",
};

export const trips: Trip[] = [japanTrip];

export const travelExpenses: TravelExpense[] = [
  { id: "travel-flight", tripId: japanTrip.id, name: "Round-trip flights", category: "Flights", plannedMinor: php("42000"), actualMinor: php("0"), currencyCode: "PHP" },
  { id: "travel-hotel", tripId: japanTrip.id, name: "Tokyo hotel deposit", category: "Accommodation", plannedMinor: php("36000"), actualMinor: php("12000"), currencyCode: "PHP" },
  { id: "travel-transit", tripId: japanTrip.id, name: "Local transportation", category: "Transportation", plannedMinor: php("12000"), actualMinor: php("0"), currencyCode: "PHP" },
  { id: "travel-food", tripId: japanTrip.id, name: "Food and coffee", category: "Food", plannedMinor: php("20000"), actualMinor: php("0"), currencyCode: "PHP" },
  { id: "travel-activities", tripId: japanTrip.id, name: "Activities and entry", category: "Activities", plannedMinor: php("12000"), actualMinor: php("0"), currencyCode: "PHP" },
  { id: "travel-insurance", tripId: japanTrip.id, name: "Travel insurance", category: "Insurance", plannedMinor: php("8000"), actualMinor: php("0"), currencyCode: "PHP" },
];

export const itineraryItems: ItineraryItem[] = [
  { id: "itinerary-day-1", tripId: japanTrip.id, date: "2027-03-12", time: "15:00", title: "Arrival and hotel check-in", location: "Shinjuku, Tokyo", notes: "Leave the evening open after the flight." },
  { id: "itinerary-day-2", tripId: japanTrip.id, date: "2027-03-13", time: "09:00", title: "Tokyo neighbourhoods", location: "Asakusa and Ueno", notes: "Keep the afternoon flexible." },
  { id: "itinerary-day-3", tripId: japanTrip.id, date: "2027-03-14", time: "08:30", title: "Day trip to Hakone", location: "Hakone, Kanagawa", notes: "Check the weather before booking transit." },
];

export const travelTodos: TravelTodo[] = [
  { id: "todo-passport", tripId: japanTrip.id, title: "Check passport expiry dates", dueDate: "2026-12-01", completed: true, list: "to-do" },
  { id: "todo-hotel", tripId: japanTrip.id, title: "Compare hotel options in Shinjuku", dueDate: "2026-11-15", completed: false, list: "to-do" },
  { id: "packing-adapter", tripId: japanTrip.id, title: "Universal travel adapter", completed: false, list: "packing" },
  { id: "packing-meds", tripId: japanTrip.id, title: "Personal medication", completed: false, list: "packing" },
];

export const monthlyFinancialTrend = [
  { month: "May", income: php("48000"), spending: php("32900"), savings: php("142000") },
  { month: "Jun", income: php("50000"), spending: php("34600"), savings: php("151500") },
  { month: "Jul", income: php("50000"), spending: php("31800"), savings: php("164000") },
  { month: "Aug", income: php("50000"), spending: php("36750"), savings: php("178200") },
  { month: "Sep", income: php("50000"), spending: php("34750"), savings: php("198300") },
  { month: "Oct", income: php("50000"), spending: php("34750"), savings: php("220800") },
];