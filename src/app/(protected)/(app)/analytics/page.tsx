import { AlertCircle, ArrowDownLeft, ArrowUpRight, ChartNoAxesCombined, CreditCard, PiggyBank, Plane, Wallet } from "lucide-react";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import {
  ComparisonBarChart,
  SpendingDonutChart,
  TrendLineChart,
  type TrendDatum,
} from "@/components/charts";
import { EmptyState, PageHeader, Panel, ProgressBar, SectionHeading } from "@/components/ui";
import { formatDate, formatMonth } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { requireUser } from "@/lib/auth-session";
import { getAnalyticsDashboardData } from "@/services/analytics-service";
import { getUserPreferences } from "@/services/preferences-service";
import { AnalyticsRangeError } from "@/lib/analytics";
import type { AnalyticsDashboardData, AnalyticsPeriod } from "@/types/analytics";
import type { CurrencyCode } from "@/types/domain";

type SearchParams = Record<string, string | string[] | undefined>;

const periods: Array<{ value: AnalyticsPeriod; label: string }> = [
  { value: "this-month", label: "This month" },
  { value: "last-month", label: "Last month" },
  { value: "last-3-months", label: "Last 3 months" },
  { value: "last-6-months", label: "Last 6 months" },
  { value: "year-to-date", label: "Year to date" },
  { value: "this-year", label: "This year" },
  { value: "custom", label: "Custom range" },
];

export default function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return (
    <Suspense fallback={<AnalyticsLoading />}>
      <AnalyticsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function AnalyticsContent({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  const preferences = await getUserPreferences(user.id);
  const params = await searchParams;
  const periodParam = firstParam(params.period);
  const selectedPeriod = periods.find((period) => period.value === periodParam)?.value ?? "this-month";
  const customStart = firstParam(params.from);
  const customEnd = firstParam(params.to);
  let filterError: string | null = periodParam && selectedPeriod !== periodParam
    ? "Choose a supported analytics period."
    : null;
  let data: AnalyticsDashboardData;

  try {
    data = await getAnalyticsDashboardData(user.id, {
      period: selectedPeriod,
      timezone: preferences.timezone,
      defaultCurrencyCode: preferences.defaultCurrencyCode,
      customStart,
      customEnd,
    });
  } catch (error) {
    if (!(error instanceof AnalyticsRangeError)) throw error;
    filterError = error.message;
    data = await getAnalyticsDashboardData(user.id, {
      period: "this-month",
      timezone: preferences.timezone,
      defaultCurrencyCode: preferences.defaultCurrencyCode,
    });
  }

  const rangeLabel = `${formatRangeDate(data.range.startDate, preferences.timezone)} – ${formatRangeDate(data.range.endDate, preferences.timezone)}`;
  const rangeIsEmpty = data.savings.trend.every((series) => series.points.every((point) => point.amountMinor === 0))
    && data.budget.actualIncome.length === 0
    && data.budget.actualSpending.length === 0
    && data.debt.paid.length === 0;
  const currencyCodes = allCurrencyCodes(data);

  return (
    <div className="page-stack">
      <PageHeader
        description="Understand where your money is going."
        eyebrow="Patterns, not pressure"
        title="Analytics"
      />

      <Panel className="analytics-filter-panel">
        <form className="analytics-period-form" method="get">
          <label>
            <span>Time period</span>
            <select defaultValue={selectedPeriod} name="period">
              {periods.map((period) => <option key={period.value} value={period.value}>{period.label}</option>)}
            </select>
          </label>
          <label>
            <span>From</span>
            <input defaultValue={customStart ?? (selectedPeriod === "custom" ? "" : undefined)} name="from" type="date" />
          </label>
          <label>
            <span>To</span>
            <input defaultValue={customEnd ?? (selectedPeriod === "custom" ? "" : undefined)} name="to" type="date" />
          </label>
          <button className="button button-primary" type="submit">Apply</button>
          <p aria-live="polite" className="analytics-period-range">
            <strong>{rangeLabel}</strong>
            <span>{preferences.timezone}</span>
          </p>
        </form>
        {filterError ? <p className="analytics-filter-error" role="alert"><AlertCircle aria-hidden="true" size={16} />{filterError} Showing this month until the range is corrected.</p> : null}
      </Panel>

      <section aria-label="Financial overview" className="page-stack">
        <SectionHeading detail="Tracked balances and posted activity, grouped by currency." title="Financial Overview" />
        <div className="metrics-grid analytics-metrics-grid">
          <GroupedMetric icon={<PiggyBank aria-hidden="true" size={18} />} label="Savings balances" metrics={data.savings.balances} empty="No included savings balances" />
          <GroupedMetric icon={<Wallet aria-hidden="true" size={18} />} label="Actual income" metrics={data.budget.actualIncome} empty="No income recorded" />
          <GroupedMetric icon={<ArrowUpRight aria-hidden="true" size={18} />} label="Spending" metrics={data.budget.actualSpending} empty="No spending recorded" />
          <GroupedMetric icon={<CreditCard aria-hidden="true" size={18} />} label="Outstanding debt" metrics={data.debt.outstanding} empty="No active debt balances" />
        </div>
        {rangeIsEmpty ? (
          <EmptyState description={`No posted income, spending, savings changes, or debt payments were recorded from ${rangeLabel}.`} title="No activity in this period" />
        ) : null}
      </section>

      {data.insights.length > 0 ? (
        <section aria-label="Factual financial insights" className="analytics-insights">
          <SectionHeading detail="Calculated from your recorded accounts and budgets. These are factual summaries, not recommendations." title="What stands out" />
          <div className="analytics-insight-list">
            {data.insights.map((insight, index) => (
              <Link className={`analytics-insight insight-${insight.severity}`} href={insight.relatedRoute} key={`${insight.type}-${index}`}>
                <span aria-hidden="true" className="analytics-insight-mark" />
                <span><strong>{insight.title}</strong><small>{insight.message}</small></span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section aria-label="Savings analytics" className="analytics-grid">
        <Panel className="panel-wide">
          <SectionHeading detail="Period-ending balances; account transfers net to zero." title="Savings balance trend" />
          {data.savings.trend.length === 0 ? (
            <div className="analytics-empty"><PiggyBank aria-hidden="true" size={22} /><span>Add a savings account to start seeing savings trends.</span></div>
          ) : data.savings.trend.map((series) => (
            <div className="analytics-series" key={series.currencyCode}>
              <h3>{series.currencyCode}</h3>
              <TrendLineChart
                currencyCode={series.currencyCode}
                data={series.points.map((point) => ({ month: formatBucket(point.period), balance: point.amountMinor }))}
                series={[{ key: "balance", label: "Ending balance", color: "var(--brand)" }]}
              />
            </div>
          ))}
        </Panel>

        <Panel>
          <SectionHeading detail="Balances included in your Savings total." title="Accounts" />
          {data.savings.accounts.length === 0 ? (
            <div className="analytics-empty"><span>Add a savings account to see account balances.</span></div>
          ) : (
            <div className="analytics-account-list">
              {data.savings.accounts.map((account) => (
                <div className="analytics-account-row" key={`${account.name}-${account.currencyCode}`}>
                  <span><strong>{account.name}</strong><small>{account.currencyCode}{account.archived ? " · archived" : account.includedInTotal ? "" : " · excluded from total"}</small></span>
                  <strong>{formatMoney(account.balanceMinor, account.currencyCode)}</strong>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel className="panel-wide">
          <SectionHeading detail="Posted Debt payments, grouped by the selected period's chart buckets." title="Debt payments over time" />
          {data.debt.paymentTrend.length === 0 ? <div className="chart-empty">No debt payments in this period.</div> : data.debt.paymentTrend.map((series) => (
            <div className="analytics-series" key={series.currencyCode}>
              <h3>{series.currencyCode}</h3>
              <TrendLineChart
                currencyCode={series.currencyCode}
                data={series.points.map((point) => ({ month: formatBucket(point.period), paid: point.amountMinor }))}
                series={[{ key: "paid", label: "Debt payments", color: "var(--chart-debt)" }]}
              />
            </div>
          ))}
        </Panel>

        <Panel>
          <SectionHeading detail={`Deposits and withdrawals during ${rangeLabel}; transfers are excluded.`} title="Savings activity" />
          {currencyCodes.length === 0 ? <div className="chart-empty">No savings transactions in this period.</div> : currencyCodes.map((currency) => {
            const deposits = amountFor(data.savings.deposits, currency);
            const withdrawals = amountFor(data.savings.withdrawals, currency);
            return (
              <div className="analytics-series" key={currency}>
                <h3>{currency}</h3>
                <ComparisonBarChart
                  currencyCode={currency}
                  data={[{ month: "Selected period", deposits, withdrawals }]}
                  series={[
                    { key: "deposits", label: "Deposits", color: "var(--brand)" },
                    { key: "withdrawals", label: "Withdrawals", color: "var(--chart-transport)" },
                  ]}
                />
              </div>
            );
          })}
          <div className="analytics-compact-metrics">
            <GroupedMetric icon={<ArrowDownLeft aria-hidden="true" size={16} />} label="Net savings change" metrics={data.savings.change} empty="No balance change" compact />
          </div>
        </Panel>

        <Panel className="panel-wide">
          <SectionHeading detail="Linked goals use the current balance of their savings account." title="Savings goals" />
          {data.savings.goals.length === 0 ? (
            <div className="analytics-empty"><span>Create a savings goal to see progress here.</span></div>
          ) : (
            <div className="analytics-goal-list">
              {data.savings.goals.map((goal) => (
                <ProgressBar
                  displayValue={`${formatMoney(goal.savedMinor, goal.currencyCode)} / ${formatMoney(goal.targetMinor, goal.currencyCode)} · ${goal.progressPercent}%`}
                  key={`${goal.name}-${goal.currencyCode}`}
                  label={`${goal.name} · ${goal.currencyCode}`}
                  max={goal.targetMinor}
                  value={goal.savedMinor}
                />
              ))}
            </div>
          )}
        </Panel>
      </section>

      <section aria-label="Budget and spending analytics" className="analytics-grid">
        <Panel>
          <SectionHeading detail="Posted expenses, counted once by their Budget record, Travel record, or unlinked Debt payment." title="Where your money goes" />
          {data.budget.spendingByCategory.length === 0 ? (
            <div className="analytics-empty"><span>Create a monthly budget or record a debt payment to see spending analytics.</span></div>
          ) : currencyCodes.map((currency) => {
            const chartData = data.budget.spendingByCategory
              .filter((entry) => entry.currencyCode === currency)
              .map((entry) => ({ name: entry.name, value: entry.amountMinor, color: entry.color }));
            return chartData.length > 0 ? <div className="analytics-series" key={currency}><h3>{currency}</h3><SpendingDonutChart currencyCode={currency} data={chartData} /></div> : null;
          })}
        </Panel>

        <Panel className="panel-wide">
          <SectionHeading detail="Trip plans use their expected date, or the trip start date when no expected date is set. Foreign currencies stay separate." title="Travel spending" />
          <div className="analytics-compact-metrics">
            <GroupedMetric icon={<Plane aria-hidden="true" size={16} />} label="Planned travel" metrics={data.travel.planned} empty="No travel expenses planned for this period" compact />
            <GroupedMetric icon={<ArrowUpRight aria-hidden="true" size={16} />} label="Actual travel expenses" metrics={data.travel.actualSpending} empty="No travel expenses recorded for this period" compact />
          </div>
          {data.travel.byTrip.length === 0 ? (
            <div className="analytics-empty"><span>Plan a trip to compare expected and recorded expenses.</span></div>
          ) : (
            <div className="analytics-travel-list">
              {data.travel.byTrip.map((trip) => (
                <div className="analytics-travel-row" key={`${trip.tripId}-${trip.currencyCode}`}>
                  <span><strong>{trip.tripName}</strong><small>{trip.destination} · {trip.currencyCode}</small></span>
                  <span><small>Planned</small><strong>{formatMoney(trip.plannedMinor, trip.currencyCode)}</strong></span>
                  <span><small>Actual</small><strong>{formatMoney(trip.actualMinor, trip.currencyCode)}</strong></span>
                </div>
              ))}
            </div>
          )}
          {data.travel.spendingTrend.map((series) => (
            <div className="analytics-series" key={series.currencyCode}>
              <h3>{series.currencyCode}</h3>
              <TrendLineChart
                currencyCode={series.currencyCode}
                data={series.points.map((point) => ({ month: formatBucket(point.period), actual: point.amountMinor }))}
                series={[{ key: "actual", label: "Travel expenses", color: "var(--chart-travel)" }]}
              />
            </div>
          ))}
        </Panel>

        <Panel>
          <SectionHeading detail={`Actual income and spending by ${preferences.timezone} calendar date.`} title="Income vs spending" />
          {currencyCodes.length === 0 ? <div className="chart-empty">No income or spending in this period.</div> : currencyCodes.map((currency) => (
            <div className="analytics-series" key={currency}>
              <h3>{currency}</h3>
              <ComparisonBarChart
                currencyCode={currency}
                data={combineTrend(data.budget.incomeTrend, data.budget.spendingTrend, currency)}
                series={[
                  { key: "income", label: "Actual income", color: "var(--brand)" },
                  { key: "spending", label: "Spending", color: "var(--chart-transport)" },
                ]}
              />
            </div>
          ))}
        </Panel>

        <Panel className="panel-wide">
          <SectionHeading detail="Spending compared with the full planned allocation for each budget month in this period." title="Category allocation" />
          {data.budget.categories.length === 0 ? (
            <div className="analytics-empty"><span>Create a monthly budget to see category allocations.</span></div>
          ) : (
            <div className="analytics-category-list">
              {data.budget.categories.map((category) => {
                const share = data.budget.spendingByCategory.find((entry) => entry.name === category.name && entry.currencyCode === category.currencyCode)?.percentage ?? 0;
                return (
                  <div className="analytics-category-row" key={`${category.currencyCode}-${category.name}`}>
                    <div className="analytics-category-heading">
                      <span><i aria-hidden="true" style={{ backgroundColor: category.color }} />{category.name} · {category.currencyCode}</span>
                      <strong>{formatMoney(category.spentMinor, category.currencyCode)} spent</strong>
                    </div>
                    <small className="analytics-category-comparison">
                      {share}% of spending · previous {formatMoney(category.previousSpentMinor, category.currencyCode)} · change {category.absoluteChangeMinor >= 0 ? "+" : "−"}{formatMoney(Math.abs(category.absoluteChangeMinor), category.currencyCode)}
                      {category.percentageChange === null ? " · no comparable percentage" : ` (${category.percentageChange > 0 ? "+" : ""}${category.percentageChange}%)`}
                    </small>
                    <ProgressBar
                      displayValue={category.utilizationPercent === null ? "No allocation" : `${category.utilizationPercent}%`}
                      label={`Planned ${formatMoney(category.plannedMinor, category.currencyCode)} · Remaining ${formatMoney(category.remainingMinor, category.currencyCode)}`}
                      max={category.plannedMinor}
                      value={category.spentMinor}
                      tone={category.overAllocationMinor > 0 ? "amber" : "green"}
                    />
                    {category.overAllocationMinor > 0 ? <small className="analytics-over-allocation">{formatMoney(category.overAllocationMinor, category.currencyCode)} over allocation</small> : null}
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel>
          <SectionHeading detail="Received income is dated by its recorded receipt date." title="Income" />
          <GroupedMetric icon={<Wallet aria-hidden="true" size={16} />} label="Planned income" metrics={data.budget.plannedIncome} empty="No budget income planned" compact />
          <GroupedMetric icon={<ArrowDownLeft aria-hidden="true" size={16} />} label="Actual income" metrics={data.budget.actualIncome} empty="No income recorded for this period" compact />
          <GroupedMetric icon={<Wallet aria-hidden="true" size={16} />} label="Allocated plan" metrics={data.budget.allocated} empty="No allocations in this period" compact />
          <GroupedMetric icon={<Wallet aria-hidden="true" size={16} />} label="Unallocated plan" metrics={data.budget.unallocated} empty="No unallocated plan" compact />
          {data.budget.incomeBySource.length > 0 ? (
            <ul aria-label="Income by source" className="analytics-income-list">
              {data.budget.incomeBySource.map((source) => (
                <li className="analytics-income-row" key={`${source.currencyCode}:${source.incomeType}:${source.name}`}>
                  <div>
                    <strong>{source.name}</strong>
                    <small>{source.incomeType.replaceAll("_", " ")}</small>
                  </div>
                  <div>
                    <span>{formatMoney(source.receivedMinor, source.currencyCode)} received</span>
                    <small>{formatMoney(source.plannedMinor, source.currencyCode)} planned</small>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="analytics-compact-metrics">
            <GroupedMetric icon={<PiggyBank aria-hidden="true" size={16} />} label="Savings contributions" metrics={data.budget.savingsContributions} empty="No contributions recorded" compact />
          </div>
        </Panel>

        <Panel>
          <SectionHeading detail="Only linked Budget expenses or unlinked Debt payments count toward spending." title="Debt" />
          <GroupedMetric icon={<CreditCard aria-hidden="true" size={16} />} label="Outstanding balance" metrics={data.debt.outstanding} empty="No debt data to analyze" compact />
          <GroupedMetric icon={<ArrowUpRight aria-hidden="true" size={16} />} label="Payments in period" metrics={data.debt.paid} empty="No debt payments in this period" compact />
          <GroupedMetric icon={<ChartNoAxesCombined aria-hidden="true" size={16} />} label="Due this month" metrics={data.debt.dueThisMonth} empty="No installments due this month" compact />
          <GroupedMetric icon={<AlertCircle aria-hidden="true" size={16} />} label="Overdue" metrics={data.debt.overdue} empty="No overdue installments" compact />
        </Panel>

        <Panel className="panel-wide">
          <SectionHeading detail="Progress uses recorded opening balance and current ledger balance; no principal split is inferred." title="Debt progress by plan" />
          {data.debt.byPlan.length === 0 ? (
            <div className="analytics-empty"><span>No debt data to analyze.</span></div>
          ) : (
            <div className="analytics-debt-list">
              {data.debt.byPlan.map((debt) => (
                <div className="analytics-debt-row" key={`${debt.name}-${debt.currencyCode}`}>
                  <div className="analytics-debt-title"><strong>{debt.name}</strong><span>{debt.creditor || "Debt"} · {debt.debtType.replaceAll("_", " ")} · {debt.currencyCode}</span></div>
                  <ProgressBar
                    displayValue={`${debt.progressPercent}% paid · ${formatMoney(debt.balanceMinor, debt.currencyCode)} remaining`}
                    label={`${formatMoney(debt.amountPaidMinor, debt.currencyCode)} paid of ${formatMoney(debt.openingBalanceMinor, debt.currencyCode)}`}
                    max={debt.openingBalanceMinor}
                    value={debt.amountPaidMinor}
                    tone="blue"
                  />
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel className="panel-wide">
          <SectionHeading detail="Scheduled obligations are not counted as spending until paid." title="Upcoming obligations" />
          {data.debt.upcomingInstallments.length === 0 ? (
            <div className="analytics-empty"><span>No installments are due in the next 30 days.</span></div>
          ) : (
            <div className="analytics-obligation-list">
              {data.debt.upcomingInstallments.map((installment, index) => (
                <div className="analytics-obligation-row" key={`${installment.debtName}-${installment.dueDate}-${index}`}>
                  <span><strong>{installment.debtName}</strong><small>{installment.creditor || "Debt"} · due {formatDate(installment.dueDate, "MMM d, yyyy")} · {installment.status.replaceAll("_", " ")}</small></span>
                  <strong>{formatMoney(installment.amountMinor, installment.currencyCode)}</strong>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel className="panel-wide">
          <SectionHeading detail="Change from the immediately preceding date range of the same length." title="Period comparison" />
          <div className="analytics-comparison-list">
            <ComparisonList title="Income" metrics={data.comparisons.income} />
            <ComparisonList title="Spending" metrics={data.comparisons.spending} />
            <ComparisonList title="Savings change" metrics={data.comparisons.savingsChange} />
            <ComparisonList title="Debt payments" metrics={data.comparisons.debtPayments} />
          </div>
        </Panel>
      </section>

      <Link className="text-link" href="/budget">Review your monthly budget →</Link>
    </div>
  );
}

function AnalyticsLoading() {
  return (
    <div aria-busy="true" className="page-stack">
      <PageHeader
        description="Understand where your money is going."
        eyebrow="Patterns, not pressure"
        title="Analytics"
      />
      <Panel><p role="status">Loading your financial analytics…</p></Panel>
    </div>
  );
}

function GroupedMetric({
  icon,
  label,
  metrics,
  empty,
  compact = false,
}: {
  icon: ReactNode;
  label: string;
  metrics: Array<{ currencyCode: CurrencyCode; amountMinor: number }>;
  empty: string;
  compact?: boolean;
}) {
  return (
    <article className={`analytics-grouped-metric${compact ? " analytics-grouped-metric-compact" : ""}`}>
      <div className="analytics-grouped-metric-label">{icon}<span>{label}</span></div>
      {metrics.length > 0 ? metrics.map((metric) => (
        <div className="analytics-grouped-metric-value" key={metric.currencyCode}>
          <strong>{formatMoney(metric.amountMinor, metric.currencyCode)}</strong><small>{metric.currencyCode}</small>
        </div>
      )) : <p>{empty}</p>}
    </article>
  );
}

function ComparisonList({
  title,
  metrics,
}: {
  title: string;
  metrics: Array<{ currencyCode: CurrencyCode; amountMinor: number; previousAmountMinor: number; absoluteChangeMinor: number; percentageChange: number | null }>;
}) {
  return (
    <div className="analytics-comparison-item">
      <h3>{title}</h3>
      {metrics.length === 0 ? <p>No data in either period.</p> : metrics.map((metric) => (
        <p key={metric.currencyCode}>
          <strong>{metric.currencyCode}</strong> {formatMoney(metric.amountMinor, metric.currencyCode)} vs {formatMoney(metric.previousAmountMinor, metric.currencyCode)}
          <span> · {metric.absoluteChangeMinor >= 0 ? "+" : "−"}{formatMoney(Math.abs(metric.absoluteChangeMinor), metric.currencyCode)}
            {metric.percentageChange === null ? " · no comparable percentage" : ` (${metric.percentageChange > 0 ? "+" : ""}${metric.percentageChange}%)`}
          </span>
        </p>
      ))}
    </div>
  );
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatRangeDate(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-PH", { timeZone: timezone, month: "short", day: "numeric", year: "numeric" })
    .format(new Date(`${value}T12:00:00.000Z`));
}

function formatBucket(value: string) {
  return value.length === 7 ? formatMonth(value, "MMM yyyy") : formatDate(value, "MMM d");
}

function amountFor(metrics: Array<{ currencyCode: CurrencyCode; amountMinor: number }>, currencyCode: CurrencyCode) {
  return metrics.find((metric) => metric.currencyCode === currencyCode)?.amountMinor ?? 0;
}

function allCurrencyCodes(data: Awaited<ReturnType<typeof getAnalyticsDashboardData>>) {
  const codes = new Set<CurrencyCode>();
  const groups = [
    data.savings.balances,
    data.savings.deposits,
    data.savings.withdrawals,
    data.budget.actualIncome,
    data.budget.actualSpending,
    data.debt.outstanding,
    data.debt.paid,
    data.travel.actualSpending,
  ];
  for (const group of groups) for (const item of group) codes.add(item.currencyCode);
  for (const category of data.budget.spendingByCategory) codes.add(category.currencyCode);
  for (const metric of data.travel.planned) codes.add(metric.currencyCode);
  return [...codes];
}

function combineTrend(
  income: Awaited<ReturnType<typeof getAnalyticsDashboardData>>["budget"]["incomeTrend"],
  spending: Awaited<ReturnType<typeof getAnalyticsDashboardData>>["budget"]["spendingTrend"],
  currencyCode: CurrencyCode,
): TrendDatum[] {
  const byPeriod = new Map<string, TrendDatum>();
  for (const point of income.find((series) => series.currencyCode === currencyCode)?.points ?? []) {
    byPeriod.set(point.period, { month: formatBucket(point.period), income: point.amountMinor, spending: 0 });
  }
  for (const point of spending.find((series) => series.currencyCode === currencyCode)?.points ?? []) {
    const current = byPeriod.get(point.period) ?? { month: formatBucket(point.period), income: 0, spending: 0 };
    byPeriod.set(point.period, { ...current, spending: point.amountMinor });
  }
  return [...byPeriod.values()];
}
