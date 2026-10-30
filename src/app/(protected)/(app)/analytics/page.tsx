import { ArrowRight, PiggyBank } from "lucide-react";
import Link from "next/link";
import { ComparisonBarChart, SpendingDonutChart, TrendLineChart } from "@/components/charts";
import { PageHeader, Panel, ProgressBar, SectionHeading, StatusBadge } from "@/components/ui";
import { budgetCategories, debts, monthlyBudget, monthlyFinancialTrend } from "@/data/fixtures";
import { getSpendingBreakdown } from "@/lib/finance";
import { calculatePercentage, formatMoney } from "@/lib/money";

export default function AnalyticsPage() {
  const incomeAndSpending = monthlyFinancialTrend.map(({ month, income, spending }) => ({ month, income, spending }));
  const spendingTrend = monthlyFinancialTrend.map(({ month, spending }) => ({ month, spending }));

  return (
    <div className="page-stack">
      <PageHeader
        action={<StatusBadge tone="planning">Sample insights</StatusBadge>}
        description="A clearer view of where you’ve been and what you’re building."
        eyebrow="Patterns, not pressure"
        title="Analytics"
      />

      <div className="analytics-grid">
        <Panel>
          <SectionHeading detail="Balances across your demo accounts" title="Savings trend" />
          <TrendLineChart data={monthlyFinancialTrend} series={[{ key: "savings", label: "Total savings", color: "var(--brand)" }]} />
        </Panel>

        <Panel>
          <SectionHeading detail="Income and spending by month" title="Income vs spending" />
          <ComparisonBarChart data={incomeAndSpending} series={[{ key: "income", label: "Income", color: "var(--brand)" }, { key: "spending", label: "Spending", color: "var(--chart-groceries)" }]} />
        </Panel>

        <Panel>
          <SectionHeading detail="Actual outflows, excluding internal transfers" title="Budget by category" />
          <SpendingDonutChart data={getSpendingBreakdown(monthlyBudget, budgetCategories)} />
        </Panel>

        <Panel>
          <SectionHeading detail="Recorded balances, not remaining payments multiplied by installments" title="Debt repayment progress" />
          {debts.length === 0 ? (
            <div className="analytics-empty"><PiggyBank aria-hidden="true" size={22} /><span>No debt balances to chart.</span></div>
          ) : (
            <div className="debt-progress-list">
              {debts.map((debt) => {
                const paid = debt.originalAmountMinor - debt.balanceMinor;
                return (
                  <div className="debt-progress-item" key={debt.id}>
                    <div className="debt-progress-heading"><strong>{debt.name}</strong><span>{formatMoney(debt.balanceMinor, debt.currencyCode)} left</span></div>
                    <ProgressBar displayValue={`${calculatePercentage(paid, debt.originalAmountMinor)}% paid`} label={`${formatMoney(paid, debt.currencyCode)} of ${formatMoney(debt.originalAmountMinor, debt.currencyCode)}`} max={debt.originalAmountMinor} value={paid} tone="blue" />
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel className="panel-wide">
          <SectionHeading detail="Monthly expenses in the sample period" title="Spending over time" />
          <TrendLineChart data={spendingTrend} series={[{ key: "spending", label: "Spending", color: "var(--chart-transport)" }]} />
        </Panel>
      </div>

      <Link className="text-link" href="/budget">Back to your budget <ArrowRight aria-hidden="true" size={14} /></Link>
    </div>
  );
}