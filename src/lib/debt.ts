import { parseISO } from "date-fns";
import type { CurrencyCode } from "@/types/domain";
import type { DebtAdjustmentRecord, DebtInstallmentRecord, DebtPaymentAllocationRecord, DebtPaymentRecord, DebtRecord, DebtScheduleEntry } from "@/types/debt";

export function calculateDebtBalance(
  openingBalanceMinor: number,
  payments: Pick<DebtPaymentRecord, "amountMinor" | "status" | "paymentType">[],
  adjustments: Pick<DebtAdjustmentRecord, "amountMinor" | "status" | "adjustmentType">[],
) {
  let balance = openingBalanceMinor;
  for (const payment of payments) {
    if (payment.status === "posted" && payment.paymentType !== "reversal") balance -= payment.amountMinor;
  }
  for (const adjustment of adjustments) {
    if (adjustment.status !== "posted") continue;
    balance += adjustmentBalanceEffect(adjustment.adjustmentType, adjustment.amountMinor);
  }
  assertSafeMinor(balance);
  if (balance < 0) throw new RangeError("Debt payments exceed the recorded balance.");
  return balance;
}

export function adjustmentBalanceEffect(type: DebtAdjustmentRecord["adjustmentType"], amountMinor: number) {
  return type === "balance_decrease" || type === "fee_waived" || type === "interest_waived"
    ? -amountMinor
    : amountMinor;
}

export function calculateInstallmentRemaining(
  installment: Pick<DebtInstallmentRecord, "scheduledAmountMinor">,
  allocations: Pick<DebtPaymentAllocationRecord, "principalAmountMinor" | "interestAmountMinor" | "feesAmountMinor" | "adjustmentAmountMinor" | "unapportionedAmountMinor">[],
) {
  const paidMinor = allocations.reduce((total, allocation) => total + allocationTotal(allocation), 0);
  assertSafeMinor(paidMinor);
  return Math.max(0, installment.scheduledAmountMinor - paidMinor);
}

export function allocationTotal(
  allocation: Pick<DebtPaymentAllocationRecord, "principalAmountMinor" | "interestAmountMinor" | "feesAmountMinor" | "adjustmentAmountMinor" | "unapportionedAmountMinor">,
) {
  const total = allocation.principalAmountMinor
    + allocation.interestAmountMinor
    + allocation.feesAmountMinor
    + allocation.adjustmentAmountMinor
    + allocation.unapportionedAmountMinor;
  assertSafeMinor(total);
  return total;
}

export function calculateDebtProgress(debt: Pick<DebtRecord, "originalPrincipalMinor" | "openingBalanceMinor">, balanceMinor: number) {
  const amountPaidMinor = Math.max(0, debt.openingBalanceMinor - balanceMinor);
  return {
    amountPaidMinor,
    progressPercent: debt.openingBalanceMinor > 0
      ? Math.min(100, Math.round((amountPaidMinor / debt.openingBalanceMinor) * 100))
      : 100,
  };
}

export function calculateTotalDebt(debts: { balanceMinor: number; currencyCode: CurrencyCode; includeInTotal?: boolean }[]) {
  const totals = new Map<CurrencyCode, number>();
  for (const debt of debts) {
    if (debt.includeInTotal === false) continue;
    const total = (totals.get(debt.currencyCode) ?? 0) + debt.balanceMinor;
    assertSafeMinor(total);
    totals.set(debt.currencyCode, total);
  }
  return totals;
}

export function calculateAmountPaid(
  payments: Pick<DebtPaymentRecord, "amountMinor" | "status" | "paymentType">[],
) {
  const amountPaidMinor = payments.reduce(
    (total, payment) => total + (payment.status === "posted" && payment.paymentType !== "reversal" ? payment.amountMinor : 0),
    0,
  );
  assertSafeMinor(amountPaidMinor);
  return amountPaidMinor;
}

export function calculateAmountDueThisMonth(installments: DebtInstallmentRecord[], month: string) {
  return installments
    .filter((installment) => installment.dueDate.toISOString().slice(0, 7) === month)
    .reduce((total, installment) => {
      const next = total + Math.max(0, installment.scheduledAmountMinor - installment.amountPaidMinor);
      assertSafeMinor(next);
      return next;
    }, 0);
}

export function calculateOverdueAmount(installments: DebtInstallmentRecord[]) {
  return installments.reduce((total, installment) => {
    if (installment.status !== "overdue") return total;
    const next = total + Math.max(0, installment.scheduledAmountMinor - installment.amountPaidMinor);
    assertSafeMinor(next);
    return next;
  }, 0);
}

export function calculateNextInstallment<T extends Pick<DebtInstallmentRecord, "status" | "dueDate">>(installments: T[]) {
  return installments
    .filter((installment) => installment.status === "scheduled" || installment.status === "partially_paid" || installment.status === "overdue")
    .sort((left, right) => left.dueDate.getTime() - right.dueDate.getTime())[0] ?? null;
}

export function calculateRemainingInstallmentCount(installments: DebtInstallmentRecord[]) {
  return installments.filter((installment) =>
    installment.status !== "paid" && installment.status !== "waived" && installment.status !== "cancelled",
  ).length;
}

export function calculatePaymentAllocation(
  paymentAmountMinor: number,
  due: { feesMinor: number; interestMinor: number; principalMinor: number },
) {
  assertSafeMinor(paymentAmountMinor);
  for (const value of [due.feesMinor, due.interestMinor, due.principalMinor]) assertSafeMinor(value);
  if (paymentAmountMinor <= 0 || due.feesMinor < 0 || due.interestMinor < 0 || due.principalMinor < 0) {
    throw new RangeError("Payment and allocation amounts must be positive or zero as appropriate.");
  }
  let remainder = paymentAmountMinor;
  const feesAmountMinor = Math.min(remainder, due.feesMinor);
  remainder -= feesAmountMinor;
  const interestAmountMinor = Math.min(remainder, due.interestMinor);
  remainder -= interestAmountMinor;
  const principalAmountMinor = Math.min(remainder, due.principalMinor);
  remainder -= principalAmountMinor;
  return { feesAmountMinor, interestAmountMinor, principalAmountMinor, unapportionedAmountMinor: remainder };
}

export function determineDebtStatus(debt: DebtRecord, balanceMinor: number): DebtRecord["status"] {
  if (debt.status === "archived" || debt.status === "paused" || debt.status === "defaulted" || debt.status === "draft") {
    return debt.status;
  }
  return balanceMinor === 0 ? "paid" : "active";
}

export function groupDebtPaymentsByPeriod(payments: DebtPaymentRecord[]) {
  const groups = new Map<string, Map<CurrencyCode, number>>();
  for (const payment of payments) {
    if (payment.status !== "posted" || payment.paymentType === "reversal") continue;
    const period = payment.paymentDate.toISOString().slice(0, 7);
    const totals = groups.get(period) ?? new Map<CurrencyCode, number>();
    const next = (totals.get(payment.currencyCode) ?? 0) + payment.amountMinor;
    assertSafeMinor(next);
    totals.set(payment.currencyCode, next);
    groups.set(period, totals);
  }
  return groups;
}

export function determineInstallmentStatus(
  installment: Pick<DebtInstallmentRecord, "status" | "dueDate" | "amountPaidMinor">,
  scheduledAmountMinor: number,
  gracePeriodDays: number,
  now = new Date(),
  timezone = "Asia/Manila",
): DebtInstallmentRecord["status"] {
  if (installment.status === "waived" || installment.status === "cancelled") return installment.status;
  if (installment.amountPaidMinor >= scheduledAmountMinor) return "paid";
  if (installment.amountPaidMinor > 0) {
    return dueDateIsPast(installment.dueDate, gracePeriodDays, now, timezone) ? "overdue" : "partially_paid";
  }
  return dueDateIsPast(installment.dueDate, gracePeriodDays, now, timezone) ? "overdue" : "scheduled";
}

export function dueDateIsPast(dueDate: Date, gracePeriodDays: number, now: Date, timezone: string) {
  const dateParts = new Intl.DateTimeFormat("en-US", {
    timeZone: validTimezone(timezone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => dateParts.find((item) => item.type === type)?.value ?? "";
  const today = `${part("year")}-${part("month")}-${part("day")}`;
  const due = new Date(Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate() + gracePeriodDays));
  return due.toISOString().slice(0, 10) < today;
}

export function generateDebtSchedule(input: {
  firstDueDate: string;
  recurrence: DebtRecord["recurrence"];
  recurrenceInterval?: number;
  installmentCount: number;
  regularInstallmentMinor: number;
  totalScheduledAmountMinor?: number;
}): DebtScheduleEntry[] {
  const { firstDueDate, recurrence, installmentCount, regularInstallmentMinor } = input;
  const interval = input.recurrenceInterval ?? 1;
  if (!Number.isInteger(installmentCount) || installmentCount < 1 || installmentCount > 600) {
    throw new RangeError("Installment count must be between 1 and 600.");
  }
  if (!Number.isInteger(regularInstallmentMinor) || regularInstallmentMinor <= 0) {
    throw new RangeError("Installment amounts must be positive integer minor units.");
  }
  if (!Number.isInteger(interval) || interval < 1 || interval > 52) {
    throw new RangeError("Schedule interval must be between 1 and 52.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(firstDueDate) || Number.isNaN(parseISO(firstDueDate).getTime())) {
    throw new RangeError("Enter a valid first due date.");
  }
  if (recurrence === "one_time" && installmentCount !== 1) {
    throw new RangeError("One-time debts must have exactly one installment.");
  }
  const total = input.totalScheduledAmountMinor ?? regularInstallmentMinor * installmentCount;
  assertSafeMinor(total);
  if (!Number.isSafeInteger(total) || total < installmentCount) {
    throw new RangeError("Total scheduled amount must cover every installment.");
  }

  const first = parseISO(`${firstDueDate}T00:00:00Z`);
  if (Number.isNaN(first.getTime()) || first.toISOString().slice(0, 10) !== firstDueDate) {
    throw new RangeError("Enter a valid first due date.");
  }
  const firstDay = first.getUTCDate();
  const firstMonthLength = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const preserveEndOfMonth = firstDay === firstMonthLength;
  const amounts = Array.from({ length: installmentCount }, (_, index) =>
    index === installmentCount - 1
      ? total - regularInstallmentMinor * (installmentCount - 1)
      : regularInstallmentMinor,
  );
  if (amounts.some((amount) => amount <= 0)) {
    throw new RangeError("The final installment amount must be greater than zero.");
  }

  const entries = Array.from({ length: installmentCount }, (_, index) => {
    let dueDate: Date;
    if (index === 0) {
      dueDate = first;
    } else if (recurrence === "weekly") {
      dueDate = new Date(first.getTime() + interval * index * 7 * 86_400_000);
    } else if (recurrence === "biweekly") {
      dueDate = new Date(first.getTime() + 2 * interval * index * 7 * 86_400_000);
    } else if (recurrence === "monthly") {
      const month = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + index * interval, 1));
      const monthLength = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate();
      const targetDay = preserveEndOfMonth ? monthLength : Math.min(firstDay, monthLength);
      dueDate = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), targetDay));
    } else if (recurrence === "custom") {
      throw new RangeError("Custom schedules must be entered as individual installments.");
    } else {
      dueDate = first;
    }
    return { installmentNumber: index + 1,     dueDate: dueDate.toISOString().slice(0, 10), scheduledAmountMinor: amounts[index]! };
  });
  if (new Set(entries.map((entry) => entry.dueDate)).size !== entries.length) {
    throw new RangeError("The schedule contains duplicate due dates.");
  }
  return entries;
}

function validTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return timezone;
  } catch {
    return "Asia/Manila";
  }
}

function assertSafeMinor(value: number) {
  if (!Number.isSafeInteger(value)) throw new RangeError("Debt amounts exceed the supported range.");
}

export function percentageToBasisPoints(value: string) {
  const match = value.trim().match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) throw new RangeError("Enter an interest percentage with up to two decimal places.");
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? "").padEnd(2, "0"));
  const basisPoints = whole * 100 + fraction;
  if (!Number.isSafeInteger(basisPoints) || basisPoints < 0) {
    throw new RangeError("Enter a valid interest percentage.");
  }
  return basisPoints;
}

export function basisPointsToPercentage(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError("Interest basis points must be a non-negative integer.");
  return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`;
}
