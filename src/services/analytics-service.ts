import "server-only";
import { getDatabase, type IponlyDatabase } from "@/db";
import { getBalancesForUser } from "@/repositories/account-repository";
import {
  aggregateSavingsActivity,
  aggregateSavingsBalanceBefore,
  aggregateSavingsBalanceChanges,
  findAnalyticsBudgetDetails,
  findAnalyticsBudgets,
  findAnalyticsDebtPayments,
  findAnalyticsSavingsAccounts,
  findAnalyticsSavingsGoals,
  findAnalyticsTravelData,
} from "@/repositories/analytics-repository";
import { getDebtOverview } from "@/services/debt-service";
import { calculateTotalSavings } from "@/lib/savings";
import { formatMoney } from "@/lib/money";
import { normalizeSpendingEvents } from "@/lib/analytics-events";
import {
  dateKeyInTimezone,
  getComparisonRange,
  percentageChange,
  resolveAnalyticsRange,
  sumSafeMinor,
} from "@/lib/analytics";
import type { CurrencyCode } from "@/types/domain";
import type {
  AnalyticsDateRange,
  AnalyticsDashboardData,
  AnalyticsInsight,
  AnalyticsPeriod,
  ComparisonMetric,
  CurrencyMetric,
} from "@/types/analytics";

type AmountMap = Map<CurrencyCode, number>;

export async function getAnalyticsDashboardData(
  userId: string,
  options: {
    period: AnalyticsPeriod;
    timezone: string;
    defaultCurrencyCode: CurrencyCode;
    now?: Date;
    customStart?: string;
    customEnd?: string;
    database?: IponlyDatabase;
  },
): Promise<AnalyticsDashboardData> {
  const database = options.database ?? getDatabase();
  const now = options.now ?? new Date();
  const range = resolveAnalyticsRange(
    options.period,
    options.timezone,
    now,
    options.customStart,
    options.customEnd,
  );
  const comparisonRange = getComparisonRange(range);
  const fetchRange: AnalyticsDateRange = {
    ...comparisonRange,
    endDate: range.endDate,
    endExclusive: range.endExclusive,
  };
  const [
    accounts,
    goals,
    currentBalances,
    savingsOpening,
    savingsChanges,
    savingsActivity,
    budgets,
    debtOverview,
    debtPayments,
    travelData,
  ] = await Promise.all([
    findAnalyticsSavingsAccounts(userId, database),
    findAnalyticsSavingsGoals(userId, database),
    getBalancesForUser(userId, database),
    aggregateSavingsBalanceBefore(userId, fetchRange, database),
    aggregateSavingsBalanceChanges(userId, fetchRange, range.timezone, database),
    aggregateSavingsActivity(userId, range, database),
    findAnalyticsBudgets(userId, fetchRange, database),
    getDebtOverview(userId, { database, now, timezone: range.timezone }),
    findAnalyticsDebtPayments(userId, fetchRange, database),
    findAnalyticsTravelData(userId, fetchRange, database),
  ]);
  const budgetDetails = await findAnalyticsBudgetDetails(userId, budgets.map((budget) => budget.id), fetchRange, database);
  const balanceByCurrency = calculateTotalSavings(accounts, currentBalances);
  const accountAnalytics = accounts.map((account) => ({
    name: account.name,
    currencyCode: account.currencyCode,
    balanceMinor: currentBalances.get(account.id) ?? 0,
    includedInTotal: account.includeInTotal,
    archived: account.status === "archived",
  }));
  const goalAnalytics = goals.map((goal) => {
    const savedMinor = goal.accountId ? Math.max(0, currentBalances.get(goal.accountId) ?? 0) : 0;
    return {
      name: goal.name,
      currencyCode: goal.currencyCode,
      savedMinor,
      targetMinor: goal.targetAmountMinor,
      progressPercent: goal.targetAmountMinor > 0
        ? Math.min(100, Math.round((savedMinor / goal.targetAmountMinor) * 100))
        : 0,
    };
  });

  const rawSavingsChanges = savingsChanges.map((row) => ({
    period: row.period,
    currencyCode: row.currencyCode,
    amountMinor: safeDatabaseAmount(row.amountMinor),
  }));
  const savingsTrend = makeSavingsTrend(
    range,
    savingsOpening.map((row) => [row.currencyCode, safeDatabaseAmount(row.amountMinor)] as const),
    rawSavingsChanges,
  );
  const selectedSavingsChange = sumGroupedByCurrency(rawSavingsChanges, range);
  const previousSavingsChange = sumGroupedByCurrency(rawSavingsChanges, comparisonRange);
  const depositTotals = new Map<CurrencyCode, number>();
  const withdrawalTotals = new Map<CurrencyCode, number>();
  for (const row of savingsActivity) {
    depositTotals.set(row.currencyCode, safeDatabaseAmount(row.deposits));
    withdrawalTotals.set(row.currencyCode, safeDatabaseAmount(row.withdrawals));
  }

  const selectedBudgetIds = new Set(
    budgets.filter((budget) => monthInRange(budget.year, budget.month, range)).map((budget) => budget.id),
  );
  const budgetById = new Map(budgets.map((budget) => [budget.id, budget]));
  const plannedIncome = new Map<CurrencyCode, number>();
  const allocated = new Map<CurrencyCode, number>();
  const incomeBySource = new Map<string, {
    name: string;
    incomeType: string;
    currencyCode: CurrencyCode;
    plannedMinor: number;
    receivedMinor: number;
  }>();
  for (const income of budgetDetails.incomes) {
    if (!selectedBudgetIds.has(income.budgetId) || income.status === "cancelled") continue;
    const currency = budgetById.get(income.budgetId)?.currencyCode;
    if (!currency) continue;
    addTo(plannedIncome, currency, income.plannedAmountMinor);
    const key = `${currency}:${income.incomeType}:${income.name}`;
    const source = incomeBySource.get(key) ?? {
      name: income.name,
      incomeType: income.incomeType,
      currencyCode: currency,
      plannedMinor: 0,
      receivedMinor: 0,
    };
    source.plannedMinor = sumSafeMinor([source.plannedMinor, income.plannedAmountMinor]);
    incomeBySource.set(key, source);
  }
  for (const { allocation } of budgetDetails.allocations) {
    if (!selectedBudgetIds.has(allocation.budgetId)) continue;
    const currency = budgetById.get(allocation.budgetId)?.currencyCode;
    if (currency) addTo(allocated, currency, allocation.plannedAmountMinor);
  }

  const selectedIncome = new Map<CurrencyCode, number>();
  const previousIncome = new Map<CurrencyCode, number>();
  const incomeByDate: FlowRecord[] = [];
  for (const income of budgetDetails.incomes) {
    if (income.status !== "received" || !income.receivedDate) continue;
    const currency = budgetById.get(income.budgetId)?.currencyCode;
    if (!currency) continue;
    incomeByDate.push({ date: income.receivedDate, currencyCode: currency, amountMinor: income.actualAmountMinor });
    if (dateWithin(income.receivedDate, range)) {
      addTo(selectedIncome, currency, income.actualAmountMinor);
      const key = `${currency}:${income.incomeType}:${income.name}`;
      const source = incomeBySource.get(key) ?? {
        name: income.name,
        incomeType: income.incomeType,
        currencyCode: currency,
        plannedMinor: 0,
        receivedMinor: 0,
      };
      source.receivedMinor = sumSafeMinor([source.receivedMinor, income.actualAmountMinor]);
      incomeBySource.set(key, source);
    }
    if (dateWithin(income.receivedDate, comparisonRange)) addTo(previousIncome, currency, income.actualAmountMinor);
  }

  const selectedSpending = new Map<CurrencyCode, number>();
  const previousSpending = new Map<CurrencyCode, number>();
  const selectedSavingsContributions = new Map<CurrencyCode, number>();
  const categoryPlanned = new Map<string, number>();
  const categorySpent = new Map<string, number>();
  const categoryPreviousSpent = new Map<string, number>();
  const categoryDetails = new Map<string, { name: string; color: string; currencyCode: CurrencyCode }>();
  const expenseByDate: FlowRecord[] = [];
  const normalizedSpending = normalizeSpendingEvents(
    budgetDetails.expenses.map(({ expense, category }) => ({
      id: expense.id,
      categoryId: category.id,
      categoryName: category.name,
      color: category.color,
      categoryType: category.categoryType,
      sourceType: expense.sourceType,
      status: expense.status,
      linkedDebtPaymentId: expense.linkedDebtPaymentId,
      linkedTravelExpenseId: expense.linkedTravelExpenseId,
      date: expense.transactionDate,
      amountMinor: expense.amountMinor,
      currencyCode: expense.currencyCode,
    })),
    debtPayments.filter(({ linkedExpenseId }) => linkedExpenseId === null).map(({ payment }) => ({
      id: payment.id,
      date: dateOnly(payment.paymentDate),
      amountMinor: payment.amountMinor,
      currencyCode: payment.currencyCode,
    })),
    travelData.actual.map(({ expense }) => ({
      id: expense.id,
      category: expense.category,
      date: expense.transactionDate,
      amountMinor: expense.amountMinor,
      currencyCode: expense.currencyCode,
    })),
  );
  const travelPlannedTotals = new Map<CurrencyCode, number>();
  const travelActualTotals = new Map<CurrencyCode, number>();
  const travelByTrip = new Map<string, {
    tripId: string;
    tripName: string;
    destination: string;
    currencyCode: CurrencyCode;
    plannedMinor: number;
    actualMinor: number;
  }>();
  const travelFlow: FlowRecord[] = [];
  for (const { expense, tripId, tripName, destination, tripStartDate } of travelData.planned) {
    const date = expense.expectedDate ?? tripStartDate;
    if (!date || !dateWithin(date, range)) continue;
    addTo(travelPlannedTotals, expense.currencyCode, expense.amountMinor);
    const key = `${tripId}:${expense.currencyCode}`;
    const trip = travelByTrip.get(key) ?? {
      tripId,
      tripName,
      destination,
      currencyCode: expense.currencyCode,
      plannedMinor: 0,
      actualMinor: 0,
    };
    trip.plannedMinor = sumSafeMinor([trip.plannedMinor, expense.amountMinor]);
    travelByTrip.set(key, trip);
  }
  for (const { expense, tripId, tripName, destination } of travelData.actual) {
    if (!dateWithin(expense.transactionDate, range)) continue;
    addTo(travelActualTotals, expense.currencyCode, expense.amountMinor);
    travelFlow.push({ date: expense.transactionDate, currencyCode: expense.currencyCode, amountMinor: expense.amountMinor });
    const key = `${tripId}:${expense.currencyCode}`;
    const trip = travelByTrip.get(key) ?? {
      tripId,
      tripName,
      destination,
      currencyCode: expense.currencyCode,
      plannedMinor: 0,
      actualMinor: 0,
    };
    trip.actualMinor = sumSafeMinor([trip.actualMinor, expense.amountMinor]);
    travelByTrip.set(key, trip);
  }

  for (const { allocation, category } of budgetDetails.allocations) {
    if (!selectedBudgetIds.has(allocation.budgetId)) continue;
    const currencyCode = budgetById.get(allocation.budgetId)?.currencyCode;
    if (!currencyCode) continue;
    const key = `${currencyCode}:${category.name}`;
    addTo(categoryPlanned, key, allocation.plannedAmountMinor);
    categoryDetails.set(key, { name: category.name, color: category.color, currencyCode });
  }

  for (const { expense, category } of budgetDetails.expenses) {
    if (expense.status !== "posted") continue;
    const currencyCode = budgetById.get(expense.budgetId)?.currencyCode;
    if (!currencyCode) continue;
    if (expense.sourceType === "savings_contribution" || category.categoryType === "savings") {
      if (dateWithin(expense.transactionDate, range)) addTo(selectedSavingsContributions, currencyCode, expense.amountMinor);
      continue;
    }
  }

  const selectedDebtPaymentTotals = new Map<CurrencyCode, number>();
  const previousDebtPaymentTotals = new Map<CurrencyCode, number>();
  for (const { payment } of debtPayments) {
    const date = dateOnly(payment.paymentDate);
    if (dateWithin(date, range)) addTo(selectedDebtPaymentTotals, payment.currencyCode, payment.amountMinor);
    if (dateWithin(date, comparisonRange)) addTo(previousDebtPaymentTotals, payment.currencyCode, payment.amountMinor);
  }
  for (const event of normalizedSpending) {
    const key = `${event.currencyCode}:${event.categoryName}`;
    categoryDetails.set(key, { name: event.categoryName, color: event.color, currencyCode: event.currencyCode });
    if (dateWithin(event.date, range)) {
      addTo(selectedSpending, event.currencyCode, event.amountMinor);
      addTo(categorySpent, key, event.amountMinor);
      expenseByDate.push({ date: event.date, currencyCode: event.currencyCode, amountMinor: event.amountMinor });
    } else if (dateWithin(event.date, comparisonRange)) {
      addTo(previousSpending, event.currencyCode, event.amountMinor);
      addTo(categoryPreviousSpent, key, event.amountMinor);
    }
  }

  const categories = [...categoryDetails].map(([key, details]) => {
    const plannedMinor = categoryPlanned.get(key) ?? 0;
    const spentMinor = categorySpent.get(key) ?? 0;
    const previousSpentMinor = categoryPreviousSpent.get(key) ?? 0;
    return {
      ...details,
      plannedMinor,
      spentMinor,
      previousSpentMinor,
      absoluteChangeMinor: spentMinor - previousSpentMinor,
      percentageChange: percentageChange(spentMinor, previousSpentMinor),
      remainingMinor: plannedMinor - spentMinor,
      utilizationPercent: plannedMinor > 0 ? Number(((spentMinor / plannedMinor) * 100).toFixed(1)) : null,
      overAllocationMinor: Math.max(0, spentMinor - plannedMinor),
    };
  }).sort((left, right) => right.spentMinor - left.spentMinor);
  const spendingByCategory = makeSpendingBreakdown(categories);
  const selectedDebtByCurrency = selectedDebtPaymentTotals;
  const previousDebtByCurrency = previousDebtPaymentTotals;
  const insightCards = createInsights(
    categories,
    selectedSavingsChange,
    selectedBudgetIds.size > 0 ? differenceByCurrency(plannedIncome, allocated) : new Map(),
    debtOverview,
    now,
    range.timezone,
  );

  return {
    period: options.period,
    range,
    comparisonRange,
    savings: {
      balances: toMetrics(balanceByCurrency, options.defaultCurrencyCode),
      change: toMetrics(selectedSavingsChange, options.defaultCurrencyCode),
      deposits: toMetrics(depositTotals, options.defaultCurrencyCode),
      withdrawals: toMetrics(withdrawalTotals, options.defaultCurrencyCode),
      accounts: accountAnalytics,
      goals: goalAnalytics,
      trend: savingsTrend,
    },
    budget: {
      plannedIncome: toMetrics(plannedIncome, options.defaultCurrencyCode),
      actualIncome: toMetrics(selectedIncome, options.defaultCurrencyCode),
      incomeBySource: [...incomeBySource.values()]
        .sort((left, right) => left.currencyCode.localeCompare(right.currencyCode) || right.receivedMinor - left.receivedMinor),
      allocated: toMetrics(allocated, options.defaultCurrencyCode),
      unallocated: toMetrics(differenceByCurrency(plannedIncome, allocated), options.defaultCurrencyCode),
      actualSpending: toMetrics(selectedSpending, options.defaultCurrencyCode),
      savingsContributions: toMetrics(selectedSavingsContributions, options.defaultCurrencyCode),
      debtPayments: toMetrics(selectedDebtPaymentTotals, options.defaultCurrencyCode),
      categories,
      spendingByCategory,
      incomeTrend: makeFlowTrend(range, incomeByDate),
      spendingTrend: makeFlowTrend(range, expenseByDate),
    },
    debt: {
      outstanding: toMetrics(debtOverview.totalOutstandingByCurrency, options.defaultCurrencyCode),
      paid: toMetrics(selectedDebtPaymentTotals, options.defaultCurrencyCode),
      dueThisMonth: toMetrics(debtOverview.dueThisMonthByCurrency, options.defaultCurrencyCode),
      overdue: toMetrics(debtOverview.overdueByCurrency, options.defaultCurrencyCode),
      byPlan: debtOverview.debts.map((debt) => ({
        name: debt.name,
        creditor: debt.creditor,
        debtType: debt.debtType,
        currencyCode: debt.currencyCode,
        openingBalanceMinor: debt.openingBalanceMinor,
        balanceMinor: debt.balanceMinor,
        amountPaidMinor: debt.amountPaidMinor,
        progressPercent: debt.progressPercent,
      })),
      paymentTrend: makeFlowTrend(range, debtPayments.map(({ payment }) => ({
        date: dateOnly(payment.paymentDate),
        currencyCode: payment.currencyCode,
        amountMinor: payment.amountMinor,
      }))),
      upcomingInstallments: debtOverview.calendarInstallments
        .filter((installment) => {
          const date = dateOnly(installment.dueDate);
          const today = dateKeyInTimezone(now, range.timezone);
          const withinNextMonth = date <= addDateKeyDays(today, 30);
          return date >= today && withinNextMonth;
        })
        .map((installment) => ({
          debtName: installment.debtName,
          creditor: installment.creditor,
          currencyCode: installment.currencyCode,
          dueDate: dateOnly(installment.dueDate),
          amountMinor: installment.remainingAmountMinor,
          status: installment.status,
        })),
    },
    travel: {
      planned: toMetrics(travelPlannedTotals, options.defaultCurrencyCode),
      actualSpending: toMetrics(travelActualTotals, options.defaultCurrencyCode),
      byTrip: [...travelByTrip.values()]
        .sort((left, right) => left.currencyCode.localeCompare(right.currencyCode) || right.actualMinor - left.actualMinor),
      spendingTrend: makeFlowTrend(range, travelFlow),
    },
    comparisons: {
      income: makeComparison(selectedIncome, previousIncome, options.defaultCurrencyCode),
      spending: makeComparison(selectedSpending, previousSpending, options.defaultCurrencyCode),
      savingsChange: makeComparison(selectedSavingsChange, previousSavingsChange, options.defaultCurrencyCode),
      debtPayments: makeComparison(selectedDebtByCurrency, previousDebtByCurrency, options.defaultCurrencyCode),
    },
    insights: insightCards,
  };
}

interface FlowRecord {
  date: string;
  currencyCode: CurrencyCode;
  amountMinor: number;
}

function makeSavingsTrend(
  selectedRange: AnalyticsDateRange,
  openingRows: Array<readonly [CurrencyCode, number]>,
  changes: Array<{ period: string; currencyCode: CurrencyCode; amountMinor: number }>,
) {
  const opening = new Map(openingRows);
  const selectedChanges = changes.filter((change) => dateWithin(change.period, selectedRange));
  const currencies = new Set<CurrencyCode>([
    ...opening.keys(),
    ...selectedChanges.map((change) => change.currencyCode),
  ]);
  const buckets = rangeBuckets(selectedRange);
  return [...currencies].map((currencyCode) => {
    const beforeSelected = changes
      .filter((change) => change.currencyCode === currencyCode && change.period < selectedRange.startDate)
      .reduce((total, change) => total + change.amountMinor, opening.get(currencyCode) ?? 0);
    let balance = beforeSelected;
    return {
      currencyCode,
      points: buckets.map((bucket) => {
        const change = sumSafeMinor(selectedChanges
          .filter((row) => row.currencyCode === currencyCode && bucketContains(bucket, row.period))
          .map((row) => row.amountMinor));
        balance = sumSafeMinor([balance, change]);
        return { period: bucket, amountMinor: balance };
      }),
    };
  });
}

function makeFlowTrend(range: AnalyticsDateRange, records: FlowRecord[]) {
  const buckets = rangeBuckets(range);
  const selectedRecords = records.filter((record) => dateWithin(record.date, range));
  const currencies = [...new Set(selectedRecords.map((record) => record.currencyCode))];
  return currencies.map((currencyCode) => ({
    currencyCode,
    points: buckets.map((period) => ({
      period,
      amountMinor: sumSafeMinor(selectedRecords
        .filter((record) => record.currencyCode === currencyCode && bucketContains(period, record.date))
        .map((record) => record.amountMinor)),
    })),
  }));
}

function rangeBuckets(range: AnalyticsDateRange): string[] {
  const start = new Date(`${range.startDate}T00:00:00.000Z`);
  const end = new Date(`${range.endDate}T00:00:00.000Z`);
  const days = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const buckets: string[] = [];
  if (days <= 45) {
    for (let day = start; day <= end; day = new Date(day.getTime() + 86_400_000)) buckets.push(dateOnly(day));
  } else {
    let month = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    const finalMonth = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
    while (month <= finalMonth) {
      buckets.push(month.toISOString().slice(0, 7));
      month = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1));
    }
  }
  return buckets;
}

function bucketContains(bucket: string, date: string) {
  return bucket.length === 7 ? date.slice(0, 7) === bucket : date === bucket;
}

function sumGroupedByCurrency(
  rows: Array<{ period: string; currencyCode: CurrencyCode; amountMinor: number }>,
  range: AnalyticsDateRange,
) {
  const totals = new Map<CurrencyCode, number>();
  for (const row of rows) {
    if (dateWithin(row.period, range)) addTo(totals, row.currencyCode, row.amountMinor);
  }
  return totals;
}

function dateWithin(date: string, range: AnalyticsDateRange) {
  return date >= range.startDate && date <= range.endDate;
}

function monthInRange(year: number, month: number, range: AnalyticsDateRange) {
  const key = `${year}-${String(month).padStart(2, "0")}`;
  return key >= range.startDate.slice(0, 7) && key <= range.endDate.slice(0, 7);
}

function makeSpendingBreakdown(categories: AnalyticsDashboardData["budget"]["categories"]) {
  const totals = new Map<CurrencyCode, number>();
  for (const category of categories) addTo(totals, category.currencyCode, category.spentMinor);
  return categories.map((category) => ({
    name: category.name,
    color: category.color,
    currencyCode: category.currencyCode,
    amountMinor: category.spentMinor,
    percentage: (totals.get(category.currencyCode) ?? 0) > 0
      ? Number(((category.spentMinor / (totals.get(category.currencyCode) ?? 1)) * 100).toFixed(1))
      : 0,
  }));
}

function createInsights(
  categories: AnalyticsDashboardData["budget"]["categories"],
  savingsChange: AmountMap,
  unallocated: AmountMap,
  debtOverview: Awaited<ReturnType<typeof getDebtOverview>>,
  now: Date,
  timezone: string,
): AnalyticsInsight[] {
  const insights: AnalyticsInsight[] = [];
  for (const category of categories) {
    if (category.utilizationPercent === null) continue;
    if (category.utilizationPercent >= 100) {
      insights.push({
        type: "over-allocation",
        severity: "warning",
        title: `${category.name} is over allocation`,
        message: `${category.name} spending is ${category.utilizationPercent}% of its planned allocation.`,
        relatedRoute: "/budget",
      });
    } else if (category.utilizationPercent >= 80) {
      insights.push({
        type: "near-allocation",
        severity: "info",
        title: `${category.name} is near allocation`,
        message: `${category.name} spending is ${category.utilizationPercent}% of its planned allocation.`,
        relatedRoute: "/budget",
      });
    }
  }
  for (const [currencyCode, amountMinor] of savingsChange) {
    if (amountMinor === 0) continue;
    insights.push({
      type: "savings-change",
      severity: amountMinor > 0 ? "success" : "info",
      title: amountMinor > 0 ? "Savings accounts increased" : "Savings accounts decreased",
      message: `Tracked savings changed by ${signedMoney(amountMinor, currencyCode)} during the selected period.`,
      relatedRoute: "/savings",
    });
  }
  for (const [currencyCode, amountMinor] of unallocated) {
    if (amountMinor <= 0) continue;
    insights.push({
      type: "unallocated-budget",
      severity: "info",
      title: "Planned income remains unallocated",
      message: `${signedMoney(amountMinor, currencyCode)} of planned income is not allocated.`,
      relatedRoute: "/budget",
    });
  }
  if (debtOverview.overdueInstallments.length > 0) {
    insights.push({
      type: "overdue-debt",
      severity: "warning",
      title: "Overdue installments recorded",
      message: `${debtOverview.overdueInstallments.length} installment${debtOverview.overdueInstallments.length === 1 ? "" : "s"} are currently overdue as of ${dateKeyInTimezone(now, timezone)}.`,
      relatedRoute: "/debt",
    });
  }
  return insights.slice(0, 6);
}

function makeComparison(current: AmountMap, previous: AmountMap, defaultCurrency: CurrencyCode): ComparisonMetric[] {
  const currencies = new Set([...current.keys(), ...previous.keys()]);
  return [...currencies]
    .sort((left, right) => left === defaultCurrency ? -1 : right === defaultCurrency ? 1 : left.localeCompare(right))
    .map((currencyCode) => {
      const amountMinor = current.get(currencyCode) ?? 0;
      const previousAmountMinor = previous.get(currencyCode) ?? 0;
      const absoluteChangeMinor = amountMinor - previousAmountMinor;
      return {
        currencyCode,
        amountMinor,
        previousAmountMinor,
        absoluteChangeMinor,
        percentageChange: percentageChange(amountMinor, previousAmountMinor),
      };
    });
}

function differenceByCurrency(left: AmountMap, right: AmountMap) {
  const result = new Map<CurrencyCode, number>();
  for (const currency of new Set([...left.keys(), ...right.keys()])) {
    result.set(currency, (left.get(currency) ?? 0) - (right.get(currency) ?? 0));
  }
  return result;
}

function toMetrics(values: ReadonlyMap<CurrencyCode, number>, defaultCurrency: CurrencyCode): CurrencyMetric[] {
  return [...values.entries()]
    .filter(([, amountMinor]) => amountMinor !== 0)
    .sort(([left], [right]) => left === defaultCurrency ? -1 : right === defaultCurrency ? 1 : left.localeCompare(right))
    .map(([currencyCode, amountMinor]) => ({ currencyCode, amountMinor }));
}

function addTo(values: Map<CurrencyCode, number>, currency: CurrencyCode, amount: number): void;
function addTo(values: Map<string, number>, currency: string, amount: number): void;
function addTo(values: Map<string, number>, currency: string, amount: number) {
  const total = (values.get(currency) ?? 0) + amount;
  if (!Number.isSafeInteger(total)) throw new RangeError("Analytics totals exceed the supported money range.");
  values.set(currency, total);
}

function safeDatabaseAmount(value: string) {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount)) throw new RangeError("Analytics totals exceed the supported money range.");
  return amount;
}

function signedMoney(amountMinor: number, currencyCode: CurrencyCode) {
  const formatted = formatMoney(Math.abs(amountMinor), currencyCode);
  return `${amountMinor < 0 ? "−" : ""}${formatted}`;
}

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addDateKeyDays(value: string, days: number) {
  return new Date(new Date(`${value}T00:00:00.000Z`).getTime() + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}
