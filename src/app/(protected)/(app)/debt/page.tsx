import Link from "next/link";
import { CalendarClock, CalendarDays, CreditCard } from "lucide-react";
import { DebtPaymentCalendar } from "@/components/debt-payment-calendar";
import { OverdueInstallments } from "@/components/overdue-installments";
import {
  DebtLifecycleForms,
  QuickInstallmentPaymentForm,
} from "@/components/debt-actions";
import {
  EmptyState,
  MetricCard,
  PageHeader,
  Panel,
  ProgressBar,
  SectionHeading,
  StatusBadge,
} from "@/components/ui";
import { requireUser } from "@/lib/auth-session";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { getUserPreferences } from "@/services/preferences-service";
import { getDebtOverview } from "@/services/debt-service";

export const instant = false;

export default async function DebtPage() {
  const user = await requireUser();
  const preferences = await getUserPreferences(user.id);
  const overview = await getDebtOverview(user.id, { timezone: preferences.timezone });
  const currencies = new Set([
    ...overview.totalOutstandingByCurrency.keys(),
    ...overview.dueThisMonthByCurrency.keys(),
    ...overview.overdueByCurrency.keys(),
    ...overview.paidThisMonthByCurrency.keys(),
  ]);
  if (currencies.size === 0) currencies.add(preferences.defaultCurrencyCode);
  const activeDebts = overview.debts.filter((debt) => debt.status !== "paid");
  const paidDebts = overview.debts.filter((debt) => debt.status === "paid");

  return (
    <div className="page-stack">
      <PageHeader
        action={<Link className="button button-primary" href="/debt/new">Add debt</Link>}
        description="Track balances and due dates from information you enter. Iponly does not contact lenders or process payments."
        eyebrow="Know what’s due"
        title="Debt & installments"
      />

      {[...currencies].map((currencyCode) => (
        <div className="metrics-grid metrics-three" key={currencyCode}>
          <MetricCard
            amountMinor={overview.totalOutstandingByCurrency.get(currencyCode) ?? 0}
            currencyCode={currencyCode}
            icon={CreditCard}
            label={`Outstanding · ${currencyCode}`}
            supporting={`${overview.activeCount} active plans · based on your records`}
            tone="rose"
          />
          <MetricCard
            amountMinor={overview.dueThisMonthByCurrency.get(currencyCode) ?? 0}
            currencyCode={currencyCode}
            icon={CalendarDays}
            label={`Due this month · ${currencyCode}`}
            supporting="Scheduled amount still unpaid"
            tone="amber"
          />
          <MetricCard
            amountMinor={overview.overdueByCurrency.get(currencyCode) ?? 0}
            currencyCode={currencyCode}
            icon={CalendarClock}
            label={`Overdue · ${currencyCode}`}
            supporting={`${overview.overdueInstallments.filter((item) => item.currencyCode === currencyCode).length} installments past due`}
            tone="blue"
          />
          <MetricCard
            amountMinor={overview.paidThisMonthByCurrency.get(currencyCode) ?? 0}
            currencyCode={currencyCode}
            icon={CreditCard}
            label={`Paid this month · ${currencyCode}`}
            supporting="Posted payments only; reversals excluded"
            tone="blue"
          />
          {(() => {
            const nextPayment = overview.upcomingInstallments.find((item) => item.currencyCode === currencyCode);
            return (
              <MetricCard
                amountMinor={nextPayment?.remainingAmountMinor ?? 0}
                currencyCode={currencyCode}
                icon={CalendarClock}
                label={`Next payment · ${currencyCode}`}
                supporting={nextPayment
                  ? `${nextPayment.debtName} · ${formatDate(nextPayment.dueDate.toISOString().slice(0, 10))}`
                  : "No scheduled payments"}
                tone="amber"
              />
            );
          })()}
        </div>
      ))}

      <Panel>
        <SectionHeading detail="Schedule entries are obligations, not proof of payment." title="Overdue installments" />
        {overview.overdueInstallments.length === 0 ? (
          <EmptyState description="You’re currently up to date." title="No overdue installments" />
        ) : (
          <OverdueInstallments
            installments={overview.overdueInstallments.map((item) => ({
              id: item.id, debtId: item.debtId, debtName: item.debtName,
              dueDate: item.dueDate.toISOString().slice(0, 10),
              remainingAmountMinor: item.remainingAmountMinor, currencyCode: item.currencyCode,
              canPay: overview.debts.find((debt) => debt.id === item.debtId)?.status === "active",
            }))}
            today={overview.today}
          />
        )}
      </Panel>

      <Panel>
        <SectionHeading
          action={
            <DebtPaymentCalendar
              firstDayOfWeek={preferences.firstDayOfWeek}
              today={overview.today}
              installments={overview.calendarInstallments.map((installment) => ({
                id: installment.id,
                debtId: installment.debtId,
                debtName: installment.debtName,
                dueDate: installment.dueDate.toISOString().slice(0, 10),
                remainingAmountMinor: installment.remainingAmountMinor,
                currencyCode: installment.currencyCode,
                status: installment.status,
              }))}
            />
          }
          detail="One upcoming unpaid installment per debt, starting this month"
          title="Next payments"
        />
        {overview.nextPaymentsPerDebt.length === 0 ? (
          <EmptyState description="You have no upcoming scheduled installments." title="No upcoming payments" />
        ) : (
          <div className="schedule-table debt-next-payments">
            <div className="schedule-head"><span>Debt</span><span>Due date</span><span>Remaining</span><span>Status</span><span>Action</span></div>
            {overview.nextPaymentsPerDebt.map((installment) => (
              <div className="schedule-row" key={installment.id}>
                <strong><Link href={`/debt/${installment.debtId}`}>{installment.debtName}</Link></strong>
                <span>{formatDate(installment.dueDate.toISOString().slice(0, 10))}</span>
                <strong>{formatMoney(installment.remainingAmountMinor, installment.currencyCode)}</strong>
                <StatusBadge tone={installment.status}>{installment.status.replaceAll("_", " ")}</StatusBadge>
                {overview.debts.find((debt) => debt.id === installment.debtId)?.status === "active" ? (
                  <QuickInstallmentPaymentForm
                    installment={{
                      id: installment.id,
                      debtId: installment.debtId,
                      debtName: installment.debtName,
                      dueDate: installment.dueDate.toISOString().slice(0, 10),
                      remainingAmountMinor: installment.remainingAmountMinor,
                      currencyCode: installment.currencyCode,
                    }}
                    today={overview.today}
                  />
                ) : (
                  <Link href={`/debt/${installment.debtId}`}>Open debt to resume payments</Link>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel>
        <SectionHeading detail="Progress uses the opening balance entered in Iponly, adjusted by recorded payments." title="Your debts" />
        {activeDebts.length === 0 ? (
          <EmptyState description="Add an installment plan, loan, or balance you want to track." title="No debts added yet" />
        ) : (
          <div className="debt-card-grid">
            {activeDebts.map((debt) => (
              <article className="debt-card" key={debt.id}>
                <div className="debt-card-heading">
                  <div>
                    <h3><Link href={`/debt/${debt.id}`}>{debt.name}</Link></h3>
                    <p>{debt.creditor || debt.debtType.replaceAll("_", " ")} · {debt.debtType.replaceAll("_", " ")}</p>
                  </div>
                  <StatusBadge tone={debt.status}>{debt.status}</StatusBadge>
                </div>
                <div className="debt-balance-row">
                  <div><span>Remaining balance</span><strong>{formatMoney(debt.balanceMinor, debt.currencyCode)}</strong></div>
                  <div><span>Original amount</span><strong>{formatMoney(debt.originalPrincipalMinor, debt.currencyCode)}</strong></div>
                </div>
                <ProgressBar
                  displayValue={`${debt.progressPercent}% paid`}
                  label="Progress"
                  max={debt.openingBalanceMinor}
                  value={debt.amountPaidMinor}
                />
                <div className="debt-card-foot">
                  <span>{debt.regularInstallmentMinor ? `${formatMoney(debt.regularInstallmentMinor, debt.currencyCode)} / installment` : "Manual schedule"} · {debt.remainingInstallments} remaining</span>
                  <span>{debt.nextInstallment ? `Next due ${formatDate(debt.nextInstallment.dueDate.toISOString().slice(0, 10), "MMM d")}` : "No scheduled payments"}</span>
                </div>
                <Link className="text-link" href={`/debt/${debt.id}`}>View details</Link>
              </article>
            ))}
          </div>
        )}
      </Panel>

      {paidDebts.length > 0 ? (
        <Panel>
          <SectionHeading detail="Completed balances remain available with their history." title="Paid debts" />
          <div className="account-list">
            {paidDebts.map((debt) => (
              <div className="account-row" key={debt.id}>
                <span className="account-row-copy"><strong>{debt.name}</strong><span>{formatMoney(debt.balanceMinor, debt.currencyCode)} remaining</span></span>
                <DebtLifecycleForms debt={debt} />
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      {overview.archivedDebts.length > 0 ? (
        <Panel>
          <SectionHeading detail="Archived history is retained and can be restored." title="Archived debts" />
          <div className="account-list">
            {overview.archivedDebts.map((debt) => (
              <div className="account-row" key={debt.id}>
                <span className="account-row-copy"><strong>{debt.name}</strong><span>{formatMoney(debt.balanceMinor, debt.currencyCode)} · {debt.status}</span></span>
                <DebtLifecycleForms debt={debt} showRestore />
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      <Panel>
        <SectionHeading detail="Payments are recorded manually; no money is sent to a lender." title="Recent payments" />
        {overview.recentPayments.length === 0 ? (
          <EmptyState description="Payments you record will appear here." title="No payments recorded yet" />
        ) : (
          <div className="savings-transaction-list">
            {overview.recentPayments.map((payment) => {
              const debt = overview.debts.find((item) => item.id === payment.debtId);
              return (
                <Link className="savings-transaction-row" href={`/debt/${payment.debtId}`} key={payment.id}>
                  <span className="savings-transaction-icon"><CreditCard aria-hidden="true" size={17} /></span>
                  <span className="savings-transaction-copy"><strong>{debt?.name ?? "Debt payment"}</strong><span>{formatDate(payment.paymentDate.toISOString().slice(0, 10))} · {payment.paymentType.replaceAll("_", " ")}</span></span>
                  <span className="savings-transaction-amount">{formatMoney(payment.amountMinor, payment.currencyCode)}</span>
                </Link>
              );
            })}
          </div>
        )}
      </Panel>

      <p className="form-hint">Calculated balances depend on the information you enter in Iponly. This tracker does not provide financial advice or connect to creditors.</p>
    </div>
  );
}
