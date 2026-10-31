import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, RotateCcw } from "lucide-react";
import { ReverseTransactionForm } from "@/components/savings-actions";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import type { SavingsTransactionRecord, SavingsTransactionType } from "@/types/domain";

const direction: Record<SavingsTransactionType, { label: string; sign: "+" | "−" | ""; icon: typeof ArrowDownLeft }> = {
  opening_balance: { label: "Opening balance · Inflow", sign: "+", icon: ArrowDownLeft },
  deposit: { label: "Deposit · Inflow", sign: "+", icon: ArrowDownLeft },
  withdrawal: { label: "Withdrawal · Outflow", sign: "−", icon: ArrowUpRight },
  adjustment_increase: { label: "Adjustment · Increase", sign: "+", icon: ArrowLeftRight },
  adjustment_decrease: { label: "Adjustment · Decrease", sign: "−", icon: ArrowLeftRight },
  transfer_in: { label: "Transfer · Inflow", sign: "+", icon: ArrowLeftRight },
  transfer_out: { label: "Transfer · Outflow", sign: "−", icon: ArrowLeftRight },
  reversal: { label: "Reversal", sign: "", icon: RotateCcw },
};

export function SavingsTransactionList({
  transactions,
  accountNames = new Map(),
}: {
  transactions: SavingsTransactionRecord[];
  accountNames?: ReadonlyMap<string, string>;
}) {
  if (transactions.length === 0) {
    return <p className="savings-empty-inline">No transactions yet. Your deposits, withdrawals, and transfers will appear here.</p>;
  }
  return (
    <div className="savings-transaction-list">
      {transactions.map((transaction) => {
        const view = direction[transaction.transactionType];
        const Icon = view.icon;
        const pairedTransfer = transaction.transferId
          ? transactions.find((item) => item.transferId === transaction.transferId && item.accountId !== transaction.accountId)
          : undefined;
        const amountSign = transaction.transactionType === "reversal"
          ? `Correction · ${formatMoney(transaction.amountMinor, transaction.currencyCode)}`
          : `${view.sign}${formatMoney(transaction.amountMinor, transaction.currencyCode)}`;
        return (
          <article className="savings-transaction-row" key={transaction.id}>
            <span aria-hidden="true" className="savings-transaction-icon"><Icon size={17} /></span>
            <div className="savings-transaction-copy">
              <strong>{transaction.description}</strong>
              <span>{view.label}{accountNames.has(transaction.accountId) ? ` · ${accountNames.get(transaction.accountId)}` : ""}{transaction.transferId ? ` · ${pairedTransfer ? `with ${accountNames.get(pairedTransfer.accountId) ?? "another account"}` : "linked transfer"}` : ""}</span>
              <time dateTime={transaction.transactionDate.toISOString()}>{formatDate(transaction.transactionDate.toISOString())}</time>
              {transaction.reason ? <small>Reason: {transaction.reason}</small> : null}
            </div>
            <div className="savings-transaction-amount">
              <strong>{amountSign}</strong>
              <span className={`status-badge ${transaction.status === "reversed" ? "status-neutral" : "status-active"}`}>{transaction.status === "reversed" ? "Reversed" : "Posted"}</span>
            </div>
            {transaction.status === "posted" && transaction.transactionType !== "opening_balance"
              ? <ReverseTransactionForm
                  amountMinor={transaction.amountMinor}
                  currencyCode={transaction.currencyCode}
                  description={transaction.description}
                  transactionDate={transaction.transactionDate}
                  transactionId={transaction.id}
                />
              : null}
          </article>
        );
      })}
    </div>
  );
}
