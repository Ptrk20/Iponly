import { CalendarClock, CalendarDays, CreditCard } from "lucide-react";
import { PrototypeAction } from "@/components/prototype-action";
import { EmptyState, MetricCard, PageHeader, Panel, ProgressBar, SectionHeading, StatusBadge } from "@/components/ui";
import { debts, installments, monthlyBudget } from "@/data/fixtures";
import { formatDate, formatMonth } from "@/lib/dates";
import { summarizeDebts, summarizeInstallments } from "@/lib/finance";
import { calculatePercentage, formatMoney } from "@/lib/money";

export default function DebtPage() {
  const debtSummary = summarizeDebts(debts);
  const dueSummary = summarizeInstallments(installments, monthlyBudget.month);
  const nextInstallment = [...installments].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  const nextDebt = debts.find((debt) => debt.id === nextInstallment?.debtId);

  return (
    <div className="page-stack">
      <PageHeader action={<PrototypeAction icon="plus" label="Add debt" variant="primary" />} description="Keep installment dates, balances, and payments easy to follow." eyebrow="Know what’s due" title="Debt & installments" />

      <div className="metrics-grid metrics-three">
        <MetricCard amountMinor={debtSummary.totalOutstandingMinor} currencyCode="PHP" icon={CreditCard} label="Total outstanding" supporting={`${debtSummary.activeCount} active plans`} tone="rose" />
        <MetricCard amountMinor={dueSummary.dueMinor} currencyCode="PHP" icon={CalendarDays} label={`Due in ${formatMonth(monthlyBudget.month, "MMMM")}`} supporting={`${dueSummary.dueCount} scheduled payments`} tone="amber" />
        <MetricCard amountMinor={nextInstallment?.amountMinor ?? 0} currencyCode="PHP" icon={CalendarClock} label="Next payment" supporting={nextInstallment ? `${nextDebt?.name ?? "Installment"} · ${formatDate(nextInstallment.dueDate, "MMM d")}` : "Nothing coming up"} tone="blue" />
      </div>

      <Panel>
        <SectionHeading detail="Balances use the recorded outstanding amount, not installments multiplied by months remaining" title="Active debts" />
        {debts.length === 0 ? (
          <EmptyState description="You’re debt-free here, or you haven’t added a plan yet." title="No active debts" />
        ) : (
          <div className="debt-card-grid">
            {debts.map((debt) => {
              const paidMinor = debt.originalAmountMinor - debt.balanceMinor;
              const paidPercent = calculatePercentage(paidMinor, debt.originalAmountMinor);
              return (
                <article className="debt-card" key={debt.id}>
                  <div className="debt-card-heading"><div><h3>{debt.name}</h3><p>{debt.creditor}</p></div><StatusBadge tone={debt.status}>{debt.status}</StatusBadge></div>
                  <div className="debt-balance-row">
                    <div><span>Remaining balance</span><strong>{formatMoney(debt.balanceMinor, debt.currencyCode)}</strong></div>
                    <div><span>Original amount</span><strong>{formatMoney(debt.originalAmountMinor, debt.currencyCode)}</strong></div>
                  </div>
                  <ProgressBar displayValue={`${paidPercent}% paid`} label="Progress" max={debt.originalAmountMinor} value={paidMinor} />
                  <div className="debt-card-foot"><span>{formatMoney(debt.installmentAmountMinor, debt.currencyCode)} / month · {debt.remainingInstallments} installments left</span><span>Next due {formatDate(debt.nextDueDate, "MMM d")}</span></div>
                </article>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel>
        <SectionHeading action={<PrototypeAction icon="plus" label="Record payment" />} detail="Upcoming scheduled payments · demo data" title="Payment schedule" />
        {installments.length === 0 ? (
          <EmptyState description="Scheduled payments will appear here when you add a plan." title="No installments scheduled" />
        ) : (
          <div className="schedule-table">
            <div className="schedule-head"><span>Installment</span><span>Due date</span><span>Amount</span><span>Status</span></div>
            {installments.map((installment) => {
              const debt = debts.find((item) => item.id === installment.debtId);
              return <div className="schedule-row" key={installment.id}><strong>{debt?.name ?? "Installment"}</strong><span>{formatDate(installment.dueDate, "MMM d, yyyy")}</span><strong>{formatMoney(installment.amountMinor, installment.currencyCode)}</strong><StatusBadge tone={installment.status}>{installment.status}</StatusBadge></div>;
            })}
          </div>
        )}
      </Panel>

      <p className="fixture-note">Phase 1 is read-only. Payment actions do not change balances or create transactions.</p>
    </div>
  );
}