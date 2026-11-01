import { tool } from "ai";
import { z } from "zod";
import { formatMoney } from "@/lib/money";
import { getSafeIponlyRoute } from "@/lib/ai/safety";
import { aiQueryServices, type AIQueryContext } from "@/ai/query-services";
import type { AnalyticsPeriod, CurrencyMetric } from "@/types/analytics";
import type { CurrencyCode } from "@/types/domain";

const currencyCodeSchema = z.enum(["PHP", "USD", "EUR", "JPY"]);
const periodSchema = z.enum(["this-month", "last-month", "last-3-months", "last-6-months", "year-to-date", "this-year"]);
const nameSchema = z.string().trim().min(1).max(80).optional();

export const aiToolInputSchemas = {
  getSavingsSummary: z.object({
    accountName: nameSchema,
    goalName: nameSchema,
    includeRecentTransactions: z.boolean().default(false),
  }).strict(),
  getDebtSummary: z.object({ debtName: nameSchema }).strict(),
  getBudgetSummary: z.object({
    period: periodSchema.default("this-month"),
    currencyCode: currencyCodeSchema.optional(),
    categoryName: nameSchema,
  }).strict(),
  getFinancialComparison: z.object({
    period: periodSchema.default("this-month"),
    currencyCode: currencyCodeSchema.optional(),
  }).strict(),
  getTravelSummary: z.object({ tripName: nameSchema }).strict(),
  getIponlyRoute: z.object({
    section: z.enum(["home", "savings", "debt", "budget", "analytics", "travel", "settings"]),
  }).strict(),
};

function normalizedName(value: string) {
  return value.trim().toLocaleLowerCase();
}

function matchingNames<T>(items: T[], name: string | undefined, getName: (item: T) => string) {
  if (!name) return items;
  const query = normalizedName(name);
  return items.filter((item) => normalizedName(getName(item)).includes(query));
}

function formatCurrencyMetrics(metrics: CurrencyMetric[]) {
  return metrics.map(({ currencyCode, amountMinor }) => ({
    currencyCode,
    amountMinor,
    amount: formatMoney(amountMinor, currencyCode),
  }));
}

function formatCurrencyMap(metrics: Map<CurrencyCode, number>) {
  return formatCurrencyMetrics(Array.from(metrics, ([currencyCode, amountMinor]) => ({ currencyCode, amountMinor })));
}

function dateOnly(value: Date | string | null | undefined) {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function todayInTimezone(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: "year" | "month" | "day") => parts.find((value) => value.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function createReadOnlyTools(context: AIQueryContext) {
  let savingsOverviewPromise: ReturnType<typeof aiQueryServices.getSavingsOverview> | undefined;
  let debtOverviewPromise: ReturnType<typeof aiQueryServices.getDebtOverview> | undefined;
  const debtDetailPromises = new Map<string, ReturnType<typeof aiQueryServices.getDebtDetails>>();
  const analyticsPromises = new Map<AnalyticsPeriod, ReturnType<typeof aiQueryServices.getAnalytics>>();
  let travelPagePromise: ReturnType<typeof aiQueryServices.getTravelPageData> | undefined;
  const travelDetailPromises = new Map<string, ReturnType<typeof aiQueryServices.getTravelTripDetail>>();

  const readSavingsOverview = () =>
    savingsOverviewPromise ??= aiQueryServices.getSavingsOverview(context);
  const readDebtOverview = () =>
    debtOverviewPromise ??= aiQueryServices.getDebtOverview(context);
  const readDebtDetails = (debtId: string) => {
    let result = debtDetailPromises.get(debtId);
    if (!result) {
      result = aiQueryServices.getDebtDetails(context, debtId);
      debtDetailPromises.set(debtId, result);
    }
    return result;
  };
  const readAnalytics = (period: AnalyticsPeriod) => {
    let result = analyticsPromises.get(period);
    if (!result) {
      result = aiQueryServices.getAnalytics(context, period);
      analyticsPromises.set(period, result);
    }
    return result;
  };
  const readTravelPage = () =>
    travelPagePromise ??= aiQueryServices.getTravelPageData(context);
  const readTravelDetail = (tripId: string) => {
    let result = travelDetailPromises.get(tripId);
    if (!result) {
      result = aiQueryServices.getTravelTripDetail(context, tripId);
      travelDetailPromises.set(tripId, result);
    }
    return result;
  };

  return {
    getSavingsSummary: tool({
      description: "Read the user's savings balances, accounts, and goals. Request recent transactions only when the user asks about transaction history. Use accountName or goalName to narrow results; ask for clarification when multiple results match.",
      inputSchema: aiToolInputSchemas.getSavingsSummary,
      execute: async ({ accountName, goalName, includeRecentTransactions }) => {
        const overview = await readSavingsOverview();
        const accounts = matchingNames(overview.accounts, accountName, (account) => account.name);
        const visibleGoals = overview.goals.filter((goal) => goal.status !== "archived");
        const goals = matchingNames(visibleGoals, goalName, (goal) => goal.name);

        if (accountName && accounts.length > 1) {
          return { status: "ambiguous-account", matches: accounts.slice(0, 5).map((account) => account.name) };
        }
        if (accountName && accounts.length === 0) return { status: "not-found", entity: "account" };
        if (goalName && goals.length > 1) {
          return { status: "ambiguous-goal", matches: goals.slice(0, 5).map((goal) => goal.name) };
        }
        if (goalName && goals.length === 0) return { status: "not-found", entity: "goal" };

        const selectedAccounts = accountName ? accounts : goalName ? [] : overview.accounts;
        const selectedGoals = goalName ? goals : visibleGoals;
        const recentTransactions = includeRecentTransactions && !goalName
          ? overview.recentTransactions
            .filter((transaction) => !accountName || accounts.some((account) => account.id === transaction.accountId))
            .slice(0, 8)
            .map((transaction) => ({
              accountName: transaction.accountName,
              date: dateOnly(transaction.transactionDate),
              description: transaction.description,
              type: transaction.transactionType,
              status: transaction.status,
              currencyCode: transaction.accountCurrency,
              amountMinor: transaction.amountMinor,
              amount: formatMoney(transaction.amountMinor, transaction.accountCurrency),
            }))
          : undefined;
        const accountTotals = new Map<CurrencyCode, number>();
        if (accountName) {
          for (const account of selectedAccounts) {
            const amountMinor = overview.balances.get(account.id) ?? 0;
            accountTotals.set(account.currencyCode, (accountTotals.get(account.currencyCode) ?? 0) + amountMinor);
          }
        }
        return {
          status: "ok",
          balancesByCurrency: accountName
            ? formatCurrencyMap(accountTotals)
            : goalName
              ? []
              : Array.from(overview.totals, ([currencyCode, amountMinor]) => ({
                currencyCode,
                amountMinor,
                amount: formatMoney(amountMinor, currencyCode),
              })),
          accounts: selectedAccounts.slice(0, 20).map((account) => ({
            name: account.name,
            currencyCode: account.currencyCode,
            balanceMinor: overview.balances.get(account.id) ?? 0,
            balance: formatMoney(overview.balances.get(account.id) ?? 0, account.currencyCode),
            includedInTotal: account.includeInTotal,
            archived: account.status === "archived",
          })),
          goals: selectedGoals
            .filter((goal) => !accountName || Boolean(goal.accountId && selectedAccounts.some((account) => account.id === goal.accountId)))
            .slice(0, 20)
            .map((goal) => ({
              name: goal.name,
              currencyCode: goal.currencyCode,
              savedMinor: goal.savedMinor,
              saved: formatMoney(goal.savedMinor, goal.currencyCode),
              targetMinor: goal.targetAmountMinor,
              target: formatMoney(goal.targetAmountMinor, goal.currencyCode),
              progressPercent: goal.progressPercent,
            })),
          ...(recentTransactions ? { recentTransactions } : {}),
        };
      },
    }),

    getDebtSummary: tool({
      description: "Read calculated debt balances, upcoming or overdue installments, remaining installment counts, and recent payment totals.",
      inputSchema: aiToolInputSchemas.getDebtSummary,
      execute: async ({ debtName }) => {
        const overview = await readDebtOverview();
        const debts = matchingNames(overview.debts, debtName, (debt) => debt.name);
        if (debtName && debts.length > 1) {
          return { status: "ambiguous-debt", matches: debts.slice(0, 5).map((debt) => debt.name) };
        }
        if (debtName && debts.length === 0) return { status: "not-found", entity: "debt" };

        const selectedIds = new Set(debts.map((debt) => debt.id));
        const upcoming = overview.calendarInstallments
          .filter((item) => (!debtName || selectedIds.has(item.debtId)) && item.status !== "overdue")
          .slice(0, 10);
        const overdue = overview.overdueInstallments.filter((item) => !debtName || selectedIds.has(item.debtId));
        const debtDetails = debtName && debts.length === 1 ? await readDebtDetails(debts[0]!.id) : null;
        const payments = debtDetails?.payments ?? overview.recentPayments.filter((payment) => !debtName || selectedIds.has(payment.debtId));
        return {
          status: "ok",
          period: { today: overview.today, month: overview.month, timezone: context.timezone },
          ...(debtName ? {} : {
            outstandingByCurrency: formatCurrencyMap(overview.totalOutstandingByCurrency),
            dueThisMonthByCurrency: formatCurrencyMap(overview.dueThisMonthByCurrency),
            overdueByCurrency: formatCurrencyMap(overview.overdueByCurrency),
            paidThisMonthByCurrency: formatCurrencyMap(overview.paidThisMonthByCurrency),
          }),
          debts: debts.slice(0, 20).map((debt) => ({
            name: debt.name,
            creditor: debt.creditor,
            currencyCode: debt.currencyCode,
            balanceMinor: debt.balanceMinor,
            balance: formatMoney(debt.balanceMinor, debt.currencyCode),
            status: debt.status,
            remainingInstallments: debt.remainingInstallments,
            nextDueDate: dateOnly(debt.nextInstallment?.dueDate),
          })),
          upcomingInstallments: upcoming.slice(0, 10).map((item) => ({
            debtName: item.debtName,
            dueDate: dateOnly(item.dueDate),
            currencyCode: item.currencyCode,
            amountMinor: item.remainingAmountMinor,
            amount: formatMoney(item.remainingAmountMinor, item.currencyCode),
            status: item.status,
          })),
          overdueInstallments: overdue.slice(0, 10).map((item) => ({
            debtName: item.debtName,
            dueDate: dateOnly(item.dueDate),
            currencyCode: item.currencyCode,
            amountMinor: item.remainingAmountMinor,
            amount: formatMoney(item.remainingAmountMinor, item.currencyCode),
            status: item.status,
          })),
          recentPayments: payments.slice(0, 8).map((payment) => ({
            debtName: debts.find((debt) => debt.id === payment.debtId)?.name,
            date: dateOnly(payment.paymentDate),
            currencyCode: payment.currencyCode,
            amountMinor: payment.amountMinor,
            amount: formatMoney(payment.amountMinor, payment.currencyCode),
            type: payment.paymentType,
          })),
        };
      },
    }),

    getBudgetSummary: tool({
      description: "Read the user's planned and actual budget measures and category spending for a supported period. Never combine currencies.",
      inputSchema: aiToolInputSchemas.getBudgetSummary,
      execute: async ({ period, currencyCode, categoryName }) => {
        const data = await readAnalytics(period as AnalyticsPeriod);
        const categories = currencyCode
          ? data.budget.categories.filter((category) => category.currencyCode === currencyCode)
          : data.budget.categories;
        const matchingCategories = matchingNames(categories, categoryName, (category) => category.name);
        if (categoryName && matchingCategories.length > 1) {
          return { status: "ambiguous-category", matches: matchingCategories.slice(0, 5).map((category) => category.name) };
        }
        if (categoryName && matchingCategories.length === 0) return { status: "not-found", entity: "category" };

        const categoryResults = matchingCategories.slice(0, 20).map((category) => ({
          name: category.name,
          currencyCode: category.currencyCode,
          plannedMinor: category.plannedMinor,
          planned: formatMoney(category.plannedMinor, category.currencyCode),
          spentMinor: category.spentMinor,
          spent: formatMoney(category.spentMinor, category.currencyCode),
          remainingMinor: category.remainingMinor,
          remaining: formatMoney(category.remainingMinor, category.currencyCode),
          overAllocationMinor: category.overAllocationMinor,
        }));
        const periodRange = { startDate: data.range.startDate, endDate: data.range.endDate, timezone: data.range.timezone };
        if (categoryName) return { status: "ok", period: periodRange, categories: categoryResults };

        return {
          status: "ok",
          period: periodRange,
          plannedIncome: formatCurrencyMetrics(data.budget.plannedIncome.filter((metric) => !currencyCode || metric.currencyCode === currencyCode)),
          actualIncome: formatCurrencyMetrics(data.budget.actualIncome.filter((metric) => !currencyCode || metric.currencyCode === currencyCode)),
          allocated: formatCurrencyMetrics(data.budget.allocated.filter((metric) => !currencyCode || metric.currencyCode === currencyCode)),
          unallocated: formatCurrencyMetrics(data.budget.unallocated.filter((metric) => !currencyCode || metric.currencyCode === currencyCode)),
          actualSpending: formatCurrencyMetrics(data.budget.actualSpending.filter((metric) => !currencyCode || metric.currencyCode === currencyCode)),
          categories: categoryResults,
          incomeBySource: data.budget.incomeBySource
            .filter((source) => !currencyCode || source.currencyCode === currencyCode)
            .slice(0, 10)
            .map((source) => ({
              name: source.name,
              currencyCode: source.currencyCode,
              plannedMinor: source.plannedMinor,
              receivedMinor: source.receivedMinor,
            })),
        };
      },
    }),

    getFinancialComparison: tool({
      description: "Read the trusted Analytics service's current-versus-previous period comparison for income, spending, savings change, and debt payments.",
      inputSchema: aiToolInputSchemas.getFinancialComparison,
      execute: async ({ period, currencyCode }) => {
        const data = await readAnalytics(period as AnalyticsPeriod);
        const filterCurrency = (metrics: CurrencyMetric[]) =>
          metrics.filter((metric) => !currencyCode || metric.currencyCode === currencyCode);
        const comparison = (metrics: typeof data.comparisons.income) => metrics
          .filter((metric) => !currencyCode || metric.currencyCode === currencyCode)
          .map((metric) => ({
            currencyCode: metric.currencyCode,
            currentMinor: metric.amountMinor,
            current: formatMoney(metric.amountMinor, metric.currencyCode),
            previousMinor: metric.previousAmountMinor,
            previous: formatMoney(metric.previousAmountMinor, metric.currencyCode),
            absoluteChangeMinor: metric.absoluteChangeMinor,
            absoluteChange: formatMoney(Math.abs(metric.absoluteChangeMinor), metric.currencyCode),
            direction: metric.absoluteChangeMinor > 0 ? "increase" : metric.absoluteChangeMinor < 0 ? "decrease" : "no change",
            percentageChange: metric.percentageChange,
          }));

        return {
          status: "ok",
          period: {
            current: { startDate: data.range.startDate, endDate: data.range.endDate },
            previous: { startDate: data.comparisonRange.startDate, endDate: data.comparisonRange.endDate },
            timezone: data.range.timezone,
          },
          income: comparison(data.comparisons.income),
          spending: comparison(data.comparisons.spending),
          savingsChange: comparison(data.comparisons.savingsChange),
          debtPayments: comparison(data.comparisons.debtPayments),
          currencies: filterCurrency(data.budget.actualSpending).map((metric) => metric.currencyCode),
        };
      },
    }),

    getTravelSummary: tool({
      description: "Read the user's own trips, travel budgets, tasks, packing progress, expenses, and itinerary. Never expose booking references.",
      inputSchema: aiToolInputSchemas.getTravelSummary,
      execute: async ({ tripName }) => {
        const pageData = await readTravelPage();
        const trips = matchingNames(pageData.activeTrips, tripName, (item) => item.trip.name);
        if (tripName && trips.length > 1) {
          return { status: "ambiguous-trip", matches: trips.slice(0, 5).map((item) => item.trip.name) };
        }
        if (tripName && trips.length === 0) return { status: "not-found", entity: "trip" };

        if (!tripName) {
          const today = todayInTimezone(context.timezone);
          const upcomingTrips = pageData.activeTrips
            .filter((item) => {
              const status = item.trip.status;
              const startDate = dateOnly(item.trip.startDate);
              return status === "ongoing" || (
                status !== "completed" &&
                status !== "cancelled" &&
                startDate !== null &&
                startDate >= today
              );
            })
            .sort((left, right) =>
              (dateOnly(left.trip.startDate) ?? "").localeCompare(dateOnly(right.trip.startDate) ?? ""),
            );
          return {
            status: "ok",
            today,
            timezone: context.timezone,
            trips: upcomingTrips.slice(0, 10).map((item) => ({
              name: item.trip.name,
              destination: item.trip.destination,
              startDate: dateOnly(item.trip.startDate),
              endDate: dateOnly(item.trip.endDate),
              status: item.trip.status,
              currencyCode: item.trip.baseCurrencyCode,
              totalBudgetMinor: item.trip.totalBudgetMinor,
              planned: formatCurrencyMetrics(item.plannedTotals),
              actual: formatCurrencyMetrics(item.actualTotals),
            })),
          };
        }

        const selected = trips[0]!;
        const detail = await readTravelDetail(selected.trip.id);
        if (!detail) return { status: "not-found", entity: "trip" };
        const today = todayInTimezone(context.timezone);
        return {
          status: "ok",
          trip: {
            name: detail.trip.name,
            destination: detail.trip.destination,
            startDate: dateOnly(detail.trip.startDate),
            endDate: dateOnly(detail.trip.endDate),
            status: detail.trip.status,
            currencyCode: detail.trip.baseCurrencyCode,
            totalBudgetMinor: detail.trip.totalBudgetMinor,
          },
          today,
          timezone: context.timezone,
          plannedAndActualByCategory: detail.categories.slice(0, 20).map((category) => ({
            category: category.category,
            currencyCode: category.currencyCode,
            plannedMinor: category.plannedMinor,
            actualMinor: category.actualMinor,
          })),
          upcomingItinerary: detail.itinerary
            .filter((item) => item.status !== "cancelled" && (dateOnly(item.date) ?? "") >= today)
            .slice(0, 5)
            .map((item) => ({ date: dateOnly(item.date), title: item.title, status: item.status })),
          pendingTasks: detail.todos
            .filter((item) => item.status === "pending")
            .slice(0, 10)
            .map((item) => ({ title: item.title, dueDate: dateOnly(item.dueDate), priority: item.priority })),
          packingProgress: {
            total: detail.packingItems.length,
            packed: detail.packingItems.filter((item) => item.packed).length,
            remaining: detail.packingItems.filter((item) => !item.packed).length,
          },
          bookings: detail.bookings.slice(0, 10).map((booking) => ({
            type: booking.bookingType,
            provider: booking.provider,
            title: booking.title,
            date: dateOnly(booking.bookingDate),
            status: booking.status,
            ...(booking.amountMinor !== null && booking.currencyCode ? {
              amountMinor: booking.amountMinor,
              amount: formatMoney(booking.amountMinor, booking.currencyCode),
              currencyCode: booking.currencyCode,
            } : {}),
          })),
        };
      },
    }),

    getIponlyRoute: tool({
      description: "Return an allowlisted Iponly page route when the user asks where to view a module.",
      inputSchema: aiToolInputSchemas.getIponlyRoute,
      execute: async ({ section }) => getSafeIponlyRoute(section),
    }),
  };
}

export type ReadOnlyAITools = ReturnType<typeof createReadOnlyTools>;
