# Debt & Installment Tracker (Phase 4)

## Architecture and ownership

Authenticated Debt pages load through Server Components. Server Actions resolve the user from the server session, validate form input with Zod, call the debt service, and revalidate the affected routes. Services own financial rules and transactions; repositories apply user-scoped Drizzle queries.

The schema is in `src/db/schema/debt.ts`:

- `debts` stores debt metadata and opening/original amounts.
- `debt_installments` stores expected obligations independently of payments.
- `debt_payments` stores posted payments and linked Savings transactions.
- `debt_payment_allocations` stores manually known principal, interest, fees, adjustments, or unapportioned amounts.
- `debt_adjustments` stores balance/fee/interest changes and their corrections.
- `debt_installment_reschedules` retains prior and replacement due dates with a reason.

Composite foreign keys tie child rows to the same user and parent debt. Payment accounts must belong to that user and use the debt currency. A user's ID is never accepted from form data.

## Balance, payments, and allocations

When creating a debt, choose **New debt** or **Existing debt / current balance**. For a new monthly debt with the interest-rate field blank, inferred total interest is `max(0, installment amount × installment count − original principal)`. If a schedule-total override adjusts the final installment, that actual total is used instead. The opening balance includes principal plus this inferred interest exactly once; a creation note records the inference. No extra adjustment is posted and no annual rate is guessed. The difference may include lender fees, so review the preview against your agreement.

An explicitly supplied rate (including zero), non-monthly recurrence, or an existing/current-balance debt does not trigger inference. Existing debts preserve the entered current balance even if it includes interest above the original principal. New debts otherwise start at the principal amount in the creation form. Existing saved debts are unchanged.

Money is stored in integer minor units. The authoritative current balance is derived as:

`opening balance - posted non-reversal payments + posted balance adjustments`

Reversed payments and adjustments are retained but excluded from the balance. A displayed balance is based on information manually entered into Iponly; it is not a creditor payoff quote. Interest rates are stored in basis points for reference only. Iponly does not calculate lender interest.

Payments can be regular, partial, extra, payoff, adjustment, or fee payments. A payment may be linked to one eligible installment; payments larger than its remaining scheduled amount must be recorded separately as an extra payment. If the user knows the allocation, principal, interest, fees, adjustments, and unapportioned amounts must sum exactly to the payment. Otherwise the payment is explicitly recorded as unapportioned; no principal or interest split is inferred.

Partial-payment progress is derived from allocations. Reversals preserve original payment history. If a Savings account was linked, the debt payment and Savings withdrawal reversal happen in the same database transaction. A linked payment is a withdrawal from the user's Savings ledger, not a transfer and not an additional debt expense. Recording a payment does not send money to a creditor.

In **Overdue installments** and **Next payments**, **Mark as paid** confirms and records the installment's displayed remaining amount using today's date in the user's timezone. It creates a regular, unapportioned payment linked to that installment through the same authenticated, transactional, idempotent payment workflow as the detail page. It does not deduct a Savings account or send money. For a different payment date, partial amount, or linked Savings withdrawal, use the debt detail form instead. Quick payment is available only for active debts; paused or defaulted debts must be reactivated first. Already-paid or stale amounts exceeding the current remaining obligation are rejected by the service.

Next payments shows at most one upcoming unpaid installment per debt, ordered by due date. It selects the earliest eligible installment from the user's current calendar month onward; once that installment is fully paid, the next unpaid installment appears (normally next month for monthly plans). Partial payments remain visible for their outstanding amount. Overdue installments remain in the separate Overdue installments section. Selection uses the full schedule, not the dashboard's ten-entry limit, and the calendar continues to show all eligible obligations.

## Schedules and statuses

The Overdue installments table supports row checkboxes and select-all for active debts, with **Mark selected as paid** for up to 100 installments per submission. One confirmation shows totals separately per currency. The selected remaining amounts are recorded on today's date without Savings deductions. The batch is atomic: ownership, status, or stale-balance errors roll back every payment. Retry keys prevent duplicate payments, and a successful batch clears the selection and refreshes the page. Individual row payment buttons remain available.

The debt detail page keeps balance cards above tabs for Repayment progress, Schedule, Payments, Adjustments, and Details. These use the same keyboard-accessible, horizontally scrollable tabs as Travel. Hidden panels stay mounted so switching tabs preserves unsaved form input. Existing debt-status restrictions still control available actions.

For active debts, the Schedule section's upper-right **Add manual installment** button opens the installment form in a modal. Remaining amounts and statuses align with their column headers on desktop; mobile retains the stacked schedule layout.

The Payments tab's **Payment history** section has an upper-right **Record payment** button for active debts. It opens the existing payment form in a modal, including installment selection, optional Savings linking, allocation details, validation, and confirmation.

Selecting an eligible installment fills Amount with its remaining unpaid amount in the debt's currency. The amount stays editable for partial payments; switching installments replaces it with the newly selected remaining amount. Selecting no installment clears it for manual entry.

The payment modal is up to 1000px wide, with 16px input text, larger controls, two-column fields on larger screens, and a single column on phones. Its height stays within the viewport with internal scrolling.

The Adjustments header provides **Record balance adjustment** for active or paused debts, opening the same spacious modal layout. Adjustment history retains the original transaction-row styling, with a wider description column (at least 200px on desktop) and the amount/correction action on the right. Reasons wrap within the first column.

Supported recurrence is one-time, weekly, biweekly, monthly, and manual/custom. A generated schedule can contain at most 600 installments. Weekly and biweekly dates use whole-week increments. Monthly schedules preserve the original day; if a month is shorter, that installment falls on its final day and subsequent months resume the original day (Jan 31 → Feb 28/29 → Mar 31).

Debt statuses are `draft`, `active`, `paid`, `paused`, `defaulted`, and `archived`. Installments use `scheduled`, `partially_paid`, `paid`, `overdue`, `waived`, and `cancelled`. Overdue is derived using the user's timezone and the debt's grace period. A payment or adjustment does not silently discard a balance; a debt can be marked paid only when its ledger-derived balance is zero. Archiving an outstanding debt requires explicit confirmation, and archived records can be restored.

Rescheduling is limited to unpaid installments. Every change retains the prior due date and requires a reason. Payment and debt-creation idempotency keys are unique per user. Debt rows are locked during financial mutations; linked Savings accounts are also locked before checking available funds.

## Migrating records from notes

The create form provides a guided “start tracking from today's balance” migration path. Enter the original amount, current remaining balance, next due date, and only the future unpaid installment count. The previously paid installment count and optional history summary are saved as notes. They do not create historical payments, dates, references, or Savings transactions. Complete historical schedule reconstruction is not supported yet.

Debt metadata can be edited without rewriting the opening balance, payments, allocations, or adjustments. Currency and ledger amounts are intentionally immutable after creation.

## Analytics and limitations

Dashboard and Debt summaries use authenticated records and keep totals grouped by currency. Debt progress uses the opening balance and ledger-derived current balance. Savings-linked transactions are not counted twice. Archived records remain available in history and are not included in active outstanding totals.

The **Calendar** button in **Next payments** opens a monthly installment calendar. Navigate between months or return to today, then select a date to view the unpaid installments and open their debt details. The calendar includes overdue and partially paid obligations from active, paused, and defaulted debts; paid, waived, cancelled, and archived obligations are excluded. It uses all schedules loaded by the overview rather than just the ten next-payment entries. Today's date follows the user's timezone, and weekday ordering follows their first-day-of-week preference. Due dates are treated as calendar dates without timezone conversion, and each amount retains its own currency.

- Users enter debt data manually; Iponly does not connect to creditors or lenders.
- Iponly does not process payments or provide financial advice.
- Interest calculations, automatic lender synchronization, and bank integrations are not included.
- Budget integration and Iponly AI are deferred to later phases.
- Full payment analytics by creditor/type and period filters remain limited.
- No production migration is run from automated tests; tests apply migrations to an isolated PGlite database.

## Migrations and validation

```bash
npm run db:generate
npm run db:migrate
npm run typecheck
npm run lint
npm test
npm run build
```

The migration runner requires the configured database environment. Focused debt tests use Vitest and PGlite.
