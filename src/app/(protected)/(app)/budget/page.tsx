import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SpendingDonutChart } from "@/components/charts";
import { PrototypeAction } from "@/components/prototype-action";
import { BudgetCategoryRow, EmptyState, PageHeader, Panel, ProgressBar, SectionHeading } from "@/components/ui";
import { budgetCategories, monthlyBudget } from "@/data/fixtures";
import { formatMonth } from "@/lib/dates";
import { getSpendingBreakdown, summarizeBudget } from "@/lib/finance";
import { formatMoney } from "@/lib/money";

export default function BudgetPage() {
  const summary = summarizeBudget(monthlyBudget);
  const spendingData = getSpendingBreakdown(monthlyBudget, budgetCategories);
  const categoryById = new Map(budgetCategories.map((category) => [category.id, category]));

  return (
    <div className="page-stack">
      <PageHeader action={<><PrototypeAction icon="plus" label="Add expense" variant="primary" /><PrototypeAction icon="pencil" label="Edit budget" /></>} description="Give your income a plan, then see how the month is going." eyebrow="Plan with purpose" title="Monthly budget" />

      <div className="budget-summary-grid">
        <SummaryItem label="Monthly income" value={monthlyBudget.incomeMinor} />
        <SummaryItem label="Total allocated" value={summary.totalAllocatedMinor} />
        <SummaryItem label="Actual spending" value={summary.actualSpentMinor} />
        <SummaryItem label="Remaining" value={summary.remainingMinor} tone="highlight" />
      </div>

      <Panel>
        <SectionHeading detail={`${formatMonth(monthlyBudget.month)} · Sample budget`} title="Budget progress" />
        <ProgressBar displayValue={`${summary.utilizationPercent}% spent`} label="Actual spending against income" max={monthlyBudget.incomeMinor} value={summary.actualSpentMinor} />
        <div className="budget-progress-foot"><span>Allocated {formatMoney(summary.totalAllocatedMinor)}</span><strong>{formatMoney(summary.unallocatedMinor)} unallocated</strong></div>
      </Panel>

      <div className="budget-layout">
        <Panel>
          <SectionHeading detail="Planned amounts, spending to date, and what remains" title="Category allocation" />
          {monthlyBudget.allocations.length === 0 ? (
            <EmptyState description="Add categories to decide where your income should go." title="No categories yet" />
          ) : (
            <div className="category-list">
              {monthlyBudget.allocations.map((allocation) => {
                const category = categoryById.get(allocation.categoryId);
                return category ? <BudgetCategoryRow allocation={allocation} category={category} key={allocation.id} /> : null;
              })}
            </div>
          )}
        </Panel>

        <Panel>
          <SectionHeading detail="Internal savings transfers are excluded" title="Where your money goes" />
          <SpendingDonutChart data={spendingData} />
          <Link className="text-link chart-detail-link" href="/analytics">Explore analytics <ArrowRight aria-hidden="true" size={14} /></Link>
        </Panel>
      </div>

      <p className="fixture-note">Demo figures only. No income or expenses are recorded or saved.</p>
    </div>
  );
}

function SummaryItem({ label, value, tone = "" }: { label: string; value: number; tone?: string }) {
  return <div className={`budget-summary-item ${tone ? `budget-summary-${tone}` : ""}`}><span>{label}</span><strong>{formatMoney(value)}</strong></div>;
}