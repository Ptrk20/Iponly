"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { recordBulkInstallmentPaymentsAction, type DebtActionState } from "@/actions/debt";
import { QuickInstallmentPaymentForm } from "@/components/debt-actions";
import { StatusBadge } from "@/components/ui";
import { useMutationForm } from "@/hooks/use-mutation-form";
import { formatDate } from "@/lib/dates";
import { formatMoney, minorToMajor } from "@/lib/money";
import type { CurrencyCode } from "@/types/domain";

type Installment = {
  id: string;
  debtId: string;
  debtName: string;
  dueDate: string;
  remainingAmountMinor: number;
  currencyCode: CurrencyCode;
  canPay: boolean;
};

export function OverdueInstallments({ installments, today }: { installments: Installment[]; today: string }) {
  const [selected, setSelected] = useState<string[]>([]);
  const keys = useRef(new Map<string, string>());
  const { state, formAction, formRef, submittedRef, pending } = useMutationForm<DebtActionState>(async (previous, data) => {
    const result = await recordBulkInstallmentPaymentsAction(previous, data);
    if (result.ok) {
      setSelected([]);
      keys.current.clear();
    }
    return result;
  }, { ok: false, message: "" });
  const eligible = installments.filter((item) => item.canPay);
  const chosen = eligible.filter((item) => selected.includes(item.id));
  const allSelected = eligible.length > 0 && chosen.length === eligible.length;
  const totals = new Map<CurrencyCode, number>();
  for (const item of chosen) totals.set(item.currencyCode, (totals.get(item.currencyCode) ?? 0) + item.remainingAmountMinor);

  return (
    <div>
      <form
        action={formAction}
        className="overdue-bulk-actions"
        ref={formRef}
        onSubmit={(event) => {
          if (submittedRef.current || chosen.length === 0) {
            event.preventDefault();
            return;
          }
          const summary = [...totals].map(([currency, amount]) => formatMoney(amount, currency)).join(" + ");
          if (!window.confirm(`Mark ${chosen.length} overdue installments as paid?\n\n${summary}\nPayment date: ${formatDate(today)}\n\nEach remaining amount will be recorded. No Savings account will be deducted and no money is sent. All selected payments must succeed or none will be saved.`)) {
            event.preventDefault();
            return;
          }
          const entries = chosen.map((item) => {
            let key = keys.current.get(item.id);
            if (!key) {
              key = crypto.randomUUID();
              keys.current.set(item.id, key);
            }
            return {
              debtId: item.debtId, installmentId: item.id,
              amount: String(minorToMajor(item.remainingAmountMinor, item.currencyCode)),
              idempotencyKey: key,
            };
          });
          const field = event.currentTarget.elements.namedItem("installments");
          if (field instanceof HTMLInputElement) field.value = JSON.stringify(entries);
          submittedRef.current = true;
        }}
      >
        <input name="installments" type="hidden" />
        <input name="paymentDate" type="hidden" value={today} />
        <span>{chosen.length} selected{chosen.length > 100 ? " — select up to 100 at a time" : ""}</span>
        <button className="button button-primary" disabled={pending || chosen.length === 0 || chosen.length > 100} type="submit">
          {pending ? "Saving…" : `Mark selected as paid (${chosen.length})`}
        </button>
        <p aria-live="polite" className={`form-status${state.ok ? " is-success" : ""}`} role="status">{state.message}</p>
      </form>
      <div className="schedule-table debt-next-payments debt-overdue-selection">
        <div className="schedule-head">
          <input
            aria-label="Select all payable overdue installments"
            checked={allSelected}
            disabled={pending || eligible.length === 0}
            onChange={(event) => setSelected(event.target.checked ? eligible.map((item) => item.id) : [])}
            ref={(input) => { if (input) input.indeterminate = chosen.length > 0 && !allSelected; }}
            type="checkbox"
          />
          <span>Debt</span><span>Due date</span><span>Remaining</span><span>Status</span><span>Action</span>
        </div>
        {installments.map((item) => (
          <div className="schedule-row" key={item.id}>
            <label className="overdue-row-select">
              <input
                aria-label={`Select ${item.debtName}, due ${formatDate(item.dueDate)}`}
                checked={chosen.some((entry) => entry.id === item.id)}
                disabled={pending || !item.canPay}
                onChange={(event) => setSelected((current) => event.target.checked
                  ? [...current, item.id] : current.filter((id) => id !== item.id))}
                type="checkbox"
              />
            </label>
            <strong><Link href={`/debt/${item.debtId}`}>{item.debtName}</Link></strong>
            <span>{formatDate(item.dueDate)}</span>
            <strong>{formatMoney(item.remainingAmountMinor, item.currencyCode)}</strong>
            <StatusBadge tone="overdue">Overdue</StatusBadge>
            {item.canPay ? (
              <fieldset className="overdue-single-action" disabled={pending}>
                <QuickInstallmentPaymentForm installment={item} today={today} />
              </fieldset>
            ) : <Link href={`/debt/${item.debtId}`}>Open debt to resume payments</Link>}
          </div>
        ))}
      </div>
    </div>
  );
}
