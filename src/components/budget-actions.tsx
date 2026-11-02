"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useMutationForm } from "@/hooks/use-mutation-form";
import { useFormStatus } from "react-dom";
import {
  addBudgetIncomeAction,
  copyMonthlyBudgetAction,
  createBudgetCategoryAction,
  createBudgetExpenseAction,
  createBudgetSavingsContributionAction,
  createMonthlyBudgetAction,
  linkDebtPaymentToBudgetAction,
  receiveBudgetIncomeAction,
  reverseBudgetExpenseAction,
  setBudgetCategoryArchivedAction,
  setMonthlyBudgetStatusAction,
  updateBudgetAllocationAction,
  updateBudgetCategoryAction,
  type BudgetActionState,
} from "@/actions/budget";
import { formatMoney, minorToMajor } from "@/lib/money";
import { SavingsActionDialog } from "@/components/savings-actions";
import type { BudgetCategoryRecord, BudgetIncomeRecord, MonthlyBudgetRecord } from "@/types/budget";
import type { CurrencyCode, SavingsAccountRecord } from "@/types/domain";

type BudgetAction = (previous: BudgetActionState, formData: FormData) => Promise<BudgetActionState>;

function SubmitButton({ label, variant = "primary" }: { label: string; variant?: "primary" | "secondary" }) {
  const { pending } = useFormStatus();
  return <button className={`button button-${variant}`} disabled={pending} type="submit">{pending ? "Saving…" : label}</button>;
}

function ActionForm({
  action,
  label,
  children,
  idempotent = false,
  className = "",
  variant = "primary",
}: {
  action: BudgetAction;
  label: string;
  children: ReactNode;
  idempotent?: boolean;
  className?: string;
  variant?: "primary" | "secondary";
}) {
  const { state, formAction, formRef, submittedRef } = useMutationForm(action, { ok: false, message: "" });

  return (
    <form
      action={formAction}
      className={`budget-form ${className}`}
      onSubmit={(event) => {
        if (submittedRef.current) {
          event.preventDefault();
          return;
        }
        if (idempotent) {
          const field = event.currentTarget.elements.namedItem("idempotencyKey");
          if (field instanceof HTMLInputElement && !field.value) field.value = crypto.randomUUID();
        }
        submittedRef.current = true;
      }}
      ref={formRef}
    >
      {idempotent ? <input name="idempotencyKey" type="hidden" /> : null}
      {children}
      <div className="budget-form-submit">
        <SubmitButton label={label} variant={variant} />
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

export function BudgetMonthNavigation({
  year,
  month,
  currentYear,
  currentMonth,
}: {
  year: number;
  month: number;
  currentYear: number;
  currentMonth: number;
}) {
  const router = useRouter();
  const previous = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  const format = (target: { year: number; month: number }) => `${target.year}-${String(target.month).padStart(2, "0")}`;
  return (
    <nav aria-label="Budget month navigation" className="budget-month-nav">
      <Link aria-label="Previous month" className="button button-secondary" href={`/budget?month=${format(previous)}`}>←</Link>
      <label>
        <span className="visually-hidden">Select budget month</span>
        <input
          aria-label="Select budget month"
          defaultValue={format({ year, month })}
          onChange={(event) => {
            if (/^\d{4}-\d{2}$/.test(event.currentTarget.value)) {
              router.push(`/budget?month=${event.currentTarget.value}`);
            }
          }}
          type="month"
        />
      </label>
      <Link aria-label="Next month" className="button button-secondary" href={`/budget?month=${format(next)}`}>→</Link>
      {(year !== currentYear || month !== currentMonth) ? (
        <Link className="button button-quiet" href="/budget">Current month</Link>
      ) : null}
    </nav>
  );
}

export function CreateBudgetForm({
  year,
  month,
  currencyCode,
}: {
  year: number;
  month: number;
  currencyCode: CurrencyCode;
}) {
  return (
    <ActionForm action={createMonthlyBudgetAction} idempotent label="Create monthly budget">
      <Hidden name="year" value={String(year)} />
      <Hidden name="month" value={String(month)} />
      <Field label="Currency">
        <select defaultValue={currencyCode} name="currencyCode">
          {(["PHP", "USD", "EUR", "JPY"] as const).map((currency) => <option key={currency} value={currency}>{currency}</option>)}
        </select>
      </Field>
      <Field label="Budget name (optional)"><input maxLength={100} name="name" placeholder="October budget" /></Field>
      <Field label="Notes (optional)"><textarea maxLength={2000} name="notes" rows={2} /></Field>
    </ActionForm>
  );
}

export function CopyPreviousBudgetForm({
  source,
  year,
  month,
  allocations,
  plannedIncome,
  expenseCount,
}: {
  source: MonthlyBudgetRecord;
  year: number;
  month: number;
  allocations: number;
  plannedIncome: number;
  expenseCount: number;
}) {
  return (
    <ActionForm action={copyMonthlyBudgetAction} idempotent label="Copy previous month">
      <Hidden name="sourceBudgetId" value={source.id} />
      <Hidden name="targetYear" value={String(year)} />
      <Hidden name="targetMonth" value={String(month)} />
      <p className="budget-copy-preview">
        Copies {allocations} allocations and {plannedIncome} planned income sources. Does not copy {expenseCount} actual transactions, received income, savings entries, or debt payments.
      </p>
    </ActionForm>
  );
}

export function BudgetEntryForms({
  budget,
  categories,
  accounts,
  incomes,
  year,
  month,
  today,
}: {
  budget: MonthlyBudgetRecord;
  categories: BudgetCategoryRecord[];
  accounts: (SavingsAccountRecord & { balanceMinor: number })[];
  incomes: BudgetIncomeRecord[];
  year: number;
  month: number;
  today: string;
}) {
  const activeCategories = categories.filter((category) => category.isActive);
  const expenseCategories = activeCategories.filter((category) => category.categoryType === "expense" || category.categoryType === "other");
  const savingCategory = activeCategories.find((category) => category.categoryType === "savings");
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const currentDate = today.startsWith(`${year}-${String(month).padStart(2, "0")}`) ? today : monthStart;

  return (
    <div className="budget-action-grid">
      <SavingsActionDialog label="Add income">
        <ActionForm action={addBudgetIncomeAction} idempotent label="Save planned income">
          <Hidden name="budgetId" value={budget.id} />
          <Field label="Income name"><input maxLength={100} name="name" placeholder="Monthly salary" required /></Field>
          <Field label="Type">
            <select defaultValue="salary" name="incomeType">
              {["salary", "bonus", "freelance", "allowance", "reimbursement", "business", "interest", "gift", "other"].map((type) =>
                <option key={type} value={type}>{type[0]?.toUpperCase()}{type.slice(1)}</option>)}
            </select>
          </Field>
          <Field label={`Planned amount (${budget.currencyCode})`}><input inputMode="decimal" min="0" name="plannedAmount" required step={budget.currencyCode === "JPY" ? "1" : "0.01"} /></Field>
          <Field label="Expected date (optional)"><input name="expectedDate" type="date" /></Field>
          <Field label="Notes (optional)"><textarea maxLength={2000} name="notes" rows={2} /></Field>
        </ActionForm>
      </SavingsActionDialog>

      <SavingsActionDialog label="Record an expense">
        <ActionForm action={createBudgetExpenseAction} idempotent label="Record expense">
          <Hidden name="budgetId" value={budget.id} />
          <Field label="Category">
            <select name="categoryId" required>
              <option value="">Choose category</option>
              {expenseCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </Field>
          <Field label={`Amount (${budget.currencyCode})`}><input inputMode="decimal" min="0.01" name="amount" required step={budget.currencyCode === "JPY" ? "1" : "0.01"} /></Field>
          <Field label="Date"><input defaultValue={currentDate} name="transactionDate" required type="date" /></Field>
          <Field label="Merchant (optional)"><input maxLength={100} name="merchant" /></Field>
          <Field label="Description"><input maxLength={120} name="description" required /></Field>
          <Field label="Paid from (optional)">
            <select defaultValue="" name="paymentAccountId">
              <option value="">Do not change a Savings account</option>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {formatMoney(account.balanceMinor, account.currencyCode)}</option>)}
            </select>
          </Field>
          <Field label="Notes (optional)"><textarea maxLength={2000} name="notes" rows={2} /></Field>
        </ActionForm>
      </SavingsActionDialog>

      {savingCategory ? (
        <SavingsActionDialog label="Record savings contribution">
          <ActionForm action={createBudgetSavingsContributionAction} idempotent label="Record contribution">
            <Hidden name="budgetId" value={budget.id} />
            <Hidden name="categoryId" value={savingCategory.id} />
            <Field label={`Amount (${budget.currencyCode})`}><input inputMode="decimal" min="0.01" name="amount" required step={budget.currencyCode === "JPY" ? "1" : "0.01"} /></Field>
            <Field label="Date"><input defaultValue={currentDate} name="transactionDate" required type="date" /></Field>
            <Field label="Savings account (optional)">
              <select defaultValue="" name="accountId">
                <option value="">No account link</option>
                {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select>
            </Field>
            <Field label="Description"><input maxLength={120} name="description" placeholder="Monthly savings" required /></Field>
            <p className="budget-help">When linked, this records a deposit to a tracked account, funded from untracked monthly cash.</p>
            <Field label="Notes (optional)"><textarea maxLength={2000} name="notes" rows={2} /></Field>
          </ActionForm>
        </SavingsActionDialog>
      ) : null}

      <SavingsActionDialog label="Manage categories">
        <ActionForm action={createBudgetCategoryAction} label="Add category">
          <Field label="Name"><input maxLength={60} name="name" required /></Field>
          <Field label="Type">
            <select defaultValue="expense" name="categoryType">
              <option value="expense">Expense</option><option value="savings">Savings</option>
              <option value="debt">Debt</option><option value="other">Other</option>
            </select>
          </Field>
          <Field label="Color"><input defaultValue="#6b8f71" name="color" type="color" /></Field>
        </ActionForm>
        <div className="budget-category-manage">
          {categories.map((category) => category.isSystemDefault ? null : (
            <div className="budget-category-manage-row" key={category.id}>
              <ActionForm action={updateBudgetCategoryAction} label="Save" variant="secondary">
                <Hidden name="categoryId" value={category.id} />
                <Field label={`${category.name} name`}><input defaultValue={category.name} maxLength={60} name="name" readOnly={category.isSystemDefault} required /></Field>
                <Field label="Color"><input defaultValue={category.color} name="color" type="color" /></Field>
                <Field label="Icon"><input defaultValue={category.icon ?? ""} maxLength={40} name="icon" /></Field>
                <Field label="Order"><input defaultValue={category.sortOrder} max="1000" min="0" name="sortOrder" type="number" /></Field>
              </ActionForm>
              <ActionForm action={setBudgetCategoryArchivedAction} label={category.isActive ? "Archive" : "Restore"} variant="secondary">
                <Hidden name="categoryId" value={category.id} />
                <Hidden name="archived" value={String(category.isActive)} />
              </ActionForm>
            </div>
          ))}
        </div>
      </SavingsActionDialog>

      <SavingsActionDialog label="Income history">
        {incomes.length === 0 ? <p className="budget-help">No income added yet. Add salary or another source above.</p> : (
          <ul className="budget-list">
            {incomes.map((income) => (
              <li key={income.id}>
                <span><strong>{income.name}</strong><small>Planned {formatMoney(income.plannedAmountMinor, budget.currencyCode)}</small></span>
                {income.status === "received" ? (
                  <span><strong>{formatMoney(income.actualAmountMinor, budget.currencyCode)}</strong><small>Received {income.receivedDate}</small></span>
                ) : income.status === "planned" ? (
                  <ActionForm action={receiveBudgetIncomeAction} label="Mark received" variant="secondary">
                    <Hidden name="incomeId" value={income.id} />
                    <Field label="Actual amount"><input defaultValue={minorToMajor(income.plannedAmountMinor, budget.currencyCode)} inputMode="decimal" name="actualAmount" required /></Field>
                    <Field label="Received date"><input defaultValue={currentDate} name="receivedDate" required type="date" /></Field>
                  </ActionForm>
                ) : <span>Cancelled</span>}
              </li>
            ))}
          </ul>
        )}
      </SavingsActionDialog>
    </div>
  );
}

export function BudgetAllocationEditor({
  budget,
  categories,
  allocationByCategory,
}: {
  budget: MonthlyBudgetRecord;
  categories: BudgetCategoryRecord[];
  allocationByCategory: Map<string, number>;
}) {
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const activeCategories = categories.filter((category) => category.isActive);
  const selectedCategory = activeCategories.find((category) => category.id === selectedCategoryId);
  const plannedAmountMinor = selectedCategory ? allocationByCategory.get(selectedCategory.id) ?? 0 : 0;

  return (
    <div className="budget-allocation-editor">
      {activeCategories.length === 0 ? <p className="budget-help">Create or restore a category to allocate your budget.</p> : (
        <ActionForm action={updateBudgetAllocationAction} key={`${budget.id}:${selectedCategoryId}`} label="Save allocation" variant="secondary">
          <Hidden name="budgetId" value={budget.id} />
          <Field label="Select category">
            <select
              name="categoryId"
              onChange={(event) => setSelectedCategoryId(event.currentTarget.value)}
              required
              value={selectedCategory?.id ?? ""}
            >
              <option value="">Choose category</option>
              {activeCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </Field>
          <Field label={`Planned ${budget.currencyCode}`}>
            <input
              aria-label={selectedCategory ? `${selectedCategory.name} planned amount` : "Planned amount"}
              defaultValue={minorToMajor(plannedAmountMinor, budget.currencyCode)}
              disabled={!selectedCategory}
              inputMode="decimal"
              key={`${selectedCategoryId}:${plannedAmountMinor}`}
              min="0"
              name="plannedAmount"
              required
              step={budget.currencyCode === "JPY" ? "1" : "0.01"}
            />
          </Field>
        </ActionForm>
      )}
    </div>
  );
}

export function BudgetTransactionActions({
  budget,
  expense,
}: {
  budget: MonthlyBudgetRecord;
  expense: { id: string; status: "posted" | "reversed"; reversalReason: string | null; sourceType: string; description: string };
}) {
  if (expense.status !== "posted" || expense.sourceType === "debt_payment") return null;
  return (
    <SavingsActionDialog label="Reverse">
      <ActionForm action={reverseBudgetExpenseAction} idempotent label="Reverse expense" variant="secondary">
        <Hidden name="expenseId" value={expense.id} />
        <Field label={`Reason to reverse ${expense.description}`}><input maxLength={300} name="reason" required /></Field>
        <input aria-label="Budget" name="budgetId" type="hidden" value={budget.id} />
      </ActionForm>
    </SavingsActionDialog>
  );
}

export function LinkDebtPaymentForm({
  budgetId,
  paymentId,
  categoryId,
  paymentLabel,
}: {
  budgetId: string;
  paymentId: string;
  categoryId: string;
  paymentLabel: string;
}) {
  return (
    <ActionForm action={linkDebtPaymentToBudgetAction} idempotent label="Include" variant="secondary">
      <Hidden name="budgetId" value={budgetId} />
      <Hidden name="paymentId" value={paymentId} />
      <Hidden name="categoryId" value={categoryId} />
      <span className="visually-hidden">{paymentLabel}</span>
    </ActionForm>
  );
}

export function MonthlyBudgetStatusForm({ budget }: { budget: MonthlyBudgetRecord }) {
  const nextStatus = budget.status === "active" ? "closed" : "active";
  return (
    <ActionForm action={setMonthlyBudgetStatusAction} label={budget.status === "active" ? "Close month" : "Reopen month"} variant="secondary">
      <Hidden name="budgetId" value={budget.id} />
      <Hidden name="status" value={nextStatus} />
    </ActionForm>
  );
}

export function ArchiveMonthlyBudgetForm({ budget }: { budget: MonthlyBudgetRecord }) {
  if (budget.status === "active" || budget.status === "archived") return null;
  return (
    <ActionForm action={setMonthlyBudgetStatusAction} label="Archive month" variant="secondary">
      <Hidden name="budgetId" value={budget.id} />
      <Hidden name="status" value="archived" />
    </ActionForm>
  );
}
