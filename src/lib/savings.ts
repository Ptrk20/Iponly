import type {
  CurrencyCode,
  SavingsAccountRecord,
  SavingsGoalRecord,
  SavingsTransactionRecord,
  SavingsTransactionType,
} from "@/types/domain";

const inwardTypes = new Set<SavingsTransactionType>([
  "opening_balance",
  "deposit",
  "adjustment_increase",
  "transfer_in",
]);
const outwardTypes = new Set<SavingsTransactionType>([
  "withdrawal",
  "adjustment_decrease",
  "transfer_out",
]);

export function getTransactionBalanceEffect(
  transaction: Pick<SavingsTransactionRecord, "transactionType" | "amountMinor">,
  originalType?: SavingsTransactionType,
) {
  if (inwardTypes.has(transaction.transactionType)) return transaction.amountMinor;
  if (outwardTypes.has(transaction.transactionType)) return -transaction.amountMinor;
  if (transaction.transactionType === "reversal") {
    if (!originalType) throw new Error("A reversal must reference its original transaction type.");
    if (inwardTypes.has(originalType)) return -transaction.amountMinor;
    if (outwardTypes.has(originalType)) return transaction.amountMinor;
  }
  return 0;
}

export function calculateAccountBalance(
  transactions: SavingsTransactionRecord[],
  accountId: string,
) {
  const byId = new Map(transactions.map((transaction) => [transaction.id, transaction]));
  const balance = transactions.reduce((total, transaction) => {
    if (transaction.accountId !== accountId) return total;
    const original = transaction.reversalOfTransactionId
      ? byId.get(transaction.reversalOfTransactionId)
      : undefined;
    return total + getTransactionBalanceEffect(transaction, original?.transactionType);
  }, 0);
  assertSafeMinor(balance);
  return balance;
}

export function calculateTotalSavings(
  accounts: SavingsAccountRecord[],
  balances: ReadonlyMap<string, number>,
) {
  const totals = new Map<CurrencyCode, number>();
  for (const account of accounts) {
    if (!account.includeInTotal) continue;
    const total = (totals.get(account.currencyCode) ?? 0) + (balances.get(account.id) ?? 0);
    assertSafeMinor(total);
    totals.set(account.currencyCode, total);
  }
  return totals;
}

export function calculateGoalProgress(
  goal: Pick<SavingsGoalRecord, "targetAmountMinor" | "accountId">,
  accountBalanceMinor: number,
) {
  const savedMinor = goal.accountId ? Math.max(0, accountBalanceMinor) : 0;
  const remainingMinor = Math.max(0, goal.targetAmountMinor - savedMinor);
  const progressPercent = Math.min(100, Math.round((savedMinor / goal.targetAmountMinor) * 100));
  return { savedMinor, remainingMinor, progressPercent };
}

export function calculateSavingsChange(
  transactions: SavingsTransactionRecord[],
  includedAccountIds: ReadonlySet<string>,
  originals: ReadonlyMap<string, SavingsTransactionRecord | SavingsTransactionType>,
) {
  return transactions.reduce((changes, transaction) => {
    if (!includedAccountIds.has(transaction.accountId)) return changes;
    const original = transaction.reversalOfTransactionId
      ? originals.get(transaction.reversalOfTransactionId)
      : undefined;
    const change = (changes.get(transaction.currencyCode) ?? 0)
      + getTransactionBalanceEffect(transaction, typeof original === "string" ? original : original?.transactionType);
    assertSafeMinor(change);
    changes.set(transaction.currencyCode, change);
    return changes;
  }, new Map<CurrencyCode, number>());
}

export function groupTransactionsByPeriod(
  transactions: SavingsTransactionRecord[],
  originals: ReadonlyMap<string, SavingsTransactionRecord | SavingsTransactionType>,
) {
  const groups = new Map<string, Map<CurrencyCode, number>>();
  for (const transaction of transactions) {
    const period = transaction.transactionDate.toISOString().slice(0, 7);
    const group = groups.get(period) ?? new Map<CurrencyCode, number>();
    const value = (group.get(transaction.currencyCode) ?? 0)
      + getTransactionBalanceEffect(
        transaction,
        transaction.reversalOfTransactionId
          ? (() => {
              const original = originals.get(transaction.reversalOfTransactionId!);
              return typeof original === "string" ? original : original?.transactionType;
            })()
          : undefined,
      );
    assertSafeMinor(value);
    group.set(transaction.currencyCode, value);
    groups.set(period, group);
  }
  return groups;
}

function assertSafeMinor(value: number) {
  if (!Number.isSafeInteger(value)) throw new RangeError("Savings totals exceed the supported range.");
}
