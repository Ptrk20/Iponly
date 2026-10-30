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
import { PrototypeAction } from "@/components/prototype-action";
import {
  EmptyState,
  MetricCard,
  PageHeader,
  Panel,
  ProgressBar,
  SectionHeading,
  StatusBadge,
  TransactionRow,
} from "@/components/ui";
import {
  accountTransactions,
  budgetCategories,
  debts,
  financialAccounts,
  installments,
  japanTrip,
  monthlyBudget,
  travelExpenses,
} from "@/data/fixtures";
import { formatDate, formatMonth } from "@/lib/dates";
import {
  getSpendingBreakdown,
  summarizeAccounts,
  summarizeBudget,
  summarizeDebts,
  summarizeTrip,
} from "@/lib/finance";
import { formatMoney } from "@/lib/money";
import { requireUser } from "@/lib/auth-session";

export const instant = false;

export default async function HomePage() {
  const currentUser = await requireUser();
  const firstName = currentUser.name.trim().split(/\s+/)[0] || "there";
  const savings = summarizeAccounts(financialAccounts);
  const budget = summarizeBudget(monthlyBudget);
  const debtSummary = summarizeDebts(debts);
  const tripSummary = summarizeTrip(japanTrip, travelExpenses);
  const nextInstallment = [...installments].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  const spendingData = getSpendingBreakdown(monthlyBudget, budgetCategories);

  return (
    <div className="page-stack">
      <PageHeader
        action={<PrototypeAction icon="money" label="Add transaction" variant="primary" />}
        description="Here’s your money overview. A little clarity goes a long way."
        eyebrow="Friday, October 30"
        title={`Good morning, ${firstName}`}
      />

      <div className="metrics-grid">
        <MetricCard amountMinor={savings.totalSavingsMinor} currencyCode="PHP" icon={PiggyBank} label="Total savings" supporting="Across 5 accounts" />
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
          <SectionHeading action={<Link className="text-link" href="/savings">View savings <ArrowRight aria-hidden="true" size={14} /></Link>} detail="A few places your money is growing" title="Your accounts" />
          <div className="account-list">
            {financialAccounts.slice(0, 3).map((account) => (
              <div className="account-row" key={account.id}>
                <span aria-hidden="true" className="account-institution-mark">{account.institution.slice(0, 1)}</span>
                <span className="account-row-copy"><strong>{account.name}</strong><span>{account.institution}</span></span>
                <strong className="money-small">{formatMoney(account.balanceMinor, account.currencyCode)}</strong>
              </div>
            ))}
          </div>
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
          <SectionHeading action={<Link className="text-link" href="/savings">All activity <ArrowRight aria-hidden="true" size={14} /></Link>} detail="Recent movement across your accounts" title="Recent activity" />
          <div className="transaction-list">
            {accountTransactions.slice(0, 4).map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} />)}
          </div>
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
