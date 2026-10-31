import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowUpRight, Cpu, PiggyBank, Wifi } from "lucide-react";
import { TrendLineChart } from "@/components/charts";
import { SavingsActions } from "@/components/savings-actions";
import { SavingsTransactionList } from "@/components/savings-transaction-list";
import { EmptyState, PageHeader, Panel, ProgressBar, SectionHeading } from "@/components/ui";
import { requireUser } from "@/lib/auth-session";
import { resolveAccountBrand } from "@/lib/account-brand";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { transactionFiltersSchema } from "@/lib/validations/savings";
import { getUserPreferences } from "@/services/preferences-service";
import { getSavingsOverview, type SavingsTrendPeriod } from "@/services/savings-service";
import { findRecentTransactionsForUser } from "@/repositories/account-transaction-repository";
import type { CurrencyCode, SavingsTransactionType } from "@/types/domain";

export const instant = false;

const transactionTypes: { value: SavingsTransactionType | "all"; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "opening_balance", label: "Opening balance" },
  { value: "deposit", label: "Deposits" },
  { value: "withdrawal", label: "Withdrawals" },
  { value: "adjustment_increase", label: "Balance increases" },
  { value: "adjustment_decrease", label: "Balance decreases" },
  { value: "transfer_in", label: "Transfers in" },
  { value: "transfer_out", label: "Transfers out" },
  { value: "reversal", label: "Reversals" },
];

export default async function SavingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [user, query] = await Promise.all([requireUser(), searchParams]);
  const trendPeriod: SavingsTrendPeriod =
    query.period === "month" || query.period === "3m" || query.period === "6m" || query.period === "year"
      ? query.period
      : "6m";
  const [overview, preferences] = await Promise.all([
    getSavingsOverview(user.id, undefined, trendPeriod),
    getUserPreferences(user.id),
  ]);
  const filters = transactionFiltersSchema.safeParse({
    accountId: typeof query.accountId === "string" ? query.accountId : undefined,
    type: typeof query.type === "string" ? query.type : undefined,
    status: typeof query.status === "string" ? query.status : undefined,
    search: typeof query.search === "string" ? query.search : undefined,
    from: typeof query.from === "string" ? query.from : undefined,
    to: typeof query.to === "string" ? query.to : undefined,
  });
  const activeFilters = filters.success ? filters.data : {};
  const requestedPage = typeof query.page === "string" ? Number(query.page) : 1;
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 100_000) : 1;
  const transactions = await findRecentTransactionsForUser(user.id, {
    limit: 51,
    offset: (page - 1) * 50,
    accountId: activeFilters.accountId,
    type: activeFilters.type && activeFilters.type !== "all" ? activeFilters.type : undefined,
    status: activeFilters.status && activeFilters.status !== "all" ? activeFilters.status : undefined,
    search: activeFilters.search,
    from: activeFilters.from ? new Date(`${activeFilters.from}T00:00:00.000Z`) : undefined,
    to: activeFilters.to ? new Date(`${activeFilters.to}T23:59:59.999Z`) : undefined,
  });
  const accountNames = new Map(overview.accounts.concat(overview.archivedAccounts).map((account) => [account.id, account.name]));
  const filterQuery = new URLSearchParams();
  for (const [key, value] of Object.entries(activeFilters)) {
    if (value) filterQuery.set(key, value);
  }
  const pageLink = (target: number) => {
    const params = new URLSearchParams(filterQuery);
    params.set("period", trendPeriod);
    params.set("page", String(target));
    return `/savings?${params.toString()}`;
  };

  return (
    <div className="page-stack">
      <PageHeader
        action={<SavingsActions accounts={overview.accounts} defaultCurrency={preferences.defaultCurrencyCode} goals={overview.goals} />}
        description="Balances are based on transactions you enter manually; Iponly does not connect to banks."
        eyebrow="Build your buffer"
        title="Savings"
      />

      <section aria-label="Savings totals" className="savings-feature">
        <div>
          <p className="eyebrow">Total across included accounts</p>
          {overview.totals.size === 0 ? (
            <p className="savings-total-empty">No savings accounts yet.</p>
          ) : (
            <div className="savings-total-list">
              {[...overview.totals.entries()].map(([currencyCode, total]) => (
                <div key={currencyCode}><MoneyLine amount={total} currency={currencyCode} /><span>{currencyCode}</span></div>
              ))}
            </div>
          )}
          <p>{overview.accounts.length} active {overview.accounts.length === 1 ? "account" : "accounts"} · amounts stay grouped by currency</p>
        </div>
        <div className="savings-change-list">
          <strong>Change this month</strong>
          {overview.change.size === 0
            ? <span>No savings movement recorded yet.</span>
            : [...overview.change.entries()].map(([currencyCode, amount]) => (
                <span key={currencyCode}>{amount >= 0 ? "+" : "−"}{formatMoney(Math.abs(amount), currencyCode)} {currencyCode}</span>
              ))}
        </div>
      </section>

      <Panel>
        <SectionHeading detail="Manually tracked balances · no bank connection" title="Financial accounts" />
        {overview.accounts.length === 0 ? (
          <EmptyState description="Add your first account to start tracking your ipon." title="No savings accounts yet" />
        ) : (
          <div className="account-grid">
            {overview.accounts.map((account) => {
              const balance = overview.balances.get(account.id) ?? 0;
              const lastActivity = overview.lastActivity.get(account.id);
              const goal = overview.goals.find((item) => item.accountId === account.id);
              const brand = resolveAccountBrand(account);
              const balanceLabel = formatMoney(balance, account.currencyCode);
              const cardStyle = {
                "--account-card-background": brand.background,
                "--account-card-foreground": brand.foreground,
                "--account-card-accent": brand.accent,
                "--account-card-balance-size": balanceLabel.length > 20 ? "20px" : balanceLabel.length > 16 ? "24px" : "30px",
              } as CSSProperties;
              return (
                <article className="savings-account-card" key={account.id}>
                  <Link aria-label={`View ${account.name} account details`} className="savings-bank-card" data-brand={brand.id} href={`/savings/${account.id}`} style={cardStyle}>
                    <span aria-hidden="true" className="savings-bank-watermark">{brand.label.slice(0, 1).toLowerCase()}</span>
                    <div className="savings-bank-card-top">
                      <span className="savings-bank-card-kind">{account.accountType.replaceAll("_", " ")}</span>
                      <strong className="savings-bank-brand" title={brand.label}>{brand.label}</strong>
                    </div>
                    <div aria-hidden="true" className="savings-bank-chip-row">
                      <span className="savings-bank-chip"><Cpu size={32} strokeWidth={1} /></span>
                      <Wifi className="savings-bank-contactless" size={23} strokeWidth={2} />
                    </div>
                    <div className="savings-bank-card-value">
                      <span className="savings-bank-account-name" title={account.name}>{account.name}</span>
                      <strong className="savings-bank-balance">{balanceLabel}</strong>
                    </div>
                    <div className="savings-bank-card-bottom">
                      <span>{account.currencyCode}</span>
                      <span>Account details <ArrowUpRight aria-hidden="true" size={15} /></span>
                    </div>
                  </Link>
                  <div className="savings-account-meta">
                    <span>{account.includeInTotal ? "Included in totals" : "Excluded from totals"}</span>
                    <span>{lastActivity ? `Activity ${formatDate(lastActivity.toISOString(), "MMM d")}` : "No activity yet"}</span>
                  </div>
                  {goal ? <ProgressBar displayValue={`${goal.progressPercent}% · ${formatMoney(goal.savedMinor, goal.currencyCode)} / ${formatMoney(goal.targetAmountMinor, goal.currencyCode)}`} label={goal.name} max={goal.targetAmountMinor} value={goal.savedMinor} /> : null}
                </article>
              );
            })}
          </div>
        )}
      </Panel>

      <div className="overview-grid">
        <Panel className="span-7">
          <SectionHeading detail="Progress uses a linked account balance; otherwise it starts at zero" title="Savings goals" />
          {overview.goals.length === 0 ? (
            <EmptyState description="Create a goal for your emergency fund, travel, or next big purchase." title="No savings goals yet" />
          ) : (
            <div className="goal-list">
              {overview.goals.map((goal) => (
                <div className="goal-row savings-goal-row" key={goal.id}>
                  <div className="goal-row-head"><strong>{goal.name}</strong><span>{goal.targetDate ? `Target ${formatDate(goal.targetDate.toISOString(), "MMM yyyy")}` : "No target date"}</span></div>
                  <ProgressBar displayValue={`${goal.progressPercent}% · ${formatMoney(goal.savedMinor, goal.currencyCode)} / ${formatMoney(goal.targetAmountMinor, goal.currencyCode)}`} label={`${formatMoney(goal.remainingMinor, goal.currencyCode)} remaining`} max={goal.targetAmountMinor} value={goal.savedMinor} />
                </div>
              ))}
            </div>
          )}
        </Panel>
        <Panel className="span-5">
          <SectionHeading detail="Net changes; internal transfers cancel out" title="Savings trend" />
          <form action="/savings" className="savings-period-form" method="get">
            <label htmlFor="savings-trend-period">Show</label>
            <select defaultValue={trendPeriod} id="savings-trend-period" name="period">
              <option value="month">Current month</option>
              <option value="3m">Last 3 months</option>
              <option value="6m">Last 6 months</option>
              <option value="year">Current year</option>
            </select>
            <button className="button button-secondary" type="submit">Update trend</button>
          </form>
          {overview.trend.length === 0 ? (
            <div className="analytics-empty"><PiggyBank aria-hidden="true" size={22} /><span>Add accounts and transactions to see your trend.</span></div>
          ) : overview.trend.map((series) => (
            <div className="savings-trend" key={series.currencyCode}>
              <p>{series.currencyCode} balance</p>
              <TrendLineChart currencyCode={series.currencyCode} data={series.data.map((point) => ({ month: point.month, balance: point.balanceMinor }))} series={[{ key: "balance", label: "Balance", color: "var(--brand)" }]} />
            </div>
          ))}
        </Panel>
      </div>

      <Panel>
        <SectionHeading detail="50 transactions per page; use filters to narrow the history" title="Transaction history" />
        <form action="/savings" className="savings-filter-form" method="get">
          <label><span>Search description or notes</span><input defaultValue={activeFilters.search} maxLength={100} name="search" /></label>
          <label><span>Account</span><select defaultValue={activeFilters.accountId ?? ""} name="accountId"><option value="">All accounts</option>{overview.accounts.concat(overview.archivedAccounts).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
          <label><span>Type</span><select defaultValue={activeFilters.type ?? "all"} name="type">{transactionTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
          <label><span>Status</span><select defaultValue={activeFilters.status ?? "all"} name="status"><option value="all">All statuses</option><option value="posted">Posted</option><option value="reversed">Reversed</option></select></label>
          <label><span>From</span><input defaultValue={activeFilters.from} name="from" type="date" /></label>
          <label><span>To</span><input defaultValue={activeFilters.to} name="to" type="date" /></label>
          <button className="button button-secondary" type="submit">Filter history</button>
        </form>
        <SavingsTransactionList accountNames={accountNames} transactions={transactions.slice(0, 50).map((row) => row.transaction)} />
        <nav aria-label="Transaction pages" className="savings-pagination">
          <span>Page {page}</span>
          {page > 1 ? <Link className="button button-secondary" href={pageLink(page - 1)}>Previous</Link> : null}
          {transactions.length > 50 ? <Link className="button button-secondary" href={pageLink(page + 1)}>Next</Link> : null}
        </nav>
      </Panel>

      {overview.archivedAccounts.length > 0 ? (
        <Panel>
          <SectionHeading detail="Archived accounts retain their balances and transaction histories." title="Archived accounts" />
          <div className="archived-account-list">
            {overview.archivedAccounts.map((account) => (
              <div className="archived-account-row" key={account.id}>
                <span>
                  <Link className="text-link" href={`/savings/${account.id}`}>{account.name}</Link>
                  <small>{formatMoney(overview.balances.get(account.id) ?? 0, account.currencyCode)} · {account.currencyCode}</small>
                </span>
                <SavingsActions account={account} accounts={[account]} createAccount={false} defaultCurrency={preferences.defaultCurrencyCode} />
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      <p className="savings-footnote">Transfers between your own accounts are recorded as linked movements, not income. Cross-currency transfers are not supported.</p>
    </div>
  );
}

function MoneyLine({ amount, currency }: { amount: number; currency: CurrencyCode }) {
  return <strong>{formatMoney(amount, currency)}</strong>;
}
