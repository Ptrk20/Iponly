import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  ChartNoAxesCombined,
  CreditCard,
  PiggyBank,
  Plane,
  Wallet,
} from "lucide-react";
import { SpendingDonutChart } from "@/components/charts";
import { SavingsTransactionList } from "@/components/savings-transaction-list";
import {
  EmptyState,
  MetricCard,
  PageHeader,
  Panel,
  ProgressBar,
  SectionHeading,
  StatusBadge,
} from "@/components/ui";
import {
  formatDate,
  formatMonth,
} from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { requireUser } from "@/lib/auth-session";
import { getUserPreferences } from "@/services/preferences-service";
import { getSavingsOverview } from "@/services/savings-service";
import { getDebtOverview } from "@/services/debt-service";
import { getCurrentBudgetSummary } from "@/services/budget-service";
import { getTravelDashboardSummary } from "@/services/travel-service";

export const instant = false;

export default async function HomePage() {
  const currentUser = await requireUser();
  const preferences = await getUserPreferences(currentUser.id);
  const [savings, debtOverview, budget, travel] = await Promise.all([
    getSavingsOverview(currentUser.id),
    getDebtOverview(currentUser.id, { timezone: preferences.timezone }),
    getCurrentBudgetSummary(currentUser.id, preferences.defaultCurrencyCode, preferences.timezone),
    getTravelDashboardSummary(currentUser.id, preferences.timezone),
  ]);
  const firstName = currentUser.name.trim().split(/\s+/)[0] || "there";
  const nextTrip = travel.nextTrip;
  const nextInstallment = debtOverview.upcomingInstallments[0];
  const spendingTotals = new Map<string, { name: string; value: number }>();
  for (const expense of budget?.expenses ?? []) {
    const current = spendingTotals.get(expense.categoryId);
    spendingTotals.set(expense.categoryId, {
      name: expense.categoryName,
      value: (current?.value ?? 0) + expense.amountMinor,
    });
  }
  const spendingData = [...spendingTotals.values()].map((entry, index) => ({
    name: entry.name,
    value: entry.value,
    color: ["var(--chart-groceries)", "var(--chart-dining)", "var(--chart-transport)", "var(--chart-savings)"][index % 4]!,
  }));
  const budgetMonth = budget ? `${budget.budget.year}-${String(budget.budget.month).padStart(2, "0")}` : "";
  const savingsChange = savings.change.get(preferences.defaultCurrencyCode) ?? 0;
  const formattedSavingsChange = `${savingsChange >= 0 ? "+" : "−"}${formatMoney(Math.abs(savingsChange), preferences.defaultCurrencyCode)} this month`;
  const topBudgetCategory = budget?.categories
    .filter((category) => category.plannedMinor > 0)
    .sort((left, right) => right.utilizationPercent - left.utilizationPercent)[0];
  const categoryName = topBudgetCategory
    ? budget?.expenses.find((expense) => expense.categoryId === topBudgetCategory.categoryId)?.categoryName
    : undefined;
  const dashboardSignals = [
    savingsChange !== 0
      ? `Tracked savings ${savingsChange > 0 ? "increased" : "decreased"} by ${formatMoney(Math.abs(savingsChange), preferences.defaultCurrencyCode)} this month.`
      : null,
    topBudgetCategory && categoryName && topBudgetCategory.utilizationPercent >= 80
      ? `${categoryName} has used ${topBudgetCategory.utilizationPercent}% of its allocation.`
      : null,
    budget && budget.unallocatedMinor > 0
      ? `${formatMoney(budget.unallocatedMinor, budget.currencyCode)} of planned income is unallocated.`
      : null,
    debtOverview.overdueInstallments.length > 0
      ? `${debtOverview.overdueInstallments.length} installment${debtOverview.overdueInstallments.length === 1 ? "" : "s"} currently overdue.`
      : null,
  ].filter((message): message is string => message !== null).slice(0, 3);

  return (
    <div className="page-stack">
      <PageHeader
        action={<Link className="button button-primary" href="/budget">Open monthly budget <ArrowRight aria-hidden="true" size={14} /></Link>}
        description="Here’s your money overview. A little clarity goes a long way."
        eyebrow="Your financial overview"
        title={`Good morning, ${firstName}`}
      />

      <div className="metrics-grid">
        <MetricCard amountMinor={savings.totals.get(preferences.defaultCurrencyCode) ?? 0} currencyCode={preferences.defaultCurrencyCode} icon={PiggyBank} label={`Savings · ${preferences.defaultCurrencyCode}`} supporting={`${formattedSavingsChange} · ${savings.accounts.length} active accounts`} />
        <MetricCard amountMinor={debtOverview.totalOutstandingByCurrency.get(preferences.defaultCurrencyCode) ?? 0} currencyCode={preferences.defaultCurrencyCode} icon={CreditCard} label={`Outstanding debt · ${preferences.defaultCurrencyCode}`} supporting={`${debtOverview.activeCount} active plans · other currencies stay separate`} tone="rose" />
        <MetricCard amountMinor={budget?.availableFromActualIncomeMinor ?? 0} currencyCode={budget?.currencyCode ?? preferences.defaultCurrencyCode} icon={Wallet} label="Available from actual income" supporting={budget ? `From your ${formatMonth(budgetMonth)} budget` : "No budget set for this month"} tone="blue" />
        <MetricCard amountMinor={nextInstallment?.remainingAmountMinor ?? 0} currencyCode={nextInstallment?.currencyCode ?? preferences.defaultCurrencyCode} icon={CalendarDays} label="Next installment" supporting={nextInstallment ? `${nextInstallment.debtName} · due ${formatDate(nextInstallment.dueDate.toISOString().slice(0, 10), "MMM d")}` : "No upcoming payments"} tone="amber" />
      </div>

      {dashboardSignals.length > 0 ? (
        <section aria-label="This month's factual financial insights" className="dashboard-signals">
          {dashboardSignals.map((message, index) => (
            <Link className="dashboard-signal" href="/analytics" key={`${index}-${message}`}>
              <ChartNoAxesCombined aria-hidden="true" size={15} />
              <span>{message}</span>
              <ArrowRight aria-hidden="true" size={13} />
            </Link>
          ))}
        </section>
      ) : null}

      <div className="overview-grid">
        <Panel className="budget-panel">
          <SectionHeading action={<Link className="text-link" href="/budget">View budget <ArrowRight aria-hidden="true" size={14} /></Link>} detail={budget ? `Your ${formatMonth(budgetMonth)} plan` : "Plan this month's money"} title="Budget at a glance" />
          {budget ? (
            <>
              <ProgressBar displayValue={`${budget.utilizationPercent}% used`} label="Actual spending against planned income" max={budget.plannedIncomeMinor} value={budget.actualSpentMinor} />
              <div className="budget-kpis">
                <div className="budget-kpi"><span>Actual income</span><strong>{formatMoney(budget.actualIncomeMinor, budget.currencyCode)}</strong></div>
                <div className="budget-kpi"><span>Actual spending</span><strong>{formatMoney(budget.actualSpentMinor, budget.currencyCode)}</strong></div>
                <div className="budget-kpi"><span>Unallocated plan</span><strong>{formatMoney(budget.unallocatedMinor, budget.currencyCode)}</strong></div>
              </div>
              <div className="budget-footer-note"><span aria-hidden="true" className="note-mark">i</span> Savings and Debt entries are included once when linked.</div>
            </>
          ) : <EmptyState description="Create a plan to track actual income, spending, and what remains." title="No budget set for this month" />}
        </Panel>

        <Panel className="spending-panel">
          <SectionHeading action={<Link className="text-link" href="/analytics">Insights <ArrowRight aria-hidden="true" size={14} /></Link>} detail="Actual outflows from your current monthly budget" title="Where it goes" />
          {budget ? <SpendingDonutChart data={spendingData} /> : <EmptyState description="Your category spending appears after you create a budget." title="No budget data yet" />}
        </Panel>

        <Panel className="savings-panel">
          <SectionHeading action={<Link className="text-link" href="/savings">View savings <ArrowRight aria-hidden="true" size={14} /></Link>} detail="Your saved account and goal data" title="Your savings" />
          {savings.accounts.length === 0 ? (
            <EmptyState description="Add your first account to start tracking your ipon." title="No savings accounts yet" />
          ) : (
            <>
              <div className="savings-dashboard-totals">
                {[...savings.totals.entries()].map(([currency, amount]) => <div key={currency}><span>Total · {currency}</span><strong>{formatMoney(amount, currency)}</strong></div>)}
              </div>
              <div className="account-list">
                {savings.accounts.slice(0, 3).map((account) => (
                  <Link className="account-row savings-dashboard-account" href={`/savings/${account.id}`} key={account.id}>
                    <span aria-hidden="true" className="account-institution-mark">{(account.institution ?? account.name).slice(0, 1)}</span>
                    <span className="account-row-copy"><strong>{account.name}</strong><span>{account.institution || "Personal account"}</span></span>
                    <strong className="money-small">{formatMoney(savings.balances.get(account.id) ?? 0, account.currencyCode)}</strong>
                  </Link>
                ))}
              </div>
              {savings.goals.slice(0, 2).map((goal) => (
                <div className="dashboard-goal" key={goal.id}>
                  <div><strong>{goal.name}</strong><span>{goal.progressPercent}% complete</span></div>
                  <ProgressBar displayValue={`${formatMoney(goal.savedMinor, goal.currencyCode)} / ${formatMoney(goal.targetAmountMinor, goal.currencyCode)}`} label="Goal progress" max={goal.targetAmountMinor} value={goal.savedMinor} />
                </div>
              ))}
            </>
          )}
        </Panel>

        <Panel className="debt-panel">
          <SectionHeading action={<Link className="text-link" href="/debt">See all debts <ArrowRight aria-hidden="true" size={14} /></Link>} detail="Your recorded upcoming and overdue obligations" title="Next payments" />
          {debtOverview.upcomingInstallments.length === 0 ? (
            <EmptyState description="Add an installment plan or balance when you need to track one." title="No debts added yet" />
          ) : (
            <div className="installment-list">
              {debtOverview.upcomingInstallments.slice(0, 3).map((installment) => {
                return (
                  <Link className="installment-row" href={`/debt/${installment.debtId}`} key={installment.id}>
                    <span className="installment-date"><strong>{formatDate(installment.dueDate.toISOString().slice(0, 10), "d")}</strong>{formatDate(installment.dueDate.toISOString().slice(0, 10), "MMM")}</span>
                    <span className="installment-copy"><strong>{installment.debtName}</strong><span>{installment.creditor || "Debt"} · Due {formatDate(installment.dueDate.toISOString().slice(0, 10), "MMM d")}</span></span>
                    <strong className="money-small">{formatMoney(installment.remainingAmountMinor, installment.currencyCode)}</strong>
                    <StatusBadge tone={installment.status}>{installment.status.replaceAll("_", " ")}</StatusBadge>
                  </Link>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel className="travel-panel">
          <SectionHeading action={<Link className="text-link" href="/travel">Trip details <ArrowRight aria-hidden="true" size={14} /></Link>} detail="A little something to look forward to" title="On the horizon" />
          {nextTrip ? (
            <div className="trip-mini">
              <div className="trip-mini-top"><StatusBadge tone={nextTrip.trip.status}>{nextTrip.trip.status}</StatusBadge><Plane aria-hidden="true" size={18} /></div>
              <h3>{nextTrip.trip.name}</h3>
              <p>{nextTrip.trip.destination}{nextTrip.trip.startDate ? ` · ${formatDate(nextTrip.trip.startDate, "MMM d")}` : ""}{nextTrip.trip.endDate ? `–${formatDate(nextTrip.trip.endDate, "MMM d, yyyy")}` : ""}</p>
              <div className="trip-mini-stats">
                <div><span>Planned</span><strong>{formatTravelTotal(nextTrip.plannedTotals, nextTrip.trip.baseCurrencyCode)}</strong></div>
                <div><span>Still in budget</span><strong>{nextTrip.budgetRemainingMinor === null ? "Not set" : formatMoney(nextTrip.budgetRemainingMinor, nextTrip.trip.baseCurrencyCode)}</strong></div>
              </div>
              <Link className="text-link" href={`/travel/${nextTrip.trip.id}`}>View trip <ArrowRight aria-hidden="true" size={14} /></Link>
            </div>
          ) : <EmptyState description={`${travel.planningCount} trip${travel.planningCount === 1 ? "" : "s"} in planning, with no upcoming dates yet.`} title="No upcoming trip" />}
        </Panel>

        <Panel className="activity-panel">
          <SectionHeading action={<Link className="text-link" href="/savings">All activity <ArrowRight aria-hidden="true" size={14} /></Link>} detail="Your latest saved movements" title="Recent savings activity" />
          <SavingsTransactionList accountNames={new Map(savings.recentTransactions.map((transaction) => [transaction.accountId, transaction.accountName]))} transactions={savings.recentTransactions.slice(0, 4)} />
        </Panel>
      </div>

      <Link className="insights-strip" href="/analytics">
        <span className="insights-icon"><ChartNoAxesCombined aria-hidden="true" size={19} /></span>
        <span><strong>Your money has a story.</strong><small>Explore your savings, spending, and repayment trends.</small></span>
        <ArrowRight aria-hidden="true" className="insights-arrow" size={17} />
      </Link>
    </div>
  );
}

function formatTravelTotal(totals: Array<{ currencyCode: "PHP" | "USD" | "EUR" | "JPY"; amountMinor: number }>, baseCurrencyCode: "PHP" | "USD" | "EUR" | "JPY") {
  const baseTotal = totals.find((total) => total.currencyCode === baseCurrencyCode);
  return baseTotal ? formatMoney(baseTotal.amountMinor, baseTotal.currencyCode) : "—";
}
