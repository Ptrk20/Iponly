import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ComparisonBarChart, SpendingDonutChart } from "@/components/charts";
import { SectionTabs } from "@/components/section-tabs";
import {
  ArchiveMonthlyBudgetForm,
  BudgetAllocationEditor,
  BudgetEntryForms,
  BudgetMonthNavigation,
  BudgetTransactionActions,
  CopyPreviousBudgetForm,
  CreateBudgetForm,
  LinkDebtPaymentForm,
  MonthlyBudgetStatusForm,
} from "@/components/budget-actions";
import { EmptyState, PageHeader, Panel, SectionHeading, StatusBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth-session";
import { formatMonth } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { getUserPreferences } from "@/services/preferences-service";
import { getBudgetPageData, reconcileBudgetLinks } from "@/services/budget-service";
import type { CurrencyCode } from "@/types/domain";

type BudgetPageProps = {
  searchParams: Promise<{ month?: string | string[] }>;
};

function currentMonthForTimezone(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit" })
    .formatToParts(new Date());
  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
  };
}

function currentDateForTimezone(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}-${parts.find((part) => part.type === "day")?.value}`;
}

function parseMonth(value: string | string[] | undefined, timezone: string) {
  const current = currentMonthForTimezone(timezone);
  if (typeof value !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return current;
  const [year, month] = value.split("-").map(Number);
  if (!year || year < 1900 || year > 2200) return current;
  return { year, month: month! };
}

export const instant = false;

export default async function BudgetPage({ searchParams }: BudgetPageProps) {
  const [user, query] = await Promise.all([requireUser(), searchParams]);
  const preferences = await getUserPreferences(user.id);
  const { year, month } = parseMonth(query.month, preferences.timezone);
  const data = await getBudgetPageData(user.id, year, month, preferences.defaultCurrencyCode);
  const monthLabel = formatMonth(`${year}-${String(month).padStart(2, "0")}`);

  if (!data.budget || !data.summary) {
    return (
      <div className="page-stack">
        <PageHeader
          description="Give your income a plan, then see how the month is going."
          eyebrow="Plan with purpose"
          title="Monthly budget"
        />
        <BudgetMonthNavigation
          currentMonth={currentMonthForTimezone(preferences.timezone).month}
          currentYear={currentMonthForTimezone(preferences.timezone).year}
          month={month}
          year={year}
        />
        <div className="budget-empty-layout">
          <Panel>
            <SectionHeading detail={monthLabel} title="No budget set for this month" />
            <EmptyState description="Create a monthly plan to start tracking income, allocations, and spending." title="Start with a plan" />
            <CreateBudgetForm currencyCode={preferences.defaultCurrencyCode} month={month} year={year} />
          </Panel>
          {data.copySourceBudget && data.previousCopyCounts ? (
            <Panel>
              <SectionHeading
                detail={`From ${formatMonth(`${data.copySourceBudget.year}-${String(data.copySourceBudget.month).padStart(2, "0")}`)}`}
                title="Copy previous month"
              />
              <p className="budget-copy-preview">Preview the actual counts before copying. Posted expenses, received income, savings entries, and debt payments are never copied.</p>
              <CopyPreviousBudgetForm
                allocations={data.previousCopyCounts.allocationCount}
                expenseCount={data.previousCopyCounts.expenseCount}
                month={month}
                plannedIncome={data.previousCopyCounts.plannedIncomeCount}
                source={data.copySourceBudget}
                year={year}
              />
            </Panel>
          ) : null}
        </div>
      </div>
    );
  }

  const { budget, summary } = data;
  const allocationByCategory = new Map(data.allocations.map(({ allocation }) => [allocation.categoryId, allocation.plannedAmountMinor]));
  const categoryById = new Map(data.categories.map((category) => [category.id, category]));
  const allocationChartData = data.allocations.map(({ allocation }) => ({
    name: categoryById.get(allocation.categoryId)?.name ?? "Archived category",
    value: allocation.plannedAmountMinor,
    color: categoryById.get(allocation.categoryId)?.color ?? "#82918c",
  }));
  const spendingByCategory = new Map<string, number>();
  for (const expense of data.expenses) {
    if (expense.status !== "posted") continue;
    spendingByCategory.set(expense.categoryId, (spendingByCategory.get(expense.categoryId) ?? 0) + expense.amountMinor);
  }
  const chartData = [...spendingByCategory.entries()].map(([categoryId, value]) => ({
    name: categoryById.get(categoryId)?.name ?? "Archived category",
    value,
    color: categoryById.get(categoryId)?.color ?? "#82918c",
  }));
  const plannedVsActual = data.categories.map((category) => ({
    month: category.name,
    planned: allocationByCategory.get(category.id) ?? 0,
    actual: spendingByCategory.get(category.id) ?? 0,
  }));
  const reconciliation = await reconcileBudgetLinks(user.id, budget.id);
  const current = currentMonthForTimezone(preferences.timezone);
  const isEditable = budget.status === "active";

  return (
    <div className="page-stack">
      <PageHeader
        action={<div className="budget-header-actions"><StatusBadge tone={budget.status === "active" ? "active" : "neutral"}>{budget.status}</StatusBadge><MonthlyBudgetStatusForm budget={budget} /><ArchiveMonthlyBudgetForm budget={budget} /></div>}
        description="A clear plan for what comes in, what goes out, and what remains."
        eyebrow="Plan with purpose"
        title="Monthly budget"
      />
      <BudgetMonthNavigation currentMonth={current.month} currentYear={current.year} month={month} year={year} />

      <div className="budget-summary-grid">
        <SummaryItem label="Planned income" value={summary.plannedIncomeMinor} currency={budget.currencyCode} />
        <SummaryItem label="Actual income received" value={summary.actualIncomeMinor} currency={budget.currencyCode} />
        <SummaryItem label="Actual spending" value={summary.actualSpentMinor} currency={budget.currencyCode} />
        <SummaryItem highlight label="Available from actual income" value={summary.availableFromActualIncomeMinor} currency={budget.currencyCode} />
      </div>
      <div className="budget-secondary-metrics">
        <SummaryItem label="Total allocated" value={summary.totalAllocatedMinor} currency={budget.currencyCode} />
        <SummaryItem label="Unallocated planned budget" value={summary.unallocatedMinor} currency={budget.currencyCode} />
        <SummaryItem label="Savings contributions" value={summary.savingsContributionMinor} currency={budget.currencyCode} />
        <SummaryItem label="Debt payments" value={summary.debtPaymentMinor} currency={budget.currencyCode} />
      </div>

      <SectionTabs key={budget.id} label="Budget sections" tabs={[
        { id: "overview", label: "Overview", content: <>
      <Panel>
        <SectionHeading detail={`${monthLabel} · ${budget.name}`} title="Budget usage" />
        <div className="budget-usage">
          <div className="budget-usage-copy"><strong>{summary.utilizationPercent}%</strong><span>actual spending against planned income</span></div>
          <div aria-label={`Budget usage: ${summary.utilizationPercent}% of planned income spent`} className="budget-usage-track" role="img">
            <span style={{ width: `${Math.min(100, Math.max(0, summary.utilizationPercent))}%` }} />
          </div>
          {summary.unallocatedMinor < 0 ? <p role="status">Planned allocations exceed planned income by {formatMoney(Math.abs(summary.unallocatedMinor), budget.currencyCode)}.</p> : null}
          <p>Unallocated planned income: <strong>{formatMoney(summary.unallocatedMinor, budget.currencyCode)}</strong></p>
        </div>
      </Panel>

      <div className="budget-layout">
        <Panel>
          <SectionHeading detail="Planned amount, actual spending, and what remains" title="Category allocation" />
          {summary.categories.length === 0 ? (
            <EmptyState description="Assign income to categories to make a plan." title="No allocations yet" />
          ) : (
            <div aria-label="Category allocation list" className="budget-category-progress-list" role="region" tabIndex={0}>
              {summary.categories.map((category) => {
                const config = categoryById.get(category.categoryId);
                const width = category.plannedMinor > 0 ? Math.min(100, Math.max(0, category.utilizationPercent)) : 0;
                return (
                  <article className="budget-category-progress" key={category.categoryId}>
                    <div className="budget-category-progress-heading">
                      <strong>{config?.name ?? "Archived category"}</strong>
                      <span>{formatMoney(category.spentMinor, budget.currencyCode)} of {formatMoney(category.plannedMinor, budget.currencyCode)}</span>
                    </div>
                    <div aria-label={`${config?.name ?? "Category"}: ${category.utilizationPercent}% used`} className={`budget-category-track${category.overBudgetMinor > 0 ? " is-over" : ""}`} role="img">
                      <span style={{ width: `${width}%` }} />
                    </div>
                    <p className={category.overBudgetMinor > 0 ? "budget-over-note" : ""}>
                      {category.overBudgetMinor > 0
                        ? `${formatMoney(category.overBudgetMinor, budget.currencyCode)} over allocation · ${category.utilizationPercent}% used`
                        : `${formatMoney(category.remainingMinor, budget.currencyCode)} remaining · ${category.utilizationPercent}% used`}
                    </p>
                  </article>
                );
              })}
            </div>
          )}
        </Panel>
        <Panel>
          <SectionHeading detail="Posted expenses only; linked account and debt records are counted once." title="Where your money goes" />
          <SpendingDonutChart currencyCode={budget.currencyCode} data={chartData} />
          <Link className="text-link chart-detail-link" href="/analytics">Explore analytics <ArrowRight aria-hidden="true" size={14} /></Link>
        </Panel>
      </div>

      <Panel>
        <SectionHeading detail="Planned allocations only, not actual expenses. Unallocated income is excluded." title="Allocation breakdown" />
        <SpendingDonutChart
          currencyCode={budget.currencyCode}
          data={allocationChartData}
          emptyMessage="Set category allocations to see your budget plan."
          label="Planned allocations by category"
          totalLabel="Allocated"
        />
      </Panel>

        </> },
        { id: "plan", label: "Plan and record", content: <>
      {isEditable ? (
        <Panel>
          <SectionHeading detail="Changes are saved to your authenticated budget." title="Plan and record" />
          <BudgetEntryForms
            accounts={data.accounts}
            budget={budget}
            categories={data.categories}
            incomes={data.incomes}
            month={month}
            today={currentDateForTimezone(preferences.timezone)}
            year={year}
          />
          <div className="budget-allocation-section">
            <SectionHeading detail="Allocations are plans, not spending." title="Edit category allocations" />
            <BudgetAllocationEditor budget={budget} categories={data.categories} allocationByCategory={allocationByCategory} />
          </div>
        </Panel>
      ) : (
        <Panel><p className="budget-help">This month is {budget.status}. Reopen it to edit or record transactions.</p></Panel>
      )}

        </> },
        { id: "analytics", label: "Analytics", content: <>
        <Panel>
          <SectionHeading detail="Planned allocation compared with actual spending" title="Planned vs actual" />
          <ComparisonBarChart
            currencyCode={budget.currencyCode}
            data={plannedVsActual}
            series={[
              { key: "planned", label: "Planned", color: "var(--brand)" },
              { key: "actual", label: "Actual", color: "var(--chart-transport)" },
            ]}
          />
        </Panel>
        </> },
        { id: "activity", label: "Activity", content: <>
        <Panel>
          <SectionHeading detail="Latest posted and reversed entries" title="Recent expenses" />
          {data.expenses.length === 0 ? <EmptyState description="Your spending will appear here." title="No expenses recorded yet" /> : (
            <ul className="budget-list">
              {data.expenses.slice(0, 10).map((expense) => (
                <li key={expense.id}>
                  <span><strong>{expense.description}</strong><small>{expense.categoryName} · {expense.transactionDate}{expense.merchant ? ` · ${expense.merchant}` : ""}</small>
                    {expense.status === "reversed" ? <small>Reversed: {expense.reversalReason}</small> : null}</span>
                  <span className="budget-expense-actions"><strong>{formatMoney(expense.amountMinor, budget.currencyCode)}</strong>
                    {isEditable ? <BudgetTransactionActions budget={budget} expense={expense} /> : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

      {isEditable && data.unlinkedDebtPayments.length > 0 ? (
        <Panel>
          <SectionHeading detail="These are existing Debt records, not new payments. Including them creates only a Budget reference." title="Link debt payments" />
          <ul className="budget-list">
            {data.unlinkedDebtPayments.map((payment) => {
              const debtCategory = data.categories.find((category) => category.categoryType === "debt");
              return (
                <li key={payment.id}>
                  <span><strong>{payment.debtName} · {payment.description}</strong><small>{payment.paymentDate} · {formatMoney(payment.amountMinor, payment.currencyCode)}</small></span>
                  {debtCategory ? <LinkDebtPaymentForm budgetId={budget.id} categoryId={debtCategory.id} paymentId={payment.id} paymentLabel={`${payment.debtName} ${formatMoney(payment.amountMinor, payment.currencyCode)}`} /> : <span>Debt category unavailable</span>}
                </li>
              );
            })}
          </ul>
        </Panel>
      ) : null}
        </> },
      ]} />

      {reconciliation.issues.length ? (
        <Panel className="budget-reconciliation">
          <SectionHeading detail="No linked financial records were changed automatically." title="Linked transaction review needed" />
          <ul>{reconciliation.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
        </Panel>
      ) : null}
    </div>
  );
}

function SummaryItem({
  label,
  value,
  currency,
  highlight = false,
}: {
  label: string;
  value: number;
  currency: CurrencyCode;
  highlight?: boolean;
}) {
  return (
    <div className={`budget-summary-item${highlight ? " budget-summary-highlight" : ""}`}>
      <span>{label}</span>
      <strong>{formatMoney(value, currency)}</strong>
    </div>
  );
}
