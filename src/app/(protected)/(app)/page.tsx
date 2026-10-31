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
import { PrototypeAction } from "@/components/prototype-action";
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
  budgetCategories,
  debts,
  installments,
  japanTrip,
  monthlyBudget,
  travelExpenses,
} from "@/data/fixtures";
import { formatDate, formatMonth } from "@/lib/dates";
import {
  getSpendingBreakdown,
  summarizeBudget,
  summarizeDebts,
  summarizeTrip,
} from "@/lib/finance";
import { formatMoney } from "@/lib/money";
import { requireUser } from "@/lib/auth-session";
import { getUserPreferences } from "@/services/preferences-service";
import { getSavingsOverview } from "@/services/savings-service";

export const instant = false;

export default async function HomePage() {
  const currentUser = await requireUser();
  const [savings, preferences] = await Promise.all([
    getSavingsOverview(currentUser.id),
    getUserPreferences(currentUser.id),
  ]);
  const firstName = currentUser.name.trim().split(/\s+/)[0] || "there";
  const budget = summarizeBudget(monthlyBudget);
  const debtSummary = summarizeDebts(debts);
  const tripSummary = summarizeTrip(japanTrip, travelExpenses);
  const nextInstallment = [...installments].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  const spendingData = getSpendingBreakdown(monthlyBudget, budgetCategories);
  const savingsChange = savings.change.get(preferences.defaultCurrencyCode) ?? 0;
  const formattedSavingsChange = `${savingsChange >= 0 ? "+" : "−"}${formatMoney(Math.abs(savingsChange), preferences.defaultCurrencyCode)} this month`;

  return (
    <div className="page-stack">
      <PageHeader
        action={<PrototypeAction icon="money" label="Add transaction" variant="primary" />}
        description="Here’s your money overview. A little clarity goes a long way."
        eyebrow="Your financial overview"
        title={`Good morning, ${firstName}`}
      />

      <div className="metrics-grid">
        <MetricCard amountMinor={savings.totals.get(preferences.defaultCurrencyCode) ?? 0} currencyCode={preferences.defaultCurrencyCode} icon={PiggyBank} label={`Savings · ${preferences.defaultCurrencyCode}`} supporting={`${formattedSavingsChange} · ${savings.accounts.length} active accounts`} />
        <MetricCard amountMinor={debtSummary.totalOutstandingMinor} currencyCode="PHP" icon={CreditCard} label="Outstanding debt" supporting={`${debtSummary.activeCount} active plans`} tone="rose" />
        <MetricCard amountMinor={budget.remainingMinor} currencyCode="PHP" icon={Wallet} label="Budget remaining" supporting={`From your ${formatMonth(monthlyBudget.month)} plan`} tone="blue" />
        <MetricCard amountMinor={nextInstallment?.amountMinor ?? 0} currencyCode="PHP" icon={CalendarDays} label="Next installment" supporting={nextInstallment ? `Due ${formatDate(nextInstallment.dueDate, "MMM d")}` : "No upcoming payments"} tone="amber" />
      </div>

      <div className="overview-grid">
        <Panel className="budget-panel">
          <SectionHeading action={<Link className="text-link" href="/budget">View budget <ArrowRight aria-hidden="true" size={14} /></Link>} detail={`Your ${formatMonth(monthlyBudget.month)} plan`} title="Budget at a glance" />
          <ProgressBar displayValue={`${budget.utilizationPercent}% used`} label="Monthly income spent" max={monthlyBudget.incomeMinor} value={budget.actualSpentMinor} />
          <div className="budget-kpis">
            <div className="budget-kpi"><span>Income</span><strong>{formatMoney(monthlyBudget.incomeMinor)}</strong></div>
            <div className="budget-kpi"><span>Allocated</span><strong>{formatMoney(budget.totalAllocatedMinor)}</strong></div>
            <div className="budget-kpi"><span>Unallocated</span><strong>{formatMoney(budget.unallocatedMinor)}</strong></div>
          </div>
          <div className="budget-footer-note"><span aria-hidden="true" className="note-mark">i</span> Savings transfers stay separate from spending totals.</div>
        </Panel>

        <Panel className="spending-panel">
          <SectionHeading action={<Link className="text-link" href="/analytics">Insights <ArrowRight aria-hidden="true" size={14} /></Link>} detail="Actual outflows, excluding savings transfers" title="Where it goes" />
          <SpendingDonutChart data={spendingData} />
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
          <SectionHeading action={<Link className="text-link" href="/debt">See all debts <ArrowRight aria-hidden="true" size={14} /></Link>} detail="Two payments coming up in November" title="Next payments" />
          {installments.length === 0 ? (
            <EmptyState description="No payments are scheduled. Add a plan when you need to track one." title="No upcoming installments" />
          ) : (
            <div className="installment-list">
              {[...installments].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 2).map((installment) => {
                const debt = debts.find((item) => item.id === installment.debtId);
                return (
                  <div className="installment-row" key={installment.id}>
                    <span className="installment-date"><strong>{formatDate(installment.dueDate, "d")}</strong>{formatDate(installment.dueDate, "MMM")}</span>
                    <span className="installment-copy"><strong>{debt?.name ?? "Installment"}</strong><span>{debt?.creditor} · Due {formatDate(installment.dueDate, "MMM d")}</span></span>
                    <strong className="money-small">{formatMoney(installment.amountMinor, installment.currencyCode)}</strong>
                    <StatusBadge tone="upcoming">Upcoming</StatusBadge>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel className="travel-panel">
          <SectionHeading action={<Link className="text-link" href="/travel">Trip details <ArrowRight aria-hidden="true" size={14} /></Link>} detail="A little something to look forward to" title="On the horizon" />
          <div className="trip-mini">
            <div className="trip-mini-top"><StatusBadge tone={japanTrip.status}>{japanTrip.status}</StatusBadge><Plane aria-hidden="true" size={18} /></div>
            <h3>{japanTrip.name}</h3>
            <p>{japanTrip.destination} · {formatDate(japanTrip.startDate, "MMM d")}–{formatDate(japanTrip.endDate, "MMM d, yyyy")}</p>
            <div className="trip-mini-stats">
              <div><span>Planned</span><strong>{formatMoney(tripSummary.plannedMinor)}</strong></div>
              <div><span>Still in budget</span><strong>{formatMoney(tripSummary.remainingMinor)}</strong></div>
            </div>
            <Link className="text-link" href="/travel">View trip <ArrowRight aria-hidden="true" size={14} /></Link>
          </div>
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
