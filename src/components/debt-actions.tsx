"use client";

import Link from "next/link";
import { useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { useMutationForm } from "@/hooks/use-mutation-form";
import { useFormStatus } from "react-dom";
import {
  addDebtAdjustmentAction,
  archiveDebtAction,
  createDebtAction,
  createManualInstallmentAction,
  markDebtPaidAction,
  recordDebtPaymentAction,
  rescheduleDebtInstallmentAction,
  restoreDebtAction,
  reverseDebtAdjustmentAction,
  reverseDebtPaymentAction,
  setDebtPausedAction,
  updateDebtDetailsAction,
  type DebtActionState,
} from "@/actions/debt";
import { formatMoney, minorToMajor, parseMoneyInput } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { calculateInstallmentInterest, generateDebtSchedule } from "@/lib/debt";
import type { CurrencyCode, SavingsAccountRecord } from "@/types/domain";
import type { DebtAdjustmentRecord, DebtInstallmentRecord, DebtPaymentRecord, DebtRecord } from "@/types/debt";

type DebtAction = (previous: DebtActionState, formData: FormData) => Promise<DebtActionState>;

function SubmitButton({ label, variant = "primary" }: { label: string; variant?: "primary" | "secondary" }) {
  const { pending } = useFormStatus();
  return <button className={`button button-${variant}`} disabled={pending} type="submit">{pending ? "Saving…" : label}</button>;
}

function ActionForm({
  action,
  label,
  children,
  confirmation,
  idempotent = false,
  className = "",
  buttonVariant = "primary",
}: {
  action: DebtAction;
  label: string;
  children: ReactNode;
  confirmation?: (form: HTMLFormElement) => string;
  idempotent?: boolean;
  className?: string;
  buttonVariant?: "primary" | "secondary";
}) {
  const { state, formAction, formRef, submittedRef } = useMutationForm(action, { ok: false, message: "" });

  return (
    <form
      action={formAction}
      className={`savings-form ${className}`}
      onSubmit={(event) => {
        if (submittedRef.current) {
          event.preventDefault();
          return;
        }
        if (confirmation && !window.confirm(confirmation(event.currentTarget))) {
          event.preventDefault();
          return;
        }
        if (idempotent) {
          const key = event.currentTarget.elements.namedItem("idempotencyKey");
          if (key instanceof HTMLInputElement && !key.value) key.value = crypto.randomUUID();
        }
        submittedRef.current = true;
      }}
      ref={formRef}
    >
      {idempotent ? <input name="idempotencyKey" type="hidden" /> : null}
      {children}
      <div className="savings-form-submit">
        <SubmitButton label={label} variant={buttonVariant} />
        <p aria-live="polite" className={`form-status${state.ok ? " is-success" : ""}`} role={state.message ? "status" : undefined}>
          {state.message}
        </p>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="savings-field"><span>{label}</span>{children}</label>;
}

function Hidden({ name, value }: { name: string; value: string }) {
  return <input name={name} type="hidden" value={value} />;
}

type PreviewValues = {
  currencyCode: CurrencyCode;
  recurrence: DebtRecord["recurrence"];
  firstDueDate: string;
  installmentCount: string;
  regularInstallmentAmount: string;
  totalScheduledAmount: string;
  originalAmount: string;
  annualInterestRate: string;
  balanceMode: "new" | "current";
};

export function DebtCreateForm({
  defaultCurrency,
  today,
}: {
  defaultCurrency: CurrencyCode;
  today: string;
}) {
  const [resetVersion, setResetVersion] = useState(0);
  const { state, formAction, formRef, submittedRef } = useMutationForm<DebtActionState>(async (previous, formData) => {
    const result = await createDebtAction(previous, formData);
    if (result.ok) setResetVersion((version) => version + 1);
    return result;
  }, { ok: false, message: "" });
  return (
    <DebtCreateFormFields
      key={resetVersion}
      formRef={formRef}
      submittedRef={submittedRef}
      defaultCurrency={defaultCurrency}
      formAction={formAction}
      state={state}
      today={today}
    />
  );
}

function DebtCreateFormFields({
  formRef,
  submittedRef,
  defaultCurrency,
  formAction,
  state,
  today,
}: {
  formRef: RefObject<HTMLFormElement | null>;
  submittedRef: RefObject<boolean>;
  defaultCurrency: CurrencyCode;
  formAction: (formData: FormData) => void;
  state: DebtActionState;
  today: string;
}) {
  const [step, setStep] = useState(1);
  const [previewValues, setPreviewValues] = useState<PreviewValues>({
    currencyCode: defaultCurrency,
    recurrence: "monthly",
    firstDueDate: today,
    installmentCount: "12",
    regularInstallmentAmount: "",
    totalScheduledAmount: "",
    originalAmount: "",
    annualInterestRate: "",
    balanceMode: "new",
  });
  const schedulePreview = useMemo(() => {
    if (previewValues.recurrence === "custom" || !previewValues.firstDueDate) return { entries: [], error: "" };
    const regular = parseMoneyInput(previewValues.regularInstallmentAmount, previewValues.currencyCode);
    const count = previewValues.recurrence === "one_time" ? 1 : Number(previewValues.installmentCount);
    const total = previewValues.totalScheduledAmount
      ? parseMoneyInput(previewValues.totalScheduledAmount, previewValues.currencyCode)
      : undefined;
    if (regular === null || regular <= 0 || !Number.isInteger(count) || count < 1) return { entries: [], error: "" };
    try {
      return {
        entries: generateDebtSchedule({
          firstDueDate: previewValues.firstDueDate,
          recurrence: previewValues.recurrence,
          installmentCount: count,
          regularInstallmentMinor: regular,
          totalScheduledAmountMinor: total ?? undefined,
        }),
        error: "",
      };
    } catch (error) {
      return { entries: [], error: error instanceof Error ? error.message : "The schedule could not be previewed." };
    }
  }, [previewValues]);
  const scheduleTotal = schedulePreview.entries.reduce((total, entry) => total + entry.scheduledAmountMinor, 0);
  const inferInterest = previewValues.balanceMode === "new" &&
    previewValues.recurrence === "monthly" && !previewValues.annualInterestRate.trim();
  const principalMinor = parseMoneyInput(previewValues.originalAmount, previewValues.currencyCode);
  const installmentMinor = parseMoneyInput(previewValues.regularInstallmentAmount, previewValues.currencyCode);
  let interestPreview: ReturnType<typeof calculateInstallmentInterest> | null = null;
  let interestError = "";
  if (inferInterest && principalMinor !== null && principalMinor > 0 && installmentMinor !== null && schedulePreview.entries.length > 0) {
    try {
      interestPreview = calculateInstallmentInterest(
        principalMinor,
        installmentMinor,
        Number(previewValues.installmentCount),
        scheduleTotal,
      );
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      interestError = error.message;
    }
  }

  function continueToNextStep() {
    const invalidField = formRef.current?.querySelector<HTMLElement>(`[data-wizard-step="${step}"] :invalid`);
    if (invalidField instanceof HTMLInputElement || invalidField instanceof HTMLSelectElement || invalidField instanceof HTMLTextAreaElement) {
      invalidField.reportValidity();
      return;
    }
    setStep((current) => Math.min(current + 1, 3));
  }

  return (
    <form
      action={formAction}
      className="savings-form"
      ref={formRef}
      onChange={(event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
        if (target.name === "currencyCode") {
          setPreviewValues((current) => ({ ...current, currencyCode: target.value as CurrencyCode }));
        } else if (target.name === "recurrence") {
          setPreviewValues((current) => ({ ...current, recurrence: target.value as DebtRecord["recurrence"] }));
        } else if (target.name === "firstDueDate") {
          setPreviewValues((current) => ({ ...current, firstDueDate: target.value }));
        } else if (target.name === "installmentCount") {
          setPreviewValues((current) => ({ ...current, installmentCount: target.value }));
        } else if (target.name === "regularInstallmentAmount") {
          setPreviewValues((current) => ({ ...current, regularInstallmentAmount: target.value }));
        } else if (target.name === "totalScheduledAmount") {
          setPreviewValues((current) => ({ ...current, totalScheduledAmount: target.value }));
        } else if (target.name === "originalAmount" || target.name === "annualInterestRate") {
          setPreviewValues((current) => ({ ...current, [target.name]: target.value }));
        } else if (target.name === "balanceMode") {
          setPreviewValues((current) => ({ ...current, balanceMode: target.value === "new" ? "new" : "current" }));
        }
      }}
      onSubmit={(event) => {
        if (submittedRef.current) {
          event.preventDefault();
          return;
        }
        if (step !== 3) {
          event.preventDefault();
          continueToNextStep();
          return;
        }
        const key = event.currentTarget.elements.namedItem("idempotencyKey");
        if (key instanceof HTMLInputElement && !key.value) key.value = crypto.randomUUID();
        submittedRef.current = true;
      }}
    >
      <ol aria-label="Debt setup steps" className="debt-wizard-progress">
        {["Debt basics", "Installment schedule", "Extra details"].map((label, index) => (
          <li aria-current={step === index + 1 ? "step" : undefined} className={step >= index + 1 ? "is-current" : ""} key={label}>
            <span>{index + 1}</span><strong>{label}</strong>
          </li>
        ))}
      </ol>
      {state.message ? (
        <p aria-live="polite" className={`form-status${state.ok ? " is-success" : ""}`} role={state.ok ? "status" : "alert"}>
          {state.message} {state.ok && state.debtId ? <Link href={`/debt/${state.debtId}`}>View this debt</Link> : null}
        </p>
      ) : null}

      <section aria-labelledby="debt-wizard-step-1" data-wizard-step="1" hidden={step !== 1}>
        <h2 id="debt-wizard-step-1">Debt basics</h2>
        <p className="form-hint">Start with the amount you originally owed and what remains today.</p>
        <div className="savings-filter-form">
          <Field label="Debt name"><input maxLength={100} name="name" placeholder="Laptop installment" required={step === 1} /></Field>
          <Field label="Creditor (optional)"><input maxLength={100} name="creditor" placeholder="Store or lender" /></Field>
          <Field label="Debt type">
            <select defaultValue="installment" name="debtType">
              <option value="installment">Installment</option><option value="credit_card">Credit card</option>
              <option value="personal_loan">Personal loan</option><option value="housing_loan">Housing loan</option>
              <option value="vehicle_loan">Vehicle loan</option><option value="buy_now_pay_later">Buy now, pay later</option>
              <option value="family_loan">Family loan</option><option value="one_time">One-time debt</option><option value="other">Other</option>
            </select>
          </Field>
          <Field label="Currency">
            <select defaultValue={defaultCurrency} name="currencyCode">
              <option value="PHP">PHP · Philippine peso</option><option value="USD">USD · US dollar</option>
              <option value="EUR">EUR · Euro</option><option value="JPY">JPY · Japanese yen</option>
            </select>
          </Field>
          <Field label="Original amount"><input inputMode="decimal" min="0.01" name="originalAmount" placeholder="0.00" required={step === 1} step="0.01" /></Field>
          <Field label="Tracking">
            <select defaultValue="new" name="balanceMode">
              <option value="new">New debt</option>
              <option value="current">Existing debt / current balance</option>
            </select>
          </Field>
          {previewValues.balanceMode === "new" ? (
            <Field key="calculated-opening-balance" label="Opening balance (calculated)">
              <input name="openingBalance" readOnly value={interestPreview
                ? String(minorToMajor(interestPreview.openingBalanceMinor, previewValues.currencyCode))
                : previewValues.originalAmount} />
            </Field>
          ) : (
            <Field key="current-opening-balance" label="Remaining balance"><input inputMode="decimal" min="0" name="openingBalance" placeholder="0.00" required={step === 1} step="0.01" /></Field>
          )}
        </div>
        <p className="form-hint">New monthly debts with no interest rate include inferred interest from the schedule. For an existing debt, enter your current balance including any interest already owed; it will not be increased automatically.</p>
      </section>

      <section aria-labelledby="debt-wizard-step-2" data-wizard-step="2" hidden={step !== 2}>
        <h2 id="debt-wizard-step-2">Installment schedule</h2>
        <p className="form-hint">Choose how installments are scheduled. Manual schedules can be added after creating the debt.</p>
        <div className="savings-filter-form">
          <Field label="Recurrence">
            <select defaultValue="monthly" name="recurrence">
              <option value="one_time">One-time</option><option value="weekly">Weekly</option>
              <option value="biweekly">Biweekly</option><option value="monthly">Monthly</option><option value="custom">Manual schedule</option>
            </select>
          </Field>
          <Field label="First due date">
            <input defaultValue={today} name="firstDueDate" required={step === 2 && previewValues.recurrence !== "custom"} type="date" />
          </Field>
          <Field label="Installment amount">
            <input inputMode="decimal" min="0.01" name="regularInstallmentAmount" placeholder="0.00" required={step === 2 && previewValues.recurrence !== "custom"} step="0.01" />
          </Field>
          <Field label="Installments to generate">
            <input defaultValue="12" disabled={previewValues.recurrence === "one_time" || previewValues.recurrence === "custom"} max="600" min="1" name="installmentCount" required={step === 2 && previewValues.recurrence !== "one_time" && previewValues.recurrence !== "custom"} type="number" />
          </Field>
          <Field label="Schedule total (optional)">
            <input inputMode="decimal" name="totalScheduledAmount" placeholder="Adjust final installment" step="0.01" />
          </Field>
          <Field label="Repeat interval">
            <input defaultValue="1" max="52" min="1" name="recurrenceInterval" type="number" />
          </Field>
        </div>
        {previewValues.recurrence === "custom" ? (
          <p className="form-hint">This creates the debt without an automatic schedule. Add future installments manually after saving.</p>
        ) : schedulePreview.error ? (
          <p className="form-status" role="alert">{schedulePreview.error}</p>
        ) : schedulePreview.entries.length > 0 ? (
          <div className="debt-schedule-preview" aria-live="polite">
            <strong>Schedule preview · {schedulePreview.entries.length} installments · {formatMoney(scheduleTotal, previewValues.currencyCode)}</strong>
            <ul>
              {schedulePreview.entries.slice(0, 4).map((entry) => (
                <li key={entry.installmentNumber}>#{entry.installmentNumber} · {formatDate(entry.dueDate)} · {formatMoney(entry.scheduledAmountMinor, previewValues.currencyCode)}</li>
              ))}
              {schedulePreview.entries.length > 4 ? (
                <li>… final payment {formatDate(schedulePreview.entries.at(-1)!.dueDate)} · {formatMoney(schedulePreview.entries.at(-1)!.scheduledAmountMinor, previewValues.currencyCode)}</li>
              ) : null}
            </ul>
            <p>Monthly schedules preserve end-of-month dates; shorter months use the last valid date without shifting later months.</p>
          </div>
        ) : null}
      </section>

      <section aria-labelledby="debt-wizard-step-3" data-wizard-step="3" hidden={step !== 3}>
        <h2 id="debt-wizard-step-3">Extra details</h2>
        <p className="form-hint">These details are optional and can help you keep track of the plan.</p>
        <div className="savings-filter-form">
          <Field label="Interest rate (optional, %)">
            <input inputMode="decimal" max="99999999" name="annualInterestRate" placeholder="Manual interest only" step="0.01" />
          </Field>
          <Field label="Grace period (days)">
            <input defaultValue="0" max="365" min="0" name="gracePeriodDays" type="number" />
          </Field>
          <Field label="Reference number (optional)"><input maxLength={120} name="referenceNumber" /></Field>
          <Field label="Notes (optional)"><input maxLength={2000} name="notes" /></Field>
          <Field label="Include in totals">
            <select defaultValue="true" name="includeInTotal"><option value="true">Yes</option><option value="false">No</option></select>
          </Field>
        </div>
        <div className="debt-migration-guide">
          <strong>Moving an installment plan from notes?</strong>
          <p>Use your current remaining balance and enter only future unpaid installments. Past payments stay a summary and are not added as transactions.</p>
          <div className="savings-filter-form">
            <Field label="Previously paid installments (optional)">
              <input disabled={previewValues.balanceMode === "new"} max="600" min="0" name="priorPaidInstallmentCount" type="number" />
            </Field>
            <Field label="Historical payment summary (optional)">
              <textarea disabled={previewValues.balanceMode === "new"} maxLength={2000} name="migrationSummary" rows={2} placeholder="For example: 5 of 12 installments paid before Iponly tracking." />
            </Field>
          </div>
          {interestError ? <p className="form-status" role="alert">{interestError}</p> : null}
          {interestPreview && principalMinor !== null ? (
            <div className="debt-migration-guide" aria-live="polite">
              <strong>Inferred total interest: {formatMoney(interestPreview.interestMinor, previewValues.currencyCode)}</strong>
              <p>Scheduled repayments {formatMoney(interestPreview.totalMinor, previewValues.currencyCode)} − original amount {formatMoney(principalMinor, previewValues.currencyCode)}.</p>
              <p>Opening remaining balance: {formatMoney(interestPreview.openingBalanceMinor, previewValues.currencyCode)}. This includes inferred interest once, not an annual interest rate. The difference may include lender fees.</p>
            </div>
          ) : null}
        </div>
        <p className="form-hint">Calculated balances depend on the information you enter. Iponly does not contact lenders or process payments.</p>
      </section>

      <input name="idempotencyKey" type="hidden" />
      <div className="debt-wizard-actions">
        {step > 1 ? <button className="button button-secondary" onClick={() => setStep((current) => current - 1)} type="button">Back</button> : null}
        {step < 3 ? (
          <button className="button button-primary" onClick={continueToNextStep} type="button">Next</button>
        ) : (
          <SubmitButton label="Create debt" />
        )}
      </div>
    </form>
  );
}

export function DebtEditForm({ debt }: { debt: DebtRecord }) {
  return (
    <ActionForm action={updateDebtDetailsAction} label="Save debt details">
      <Hidden name="debtId" value={debt.id} />
      <div className="savings-filter-form">
        <Field label="Debt name"><input defaultValue={debt.name} maxLength={100} name="name" required /></Field>
        <Field label="Creditor (optional)"><input defaultValue={debt.creditor ?? ""} maxLength={100} name="creditor" /></Field>
        <Field label="Debt type">
          <select defaultValue={debt.debtType} name="debtType">
            <option value="installment">Installment</option><option value="credit_card">Credit card</option>
            <option value="personal_loan">Personal loan</option><option value="housing_loan">Housing loan</option>
            <option value="vehicle_loan">Vehicle loan</option><option value="buy_now_pay_later">Buy now, pay later</option>
            <option value="family_loan">Family loan</option><option value="one_time">One-time debt</option><option value="other">Other</option>
          </select>
        </Field>
        <Field label="Annual interest rate (%)">
          <input defaultValue={debt.annualInterestRateBasisPoints === null ? "" : (debt.annualInterestRateBasisPoints / 100).toFixed(2)} inputMode="decimal" max="99999999" name="annualInterestRate" step="0.01" />
        </Field>
        <Field label="Grace period (days)"><input defaultValue={debt.gracePeriodDays} max="365" min="0" name="gracePeriodDays" type="number" /></Field>
        <Field label="Reference number (optional)"><input defaultValue={debt.referenceNumber ?? ""} maxLength={120} name="referenceNumber" /></Field>
        <Field label="Notes (optional)"><textarea defaultValue={debt.notes ?? ""} maxLength={2000} name="notes" rows={2} /></Field>
        <Field label="Include in totals">
          <select defaultValue={debt.includeInTotal ? "true" : "false"} name="includeInTotal"><option value="true">Yes</option><option value="false">No</option></select>
        </Field>
      </div>
    </ActionForm>
  );
}

export function QuickInstallmentPaymentForm({
  installment,
  today,
}: {
  installment: {
    id: string;
    debtId: string;
    debtName: string;
    dueDate: string;
    remainingAmountMinor: number;
    currencyCode: CurrencyCode;
  };
  today: string;
}) {
  const amount = formatMoney(installment.remainingAmountMinor, installment.currencyCode);
  return (
    <ActionForm
      action={recordDebtPaymentAction}
      buttonVariant="secondary"
      className="debt-quick-payment"
      confirmation={() => `Mark installment as paid?\n\n${installment.debtName}\nDue: ${formatDate(installment.dueDate)}\nRemaining amount to record: ${amount} ${installment.currencyCode}\nPayment date: ${formatDate(today)}\n\nNo Savings account will be deducted. Iponly records this payment but does not send money to the creditor. For a different date or a linked Savings withdrawal, cancel and record the payment from the debt details.`}
      idempotent
      label="Mark as paid"
    >
      <Hidden name="debtId" value={installment.debtId} />
      <Hidden name="installmentId" value={installment.id} />
      <Hidden name="amount" value={String(minorToMajor(installment.remainingAmountMinor, installment.currencyCode))} />
      <Hidden name="paymentDate" value={today} />
      <Hidden name="paymentType" value="regular" />
      <Hidden name="description" value={`Installment due ${installment.dueDate} paid`} />
    </ActionForm>
  );
}

export function DebtPaymentForm({
  debt,
  installments,
  accounts,
  today,
}: {
  debt: Pick<DebtRecord, "id" | "name" | "currencyCode"> & { balanceMinor: number };
  installments: (DebtInstallmentRecord & { remainingAmountMinor: number })[];
  accounts: (SavingsAccountRecord & { balanceMinor: number })[];
  today: string;
}) {
  const amountRef = useRef<HTMLInputElement>(null);
  const eligible = installments.filter((item) =>
    item.status === "scheduled" || item.status === "partially_paid" || item.status === "overdue",
  );
  const matchingAccounts = accounts.filter((item) => item.currencyCode === debt.currencyCode);
  return (
    <ActionForm
      action={recordDebtPaymentAction}
      confirmation={(form) => {
        const amountField = form.elements.namedItem("amount");
        const sourceField = form.elements.namedItem("sourceAccountId");
        const amountText = amountField instanceof HTMLInputElement ? amountField.value : "";
        const accountId = sourceField instanceof HTMLSelectElement ? sourceField.value : "";
        const amountMinor = parseMoneyInput(amountText, debt.currencyCode);
        const source = matchingAccounts.find((account) => account.id === accountId);
        const newDebtBalance = amountMinor === null ? debt.balanceMinor : Math.max(0, debt.balanceMinor - amountMinor);
        const newAccountBalance = source && amountMinor !== null ? source.balanceMinor - amountMinor : null;
        return `Confirm debt payment\n\n${debt.name}\nAmount: ${amountMinor === null ? amountText : formatMoney(amountMinor, debt.currencyCode)}\nDebt balance after payment: ${formatMoney(newDebtBalance, debt.currencyCode)}${source ? `\nSource: ${source.name}\nSavings balance after payment: ${formatMoney(newAccountBalance ?? source.balanceMinor, debt.currencyCode)}` : "\nNo Savings account linked"}\n\nIponly records this payment but does not send money to the creditor.`;
      }}
      idempotent
      label="Record payment"
    >
      <Hidden name="debtId" value={debt.id} />
      <div className="savings-filter-form">
        <Field label="Installment (optional)">
          <select
            defaultValue=""
            name="installmentId"
            onChange={(event) => {
              const installment = eligible.find((item) => item.id === event.target.value);
              if (amountRef.current) {
                amountRef.current.value = installment
                  ? String(minorToMajor(installment.remainingAmountMinor, debt.currencyCode))
                  : "";
              }
            }}
          >
            <option value="">No installment · extra/manual payment</option>
            {eligible.map((item) => (
              <option key={item.id} value={item.id}>
                {item.installmentNumber ? `#${item.installmentNumber} · ` : ""}{formatDate(item.dueDate.toISOString().slice(0, 10))} · remaining {formatMoney(item.remainingAmountMinor, debt.currencyCode)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Amount">
          <input autoComplete="off" inputMode="decimal" min="0.01" name="amount" placeholder="0.00" ref={amountRef} required step="0.01" />
        </Field>
        <Field label="Payment type">
          <select defaultValue="regular" name="paymentType">
            <option value="regular">Regular</option><option value="partial">Partial</option>
            <option value="extra">Extra principal</option><option value="payoff">Final payoff</option>
            <option value="fee_payment">Fee payment</option><option value="adjustment">Other</option>
          </select>
        </Field>
        <Field label="Payment date"><input defaultValue={today} name="paymentDate" required type="date" /></Field>
        <Field label="Savings account (optional)">
          <select defaultValue="" name="sourceAccountId">
            <option value="">Not tracked in Savings</option>
            {matchingAccounts.map((account) => (
              <option key={account.id} value={account.id}>{account.name} · {formatMoney(account.balanceMinor, account.currencyCode)}</option>
            ))}
          </select>
        </Field>
        <Field label="Description"><input defaultValue={`Payment for ${debt.name}`} maxLength={120} name="description" required /></Field>
        <Field label="Reference number (optional)"><input maxLength={120} name="referenceNumber" /></Field>
        <Field label="Notes (optional)"><input maxLength={2000} name="notes" /></Field>
      </div>
      <details>
        <summary>Enter known allocation details (optional)</summary>
        <p className="form-hint">Leave these blank to record the payment without guessing principal, interest, or fee breakdowns.</p>
        <div className="savings-filter-form">
          <Field label="Principal"><input inputMode="decimal" name="principalAmount" placeholder="0.00" step="0.01" /></Field>
          <Field label="Interest"><input inputMode="decimal" name="interestAmount" placeholder="0.00" step="0.01" /></Field>
          <Field label="Fees"><input inputMode="decimal" name="feesAmount" placeholder="0.00" step="0.01" /></Field>
          <Field label="Adjustment"><input inputMode="decimal" name="adjustmentAmount" placeholder="0.00" step="0.01" /></Field>
          <Field label="Unapportioned"><input inputMode="decimal" name="unapportionedAmount" placeholder="0.00" step="0.01" /></Field>
        </div>
      </details>
    </ActionForm>
  );
}

export function ManualInstallmentForm({ debtId }: { debtId: string }) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <ActionForm action={createManualInstallmentAction} label="Add installment">
      <Hidden name="debtId" value={debtId} />
      <div className="savings-filter-form">
        <Field label="Due date"><input defaultValue={today} name="dueDate" required type="date" /></Field>
        <Field label="Amount"><input inputMode="decimal" min="0.01" name="amount" required step="0.01" /></Field>
        <Field label="Notes (optional)"><input maxLength={2000} name="notes" /></Field>
      </div>
    </ActionForm>
  );
}

export function RescheduleInstallmentForm({
  debtId,
  installment,
}: {
  debtId: string;
  installment: DebtInstallmentRecord;
}) {
  return (
    <details>
      <summary>Reschedule</summary>
      <ActionForm action={rescheduleDebtInstallmentAction} label="Save new date">
        <Hidden name="debtId" value={debtId} />
        <Hidden name="installmentId" value={installment.id} />
        <div className="savings-filter-form">
          <Field label="New due date"><input defaultValue={installment.dueDate.toISOString().slice(0, 10)} name="newDueDate" required type="date" /></Field>
          <Field label="Reason"><input maxLength={300} name="reason" required /></Field>
          <Field label="Notes (optional)"><input maxLength={2000} name="notes" /></Field>
        </div>
      </ActionForm>
    </details>
  );
}

export function DebtAdjustmentForm({
  debtId,
  currencyCode,
  today,
}: {
  debtId: string;
  currencyCode: CurrencyCode;
  today: string;
}) {
  return (
    <ActionForm action={addDebtAdjustmentAction} label="Record adjustment">
      <Hidden name="debtId" value={debtId} />
      <div className="savings-filter-form">
        <Field label="Adjustment type">
          <select defaultValue="fee_added" name="adjustmentType">
            <option value="balance_increase">Balance increase</option><option value="balance_decrease">Balance decrease</option>
            <option value="fee_added">Fee added</option><option value="fee_waived">Fee waived</option>
            <option value="interest_added">Interest added</option><option value="interest_waived">Interest waived</option>
            <option value="principal_correction">Principal correction</option>
          </select>
        </Field>
        <Field label={`Amount (${currencyCode})`}><input inputMode="decimal" min="0.01" name="amount" required step="0.01" /></Field>
        <Field label="Effective date"><input defaultValue={today} name="effectiveDate" required type="date" /></Field>
        <Field label="Reason"><input maxLength={300} name="reason" required /></Field>
        <Field label="Notes (optional)"><input maxLength={2000} name="notes" /></Field>
      </div>
    </ActionForm>
  );
}

export function ReversePaymentForm({ payment }: { payment: DebtPaymentRecord }) {
  return (
    <details>
      <summary>Reverse payment</summary>
      <ActionForm
        action={reverseDebtPaymentAction}
        confirmation={() => `Reverse ${formatMoney(payment.amountMinor, payment.currencyCode)} from ${payment.paymentDate.toISOString().slice(0, 10)}? The original record stays in history${payment.sourceAccountId ? " and the linked Savings withdrawal will also be reversed" : ""}.`}
        idempotent
        label="Confirm reversal"
      >
        <Hidden name="paymentId" value={payment.id} />
        <Field label="Reason"><input maxLength={300} name="reason" required /></Field>
      </ActionForm>
    </details>
  );
}

export function ReverseAdjustmentForm({ adjustment }: { adjustment: DebtAdjustmentRecord }) {
  return (
    <details>
      <summary>Correct adjustment</summary>
      <ActionForm action={reverseDebtAdjustmentAction} label="Record correction">
        <Hidden name="adjustmentId" value={adjustment.id} />
        <Field label="Reason"><input maxLength={300} name="reason" required /></Field>
      </ActionForm>
    </details>
  );
}

export function DebtLifecycleForms({
  debt,
  showRestore = false,
}: {
  debt: Pick<DebtRecord, "id" | "status" | "currencyCode"> & { balanceMinor: number };
  showRestore?: boolean;
}) {
  if (showRestore) {
    return (
      <ActionForm action={restoreDebtAction} label="Restore debt">
        <Hidden name="debtId" value={debt.id} />
      </ActionForm>
    );
  }
  return (
    <div className="savings-goal-status-actions">
      {debt.status === "active" || debt.status === "paused" ? (
        <ActionForm action={setDebtPausedAction} buttonVariant="secondary" className="savings-goal-status-form" label={debt.status === "paused" ? "Resume" : "Pause"}>
          <Hidden name="debtId" value={debt.id} />
          <Hidden name="paused" value={debt.status === "paused" ? "false" : "true"} />
        </ActionForm>
      ) : null}
      {debt.balanceMinor === 0 && debt.status !== "paid" ? (
        <ActionForm action={markDebtPaidAction} buttonVariant="secondary" className="savings-goal-status-form" label="Mark as paid">
          <Hidden name="debtId" value={debt.id} />
        </ActionForm>
      ) : null}
      {debt.status !== "archived" ? (
        <ActionForm
          action={archiveDebtAction}
          buttonVariant="secondary"
          className="savings-goal-status-form savings-goal-archive-form"
          confirmation={() => `Archive this debt?${debt.balanceMinor > 0 ? ` It still has ${formatMoney(debt.balanceMinor, debt.currencyCode)} outstanding.` : ""} History will be kept.`}
          label="Archive"
        >
          <Hidden name="debtId" value={debt.id} />
          <Hidden name="confirmOutstanding" value={debt.balanceMinor > 0 ? "true" : "false"} />
        </ActionForm>
      ) : null}
    </div>
  );
}
