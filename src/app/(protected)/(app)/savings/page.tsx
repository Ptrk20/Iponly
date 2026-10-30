import { Wallet } from "lucide-react";
import { PrototypeAction } from "@/components/prototype-action";
import { EmptyState, MoneyValue, PageHeader, Panel, ProgressBar, SectionHeading, TransactionRow } from "@/components/ui";
import { accountTransactions, financialAccounts, savingsGoals } from "@/data/fixtures";
import { formatDate } from "@/lib/dates";
import { summarizeAccounts } from "@/lib/finance";
import { calculatePercentage, formatMoney } from "@/lib/money";

export default function SavingsPage() {
  const savings = summarizeAccounts(financialAccounts);
  const featuredGoal = savingsGoals[0];
  const goalPercent = featuredGoal ? calculatePercentage(featuredGoal.savedMinor, featuredGoal.targetMinor) : 0;

  return (
    <div className="page-stack">
      <PageHeader action={<><PrototypeAction icon="transfer" label="Transfer" /><PrototypeAction icon="plus" label="Add account" variant="primary" /></>} description="All your savings, goals, and recent activity in one place." eyebrow="Build your buffer" title="Savings" />

      <section aria-label="Savings total and featured goal" className="savings-feature">
        <div><p className="eyebrow">Total across your accounts</p><MoneyValue amountMinor={savings.totalSavingsMinor} size="large" /><p>Five accounts, one clear picture.</p></div>
        {featuredGoal ? <ProgressBar displayValue={`${goalPercent}%`} label={`${featuredGoal.name} · ${formatMoney(featuredGoal.savedMinor)} of ${formatMoney(featuredGoal.targetMinor)}`} max={featuredGoal.targetMinor} value={featuredGoal.savedMinor} /> : null}
      </section>

      <Panel>
        <SectionHeading action={<PrototypeAction icon="plus" label="Add money" variant="quiet" />} detail="Balances shown in Philippine pesos" title="Financial accounts" />
        {financialAccounts.length === 0 ? (
          <EmptyState description="Add your first account to start tracking your ipon." title="No savings accounts yet" />
        ) : (
          <div className="account-grid">
            {financialAccounts.map((account) => {
              const goal = savingsGoals.find((item) => item.id === account.goalId);
              return (
                <article className="account-card" key={account.id}>
                  <div className="account-card-head"><span aria-hidden="true" className="account-institution-mark">{account.institution.slice(0, 1)}</span><span className="account-card-title"><strong>{account.name}</strong><span>{account.institution} · {account.accountType}</span></span></div>
                  <strong className="account-card-balance">{formatMoney(account.balanceMinor, account.currencyCode)}</strong>
                  <div className="account-card-foot"><span>{account.currencyCode}</span>{goal ? <span>{goal.name}</span> : <span>Available balance</span>}</div>
                </article>
              );
            })}
          </div>
        )}
      </Panel>

      <div className="overview-grid">
        <Panel className="span-7">
          <SectionHeading detail="A target gives every peso a purpose" title="Savings goals" />
          {savingsGoals.length === 0 ? (
            <EmptyState description="Set a goal for a rainy day or your next big plan." title="No savings goals yet" />
          ) : (
            <div className="goal-list">
              {savingsGoals.map((goal) => (
                <div className="goal-row" key={goal.id}>
                  <div className="goal-row-head"><strong>{goal.name}</strong><span>Target {formatDate(goal.targetDate, "MMM yyyy")}</span></div>
                  <ProgressBar displayValue={`${calculatePercentage(goal.savedMinor, goal.targetMinor)}% · ${formatMoney(goal.savedMinor)} / ${formatMoney(goal.targetMinor)}`} label="Progress" max={goal.targetMinor} value={goal.savedMinor} />
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel className="span-5">
          <SectionHeading detail="Fixture data only · no changes are saved" title="Recent savings activity" />
          {accountTransactions.length === 0 ? (
            <EmptyState description="Deposits and transfers will appear here." title="No activity yet" />
          ) : (
            <div className="transaction-list">{accountTransactions.slice(0, 4).map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} />)}</div>
          )}
        </Panel>
      </div>

      <Panel className="savings-note"><span aria-hidden="true" className="metric-icon"><Wallet size={18} /></span><div><strong>Transfers stay transfers.</strong><p>Moving money between your own accounts does not count as new income.</p></div></Panel>
    </div>
  );
}