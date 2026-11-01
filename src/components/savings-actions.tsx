"use client";

import { useActionState, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { X } from "lucide-react";
import {
  adjustSavingsAction,
  archiveSavingsAccountAction,
  archiveSavingsGoalAction,
  completeSavingsGoalAction,
  createSavingsAccountAction,
  createSavingsGoalAction,
  depositSavingsAction,
  restoreSavingsAccountAction,
  reverseSavingsTransactionAction,
  transferSavingsAction,
  updateSavingsAccountAction,
  updateSavingsGoalAction,
  withdrawSavingsAction,
  type SavingsActionState,
} from "@/actions/savings";
import { formatMoney } from "@/lib/money";
import type { CurrencyCode, SavingsAccountRecord, SavingsGoalRecord } from "@/types/domain";

type SavingsAction = (previous: SavingsActionState, formData: FormData) => Promise<SavingsActionState>;

export function SavingsActionDialog({
  label,
  children,
  trigger,
  open,
  onClose,
}: {
  label: string;
  children: ReactNode;
  trigger?: ReactNode;
  open?: boolean;
  onClose?: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open ?? internalOpen;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) dialog.showModal();
    if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);

  return (
    <div className="savings-action">
      {trigger ?? (
        <button aria-haspopup="dialog" className="savings-action-trigger" onClick={() => setInternalOpen(true)} type="button">
          {label}
        </button>
      )}
      <dialog
        aria-labelledby={titleId}
        className="savings-action-dialog"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            dialogRef.current?.close();
          }
        }}
        onClose={() => {
          setInternalOpen(false);
          onClose?.();
        }}
        ref={dialogRef}
      >
        <div className="savings-action-dialog-header">
          <h2 id={titleId}>{label}</h2>
          <button aria-label="Close dialog" className="savings-action-close" onClick={() => dialogRef.current?.close()} title="Close dialog" type="button">
            <X aria-hidden="true" size={20} />
          </button>
        </div>
        <div className="savings-action-dialog-body">{children}</div>
      </dialog>
    </div>
  );
}

function SubmitButton({ label, variant = "primary" }: { label: string; variant?: "primary" | "secondary" }) {
  const { pending } = useFormStatus();
  return <button className={`button button-${variant}`} disabled={pending} type="submit">{pending ? "Saving…" : label}</button>;
}

function ActionForm({
  action,
  label,
  children,
  className = "",
  buttonVariant = "primary",
  idempotent = false,
  confirmation,
}: {
  action: SavingsAction;
  label: string;
  children: ReactNode;
  className?: string;
  buttonVariant?: "primary" | "secondary";
  idempotent?: boolean;
  confirmation?: "transfer" | "adjustment" | string;
}) {
  const [state, formAction] = useActionState(action, { ok: false, message: "" });
  const formRef = useRef<HTMLFormElement>(null);
  const submittedRef = useRef(false);

  useEffect(() => {
    if (state.message) {
      if (state.ok) formRef.current?.reset();
      submittedRef.current = false;
    }
  }, [state]);

  return (
    <form
      action={formAction}
      className={`savings-form ${className}`}
      onSubmit={(event) => {
        if (submittedRef.current) {
          event.preventDefault();
          return;
        }
        if (confirmation) {
          const form = event.currentTarget;
          const getValue = (name: string) => {
            const field = form.elements.namedItem(name);
            return field instanceof HTMLInputElement || field instanceof HTMLSelectElement ? field.value : "";
          };
          const selectedLabel = (name: string) => {
            const field = form.elements.namedItem(name);
            return field instanceof HTMLSelectElement ? field.options[field.selectedIndex]?.textContent ?? "" : "";
          };
          const message = confirmation === "transfer"
            ? `Confirm transfer\n\nFrom: ${selectedLabel("sourceAccountId")}\nTo: ${selectedLabel("destinationAccountId")}\nAmount: ${getValue("amount")}\nDate: ${getValue("transactionDate")}\n\nContinue?`
            : confirmation === "adjustment"
              ? `Confirm balance adjustment\n\nDirection: ${getValue("direction")}\nAmount: ${getValue("amount")}\nDate: ${getValue("transactionDate")}\nReason: ${getValue("reason")}\n\nContinue?`
              : confirmation;
          if (!window.confirm(message)) {
            event.preventDefault();
            return;
          }
        }
        submittedRef.current = true;
        if (idempotent) {
          const keyInput = event.currentTarget.elements.namedItem("idempotencyKey");
          if (keyInput instanceof HTMLInputElement && !keyInput.value) keyInput.value = crypto.randomUUID();
        }
      }}
      ref={formRef}
    >
      {idempotent ? <input name="idempotencyKey" type="hidden" /> : null}
      {children}
      <div className="savings-form-submit">
        <SubmitButton label={label} variant={buttonVariant} />
        <p aria-live="polite" className={state.ok ? "form-status is-success" : "form-status"} role={state.message ? "status" : undefined}>
          {state.message}
        </p>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="savings-field"><span>{label}</span>{children}</label>;
}

function AccountSelect({
  accounts,
  name = "accountId",
  selectedAccountId,
}: {
  accounts: SavingsAccountRecord[];
  name?: string;
  selectedAccountId?: string;
}) {
  return (
    <Field label="Account">
      <select defaultValue={selectedAccountId ?? accounts[0]?.id ?? ""} name={name} required>
        {accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currencyCode}</option>)}
      </select>
    </Field>
  );
}

function DateField() {
  const todayInManila = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  return <Field label="Date"><input defaultValue={todayInManila} name="transactionDate" required type="date" /></Field>;
}

function TransactionFields({ accounts, accountId }: { accounts: SavingsAccountRecord[]; accountId?: string }) {
  return (
    <>
      {accountId ? <input name="accountId" type="hidden" value={accountId} /> : <AccountSelect accounts={accounts} />}
      <Field label="Amount"><input autoComplete="off" inputMode="decimal" min="0.01" name="amount" placeholder="0.00" required step="0.01" type="number" /></Field>
      <DateField />
      <Field label="Description"><input maxLength={120} name="description" placeholder="What was this for?" required /></Field>
      <Field label="Notes (optional)"><input maxLength={1000} name="notes" /></Field>
    </>
  );
}

function TransferAccountFields({
  accounts,
  selectedAccountId,
}: {
  accounts: SavingsAccountRecord[];
  selectedAccountId?: string;
}) {
  const [sourceId, setSourceId] = useState(selectedAccountId ?? accounts[0]?.id ?? "");
  const [destinationId, setDestinationId] = useState(() => accounts.find((item) => item.id !== sourceId && item.currencyCode === accounts.find((candidate) => candidate.id === sourceId)?.currencyCode)?.id ?? "");
  const source = accounts.find((item) => item.id === sourceId);
  const destinations = accounts.filter((item) => item.id !== sourceId && item.currencyCode === source?.currencyCode);
  return (
    <>
      <Field label="From">
        <select name="sourceAccountId" onChange={(event) => {
          const nextSourceId = event.target.value;
          setSourceId(nextSourceId);
          const nextSource = accounts.find((item) => item.id === event.target.value);
          const nextDestinations = accounts.filter((item) => item.id !== nextSourceId && item.currencyCode === nextSource?.currencyCode);
          if (!nextDestinations.some((item) => item.id === destinationId)) {
            setDestinationId(nextDestinations[0]?.id ?? "");
          }
        }} value={sourceId}>
          {accounts.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.currencyCode}</option>)}
        </select>
      </Field>
      <Field label="To">
        <select name="destinationAccountId" onChange={(event) => setDestinationId(event.target.value)} required value={destinationId}>
          {destinations.length === 0 ? <option value="">No same-currency account available</option> : null}
          {destinations.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.currencyCode}</option>)}
        </select>
      </Field>
    </>
  );
}

function AccountTypeSelect({ defaultValue }: { defaultValue?: string }) {
  return (
    <Field label="Account type">
      <select defaultValue={defaultValue ?? "savings"} name="accountType" required>
        <option value="savings">Savings</option>
        <option value="checking">Checking</option>
        <option value="digital_wallet">Digital wallet</option>
        <option value="cash">Cash</option>
        <option value="emergency_fund">Emergency fund</option>
        <option value="travel_fund">Travel fund</option>
        <option value="other">Other</option>
      </select>
    </Field>
  );
}

function AccountFields({
  account,
  defaultCurrency,
  includeCurrency,
}: {
  account?: SavingsAccountRecord;
  defaultCurrency: CurrencyCode;
  includeCurrency: boolean;
}) {
  return (
    <>
      {account ? <input name="accountId" type="hidden" value={account.id} /> : null}
      <Field label="Account name"><input defaultValue={account?.name} maxLength={100} name="name" required /></Field>
      <Field label="Institution (optional)"><input defaultValue={account?.institution ?? ""} maxLength={100} name="institution" /></Field>
      <AccountTypeSelect defaultValue={account?.accountType} />
      {includeCurrency ? (
        <Field label="Currency">
          <select defaultValue={defaultCurrency} name="currencyCode">
            {(["PHP", "USD", "EUR", "JPY"] as CurrencyCode[]).map((currency) => <option key={currency} value={currency}>{currency}</option>)}
          </select>
        </Field>
      ) : null}
      {includeCurrency ? <Field label="Opening balance"><input defaultValue="0" inputMode="decimal" min="0" name="openingBalance" step="0.01" type="number" /></Field> : null}
      <label className="savings-checkbox"><input defaultChecked={account?.includeInTotal ?? true} name="includeInTotal" type="checkbox" value="true" /><span>Include in total savings</span></label>
      <Field label="Color (optional)"><input defaultValue={account?.color ?? ""} maxLength={7} name="color" placeholder="#187550" /></Field>
      <Field label="Notes (optional)"><textarea defaultValue={account?.notes ?? ""} maxLength={1000} name="notes" rows={2} /></Field>
    </>
  );
}

function SavingsGoalManager({ goals, accounts }: { goals: SavingsGoalRecord[]; accounts: SavingsAccountRecord[] }) {
  const [selectedGoalId, setSelectedGoalId] = useState("");
  const selectedGoal = goals.find((goal) => goal.id === selectedGoalId);

  return (
    <SavingsActionDialog
      label={selectedGoal ? `Manage ${selectedGoal.name}` : "Manage goal"}
      open={Boolean(selectedGoal)}
      onClose={() => setSelectedGoalId("")}
      trigger={(
        <label className="savings-goal-selector">
          <span className="visually-hidden">Select a savings goal to manage</span>
          <select
            onChange={(event) => {
              setSelectedGoalId(event.target.value);
            }}
            value={selectedGoalId}
          >
            <option value="">Manage goal</option>
            {goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.name}</option>)}
          </select>
        </label>
      )}
    >
      {selectedGoal ? (
        <div key={selectedGoal.id} className="savings-goal-manager-content">
          <ActionForm action={updateSavingsGoalAction} label="Save goal">
            <input name="goalId" type="hidden" value={selectedGoal.id} />
            <Field label="Goal name"><input defaultValue={selectedGoal.name} maxLength={100} name="name" required /></Field>
            <Field label="Linked account (optional)"><select defaultValue={selectedGoal.accountId ?? ""} name="accountId"><option value="">No linked account</option>{accounts.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.currencyCode}</option>)}</select></Field>
            <Field label="Target amount"><input defaultValue={selectedGoal.targetAmountMinor / (selectedGoal.currencyCode === "JPY" ? 1 : 100)} inputMode="decimal" min="0.01" name="targetAmount" required step="0.01" type="number" /></Field>
            <Field label="Target date (optional)"><input defaultValue={selectedGoal.targetDate?.toISOString().slice(0, 10) ?? ""} name="targetDate" type="date" /></Field>
            <Field label="Notes (optional)"><textarea defaultValue={selectedGoal.notes ?? ""} maxLength={1000} name="notes" rows={2} /></Field>
          </ActionForm>
          <div className="savings-goal-status-actions">
            <ActionForm action={completeSavingsGoalAction} buttonVariant="secondary" className="savings-goal-status-form" label="Mark complete">
              <input name="goalId" type="hidden" value={selectedGoal.id} />
            </ActionForm>
            <ActionForm action={archiveSavingsGoalAction} buttonVariant="secondary" className="savings-goal-status-form savings-goal-archive-form" label="Archive goal">
              <input name="goalId" type="hidden" value={selectedGoal.id} />
            </ActionForm>
          </div>
        </div>
      ) : null}
    </SavingsActionDialog>
  );
}

export function SavingsActions({
  accounts,
  defaultCurrency = "PHP",
  account,
  accountBalanceMinor,
  goals = [],
  createAccount = true,
}: {
  accounts: SavingsAccountRecord[];
  defaultCurrency?: CurrencyCode;
  account?: SavingsAccountRecord;
  accountBalanceMinor?: number;
  goals?: SavingsGoalRecord[];
  createAccount?: boolean;
}) {
  const activeAccounts = accounts.filter((item) => item.status === "active");
  return (
    <div className="savings-actions">
      {createAccount ? (
        <SavingsActionDialog label="Add account">
          <ActionForm action={createSavingsAccountAction} idempotent label="Create account">
            <AccountFields defaultCurrency={defaultCurrency} includeCurrency />
          </ActionForm>
        </SavingsActionDialog>
      ) : null}
      {account ? (
        <>
          <SavingsActionDialog label="Edit account">
            <ActionForm action={updateSavingsAccountAction} label="Save account">
              <AccountFields account={account} defaultCurrency={account.currencyCode} includeCurrency={false} />
            </ActionForm>
          </SavingsActionDialog>
          {account.status === "active" ? (
            <SavingsActionDialog label="Archive account">
              <p>Archiving preserves all history. The balance must be zero and linked active goals must be resolved first.</p>
              <ActionForm
                action={archiveSavingsAccountAction}
                confirmation={`Archive ${account.name} with a current balance of ${formatMoney(accountBalanceMinor ?? 0, account.currencyCode)}? The balance must be zero, active goals must be resolved, and transaction history will be retained.`}
                label="Archive account"
              >
                <input name="accountId" type="hidden" value={account.id} />
              </ActionForm>
            </SavingsActionDialog>
          ) : (
            <ActionForm action={restoreSavingsAccountAction} label="Restore account">
              <input name="accountId" type="hidden" value={account.id} />
            </ActionForm>
          )}
        </>
      ) : null}
      {activeAccounts.length > 0 ? (
        <>
          {(["deposit", "withdraw", "adjust"] as const).map((kind) => (
            <SavingsActionDialog key={kind} label={kind === "deposit" ? "Add money" : kind === "withdraw" ? "Withdraw" : "Adjust balance"}>
              {kind === "adjust" ? (
                <ActionForm action={adjustSavingsAction} confirmation="adjustment" idempotent label="Record adjustment">
                  <TransactionFields accountId={account?.id} accounts={activeAccounts} />
                  <Field label="Direction"><select defaultValue="increase" name="direction"><option value="increase">Increase</option><option value="decrease">Decrease</option></select></Field>
                  <Field label="Reason"><input maxLength={300} name="reason" required /></Field>
                </ActionForm>
              ) : (
                <ActionForm action={kind === "deposit" ? depositSavingsAction : withdrawSavingsAction} idempotent label={kind === "deposit" ? "Record deposit" : "Record withdrawal"}>
                  <TransactionFields accountId={account?.id} accounts={activeAccounts} />
                </ActionForm>
              )}
            </SavingsActionDialog>
          ))}
          {activeAccounts.length > 1 ? (
            <SavingsActionDialog label="Transfer">
              <ActionForm action={transferSavingsAction} confirmation="transfer" idempotent label="Confirm transfer">
                <TransferAccountFields accounts={activeAccounts} selectedAccountId={account?.id} />
                <Field label="Amount"><input inputMode="decimal" min="0.01" name="amount" required step="0.01" type="number" /></Field>
                <DateField />
                <Field label="Description"><input defaultValue="Transfer between my accounts" maxLength={120} name="description" required /></Field>
                <Field label="Notes (optional)"><input maxLength={1000} name="notes" /></Field>
                <p className="form-hint">Both accounts must use the same currency. This transfer does not change your total savings.</p>
              </ActionForm>
            </SavingsActionDialog>
          ) : null}
        </>
      ) : null}
      {(!account || account.status === "active") ? (
        <SavingsActionDialog label="Create savings goal">
          <ActionForm action={createSavingsGoalAction} label="Create goal">
            <Field label="Goal name"><input maxLength={100} name="name" required /></Field>
            <Field label="Linked account (optional)"><select defaultValue={account?.id ?? ""} name="accountId"><option value="">No linked account</option>{activeAccounts.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.currencyCode}</option>)}</select></Field>
            <Field label="Target amount"><input inputMode="decimal" min="0.01" name="targetAmount" required step="0.01" type="number" /></Field>
            <Field label="Target date (optional)"><input name="targetDate" type="date" /></Field>
            <Field label="Notes (optional)"><textarea maxLength={1000} name="notes" rows={2} /></Field>
            <p className="form-hint">When linked, progress follows the account balance. Otherwise the goal uses your default currency.</p>
          </ActionForm>
        </SavingsActionDialog>
      ) : null}
      {goals.length > 0 ? <SavingsGoalManager accounts={activeAccounts} goals={goals} /> : null}
    </div>
  );
}

export function ReverseTransactionForm({
  transactionId,
  description,
  amountMinor,
  currencyCode,
  transactionDate,
}: {
  transactionId: string;
  description: string;
  amountMinor: number;
  currencyCode: CurrencyCode;
  transactionDate: Date;
}) {
  return (
    <details className="transaction-reversal">
      <summary>Reverse</summary>
      <p>Reverse “{description}”? A linked correction will be recorded; the original history remains.</p>
      <ActionForm action={reverseSavingsTransactionAction} confirmation={`Reverse “${description}” (${formatMoney(amountMinor, currencyCode)} on ${transactionDate.toISOString().slice(0, 10)})? This records an opposite transaction, preserves the original, and cannot be undone. Enter a reason and confirm.`} idempotent label="Confirm reversal">
        <input name="transactionId" type="hidden" value={transactionId} />
        <Field label="Reason"><input maxLength={300} name="reason" required /></Field>
      </ActionForm>
    </details>
  );
}

export function formatSavingsAccountBalance(amountMinor: number, currencyCode: CurrencyCode) {
  return formatMoney(amountMinor, currencyCode);
}
