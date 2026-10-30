Implement Phase 4 of Iponly: Debt and Installment Tracker.

Iponly is a mobile-first personal finance Progressive Web App designed primarily for Filipino users.

Product name:
Iponly

Tagline:
"Ipon. Budget. Bayad. Gala."

Follow all architecture, financial correctness, security, accessibility, testing, and product rules defined in the project's agent instructions.

==================================================
PHASE 4 GOAL
==================================================

Build the production-ready Debt and Installment Tracker for Iponly.

Replace the Debt page's Phase 1 fixture data with authenticated, user-owned records stored in PostgreSQL.

At the end of Phase 4, an authenticated user must be able to:

1. Create and manage debts.
2. Create one-time or recurring installment plans.
3. Generate installment schedules.
4. View upcoming installments.
5. View overdue installments.
6. Record full payments.
7. Record partial payments.
8. Record extra payments.
9. Record fees and adjustments.
10. Allocate payments to principal, interest, and fees when applicable.
11. Link a payment to a Savings account optionally.
12. View debt balances and payment history.
13. Reverse an incorrect payment safely.
14. Reschedule an unpaid installment.
15. mark a debt as paid.
16. Archive and restore debts.
17. View debt analytics and progress.
18. View real debt summaries on the dashboard.
19. Migrate existing installment records from notes using a guided form.

All debt records must belong to the authenticated user.

User A must never be able to view, modify, pay, reverse, archive, restore, or infer the existence of User B's debt records.

==================================================
PHASE 4 BOUNDARIES
==================================================

Implement only the Debt and Installment Tracker and its direct integration with the existing Savings Tracker and dashboard.

Do NOT implement yet:

- Monthly Budget persistence
- Monthly Budget category allocation
- General expense tracking
- Travel Planner persistence
- Iponly AI
- AI-created debt actions
- Automatic creditor synchronization
- Bank or lender API integration
- Credit score monitoring
- Automatic loan approval or financial advice
- Automatic interest-rate retrieval
- Automatic payment processing
- Payment gateway integration
- Push notifications
- Email or SMS notifications
- Full offline transaction synchronization
- Debt refinancing recommendations
- Debt payoff strategy recommendations
- Tax or accounting advice
- Shared household debts

Do not proceed to Phase 5 automatically.

==================================================
STEP 1 - INSPECT THE EXISTING PROJECT
==================================================

Before changing any code:

1. Inspect the complete project structure.
2. Review package.json and available scripts.
3. Review the Phase 1 Debt page and components.
4. Review the current dashboard debt cards.
5. Review the authentication implementation.
6. Review authenticated-user helpers.
7. Review the PostgreSQL and Drizzle configuration.
8. Review existing database schemas and migrations.
9. Review repository and service patterns.
10. Review Server Actions and validation patterns.
11. Review money and date utilities.
12. Review the production Savings Tracker.
13. Review account transaction types.
14. Review Savings transfer and reversal workflows.
15. Review user preference handling.
16. Review current domain types.
17. Review testing infrastructure.
18. Review mobile and desktop navigation.
19. Review loading, empty, and error states.
20. Review documentation and deployment configuration.

Do not assume dependencies are missing.

Do not replace working authentication, Savings logic, database configuration, or UI components.

Do not introduce a second ORM, form library, validation library, date library, chart library, or state-management library.

Before implementation, provide a concise plan containing:

- Existing relevant architecture
- Debt model and assumptions
- Database tables to add
- Enums to add
- Migrations required
- Files to create
- Files to modify
- Server Actions required
- Services and repositories required
- Savings integration points
- UI components required
- Tests required
- Important financial, scheduling, concurrency, and authorization risks

After presenting the plan, proceed without waiting for confirmation.

==================================================
STEP 2 - DEFINE THE DEBT DOMAIN
==================================================

The Debt and Installment Tracker must manage the following concepts:

1. Debts
2. Installment schedules
3. Debt payments
4. Payment allocations
5. Debt adjustments
6. Debt-account links

A debt represents an amount the user owes.

Examples:

- Laptop Installment
- Smartphone Installment
- Credit Card Balance
- Personal Loan
- Appliance Installment
- Buy Now, Pay Later Plan
- Family Loan
- Housing Loan
- Vehicle Loan
- One-Time Payable

An installment represents an expected amount due on a specific date.

A payment represents an actual amount paid.

Do not treat an installment as proof that payment occurred.

Keep scheduled obligations and actual payments separate.

==================================================
STEP 3 - DEBT TYPES
==================================================

Support debt types such as:

- installment
- credit_card
- personal_loan
- housing_loan
- vehicle_loan
- buy_now_pay_later
- family_loan
- one_time
- other

Keep the enum extensible without accepting arbitrary unsafe values.

Do not build specialized amortization behavior for every debt type unless the user provides the necessary terms.

For Phase 4, support:

- Fixed installment plans
- One-time debts
- Manually entered schedules
- Basic interest-bearing debts when exact inputs are available

Do not claim to calculate an authoritative lender payoff amount.

Clearly label calculated balances as based on data entered into Iponly.

==================================================
STEP 4 - DEBT SCHEMA
==================================================

Create a debts table.

Suggested table name:

debts

Suggested fields:

- id
- userId
- name
- creditor
- debtType
- currencyCode
- originalPrincipalMinor
- openingBalanceMinor
- currentBalanceMinor, if safely maintained
- annualInterestRateBasisPoints
- regularInstallmentMinor
- expectedInstallmentCount
- firstDueDate
- maturityDate
- recurrence
- recurrenceInterval
- dueDay
- gracePeriodDays
- paymentMethod
- referenceNumber
- notes
- status
- includeInTotal
- createdAt
- updatedAt
- completedAt
- archivedAt

Supported statuses:

- draft
- active
- paid
- paused
- defaulted
- archived

Supported recurrence values:

- one_time
- weekly
- biweekly
- monthly
- custom

Requirements:

- Every debt belongs to one authenticated user.
- Debt name is required.
- Debt type is required.
- Currency is required.
- PHP is the default currency.
- Original principal must use integer minor units.
- Opening balance must use integer minor units.
- Regular installment must use integer minor units.
- Interest rate must not use floating-point money.
- Interest percentage may be stored using basis points or another precise decimal-compatible representation.
- Archived debts remain in the database.
- Paid debts retain their complete history.
- A debt may be excluded from aggregated debt totals.
- Add indexes for userId, status, due date, type, and commonly used filters.

Do not store financial values as JavaScript floating-point numbers.

==================================================
STEP 5 - INTEREST RATE REPRESENTATION
==================================================

If supporting annual interest rates, store rates precisely.

Preferred representation:

Basis points

Examples:

1% = 100 basis points
5.5% = 550 basis points
12% = 1200 basis points

Create reusable conversion utilities such as:

- percentageToBasisPoints()
- basisPointsToPercentage()
- calculateSimpleInterest()
- calculatePeriodicInterest()

Do not use interest calculations unless the user has supplied enough information.

Do not guess whether interest is:

- Simple
- Compound
- Declining balance
- Add-on
- Flat rate
- Annual percentage rate
- Effective annual rate

Include an interest-calculation method field if the implementation supports more than one method.

Suggested values:

- none
- manual
- simple
- fixed_schedule

For the initial Phase 4 implementation, prefer:

- No automatic interest
- Manual interest allocation
- Fixed schedule amounts

Only implement automated interest calculations when the debt has explicit, validated calculation terms.

==================================================
STEP 6 - INSTALLMENT SCHEMA
==================================================

Create a debt installments table.

Suggested table name:

debt_installments

Suggested fields:

- id
- userId
- debtId
- installmentNumber
- dueDate
- scheduledAmountMinor
- principalDueMinor
- interestDueMinor
- feesDueMinor
- amountPaidMinor
- remainingAmountMinor, if safely maintained
- status
- paidAt
- notes
- createdAt
- updatedAt
- rescheduledFromDate
- rescheduleReason

Supported statuses:

- scheduled
- partially_paid
- paid
- overdue
- waived
- cancelled

Requirements:

- Every installment belongs to a debt.
- Every installment has the same user owner as its debt.
- Due date is required.
- Scheduled amount must be greater than zero unless the installment is explicitly waived.
- Installment numbers must be unique within a debt where applicable.
- Payment status must be derived from actual payment allocations.
- Do not mark an installment paid only because its due date has passed.
- Overdue status means the installment is unpaid or partially paid after its due date and any supported grace period.
- Add indexes for userId, debtId, dueDate, and status.
- Add a uniqueness rule for debtId and installmentNumber where appropriate.

Do not silently rewrite paid installments when a schedule is regenerated.

==================================================
STEP 7 - DEBT PAYMENT SCHEMA
==================================================

Create a debt payments table.

Suggested table name:

debt_payments

Suggested fields:

- id
- userId
- debtId
- sourceAccountId
- amountMinor
- currencyCode
- paymentDate
- paymentType
- referenceNumber
- description
- notes
- status
- reversalOfPaymentId
- reversedByPaymentId
- linkedAccountTransactionId
- idempotencyKey
- createdBy
- createdAt
- updatedAt

Supported payment types:

- regular
- partial
- extra
- payoff
- adjustment
- fee_payment
- reversal

Supported statuses:

- posted
- reversed

Supported createdBy values:

- user
- system

Reserve support for:

- assistant

Do not implement AI-created payments in Phase 4.

Requirements:

- Every payment belongs to an authenticated user.
- Every payment belongs to a debt owned by that user.
- Amount must be a positive integer in minor units.
- Payment currency must match the debt currency.
- If a source Savings account is selected, its currency must match.
- Posted payments must be immutable except through reversal.
- Idempotency keys must prevent duplicate payment processing.
- Add indexes for userId, debtId, paymentDate, status, idempotencyKey, and sourceAccountId.

==================================================
STEP 8 - PAYMENT ALLOCATION SCHEMA
==================================================

Create a debt payment allocations table.

Suggested table name:

debt_payment_allocations

Suggested fields:

- id
- userId
- paymentId
- installmentId
- principalAmountMinor
- interestAmountMinor
- feesAmountMinor
- adjustmentAmountMinor
- createdAt

Requirements:

- Every allocation belongs to the same user as the payment.
- Every installment belongs to the payment's debt.
- Allocated amounts must be non-negative integers.
- Total allocation must equal the applicable payment amount.
- A payment may be allocated across multiple installments.
- Partial allocations must be supported.
- Overpayments must follow an explicit rule.
- Allocations must be created in the same database transaction as the payment.
- Reversal must undo the effect of all corresponding allocations.

Do not store only a generic paid amount if principal, interest, and fee allocation information is known.

If allocation information is not known, clearly classify the payment as unapportioned or apply a documented default rule.

==================================================
STEP 9 - DEBT ADJUSTMENT SCHEMA
==================================================

If required by the existing architecture, create a debt adjustments table.

Suggested table name:

debt_adjustments

Suggested fields:

- id
- userId
- debtId
- installmentId
- adjustmentType
- amountMinor
- effectiveDate
- reason
- notes
- status
- reversalOfAdjustmentId
- createdAt
- updatedAt

Supported adjustment types:

- balance_increase
- balance_decrease
- fee_added
- interest_added
- fee_waived
- interest_waived
- principal_correction

Adjustments must:

- Require a reason.
- Preserve history.
- Never silently overwrite the original principal.
- Use integer minor units.
- Be reversible or correctable through an auditable workflow.

Do not use adjustments as a substitute for normal payments.

==================================================
STEP 10 - DATABASE MIGRATION
==================================================

Create a proper Drizzle migration for:

- debts
- debt_installments
- debt_payments
- debt_payment_allocations
- debt_adjustments, if used
- Required enums
- Foreign keys
- Unique constraints
- Check constraints where supported
- Ownership indexes
- Due-date indexes
- Payment-date indexes
- Idempotency constraints
- Reversal relationships
- Optional Savings account relationships

Review the generated SQL before applying it.

Verify that:

- Money fields use integer-compatible database types.
- Required columns are non-null.
- User ownership relationships are present.
- Debt and installment relationships are correct.
- Payment and allocation relationships are correct.
- Source account relationships do not allow cross-user association.
- Production migrations are tracked in version control.

Do not use schema push as the only production migration strategy.

Apply the migration to the configured development database.

If database credentials are unavailable, generate and review the migration, then report that applying it could not be validated.

==================================================
STEP 11 - CENTRALIZE DEBT CALCULATIONS
==================================================

Create pure reusable domain functions.

Suggested functions:

- calculateDebtBalance()
- calculateInstallmentRemaining()
- calculateDebtProgress()
- calculateTotalDebt()
- calculateAmountPaid()
- calculateAmountDueThisMonth()
- calculateOverdueAmount()
- calculateNextInstallment()
- calculateRemainingInstallmentCount()
- calculatePaymentAllocation()
- calculateDebtPayoffProgress()
- determineInstallmentStatus()
- determineDebtStatus()
- groupDebtPaymentsByPeriod()

Do not duplicate these calculations across:

- React components
- Server Actions
- Services
- Repositories
- Charts
- Dashboard cards

The debt balance should account for:

- Opening balance
- Principal payments
- Principal increases
- Principal reductions
- Fees where included
- Interest where included
- Reversals
- Adjustments

Do not calculate outstanding debt only as:

regular installment × remaining installment count

That may not match the real balance because of:

- Partial payments
- Extra payments
- Fees
- Interest
- Waivers
- Adjustments
- Rescheduled installments
- Rounding
- Reversals

==================================================
STEP 12 - BALANCE STRATEGY
==================================================

Choose and document one authoritative balance strategy.

Preferred approaches:

Option A:
Calculate the balance from debt opening data, payments, allocations, and adjustments.

Option B:
Maintain currentBalanceMinor as a cached balance updated atomically with all debt mutations.

If using a cached balance:

- Update it within the same PostgreSQL transaction as the payment or adjustment.
- Never update it independently.
- Add a reconciliation utility.
- Add tests proving cached and calculated totals remain equal.
- Run reconciliation in development and test workflows.

Financial records remain the source of truth.

Do not let UI-computed balances become authoritative.

==================================================
STEP 13 - INSTALLMENT SCHEDULE GENERATOR
==================================================

Create a tested installment schedule generator.

It must support:

- One-time
- Weekly
- Biweekly
- Monthly
- Custom/manual schedules

Inputs may include:

- First due date
- Recurrence
- Number of installments
- Regular installment amount
- Final installment amount
- Total scheduled amount
- Due day
- Currency

The generator must handle:

- Months with 28 days
- Months with 29 days
- Months with 30 days
- Months with 31 days
- Leap years
- End-of-month schedules
- First due date on the 29th, 30th, or 31st
- Biweekly intervals
- Weekly intervals
- Final installment rounding differences
- User timezone

For monthly recurrence:

- Preserve end-of-month intent where appropriate.
- Do not add a fixed number of milliseconds.
- Use date-aware month arithmetic.
- Document the behavior for dates that do not exist in the next month.

Example:

If the first payment is due January 31, later monthly due dates should follow an explicit end-of-month policy rather than drifting unpredictably.

Do not generate duplicated dates.

Do not generate a schedule beyond the expected installment count.

==================================================
STEP 14 - SCHEDULE GENERATION SAFETY
==================================================

When generating a schedule:

1. Resolve the authenticated user.
2. Validate debt ownership.
3. Validate schedule inputs.
4. Preview the schedule before saving.
5. Show total scheduled amount.
6. Show the difference between scheduled total and current debt balance.
7. Require confirmation when a meaningful difference exists.
8. Create the schedule atomically.
9. Prevent duplicate schedule generation.
10. Revalidate affected routes.

Do not silently regenerate a schedule when installments or payments already exist.

If a schedule already exists:

- Allow adding future installments manually.
- Allow editing eligible unpaid installments.
- Require a controlled rescheduling workflow.
- Protect paid and partially paid records from destructive replacement.

==================================================
STEP 15 - VALIDATION SCHEMAS
==================================================

Create Zod schemas for:

- Create debt
- Update debt
- Generate installment schedule
- Create manual installment
- Update unpaid installment
- Reschedule installment
- Record full payment
- Record partial payment
- Record extra payment
- Record adjustment
- Reverse payment
- Archive debt
- Restore debt
- Mark debt paid
- Debt filters
- Payment-history filters

Validate on the server even when client validation exists.

Debt validation should cover:

- Required debt name
- Valid debt type
- Valid currency
- Positive original amount
- Non-negative opening balance
- Valid installment amount
- Valid installment count
- Valid first due date
- Valid recurrence
- Valid interest representation
- Safe notes length
- Safe creditor and reference lengths

Payment validation should cover:

- Positive amount
- Maximum supported amount
- Valid payment date
- Debt ownership
- Currency match
- Source account ownership
- Source account currency
- Sufficient source-account balance
- Idempotency
- Allocation equality

Never allow:

- NaN
- Infinity
- Negative payment amounts
- Zero-value payments
- Invalid dates
- Invalid currency
- Unbounded text
- Browser-supplied authoritative userId
- Payment allocation exceeding the payment
- Payment against another user's debt
- Source account owned by another user

==================================================
STEP 16 - REPOSITORY LAYER
==================================================

Create repositories following the existing architecture.

Suggested files:

src/repositories/debt-repository.ts
src/repositories/debt-installment-repository.ts
src/repositories/debt-payment-repository.ts
src/repositories/debt-adjustment-repository.ts

Suggested debt operations:

- createForUser()
- findActiveForUser()
- findArchivedForUser()
- findByIdForUser()
- updateForUser()
- markPaidForUser()
- pauseForUser()
- archiveForUser()
- restoreForUser()

Suggested installment operations:

- createManyForDebtAndUser()
- createForDebtAndUser()
- findForDebtAndUser()
- findUpcomingForUser()
- findOverdueForUser()
- findByIdForUser()
- updateUnpaidForUser()
- rescheduleForUser()

Suggested payment operations:

- createForDebtAndUser()
- findForDebtAndUser()
- findByIdForUser()
- findRecentForUser()
- findByIdempotencyKey()
- markReversedForUser()

Suggested adjustment operations:

- createForDebtAndUser()
- findForDebtAndUser()
- reverseForUser()

Every method handling owned data must require userId.

Correct:

findByIdForUser(debtId, userId)

Incorrect:

findById(debtId)

when used for authenticated financial operations.

Do not return another user's record when its identifier is known.

==================================================
STEP 17 - SERVICE LAYER
==================================================

Create a Debt service layer.

Suggested file:

src/services/debt-service.ts

Responsibilities:

- Create debts
- Normalize debt data
- Generate installment schedules
- Create manual installments
- Record payments
- Allocate payments
- Link payments to Savings transactions
- Record adjustments
- Reverse payments
- Calculate balances
- Determine statuses
- Reschedule installments
- Archive and restore debts
- Mark debts paid
- Return dashboard summaries
- Return analytics summaries
- Reconcile cached balances if used

The service layer owns business rules.

The repository layer owns database access.

React components must not contain authoritative debt calculations.

==================================================
STEP 18 - CREATE DEBT WORKFLOW
==================================================

Create an accessible guided workflow for entering a debt.

Recommended steps:

Step 1:
Basic information

- Debt name
- Creditor
- Debt type
- Currency
- Reference number
- Notes

Step 2:
Financial details

- Original amount
- Current/opening balance
- Regular installment amount
- Interest rate, optional
- Fees, optional

Step 3:
Schedule

- Recurrence
- First due date
- Number of installments
- Due day
- Grace period
- Manual schedule option

Step 4:
Review

- Debt summary
- Generated schedule preview
- Total scheduled amount
- Difference from current balance
- First and final due dates

Step 5:
Confirm

When creating the debt:

1. Resolve the authenticated user.
2. Validate all input.
3. Create the debt.
4. Generate and create installments where requested.
5. Commit the debt and schedule atomically.
6. Prevent duplicate submission.
7. Return the new debt.
8. Revalidate Debt and Dashboard routes.

Do not create incomplete debt records without an explicit draft status.

==================================================
STEP 19 - GUIDED NOTEPAD MIGRATION
==================================================

Provide a guided manual migration form for debts currently stored in notes.

Support fields such as:

- Debt name
- Creditor
- Original amount
- Current remaining balance
- Installment amount
- Total installment count
- Paid installment count
- Remaining installment count
- Next due date
- Recurrence
- Notes

Allow users to choose one of these migration approaches:

A. Start tracking from the current balance

- Create the debt using the current remaining balance.
- Generate only future unpaid installments.
- Preserve previous-payment information as a summary note if exact history is unavailable.

B. Reconstruct the complete schedule

- Generate historical and future installments.
- Mark known past installments as paid only when the user confirms them.
- Do not fabricate payment dates or payment references.

If the imported note lacks exact payment history:

- Do not invent historical transactions.
- Store the known summary.
- Clearly label earlier history as not recorded in Iponly.
- Start auditable payment tracking from the migration date.

Do not use AI note parsing in Phase 4.

==================================================
STEP 20 - RECORD PAYMENT WORKFLOW
==================================================

Support:

- Full installment payment
- Partial installment payment
- Multiple installment payment
- Extra principal payment
- Payoff payment
- Fee payment
- Unallocated/manual payment where necessary

When recording a payment:

1. Resolve the authenticated user.
2. Validate the request.
3. Load the debt using debtId and userId.
4. Confirm the debt is active or otherwise eligible.
5. Load selected installments with ownership validation.
6. Confirm currency.
7. Validate allocation.
8. Optionally load the Savings source account.
9. Validate source-account ownership and currency.
10. Validate available account balance.
11. Create the debt payment.
12. Create payment allocations.
13. Update installment statuses.
14. Update debt balance.
15. Optionally create a linked Savings withdrawal.
16. Commit all operations in one PostgreSQL transaction.
17. Return updated debt and account balances.
18. Revalidate affected routes.

Do not mark a payment complete if the Savings withdrawal fails.

Do not create the Savings withdrawal if the debt payment fails.

Linked financial effects must be atomic.

==================================================
STEP 21 - SAVINGS ACCOUNT INTEGRATION
==================================================

A debt payment may optionally use one existing Savings account as its source.

Example:

Debt:
Laptop Installment

Payment:
₱5,000

Source account:
BDO Savings

When linked:

- Create one debt payment.
- Create one Savings withdrawal transaction.
- Link both records.
- Use the same authenticated user.
- Use the same currency.
- Commit both operations atomically.
- Prevent duplicate records using one idempotency workflow.

Do not count the linked withdrawal twice in future Budget analytics.

Preserve enough metadata so Phase 5 can identify that the Savings withdrawal represents a debt payment.

If the user does not select an account:

- Record the debt payment without a Savings transaction.
- Clearly indicate that no source account was tracked.

Never require a Savings account to record a debt payment.

==================================================
STEP 22 - PAYMENT ALLOCATION RULES
==================================================

Define and document a clear default allocation rule.

Recommended default when allocations are known:

1. Fees due
2. Interest due
3. Principal due
4. Extra principal

Allow the user to review the allocation before saving.

Do not apply this rule when the debt explicitly provides a different known allocation.

For simple fixed installments without detailed breakdown:

- Allow the installment scheduled amount to be treated as a general payment.
- Apply the amount toward the outstanding debt according to the selected debt model.
- Clearly label the breakdown as unavailable rather than inventing principal and interest amounts.

The sum of allocation values must equal the payment amount unless an explicitly supported unapplied-payment balance exists.

Avoid introducing unapplied balances unless required by the design.

==================================================
STEP 23 - PARTIAL PAYMENT WORKFLOW
==================================================

When a payment is smaller than an installment's remaining amount:

- Record the payment.
- Allocate it to the installment.
- Set the installment to partially_paid.
- Update amount paid.
- Preserve the remaining amount.
- Keep the original due date unless explicitly rescheduled.
- Mark it overdue after the due date and grace period if an amount remains.

Do not create a new installment automatically unless the user explicitly chooses to reschedule the remaining amount.

==================================================
STEP 24 - EXTRA PAYMENT WORKFLOW
==================================================

Support extra payments.

Allow the user to specify:

- Apply to principal
- Apply to future installments
- Record as manual allocation

For principal reduction:

- Reduce the debt balance.
- Do not automatically rewrite future installments unless the user explicitly requests a schedule recalculation.
- Show the effect on remaining balance.
- Preserve the original schedule for auditability.

If schedule recalculation is later supported:

- Preview changes.
- Protect paid installments.
- Create a schedule-change audit record.
- Never silently replace history.

==================================================
STEP 25 - PAYMENT REVERSAL
==================================================

Do not hard-delete posted debt payments.

Implement reversal.

When reversing a payment:

1. Resolve the authenticated user.
2. Load the payment using paymentId and userId.
3. Confirm debt ownership.
4. Confirm the payment is posted.
5. Confirm it has not already been reversed.
6. Require a reversal reason.
7. Reverse all payment allocations.
8. Recalculate installment statuses.
9. Restore the affected debt balance.
10. If linked to a Savings withdrawal, reverse that transaction too.
11. Commit everything atomically.
12. Mark the original payment as reversed.
13. Link original and reversal records.
14. Return updated debt, installment, and account balances.
15. Revalidate affected routes.

For a linked Savings payment:

- Never reverse only the debt side.
- Never reverse only the Savings side.
- Use one transaction.

Prevent duplicate reversals.

==================================================
STEP 26 - INSTALLMENT RESCHEDULING
==================================================

Allow eligible unpaid or partially paid installments to be rescheduled.

Require:

- New due date
- Reason
- Optional notes

Store:

- Original due date
- New due date
- Reschedule reason
- Updated timestamp

Do not allow rescheduling of:

- Fully paid installments
- Waived installments without an explicit restore workflow
- Another user's installments
- Archived debts unless restored

Do not overwrite the original due date without retaining the change history.

If a full schedule change is required, provide a controlled future-installment update workflow.

Protect all paid installments from modification.

==================================================
STEP 27 - OVERDUE STATUS
==================================================

Determine overdue status based on:

- Due date
- Grace period
- Remaining unpaid amount
- User timezone
- Installment status

An installment is overdue only when:

- The due date plus grace period has passed.
- A remaining amount is greater than zero.
- It has not been waived or cancelled.

Do not permanently write overdue status unless the system has a reliable refresh strategy.

Prefer deriving overdue state from current data where practical.

If persisted:

- Provide a reliable scheduled or request-time recalculation strategy.
- Do not depend on a background job that does not exist.

Show overdue amounts and dates clearly without using alarmist language.

==================================================
STEP 28 - DEBT DETAILS PAGE
==================================================

Create a debt details route.

Suggested route:

/debt/[debtId]

Load the debt using:

- debtId
- authenticated userId

If the record does not belong to the user, return a safe not-found response.

Do not reveal whether another user's debt exists.

Show:

- Debt name
- Creditor
- Debt type
- Current balance
- Original amount
- Amount paid
- Progress percentage
- Regular installment
- Interest information, if available
- Next due installment
- Overdue amount
- Installment schedule
- Payment history
- Adjustments
- Notes
- Status

Actions:

- Record Payment
- Add Installment
- Reschedule
- Add Adjustment
- Reverse Payment
- Edit Debt
- Mark Paid
- Pause
- Archive

Only show actions valid for the current debt status.

==================================================
STEP 29 - DEBT PAGE
==================================================

Replace the Phase 1 Debt page fixture data with authenticated server data.

Show summary cards for:

- Total Outstanding Debt
- Due This Month
- Overdue Amount
- Next Payment
- Active Debts
- Paid This Month

Show sections for:

- Upcoming installments
- Overdue installments
- Active debts
- Recently paid
- Debt progress
- Recent payments

Use Server Components for initial data where appropriate.

Use Client Components only for interactions requiring client behavior.

Do not display Phase 1 synthetic debt data as real authenticated data.

==================================================
STEP 30 - DEBT CARDS
==================================================

Each debt card should show:

- Debt name
- Creditor
- Debt type
- Current balance
- Original amount
- Progress
- Regular installment
- Next due date
- Next amount due
- Remaining installment count
- Status
- Currency

Actions may include:

- View Details
- Record Payment
- Edit
- Archive

Keep cards readable at 360px width.

Prevent large amounts from overflowing.

Do not rely only on color for status.

==================================================
STEP 31 - INSTALLMENT SCHEDULE UI
==================================================

Build a responsive installment schedule component.

Each installment should show:

- Installment number
- Due date
- Scheduled amount
- Amount paid
- Remaining amount
- Status
- Payment date, when applicable
- Rescheduled indicator
- Overdue indicator

Desktop may use a table if accessible.

Mobile must use a responsive list or card view.

Filters:

- All
- Upcoming
- Paid
- Partially Paid
- Overdue
- Rescheduled

Do not load an unbounded schedule when pagination is appropriate.

==================================================
STEP 32 - PAYMENT FORM
==================================================

Create an accessible payment form.

Fields may include:

- Debt
- Installment selection
- Payment amount
- Payment type
- Payment date
- Source Savings account, optional
- Principal allocation
- Interest allocation
- Fee allocation
- Reference number
- Description
- Notes

Show before confirmation:

- Debt name
- Current balance
- Selected installment
- Amount due
- Payment amount
- Source account
- Source account balance
- Allocation
- Expected remaining debt balance
- Expected source account balance

Example:

Confirm Debt Payment

Debt:
Laptop Installment

Installment:
5 of 12

Payment:
₱5,000.00

Source:
BDO Savings

Debt balance after payment:
₱35,000.00

BDO Savings after payment:
₱20,000.00

The values must come from real validated data.

Do not use hard-coded confirmation amounts.

==================================================
STEP 33 - MARK DEBT AS PAID
==================================================

Allow a debt to be marked paid only when:

- Calculated outstanding balance is zero, or
- The user confirms an explicit balance adjustment or waiver.

Do not silently discard a remaining balance.

If the balance is not zero, present options such as:

- Record final payment
- Add balance adjustment
- Waive remaining amount with a reason
- Cancel

When completed:

- Set status to paid.
- Set completedAt.
- Retain all installments and payment history.
- Prevent ordinary new payments unless the debt is reopened through a controlled workflow.

==================================================
STEP 34 - ARCHIVE AND RESTORE
==================================================

Allow debts to be archived instead of deleted.

Before archiving, show:

- Debt name
- Current balance
- Upcoming installments
- Overdue installments
- History-retention notice

Recommended rules:

- Paid debts may be archived.
- Active debts with a balance require explicit warning.
- Archived debts retain all history.
- Archived debts are hidden from active views by default.
- Archived debts cannot receive ordinary payments.
- Archived debts may be viewed separately.
- Archived debts may be restored.

Do not hard-delete financial debt records through the normal UI.

==================================================
STEP 35 - DEBT ANALYTICS
==================================================

Create analytics using real authenticated debt data.

Include:

- Total outstanding debt
- Debt balance by creditor
- Debt balance by type
- Principal paid over time
- Interest paid over time, when known
- Fees paid over time, when known
- Amount due by month
- Payment history
- Debt repayment progress
- Upcoming installments
- Overdue amounts

Important rules:

- Do not silently combine different currencies.
- Group totals by currency.
- Do not infer principal-interest breakdown when unavailable.
- Reversed payments must be excluded or represented correctly.
- Internal Savings linkage must not duplicate payment totals.
- Archived debt inclusion must follow explicit analytics rules.

Support periods such as:

- Current month
- Next 30 days
- Last 3 months
- Last 6 months
- Current year
- Custom range

If data is insufficient, show an honest empty state.

==================================================
STEP 36 - DASHBOARD INTEGRATION
==================================================

Replace the Debt portion of the dashboard fixture data with real authenticated data.

Show:

- Total outstanding debt
- Due this month
- Overdue amount
- Next installment
- Next due date
- Recent payments
- Debt repayment progress

If the user has no debts, show:

"No debts added yet."

Provide an action:

"Add your first debt"

Do not mix real debt totals with fictional Phase 1 amounts.

Modules that still use fixture data must be clearly labeled as previews or replaced with empty states.

==================================================
STEP 37 - EMPTY, LOADING, AND ERROR STATES
==================================================

Create polished states.

No debts:

"No debts added yet.
Add an installment plan, loan, or balance you want to track."

No upcoming installments:

"No upcoming payments.
You have no scheduled installments in this period."

No payment history:

"No payments recorded yet.
Payments you add will appear here."

No overdue installments:

"No overdue installments.
You're currently up to date."

Loading:

- Use existing skeleton components.
- Avoid layout shifts.
- Do not display fixture balances while real data loads.

Errors:

- Provide safe retry behavior.
- Preserve form values where practical.
- Do not expose raw SQL errors.
- Do not expose authentication or database details.

==================================================
STEP 38 - SECURITY AND AUTHORIZATION
==================================================

Apply server-side authorization to every read and write.

Never trust:

- Browser-supplied userId
- URL debtId alone
- URL installmentId alone
- URL paymentId alone
- Hidden form ownership values
- Client-side state

For debt operations:

- Resolve userId from the authenticated session.
- Query using debtId and userId.

For installment operations:

- Resolve userId from the session.
- Verify installment and debt ownership.

For payment operations:

- Resolve userId from the session.
- Verify debt ownership.
- Verify installment ownership.
- Verify source-account ownership.

For linked Savings operations:

- Verify the account belongs to the same authenticated user.
- Verify the currency matches.
- Never transfer payment money to another user.

Do not reveal whether another user's debt, payment, installment, adjustment, or account exists.

==================================================
STEP 39 - CONCURRENCY AND DUPLICATE PROTECTION
==================================================

Financial actions must be safe against duplicate and concurrent requests.

Use:

- Idempotency keys
- Database uniqueness
- Database transactions
- Disabled pending controls
- Server-side duplicate detection
- Appropriate atomic checks or locking

Protect against:

- Double-clicking Record Payment
- Browser retries
- Network retries
- Repeated Server Action execution
- Simultaneous payments
- Simultaneous payment reversal
- Payment and archive operations occurring together
- Two linked withdrawals spending the same Savings balance

Do not depend only on a source-account balance checked in the browser.

Document the concurrency strategy.

==================================================
STEP 40 - AUDITABILITY
==================================================

Ensure debt history records:

- Debt creation time
- Schedule creation
- Original due dates
- Rescheduled dates
- Payment date
- Payment creation time
- Payment allocations
- Source Savings transaction
- Adjustments
- Reversal relationships
- Status changes
- Archive and restore events where supported
- Created-by type
- Reasons for adjustments, waivers, and reversals

Do not store secrets, passwords, session tokens, or sensitive authentication data in financial records.

If an audit-log framework exists, integrate significant Debt actions.

Do not build a broad unrelated audit platform solely for Phase 4.

==================================================
STEP 41 - ACCESSIBILITY
==================================================

The Debt Tracker must support:

- Semantic headings
- Accessible forms
- Visible field labels
- Keyboard navigation
- Visible focus states
- Accessible dialogs and drawers
- Accessible validation messages
- Accessible payment confirmation
- Screen-reader-friendly charts
- Accessible installment statuses
- Touch-friendly controls
- aria-live save feedback
- Confirmation focus management
- Reduced-motion preferences

Do not use color as the only indicator for:

- Paid
- Partially paid
- Overdue
- Active
- Paused
- Reversed
- Success
- Error

==================================================
STEP 42 - RESPONSIVE DESIGN
==================================================

Verify the Debt Tracker at:

- 360px
- 390px
- 430px
- 768px
- 1024px
- 1440px

At mobile widths:

- No horizontal scrolling
- Debt cards remain readable
- Monetary values do not overflow
- Schedule becomes a responsive card/list view
- Payment forms fit the viewport
- Drawers and dialogs remain usable
- Charts resize correctly
- Bottom navigation does not cover important actions
- Confirmation summaries remain readable

Do not use a desktop table as the only way to access installment information.

==================================================
STEP 43 - UNIT TESTS
==================================================

Add unit tests for:

- Debt balance calculation
- Total debt calculation
- Amount paid calculation
- Installment remaining amount
- Partial payment
- Full payment
- Extra payment
- Payment allocation
- Principal allocation
- Interest allocation
- Fee allocation
- Reversal
- Debt progress
- Zero-balance debt
- Overpaid debt protection
- Due-this-month calculation
- Overdue calculation
- Grace period
- Remaining installment count
- Multiple currencies
- Archived-debt inclusion
- Basis-point conversion
- Schedule generation
- Weekly schedule
- Biweekly schedule
- Monthly schedule
- One-time schedule
- End-of-month recurrence
- February dates
- Leap-year dates
- Final-installment rounding

Use exact integer values.

Example:

Original debt:
₱60,000.00 = 6000000 minor units

Payment:
₱5,000.00 = 500000 minor units

Expected remaining balance:
₱55,000.00 = 5500000 minor units

==================================================
STEP 44 - INTEGRATION TESTS
==================================================

Add integration tests for:

- Debt creation
- Debt creation with generated schedule
- One-time debt
- Weekly schedule
- Biweekly schedule
- Monthly schedule
- Manual schedule
- Duplicate schedule prevention
- Full payment
- Partial payment
- Extra payment
- Multi-installment payment
- Payment with source Savings account
- Payment without source account
- Insufficient Savings balance
- Currency mismatch
- Linked account withdrawal
- Atomic rollback when Savings withdrawal fails
- Payment reversal
- Linked Savings reversal
- Duplicate reversal prevention
- Adjustment
- Rescheduling
- Mark debt paid
- Prevent mark-paid with remaining balance
- Archive
- Restore
- Duplicate payment protection
- Concurrent payment protection

Use an isolated test database.

Never run automated tests against production.

==================================================
STEP 45 - AUTHORIZATION TESTS
==================================================

Create at least two authenticated test users.

Verify:

- User A can create a debt.
- User A can view User A's debt.
- User B cannot view User A's debt.
- User B cannot update User A's debt.
- User B cannot view User A's installments.
- User B cannot modify User A's installments.
- User B cannot record a payment against User A's debt.
- User B cannot reverse User A's payment.
- User B cannot reschedule User A's installment.
- User B cannot archive User A's debt.
- User B cannot link User A's debt to User B's account.
- User B cannot link User B's debt to User A's account.
- Forged userId input does not bypass authorization.
- Changing debtId does not bypass authorization.
- Changing installmentId does not bypass authorization.
- Changing paymentId does not bypass authorization.
- Unauthorized access returns a safe result.

These tests are mandatory.

==================================================
STEP 46 - PLAYWRIGHT TESTS
==================================================

Add end-to-end tests for critical Debt workflows:

1. Log in.
2. Open Debt Tracker.
3. Verify the empty state.
4. Create a laptop installment debt.
5. Preview the generated monthly schedule.
6. Confirm the debt.
7. Verify the debt summary.
8. Verify the installment schedule.
9. Record a full installment payment without a Savings account.
10. Verify the installment is paid.
11. Verify the debt balance changes.
12. Record a partial installment payment.
13. Verify partially paid status.
14. Record a debt payment using a Savings account.
15. Verify the Savings balance decreases once.
16. Verify the debt balance decreases once.
17. Reverse the linked payment.
18. Verify both debt and Savings balances are restored.
19. Reschedule an unpaid installment.
20. Verify the original and new due dates.
21. Add an adjustment with a reason.
22. Pay the remaining balance.
23. Mark the debt paid.
24. Archive the paid debt.
25. Restore the debt.
26. Log out.
27. Verify protected Debt routes require authentication.

Avoid brittle selectors.

Prefer roles, labels, and accessible names.

Use stable test IDs only when necessary.

==================================================
STEP 47 - PERFORMANCE
==================================================

Avoid:

- Loading every payment and installment in one request
- Calculating large schedules repeatedly in Client Components
- Duplicate dashboard queries
- Unbounded history lists
- N+1 database queries
- Unnecessary client-side fetching
- Marking entire page trees with "use client"

Use:

- Server Components for initial reads
- Pagination or cursor loading for payment history
- Indexed queries
- Aggregated server-side summaries
- Shared dashboard query functions
- Route revalidation after mutations
- Bounded chart datasets

Financial correctness is more important than aggressive caching.

==================================================
STEP 48 - DOCUMENTATION
==================================================

Update project documentation with:

- Debt architecture
- Database tables
- Debt statuses
- Installment statuses
- Payment types
- Payment allocation rules
- Schedule-generation behavior
- End-of-month rules
- Partial-payment behavior
- Extra-payment behavior
- Overdue rules
- Rescheduling behavior
- Reversal behavior
- Savings integration
- Balance strategy
- Idempotency strategy
- Concurrency strategy
- Migration commands
- Testing commands
- Known limitations
- Features deferred to Phase 5

Clearly state:

- Iponly does not connect to creditors or lenders in Phase 4.
- Users enter debt data manually.
- Iponly does not process payments.
- Recording a payment does not send money to a creditor.
- Calculated balances depend on user-entered information.
- Iponly does not provide financial advice.
- Automatic interest calculations are limited to explicitly supported debt terms.
- Budget integration is deferred to Phase 5.
- Iponly AI is deferred to a later phase.

==================================================
STEP 49 - VALIDATION
==================================================

After implementation, inspect package.json and run all relevant existing commands for:

- Type checking
- Linting
- Unit tests
- Integration tests
- Authorization tests
- Playwright tests
- Production build
- Migration generation
- Migration application
- Balance reconciliation, if applicable

Do not invent script names.

Use scripts present in package.json.

Fix errors introduced by Phase 4.

Do not hide errors using:

- any
- @ts-ignore
- @ts-nocheck
- Disabled lint rules
- Skipped authorization tests
- Commented-out tests
- Fake success results

If database credentials or another external dependency is unavailable, report exactly which validation could not be completed.

==================================================
STEP 50 - PHASE 4 COMPLETION REPORT
==================================================

After implementation, provide a concise report containing:

1. Existing architecture inspected
2. Debt features completed
3. Debt model implemented
4. Database tables and enums created
5. Migration files created
6. Migration status
7. Schedule-generation strategy
8. End-of-month recurrence strategy
9. Balance strategy
10. Payment-allocation strategy
11. Partial-payment strategy
12. Extra-payment strategy
13. Reversal strategy
14. Savings integration strategy
15. Idempotency strategy
16. Concurrency strategy
17. Repositories created
18. Services created
19. Server Actions or Route Handlers created
20. Pages and components created
21. Existing files modified
22. Dependencies installed
23. Security controls implemented
24. Tests created
25. Commands executed
26. Type-check status
27. Lint status
28. Test status
29. Build status
30. Known limitations
31. Items deferred to Phase 5

Be transparent about anything that could not be validated.

==================================================
PHASE 4 DEFINITION OF DONE
==================================================

Phase 4 is complete when:

- Authenticated users can create debts.
- Users can create one-time debts.
- Users can generate weekly installment schedules.
- Users can generate biweekly installment schedules.
- Users can generate monthly installment schedules.
- Users can create manual schedules.
- Schedule generation correctly handles month lengths and leap years.
- Users can view upcoming installments.
- Users can view overdue installments.
- Users can record full payments.
- Users can record partial payments.
- Users can record extra payments.
- Users can allocate payments when breakdown data is known.
- Users can link a payment to a Savings account.
- Linked debt and Savings records are committed atomically.
- Users can record payments without selecting a Savings account.
- Users can reverse incorrect payments.
- Linked debt and Savings reversals are atomic.
- Users can reschedule eligible installments.
- Users can record adjustments with reasons.
- Users can mark a zero-balance debt paid.
- Remaining balances cannot be silently discarded.
- Users can archive and restore debts.
- Debt analytics use real authenticated data.
- Dashboard debt summaries use real authenticated data.
- Phase 1 debt fixtures are no longer presented as real user data.
- Money is stored using integer minor units.
- Interest rates use a precise representation.
- Debt balances are not based only on installment count.
- Scheduled installments and actual payments remain separate.
- All operations resolve userId from the authenticated session.
- User A cannot access or modify User B's records.
- Duplicate payments are prevented.
- Concurrent payments cannot corrupt debt or Savings balances.
- No ordinary financial history is hard-deleted.
- Mobile layouts work without horizontal overflow.
- Accessibility requirements are met.
- Database migration succeeds.
- Type checking passes.
- Linting passes.
- Unit tests pass.
- Integration tests pass.
- Authorization tests pass.
- Relevant Playwright tests pass.
- Production build passes.
- Documentation is updated.

Do not proceed to Phase 5 automatically.

Stop after Phase 4 is implemented, tested, validated, documented, and summarized.
