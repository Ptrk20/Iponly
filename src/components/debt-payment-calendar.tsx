"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import { addMonths, format, parseISO } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { EmptyState, StatusBadge } from "@/components/ui";
import { getDebtCalendarDays } from "@/lib/debt-calendar";
import { formatDate, formatMonth } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import type { CurrencyCode } from "@/types/domain";
import type { DebtInstallmentRecord } from "@/types/debt";

interface CalendarInstallment {
  id: string;
  debtId: string;
  debtName: string;
  dueDate: string;
  remainingAmountMinor: number;
  currencyCode: CurrencyCode;
  status: DebtInstallmentRecord["status"];
}

export function DebtPaymentCalendar({
  installments,
  today,
  firstDayOfWeek,
}: {
  installments: CalendarInstallment[];
  today: string;
  firstDayOfWeek: "monday" | "sunday";
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(today);
  const days = getDebtCalendarDays(month, firstDayOfWeek);
  const weekdays = firstDayOfWeek === "monday"
    ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const installmentsByDate = new Map<string, CalendarInstallment[]>();
  for (const installment of installments) {
    const entries = installmentsByDate.get(installment.dueDate) ?? [];
    entries.push(installment);
    installmentsByDate.set(installment.dueDate, entries);
  }
  const selectedInstallments = installmentsByDate.get(selectedDate) ?? [];
  const monthCount = installments.filter((installment) => installment.dueDate.startsWith(month)).length;

  function changeMonth(offset: number) {
    const next = format(addMonths(parseISO(`${month}-01`), offset), "yyyy-MM");
    setMonth(next);
    setSelectedDate(next === today.slice(0, 7) ? today : `${next}-01`);
  }

  return (
    <div className="savings-action">
      <button
        aria-haspopup="dialog"
        className="button button-secondary"
        onClick={() => dialogRef.current?.showModal()}
        type="button"
      >
        <CalendarDays aria-hidden="true" size={16} />Calendar
      </button>
      <dialog
        aria-labelledby={titleId}
        className="savings-action-dialog debt-calendar-dialog"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            dialogRef.current?.close();
          }
        }}
        ref={dialogRef}
      >
        <div className="savings-action-dialog-header">
          <h2 id={titleId}>Installment calendar</h2>
          <button
            aria-label="Close calendar"
            className="savings-action-close"
            onClick={() => dialogRef.current?.close()}
            type="button"
          >
            <X aria-hidden="true" size={20} />
          </button>
        </div>
        <div className="savings-action-dialog-body">
          <p>Unpaid installments, including overdue and partial payments. Select a date to see what is due.</p>
          <div className="debt-calendar-toolbar">
            <button aria-label="Previous month" className="button button-secondary button-icon" onClick={() => changeMonth(-1)} type="button">
              <ChevronLeft aria-hidden="true" size={18} />
            </button>
            <h3 aria-live="polite">{formatMonth(month)}</h3>
            <button aria-label="Next month" className="button button-secondary button-icon" onClick={() => changeMonth(1)} type="button">
              <ChevronRight aria-hidden="true" size={18} />
            </button>
            <button
              className="button button-secondary"
              onClick={() => {
                setMonth(today.slice(0, 7));
                setSelectedDate(today);
              }}
              type="button"
            >Today</button>
          </div>
          <div aria-label={`Installment due dates for ${formatMonth(month)}`} className="debt-calendar-grid" role="group">
            {weekdays.map((day) => <span aria-hidden="true" className="debt-calendar-weekday" key={day}>{day}</span>)}
            {days.map((day) => {
              const entries = installmentsByDate.get(day.date) ?? [];
              const overdueCount = entries.filter((entry) => entry.status === "overdue").length;
              return (
                <button
                  aria-current={day.date === today ? "date" : undefined}
                  aria-label={`${formatDate(day.date, "EEEE, MMMM d, yyyy")}: ${entries.length} unpaid ${entries.length === 1 ? "installment" : "installments"}${overdueCount ? `, ${overdueCount} overdue` : ""}`}
                  aria-pressed={selectedDate === day.date}
                  className={`debt-calendar-day${day.inMonth ? "" : " is-outside"}${overdueCount ? " has-overdue" : ""}`}
                  key={day.date}
                  onClick={() => {
                    setSelectedDate(day.date);
                    if (!day.inMonth) setMonth(day.date.slice(0, 7));
                  }}
                  type="button"
                >
                  <span>{day.day}</span>
                  {entries.length ? <span aria-hidden="true" className="debt-calendar-count">{entries.length}<span className="debt-calendar-count-label"> due</span></span> : null}
                </button>
              );
            })}
          </div>
          <p className="form-hint" aria-live="polite">{monthCount} unpaid {monthCount === 1 ? "installment" : "installments"} in {formatMonth(month)}.</p>
          <section aria-label="Selected date installments" className="debt-calendar-agenda" aria-live="polite">
            <h3>{formatDate(selectedDate, "EEEE, MMMM d")}</h3>
            {selectedInstallments.length === 0 ? (
              <EmptyState title="No installments due" description="There are no unpaid installments scheduled for this date." />
            ) : (
              <ul>
                {selectedInstallments.map((installment) => (
                  <li key={installment.id}>
                    <Link href={`/debt/${installment.debtId}`} onClick={() => dialogRef.current?.close()}>
                      <strong>{installment.debtName}</strong>
                      <span>{formatMoney(installment.remainingAmountMinor, installment.currencyCode)} <span className="debt-calendar-currency">{installment.currencyCode}</span></span>
                      <StatusBadge tone={installment.status}>{installment.status.replaceAll("_", " ")}</StatusBadge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </dialog>
    </div>
  );
}
