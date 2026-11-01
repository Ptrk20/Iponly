import type { CurrencyCode } from "@/types/domain";

export type AnalyticsPeriod =
  | "this-month"
  | "last-month"
  | "last-3-months"
  | "last-6-months"
  | "year-to-date"
  | "this-year"
  | "custom";

export interface AnalyticsDateRange {
  startDate: string;
  endDate: string;
  startInclusive: Date;
  endExclusive: Date;
  timezone: string;
}

export interface CurrencyMetric {
  currencyCode: CurrencyCode;
  amountMinor: number;
}

export interface ComparisonMetric extends CurrencyMetric {
  previousAmountMinor: number;
  absoluteChangeMinor: number;
  percentageChange: number | null;
}

export interface AnalyticsChartPoint {
  period: string;
  amountMinor: number;
}

export interface SavingsAccountAnalytics {
  name: string;
  currencyCode: CurrencyCode;
  balanceMinor: number;
  includedInTotal: boolean;
  archived: boolean;
}

export interface SavingsGoalAnalytics {
  name: string;
  currencyCode: CurrencyCode;
  savedMinor: number;
  targetMinor: number;
  progressPercent: number;
}

export interface CategoryAnalytics {
  name: string;
  color: string;
  currencyCode: CurrencyCode;
  plannedMinor: number;
  spentMinor: number;
  previousSpentMinor: number;
  absoluteChangeMinor: number;
  percentageChange: number | null;
  remainingMinor: number;
  utilizationPercent: number | null;
  overAllocationMinor: number;
}

export interface IncomeSourceAnalytics {
  name: string;
  incomeType: string;
  currencyCode: CurrencyCode;
  plannedMinor: number;
  receivedMinor: number;
}

export interface AnalyticsInsight {
  type: "over-allocation" | "near-allocation" | "savings-change" | "upcoming-debt" | "overdue-debt" | "unallocated-budget";
  severity: "info" | "success" | "warning";
  title: string;
  message: string;
  relatedRoute: string;
}

export interface AnalyticsDashboardData {
  period: AnalyticsPeriod;
  range: AnalyticsDateRange;
  comparisonRange: AnalyticsDateRange;
  savings: {
    balances: CurrencyMetric[];
    change: CurrencyMetric[];
    deposits: CurrencyMetric[];
    withdrawals: CurrencyMetric[];
    accounts: SavingsAccountAnalytics[];
    goals: SavingsGoalAnalytics[];
    trend: Array<{ currencyCode: CurrencyCode; points: AnalyticsChartPoint[] }>;
  };
  budget: {
    plannedIncome: CurrencyMetric[];
    actualIncome: CurrencyMetric[];
    incomeBySource: IncomeSourceAnalytics[];
    allocated: CurrencyMetric[];
    unallocated: CurrencyMetric[];
    actualSpending: CurrencyMetric[];
    savingsContributions: CurrencyMetric[];
    debtPayments: CurrencyMetric[];
    categories: CategoryAnalytics[];
    spendingByCategory: Array<{ name: string; color: string; currencyCode: CurrencyCode; amountMinor: number; percentage: number }>;
    incomeTrend: Array<{ currencyCode: CurrencyCode; points: AnalyticsChartPoint[] }>;
    spendingTrend: Array<{ currencyCode: CurrencyCode; points: AnalyticsChartPoint[] }>;
  };
  debt: {
    outstanding: CurrencyMetric[];
    paid: CurrencyMetric[];
    dueThisMonth: CurrencyMetric[];
    overdue: CurrencyMetric[];
    byPlan: Array<{
      name: string;
      creditor: string | null;
      debtType: string;
      currencyCode: CurrencyCode;
      openingBalanceMinor: number;
      balanceMinor: number;
      amountPaidMinor: number;
      progressPercent: number;
    }>;
    paymentTrend: Array<{ currencyCode: CurrencyCode; points: AnalyticsChartPoint[] }>;
    upcomingInstallments: Array<{
      debtName: string;
      creditor: string | null;
      currencyCode: CurrencyCode;
      dueDate: string;
      amountMinor: number;
      status: string;
    }>;
  };
  travel: {
    planned: CurrencyMetric[];
    actualSpending: CurrencyMetric[];
    byTrip: Array<{
      tripId: string;
      tripName: string;
      destination: string;
      currencyCode: CurrencyCode;
      plannedMinor: number;
      actualMinor: number;
    }>;
    spendingTrend: Array<{ currencyCode: CurrencyCode; points: AnalyticsChartPoint[] }>;
  };
  comparisons: {
    income: ComparisonMetric[];
    spending: ComparisonMetric[];
    savingsChange: ComparisonMetric[];
    debtPayments: ComparisonMetric[];
  };
  insights: AnalyticsInsight[];
}
