import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, CreditCard } from "lucide-react";
import { SectionTabs } from "@/components/section-tabs";
import { SavingsActionDialog } from "@/components/savings-actions";
import {
  DebtAdjustmentForm,
  DebtEditForm,
  DebtLifecycleForms,
  DebtPaymentForm,
  ManualInstallmentForm,
  RescheduleInstallmentForm,
  ReverseAdjustmentForm,
  ReversePaymentForm,
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
import { getAvailableDebtPaymentAccounts, getDebtDetails } from "@/services/debt-service";

export const instant = false;

function todayInTimezone(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export default async function DebtDetailsPage({ params }: { params: Promise<{ debtId: string }> }) {
  const [{ debtId }, user] = await Promise.all([params, requireUser()]);
  const preferences = await getUserPreferences(user.id);
  const [details, accounts] = await Promise.all([
    getDebtDetails(user.id, debtId, { timezone: preferences.timezone }),
    getAvailableDebtPaymentAccounts(user.id),
  ]);
  if (!details) notFound();

  const { debt, installments, payments, adjustments, reschedules, nextInstallment } = details;
  const reschedulesByInstallment = new Map<string, typeof reschedules>();
  for (const reschedule of reschedules) {
    const current = reschedulesByInstallment.get(reschedule.installmentId) ?? [];
    current.push(reschedule);
    reschedulesByInstallment.set(reschedule.installmentId, current);
  }
  const reversedAdjustmentIds = new Set(adjustments.flatMap((adjustment) => adjustment.reversalOfAdjustmentId ? [adjustment.reversalOfAdjustmentId] : []));
  const dueOverdue = installments.filter((item) => item.status === "overdue")
    .reduce((sum, item) => sum + item.remainingAmountMinor, 0);

  return (
    <div className="page-stack">
      <PageHeader
        action={<Link className="button button-secondary" href="/debt"><ArrowLeft aria-hidden="true" size={16} />All debts</Link>}
        description={`${debt.creditor || "Manually tracked"} · ${debt.debtType.replaceAll("_", " ")} · ${debt.currencyCode}`}
        eyebrow="Debt details"
        title={debt.name}
      />

      <div className="metrics-grid metrics-three">
        <MetricCard amountMinor={debt.balanceMinor} currencyCode={debt.currencyCode} icon={CreditCard} label="Recorded balance" supporting="Calculated from your Iponly entries" tone="rose" />
        <MetricCard amountMinor={nextInstallment?.remainingAmountMinor ?? 0} currencyCode={debt.currencyCode} icon={CalendarDays} label="Next installment" supporting={nextInstallment ? `Due ${formatDate(nextInstallment.dueDate.toISOString().slice(0, 10))}` : "No unpaid installment"} tone="amber" />
        <MetricCard amountMinor={dueOverdue} currencyCode={debt.currencyCode} icon={CalendarDays} label="Overdue amount" supporting={`${installments.filter((item) => item.status === "overdue").length} installments`} tone="blue" />
      </div>

      <SectionTabs label="Debt sections" tabs={[
        { id: "progress", label: "Repayment progress", content: (
      <Panel>
        <SectionHeading detail="The remaining balance is derived from the opening balance, recorded payments, and adjustments." title="Repayment progress" />
        <ProgressBar
          displayValue={`${debt.progressPercent}% paid · ${formatMoney(debt.amountPaidMinor, debt.currencyCode)} of ${formatMoney(debt.openingBalanceMinor, debt.currencyCode)}`}
          label="Progress"
          max={debt.openingBalanceMinor}
          value={debt.amountPaidMinor}
        />
        <div className="debt-balance-row">
          <div><span>Original amount</span><strong>{formatMoney(debt.originalPrincipalMinor, debt.currencyCode)}</strong></div>
          <div><span>Regular installment</span><strong>{debt.regularInstallmentMinor ? formatMoney(debt.regularInstallmentMinor, debt.currencyCode) : "Manual schedule"}</strong></div>
          <div><span>Interest rate</span><strong>{debt.annualInterestRateBasisPoints === null ? "Not recorded" : `${(debt.annualInterestRateBasisPoints / 100).toFixed(2)}% · manual only`}</strong></div>
          <div><span>Reference</span><strong>{debt.referenceNumber || "Not recorded"}</strong></div>
        </div>
        <p className="form-hint">Iponly does not calculate lender interest or an authoritative payoff amount.</p>
        <DebtLifecycleForms debt={debt} showRestore={debt.status === "archived"} />
      </Panel>
        ) },
        { id: "schedule", label: "Schedule", content: (
      <>

      <Panel>
        <SectionHeading
          action={debt.status === "active" ? (
            <SavingsActionDialog label="Add manual installment">
              <p className="form-hint">Add a due date without rewriting existing installments.</p>
              <ManualInstallmentForm debtId={debt.id} />
            </SavingsActionDialog>
          ) : undefined}
          detail="Paid status comes from actual allocations. Overdue is derived using your timezone and grace period."
          title="Installment schedule"
        />
        {installments.length === 0 ? (
          <EmptyState description="Add a manual installment when you are ready to track a due date." title="No installments scheduled" />
        ) : (
          <div className="schedule-table debt-installment-schedule">
            <div className="schedule-head"><span>Installment</span><span>Due date</span><span>Remaining</span><span>Status</span></div>
            {installments.map((installment) => {
              const priorChanges = reschedulesByInstallment.get(installment.id) ?? [];
              return (
                <div className="schedule-row debt-schedule-row" key={installment.id}>
                  <strong>{installment.installmentNumber ? `#${installment.installmentNumber}` : "Manual"} · {formatMoney(installment.scheduledAmountMinor, debt.currencyCode)}</strong>
                  <span>{formatDate(installment.dueDate.toISOString().slice(0, 10))}{priorChanges.length ? " · rescheduled" : ""}</span>
                  <strong>{formatMoney(installment.remainingAmountMinor, debt.currencyCode)}</strong>
                  <span className="debt-schedule-state"><StatusBadge tone={installment.status}>{installment.status.replaceAll("_", " ")}</StatusBadge></span>
                  <small>Paid {formatMoney(installment.amountPaidMinor, debt.currencyCode)}{installment.paidAt ? ` · ${formatDate(installment.paidAt.toISOString().slice(0, 10))}` : ""}</small>
                  {installment.status !== "paid" && installment.status !== "waived" && installment.status !== "cancelled" && debt.status !== "archived"
                    ? <RescheduleInstallmentForm debtId={debt.id} installment={installment} />
                    : null}
                </div>
              );
            })}
          </div>
        )}
      </Panel>
      </>
        ) },
        { id: "payments", label: "Payments", content: (
      <>
      <Panel>
        <SectionHeading
          action={debt.status === "active" ? (
            <SavingsActionDialog className="debt-payment-dialog" label="Record payment">
              <p className="form-hint">Review the amount and optional Savings account before recording.</p>
              <DebtPaymentForm
                accounts={accounts}
                debt={debt}
                installments={installments}
                today={todayInTimezone(preferences.timezone)}
              />
            </SavingsActionDialog>
          ) : undefined}
          detail="Reversals keep their original entry and reason."
          title="Payment history"
        />
        {payments.length === 0 ? (
          <EmptyState description="Payments you record will appear here." title="No payments recorded yet" />
        ) : (
          <div className="savings-transaction-list">
            {payments.map((payment) => (
              <article className="savings-transaction-row" key={payment.id}>
                <span className="savings-transaction-icon"><CreditCard aria-hidden="true" size={17} /></span>
                <span className="savings-transaction-copy">
                  <strong>{payment.description}</strong>
                  <span>{formatDate(payment.paymentDate.toISOString().slice(0, 10))} · {payment.paymentType.replaceAll("_", " ")}{payment.sourceAccountId ? " · Savings linked" : " · no account linked"}</span>
                  {payment.notes ? <small>{payment.notes}</small> : null}
                </span>
                <span className="savings-transaction-amount">
                  {formatMoney(payment.amountMinor, payment.currencyCode)}
                  <StatusBadge tone={payment.status}>{payment.status}</StatusBadge>
                  {payment.status === "posted" && payment.paymentType !== "reversal" && debt.status !== "archived"
                    ? <ReversePaymentForm payment={payment} />
                    : null}
                </span>
              </article>
            ))}
          </div>
        )}
      </Panel>
      </>
        ) },
        { id: "adjustments", label: "Adjustments", content: (
      <>
      <Panel>
        <SectionHeading
          action={debt.status === "active" || debt.status === "paused" ? (
            <SavingsActionDialog className="debt-payment-dialog" label="Record balance adjustment">
              <p className="form-hint">Every adjustment needs a reason and remains in history.</p>
              <DebtAdjustmentForm debtId={debt.id} currencyCode={debt.currencyCode} today={todayInTimezone(preferences.timezone)} />
            </SavingsActionDialog>
          ) : undefined}
          detail="Principal, interest, and fees are only separated when you enter those details."
          title="Adjustments"
        />
        {adjustments.length === 0 ? (
          <EmptyState description="Any fees, interest entries, or balance corrections will appear here." title="No adjustments recorded" />
        ) : (
          <div className="savings-transaction-list">
            {adjustments.map((adjustment) => (
              <article className="savings-transaction-row debt-adjustment-row" key={adjustment.id}>
                <span className="savings-transaction-copy">
                  <strong>{adjustment.adjustmentType.replaceAll("_", " ")}</strong>
                  <span>{formatDate(adjustment.effectiveDate.toISOString().slice(0, 10))} · {adjustment.reason}</span>
                </span>
                <span className="savings-transaction-amount">
                  {formatMoney(adjustment.amountMinor, debt.currencyCode)}
                  {!adjustment.reversalOfAdjustmentId && !reversedAdjustmentIds.has(adjustment.id) && debt.status !== "archived"
                    ? <ReverseAdjustmentForm adjustment={adjustment} />
                    : null}
                </span>
              </article>
            ))}
          </div>
        )}
      </Panel>
      </>
        ) },
        { id: "details", label: "Details", content: (
      <>
      {debt.status !== "archived" ? (
        <Panel>
          <SectionHeading detail="Changes here update descriptive details only; ledger amounts are preserved." title="Edit debt details" />
          <DebtEditForm debt={debt} />
        </Panel>
      ) : null}
        <Panel>
          <SectionHeading title="Notes" />
          <p>{debt.notes || "No notes recorded."}</p>
        </Panel>
      </>
        ) },
      ]} />
      <p className="form-hint">Recording a payment does not send money to the creditor. All figures depend on data entered by you.</p>
    </div>
  );
}
