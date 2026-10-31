import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { TrendLineChart } from "@/components/charts";
import { SavingsActions } from "@/components/savings-actions";
import { SavingsTransactionList } from "@/components/savings-transaction-list";
import { EmptyState, PageHeader, Panel, ProgressBar, SectionHeading } from "@/components/ui";
import { requireUser } from "@/lib/auth-session";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { getUserPreferences } from "@/services/preferences-service";
import { getSavingsAccountDetails } from "@/services/savings-service";

export const instant = false;

export default async function SavingsAccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ accountId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const [{ accountId }, query, user] = await Promise.all([params, searchParams, requireUser()]);
  const requestedPage = query.page ? Number(query.page) : 1;
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 100_000) : 1;
  const details = await getSavingsAccountDetails(user.id, accountId, undefined, (page - 1) * 50);
  if (!details) notFound();
  const preferences = await getUserPreferences(user.id);
  const account = details.account;

  return (
    <div className="page-stack">
      <Link className="text-link savings-back-link" href="/savings"><ArrowLeft aria-hidden="true" size={15} /> Back to savings</Link>
      <PageHeader
        action={<SavingsActions account={account} accountBalanceMinor={details.balanceMinor} accounts={details.accounts} createAccount={false} defaultCurrency={preferences.defaultCurrencyCode} goals={details.goals} />}
        description={`${account.institution || "Personal account"} · ${account.accountType.replaceAll("_", " ")} · ${account.currencyCode}`}
        eyebrow={account.status === "archived" ? "Archived account" : "Account details"}
        title={account.name}
      />
      <section className="savings-feature account-detail-feature">
        <div><p className="eyebrow">Current balance</p><strong className="money-large">{formatMoney(details.balanceMinor, account.currencyCode)}</strong><p>Manually tracked · not synced with your bank</p></div>
        <div className="account-detail-meta"><span>Created {formatDate(account.createdAt.toISOString())}</span><span>{account.includeInTotal ? "Included in savings totals" : "Excluded from savings totals"}</span></div>
      </section>

      {details.goals.length > 0 ? (
        <Panel>
          <SectionHeading title="Linked savings goals" />
          <div className="goal-list">
            {details.goals.map((goal) => (
              <div className="goal-row" key={goal.id}>
                <div className="goal-row-head"><strong>{goal.name}</strong><span>{goal.targetDate ? formatDate(goal.targetDate.toISOString(), "MMM d, yyyy") : "No target date"}</span></div>
                <ProgressBar displayValue={`${goal.progressPercent}% · ${formatMoney(goal.savedMinor, account.currencyCode)} / ${formatMoney(goal.targetAmountMinor, account.currencyCode)}`} label={`${formatMoney(goal.remainingMinor, account.currencyCode)} remaining`} max={goal.targetAmountMinor} value={goal.savedMinor} />
              </div>
            ))}
          </div>
        </Panel>
      ) : (
        <Panel><EmptyState description="Create a savings goal and link it to this account to track its progress." title="No linked goals yet" /></Panel>
      )}

      {details.trend.map((series) => (
        <Panel key={series.currencyCode}>
          <SectionHeading detail="Balance changes calculated from the transaction ledger" title="Balance trend" />
          <TrendLineChart currencyCode={series.currencyCode} data={series.data.map((point) => ({ month: point.month, balance: point.balanceMinor }))} series={[{ key: "balance", label: "Balance", color: "var(--brand)" }]} />
        </Panel>
      ))}

      <Panel>
        <SectionHeading detail="50 transactions per page" title="Transaction history" />
        <SavingsTransactionList transactions={details.transactions} />
        <nav aria-label="Account transaction pages" className="savings-pagination">
          <span>Page {page}</span>
          {page > 1 ? <Link className="button button-secondary" href={`/savings/${account.id}?page=${page - 1}`}>Previous</Link> : null}
          {details.hasMoreTransactions ? <Link className="button button-secondary" href={`/savings/${account.id}?page=${page + 1}`}>Next</Link> : null}
        </nav>
      </Panel>
    </div>
  );
}
