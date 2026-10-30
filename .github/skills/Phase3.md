Implement Phase 3 of Iponly: Savings Tracker.

Iponly is a mobile-first personal finance Progressive Web App designed primarily for Filipino users.

Product name:
Iponly

Tagline:
"Ipon. Budget. Bayad. Gala."

Follow all architecture, financial correctness, security, accessibility, testing, and product rules defined in the project's agent instructions.

==================================================
PHASE 3 GOAL
==================================================

Build the production-ready Savings Tracker for Iponly.

Replace the Savings Tracker's Phase 1 fixture data with authenticated, user-owned records stored in PostgreSQL.

At the end of Phase 3, an authenticated user must be able to:

1. Create multiple savings and financial accounts.
2. View all active accounts.
3. View the current balance of each account.
4. Record deposits.
5. Record withdrawals.
6. Transfer money between owned accounts.
7. Record balance adjustments with a required reason.
8. Create and update savings goals.
9. View account transaction history.
10. Filter and search transactions.
11. View savings summaries and trends.
12. Reverse an incorrect transaction safely.
13. Archive and restore an account.
14. See Savings data on the main dashboard.
15. Use the Savings Tracker on mobile and desktop.

All financial records must belong to the authenticated user.

User A must never be able to view, modify, archive, restore, or reverse User B's records.

==================================================
PHASE 3 BOUNDARIES
==================================================

Implement only the Savings Tracker and directly related dashboard integration.

Do NOT implement yet:

- Debt and installment persistence
- Monthly budget persistence
- Expense tracking
- Travel-plan persistence
- Iponly AI
- AI financial commands
- Bank account synchronization
- Open banking integrations
- Automatic balance retrieval
- Receipt scanning
- Investment tracking
- Interest calculation
- Foreign-exchange conversion
- Shared accounts
- Household finance
- Push notifications
- Full offline transaction synchronization

Do not proceed to Phase 4 automatically.

==================================================
STEP 1 - INSPECT THE EXISTING PROJECT
==================================================

Before changing code:

1. Inspect the complete repository structure.
2. Review package.json and available scripts.
3. Review the Phase 1 Savings UI.
4. Review the dashboard summary cards.
5. Review the database configuration.
6. Review the Drizzle schema.
7. Review existing migrations.
8. Review the authentication implementation.
9. Review the authenticated-user helpers.
10. Review the user-preferences schema.
11. Review the Server Action conventions.
12. Review service and repository patterns.
13. Review Zod validation patterns.
14. Review shared money utilities.
15. Review existing domain types.
16. Review fixture data.
17. Review testing infrastructure.
18. Review existing loading, empty, and error states.
19. Review mobile and desktop navigation.
20. Review deployment and environment configuration.

Do not assume dependencies are missing.

Do not replace working authentication, database, or UI functionality.

Do not introduce a second ORM, form library, validation library, or state-management solution.

Before implementing, provide a concise plan containing:

- Existing relevant architecture
- Tables to add or modify
- Migrations required
- Files to create
- Files to modify
- Server Actions required
- Services and repositories required
- UI components required
- Tests required
- Important financial and security risks

After presenting the plan, proceed without waiting for confirmation.

==================================================
STEP 2 - DEFINE THE SAVINGS DOMAIN
==================================================

The Savings Tracker must manage three main concepts:

1. Financial accounts
2. Account transactions
3. Savings goals

A financial account is a user-managed location where money is stored.

Examples:

- BDO Savings
- BPI Savings
- Maya Savings
- GCash
- Emergency Fund
- Travel Fund
- Cash on Hand

Iponly does not connect directly to real banks in Phase 3.

All balances are based on transactions entered manually by the user.

Clearly communicate this in the UI where appropriate.

==================================================
STEP 3 - FINANCIAL ACCOUNT SCHEMA
==================================================

Create a financial account table.

Suggested table name:

financial_accounts

Suggested fields:

- id
- userId
- name
- institution
- accountType
- currencyCode
- openingBalanceMinor
- cachedBalanceMinor, if safely maintained
- color
- icon
- notes
- status
- includeInTotal
- createdAt
- updatedAt
- archivedAt

Supported account types:

- savings
- checking
- digital_wallet
- cash
- emergency_fund
- travel_fund
- other

Supported statuses:

- active
- archived

Requirements:

- Account name is required.
- Account type is required.
- Currency code is required.
- PHP is the default currency.
- Opening balance cannot be invalid.
- User ownership is required.
- Archived accounts remain in the database.
- Archived accounts are excluded from active lists by default.
- An account may optionally be excluded from total savings.
- Account names do not have to be globally unique.
- Use safe identifiers instead of sequential public IDs when supported.
- Add indexes for userId, status, and frequently used sort fields.

Do not store balances using floating-point numbers.

Store monetary values as integer minor units.

Examples:

₱500.00 = 50000
₱1,250.75 = 125075

==================================================
STEP 4 - ACCOUNT TRANSACTION SCHEMA
==================================================

Create an account transaction table.

Suggested table name:

account_transactions

Suggested fields:

- id
- userId
- accountId
- transactionType
- amountMinor
- currencyCode
- transactionDate
- description
- notes
- transferId
- reversalOfTransactionId
- reversedByTransactionId
- status
- idempotencyKey
- createdBy
- createdAt
- updatedAt

Supported transaction types:

- opening_balance
- deposit
- withdrawal
- adjustment_increase
- adjustment_decrease
- transfer_in
- transfer_out
- reversal

Supported status values:

- posted
- reversed

Supported createdBy values:

- user
- system

Reserve support for an `assistant` value in a later phase, but do not implement AI actions now.

Requirements:

- Every transaction belongs to a user.
- Every transaction belongs to an account owned by the same user.
- Amount must be a positive integer in minor units.
- Direction comes from the transaction type.
- Do not store withdrawals as negative values unless that convention is already established consistently in the project.
- Store the absolute amount and derive the balance effect from the transaction type.
- Currency must match the account currency.
- Financial history must not be silently overwritten.
- Posted transactions must be immutable except through an explicit correction or reversal workflow.
- Idempotency keys must be unique within an appropriate scope.
- Add useful indexes for userId, accountId, transactionDate, status, transferId, and idempotencyKey.

Do not use a free-form transaction type that permits arbitrary values.

Use a database enum or constrained typed value consistent with the existing schema conventions.

==================================================
STEP 5 - SAVINGS GOAL SCHEMA
==================================================

Create a savings goal table.

Suggested table name:

savings_goals

Suggested fields:

- id
- userId
- accountId
- name
- targetAmountMinor
- targetDate
- notes
- status
- createdAt
- updatedAt
- completedAt
- archivedAt

Supported status values:

- active
- completed
- archived

Requirements:

- A goal belongs to an authenticated user.
- A goal may be linked to one financial account.
- The linked account must belong to the same user.
- The goal currency is derived from the linked account.
- Target amount must be greater than zero.
- Target date is optional.
- A user may have multiple goals.
- Archiving a goal must not delete account transactions.

For Phase 3, goal progress may be calculated using the linked account's current balance.

Do not create a second balance that duplicates account transaction data.

==================================================
STEP 6 - DATABASE MIGRATION
==================================================

Create a proper Drizzle migration for:

- financial_accounts
- account_transactions
- savings_goals
- Any required enums
- Primary keys
- Foreign keys
- Unique constraints
- Check constraints where supported
- Ownership indexes
- Transaction-date indexes
- Transfer indexes
- Reversal relationships

Review the generated SQL before applying it.

Verify that:

- Monetary fields use integer-compatible database types.
- Required columns are non-null.
- Currency code is stored consistently.
- User relationships are correct.
- Account relationships are correct.
- Deleting an account cannot accidentally delete financial history without an explicit design decision.
- Migration files are tracked in version control.

Do not use schema push as the only production migration strategy.

Apply the migration to the configured development database.

If database credentials are unavailable, generate and review the migration, then report that application of the migration could not be validated.

==================================================
STEP 7 - CENTRALIZE BALANCE CALCULATIONS
==================================================

Create pure reusable utilities for transaction balance effects.

Suggested functions:

- getTransactionBalanceEffect()
- calculateAccountBalance()
- calculateTotalSavings()
- calculateGoalProgress()
- calculateSavingsChange()
- groupTransactionsByPeriod()

Example balance effects:

opening_balance:
increase

deposit:
increase

withdrawal:
decrease

adjustment_increase:
increase

adjustment_decrease:
decrease

transfer_in:
increase

transfer_out:
decrease

reversal:
opposite effect of the original transaction

Do not duplicate balance calculations across:

- React components
- Server Actions
- Services
- Repositories
- Charts

The database records are the source of truth.

If a cached balance is maintained:

- Update it inside the same database transaction as the financial transaction.
- Never update it independently.
- Provide a reconciliation utility that recalculates it from transaction history.
- Add tests proving it stays synchronized.
- Do not trust a cached balance without a defined reconciliation strategy.

If the existing architecture does not need caching yet, calculate balances from transactions and avoid premature optimization.

==================================================
STEP 8 - CREATE VALIDATION SCHEMAS
==================================================

Create Zod schemas for:

- Create account
- Update account details
- Create deposit
- Create withdrawal
- Create adjustment
- Transfer between accounts
- Create savings goal
- Update savings goal
- Archive account
- Restore account
- Reverse transaction
- Transaction filters

Validate on the server even if client validation also exists.

Account validation should cover:

- Required name
- Maximum name length
- Valid account type
- Valid currency
- Valid opening balance
- Safe notes length
- Valid status

Transaction validation should cover:

- Positive amount
- Maximum supported amount
- Valid date
- Valid description
- Correct transaction type
- Idempotency key
- Account existence
- Account ownership
- Currency match

Transfer validation should cover:

- Source account
- Destination account
- Different source and destination
- Same authenticated owner
- Sufficient source balance unless negative balances are explicitly supported
- Matching currencies
- Positive amount
- Valid date
- Duplicate submission prevention

Goal validation should cover:

- Required goal name
- Positive target amount
- Valid optional target date
- Account ownership
- Active linked account

Never allow:

- NaN
- Infinity
- Negative transaction amounts
- Zero-value financial transactions
- Unbounded text input
- Invalid currency values
- Invalid dates
- Browser-supplied authoritative userId

==================================================
STEP 9 - REPOSITORY LAYER
==================================================

Create repositories following the established architecture.

Suggested files:

src/repositories/account-repository.ts
src/repositories/account-transaction-repository.ts
src/repositories/savings-goal-repository.ts

Suggested account operations:

- createForUser()
- findActiveForUser()
- findArchivedForUser()
- findByIdForUser()
- updateForUser()
- archiveForUser()
- restoreForUser()

Suggested transaction operations:

- createForUser()
- findForAccountAndUser()
- findByIdForUser()
- findRecentForUser()
- findByIdempotencyKey()
- markReversedForUser()

Suggested goal operations:

- createForUser()
- findActiveForUser()
- findByIdForUser()
- updateForUser()
- archiveForUser()
- completeForUser()

Every user-owned method must require userId.

A record ID by itself must never authorize a query.

Correct:

findByIdForUser(accountId, userId)

Incorrect:

findById(accountId)

when used for authenticated financial operations.

Do not permit repositories to return another user's record if its ID is known.

==================================================
STEP 10 - SERVICE LAYER
==================================================

Create a Savings service layer.

Suggested file:

src/services/savings-service.ts

Responsibilities:

- Create accounts
- Normalize account data
- Create opening balance transaction
- Record deposits
- Record withdrawals
- Validate available funds
- Create transfers
- Create adjustments
- Reverse transactions
- Calculate account balances
- Calculate total savings
- Manage savings goals
- Archive and restore accounts
- Return dashboard summaries

The service layer owns business rules.

The repository layer owns database access.

The UI must not contain authoritative financial business logic.

==================================================
STEP 11 - ACCOUNT CREATION WORKFLOW
==================================================

When creating an account:

1. Resolve the authenticated user on the server.
2. Validate the request.
3. Normalize the currency.
4. Create the account.
5. If opening balance is greater than zero, create an opening_balance transaction.
6. Perform the account creation and opening balance operation atomically.
7. Return a safe, typed result.
8. Revalidate affected routes.

Do not save the opening balance only as account metadata without its corresponding history.

The opening balance transaction should allow the user to understand how the initial balance was established.

Prevent duplicate account creation caused by repeated submission where practical.

==================================================
STEP 12 - DEPOSIT WORKFLOW
==================================================

When recording a deposit:

1. Resolve the authenticated user.
2. Validate the form.
3. Load the account using accountId and userId.
4. Reject missing, archived, or unauthorized accounts.
5. Verify currency.
6. Create a deposit transaction.
7. Update cached balance atomically if caching is used.
8. Return the updated balance.
9. Revalidate the Savings and Dashboard routes.

A deposit must not be treated as salary or budget income yet.

The Budget module will define income behavior in a later phase.

==================================================
STEP 13 - WITHDRAWAL WORKFLOW
==================================================

When recording a withdrawal:

1. Resolve the authenticated user.
2. Validate the form.
3. Load the owned account.
4. Confirm the account is active.
5. Verify currency.
6. Calculate the current available balance.
7. Reject a withdrawal that exceeds the available balance unless negative balances are an explicitly supported account feature.
8. Create a withdrawal transaction.
9. Update cached balance atomically if used.
10. Return the updated balance.
11. Revalidate affected routes.

For Phase 3, default to preventing negative balances.

Do not silently clamp a withdrawal to the available balance.

Show a clear error explaining that the amount exceeds the available balance.

==================================================
STEP 14 - TRANSFER WORKFLOW
==================================================

A transfer between owned accounts must create two linked transactions:

Source account:
transfer_out

Destination account:
transfer_in

The transfer must:

1. Resolve the authenticated user.
2. Validate the request.
3. Load source and destination accounts for that user.
4. Confirm both accounts are active.
5. Confirm source and destination are different.
6. Confirm currencies match.
7. Confirm sufficient source balance.
8. Generate one transfer ID.
9. Create both transaction records.
10. Update both cached balances if caching is used.
11. Commit everything in one PostgreSQL transaction.
12. Roll back everything if any operation fails.
13. Return both updated balances.
14. Revalidate affected routes.

A transfer must never:

- Create only one side
- Add to total savings
- Count as new income
- Count as an expense
- Cross currencies without an explicit conversion workflow
- Transfer funds to another user's account

Total savings should remain unchanged by a transfer between included accounts using the same currency.

Add a test proving this behavior.

==================================================
STEP 15 - ADJUSTMENT WORKFLOW
==================================================

Support explicit balance corrections.

Types:

- adjustment_increase
- adjustment_decrease

Require:

- Amount
- Direction
- Transaction date
- Reason
- Optional notes

Adjustments are for correcting discrepancies between Iponly and the user's manually observed balance.

Do not allow an adjustment to overwrite transaction history.

Display adjustments clearly in transaction history.

Prevent a decrease adjustment from creating a negative balance unless negative balances are explicitly supported.

==================================================
STEP 16 - TRANSACTION REVERSAL
==================================================

Do not provide destructive deletion for posted financial transactions.

Implement reversal instead.

When reversing a transaction:

1. Resolve the authenticated user.
2. Load the transaction using transactionId and userId.
3. Confirm it belongs to an owned account.
4. Confirm it is posted.
5. Confirm it has not already been reversed.
6. Require a reversal reason.
7. Create an opposite financial record.
8. Link the reversal and original transaction.
9. Mark the original as reversed.
10. Update cached balance atomically if caching is used.
11. Return the corrected balance.
12. Revalidate affected routes.

Examples:

Deposit reversal:
decrease the balance

Withdrawal reversal:
increase the balance

For transfer reversals:

- Reverse both sides together.
- Use one database transaction.
- Do not allow only one transfer side to be reversed.

Opening balance reversal must be handled carefully.

If reversing an opening balance would invalidate account setup, either:

- Support a controlled correction workflow, or
- Prevent direct reversal and require an opening-balance adjustment.

Choose the safest approach and document it.

==================================================
STEP 17 - SAVINGS GOAL WORKFLOW
==================================================

Allow a user to:

- Create a goal
- Link it to an owned account
- Set a target amount
- Set an optional target date
- Update goal details
- Mark a goal complete
- Archive a goal

Show:

- Goal name
- Current linked account balance
- Target amount
- Amount remaining
- Progress percentage
- Target date
- Status

Use safe calculations:

progressPercentage =
min(currentBalance / targetAmount × 100, 100)

Handle:

- Zero balance
- Balance above the target
- Missing target date
- Archived linked account
- Multiple goals

Do not duplicate account balances into the goal table.

==================================================
STEP 18 - SAVINGS PAGE
==================================================

Replace the Phase 1 Savings page fixture data with authenticated server data.

The page should include:

- Total savings
- Savings change for the selected period
- Active account count
- Savings-goal summary
- Account cards
- Recent transactions
- Savings trend
- Quick actions

Quick actions:

- Add Account
- Add Money
- Withdraw
- Transfer
- Adjust Balance

Use Server Components for initial data where appropriate.

Use Client Components only for interactions that require client-side behavior.

Do not fetch financial data entirely after page load if it can be safely loaded on the server.

==================================================
STEP 19 - ACCOUNT CARDS
==================================================

Each account card should show:

- Account name
- Institution
- Account type
- Current balance
- Currency
- Goal progress when applicable
- Include-in-total status
- Last activity date
- Account color or icon
- Archived state where applicable

Actions may include:

- View Details
- Add Money
- Withdraw
- Transfer
- Edit
- Archive

Keep cards readable on 360px-wide screens.

Prevent large amounts from overflowing.

Do not reveal account balance information before authentication has been confirmed.

==================================================
STEP 20 - ACCOUNT DETAILS PAGE
==================================================

Create an account details route.

Suggested route:

/savings/[accountId]

Show:

- Account information
- Current balance
- Savings goal
- Balance trend
- Transaction history
- Deposit action
- Withdrawal action
- Transfer action
- Adjustment action
- Edit account action
- Archive action

The page must load the account with both:

- accountId
- authenticated userId

If the record does not belong to the user, return a safe not-found result rather than revealing that the account exists.

Do not differentiate between "not found" and "belongs to another user" in a way that leaks record existence.

==================================================
STEP 21 - CREATE ACCOUNT FORM
==================================================

Create an accessible account form.

Fields:

- Account name
- Institution, optional
- Account type
- Currency
- Opening balance
- Include in total savings
- Color or icon choice
- Notes, optional

Default currency should come from user preferences.

Default to PHP if no preference is available.

Use:

- React Hook Form
- Zod
- Existing dialog, drawer, or page pattern

For mobile, prefer a full-height sheet, drawer, or dedicated page when a modal would feel cramped.

Provide:

- Loading state
- Validation feedback
- Submission result
- Duplicate-submission protection
- Cancel action

==================================================
STEP 22 - TRANSACTION FORMS
==================================================

Create forms for:

- Deposit
- Withdrawal
- Adjustment
- Transfer
- Reversal

Common fields should include:

- Account
- Amount
- Transaction date
- Description
- Notes

Transfer additionally requires:

- Source account
- Destination account

Adjustment additionally requires:

- Increase or decrease
- Required reason

Reversal requires:

- Required reversal reason
- Read-only original transaction details
- Confirmation

Show a financial confirmation summary before sensitive operations such as transfer, adjustment, and reversal.

Example:

Confirm Transfer

From:
BDO Savings

To:
Maya Savings

Amount:
₱2,000.00

Date:
October 30, 2026

The displayed date should come from the selected transaction date, not from a hard-coded example.

==================================================
STEP 23 - TRANSACTION HISTORY
==================================================

Build a transaction-history component.

Display:

- Transaction type
- Account
- Description
- Amount
- Date
- Status
- Transfer information when applicable
- Reversal information when applicable

Provide filters for:

- Account
- Transaction type
- Date range
- Status

Provide search for:

- Description
- Notes

Sort newest first by default.

Use pagination or cursor-based loading if appropriate.

Do not load an unbounded transaction history into the browser.

Transaction amounts should have clear accessible direction indicators:

- Deposit: Inflow
- Withdrawal: Outflow
- Transfer In: Inflow
- Transfer Out: Outflow
- Adjustment: Increase or decrease
- Reversal: Reversal of a named transaction type

Do not rely only on red and green colors.

Use icons, labels, signs, or accessible text.

==================================================
STEP 24 - SAVINGS ANALYTICS
==================================================

Create Savings analytics based on real user transactions.

Include:

- Total savings
- Balance by account
- Savings trend over time
- Deposits by period
- Withdrawals by period
- Net savings change
- Goal progress

Important rules:

- Internal transfers must not change total savings.
- Reversed transactions must be represented correctly.
- Archived accounts should follow the include-in-total behavior.
- Accounts using different currencies must not be silently combined.
- If multiple currencies exist, group totals by currency.
- Do not apply currency conversion without a verified exchange-rate source.

Support useful periods such as:

- Current month
- Last 3 months
- Last 6 months
- Current year
- Custom date range

If there is not enough data, show an informative empty state rather than a misleading chart.

==================================================
STEP 25 - DASHBOARD INTEGRATION
==================================================

Replace the Savings portion of the dashboard fixture data with real authenticated Savings data.

Show:

- Total savings
- Savings change
- Top accounts
- Current savings goals
- Recent savings transactions

If the user has no accounts, display a clear empty state:

"No savings accounts yet."

Provide an action:

"Add your first account"

Do not mix real savings totals with Phase 1 fictional amounts.

Any modules that still use fixture data must remain clearly labeled as demo previews or be replaced by empty states.

==================================================
STEP 26 - ACCOUNT ARCHIVING
==================================================

Allow users to archive accounts instead of deleting them.

Before archiving, show:

- Account name
- Current balance
- Active goal warning
- Transaction-history notice

Recommended rules:

- An account with a non-zero balance should not be archived silently.
- Require the user to transfer, withdraw, or adjust the remaining balance first.
- If archiving a non-zero balance is allowed, require an explicit warning and preserve its inclusion behavior.
- Active savings goals should be completed, reassigned, or archived.

Archived accounts:

- Remain in the database.
- Retain transaction history.
- Are hidden from the active list by default.
- Cannot receive normal transactions.
- May be viewed in an archived account section.
- May be restored.

Do not hard-delete an account through the normal UI.

==================================================
STEP 27 - EMPTY, LOADING, AND ERROR STATES
==================================================

Create polished states for:

No accounts:

"No savings accounts yet.
Add your first account to start tracking your ipon."

No transactions:

"No transactions yet.
Your deposits, withdrawals, and transfers will appear here."

No goals:

"No savings goals yet.
Create a goal for your emergency fund, travel, or next big purchase."

Loading:

- Use existing skeleton components.
- Avoid major layout shifts.
- Do not display fake balances while real data loads.

Errors:

- Provide safe retry behavior.
- Do not display raw SQL errors.
- Do not expose database or authentication details.
- Preserve user-entered form values when practical.

==================================================
STEP 28 - SECURITY AND AUTHORIZATION
==================================================

Apply server-side authorization to every operation.

Never trust:

- Browser-supplied userId
- URL account ID alone
- Hidden form fields for ownership
- Client state
- AI arguments, in later phases

For every account operation:

- Resolve userId from the authenticated session.
- Query using accountId and userId.

For every transaction operation:

- Resolve userId from the authenticated session.
- Query transaction ownership.
- Verify account ownership.

For transfers:

- Verify ownership of both accounts.
- Never allow transfers to another user's account.

For savings goals:

- Verify goal ownership.
- Verify linked-account ownership.

Do not reveal whether another user's record exists.

Apply safe authorization to both reads and writes.

==================================================
STEP 29 - CONCURRENCY AND DUPLICATE PROTECTION
==================================================

Financial actions must be resilient to duplicate submissions.

Use:

- Idempotency keys
- Disabled submit controls while pending
- Database uniqueness where appropriate
- Database transactions
- Server-side duplicate checks

Protect against:

- Double-clicking Submit
- Browser retry
- Network retry
- Repeated Server Action execution
- Two simultaneous withdrawals
- Two simultaneous transfers

Withdrawal and transfer validation must use an appropriate atomic or locking strategy so concurrent requests cannot overspend the source account.

Do not depend only on a balance checked earlier in the browser.

Document the concurrency strategy used.

==================================================
STEP 30 - AUDITABILITY
==================================================

Financial history itself provides part of the audit trail.

Ensure the system records:

- Creation time
- Transaction date
- Created-by type
- Reversal relationship
- Transfer relationship
- Status
- Adjustment reason
- Reversal reason

Do not store secrets or sensitive authentication information in financial records.

If an audit-log framework already exists, integrate Savings actions with it.

If it does not exist, do not build an unnecessarily broad audit platform in this phase. Preserve enough financial metadata for safe tracing and later extension.

==================================================
STEP 31 - ACCESSIBILITY
==================================================

The Savings Tracker must support:

- Semantic headings
- Proper form labels
- Keyboard navigation
- Visible focus states
- Accessible dialogs and drawers
- Accessible validation messages
- Screen-reader descriptions for charts
- Accessible transaction direction
- Touch-friendly controls
- aria-live feedback for save results
- Confirmation focus management
- Reduced-motion preferences

Do not use color as the only indicator of:

- Deposit
- Withdrawal
- Success
- Error
- Reversed status
- Goal progress

==================================================
STEP 32 - RESPONSIVE DESIGN
==================================================

Verify the Savings Tracker at:

- 360px
- 390px
- 430px
- 768px
- 1024px
- 1440px

At mobile widths:

- No horizontal page scrolling
- Account cards remain readable
- Monetary values do not overflow
- Transaction filters remain usable
- Charts resize correctly
- Forms fit the screen
- Dialogs do not extend beyond the viewport
- Bottom navigation does not cover actions
- Tables become cards or responsive lists when necessary

Do not use a desktop table as the only way to view transactions on mobile.

==================================================
STEP 33 - UNIT TESTS
==================================================

Add unit tests for:

- Money conversion and formatting
- Transaction balance effects
- Account balance calculation
- Total savings calculation
- Deposit effect
- Withdrawal effect
- Adjustment increase
- Adjustment decrease
- Transfer effect
- Transfer neutrality on total savings
- Reversal effect
- Goal progress
- Progress above 100%
- Zero-balance goal
- Multiple currencies
- Reversed transactions
- Archived-account inclusion rules

Use exact integer values in tests.

Example:

Opening balance:
₱10,000.00 = 1000000 minor units

Deposit:
₱2,500.00 = 250000 minor units

Withdrawal:
₱1,000.00 = 100000 minor units

Expected balance:
₱11,500.00 = 1150000 minor units

==================================================
STEP 34 - INTEGRATION TESTS
==================================================

Add integration tests for:

- Account creation
- Account creation with opening balance
- Deposit
- Withdrawal
- Withdrawal exceeding balance
- Adjustment increase
- Adjustment decrease
- Transfer
- Transfer with insufficient funds
- Transfer to the same account
- Transfer with mismatched currencies
- Transfer rollback when one side fails
- Transaction reversal
- Duplicate reversal prevention
- Transfer reversal
- Savings-goal creation
- Savings-goal update
- Account archive
- Account restore
- Duplicate-submission protection

Use an isolated test database.

Never run automated tests against production.

==================================================
STEP 35 - AUTHORIZATION TESTS
==================================================

Create at least two authenticated test users.

Verify:

- User A can create an account.
- User A can view User A's account.
- User B cannot view User A's account.
- User B cannot update User A's account.
- User B cannot deposit into User A's account.
- User B cannot withdraw from User A's account.
- User B cannot transfer from User A's account.
- User B cannot reverse User A's transaction.
- User B cannot archive User A's account.
- User B cannot update User A's savings goal.
- Forged userId input does not bypass authorization.
- Changing accountId in a request does not bypass authorization.
- Changing transactionId in a request does not bypass authorization.
- Unauthorized access returns a safe result.

These tests are mandatory.

==================================================
STEP 36 - PLAYWRIGHT TESTS
==================================================

Add end-to-end tests for the critical Savings workflow:

1. Log in.
2. Open Savings.
3. Verify the empty state.
4. Create BDO Savings with an opening balance.
5. Verify the account and balance.
6. Create Maya Savings.
7. Deposit money into Maya Savings.
8. Withdraw money from BDO Savings.
9. Transfer money from BDO Savings to Maya Savings.
10. Verify both account balances.
11. Verify total savings remains unchanged by the transfer.
12. Create a savings goal.
13. Verify the goal progress.
14. Open transaction history.
15. Filter transactions.
16. Reverse a deposit or withdrawal.
17. Verify the corrected balance.
18. Archive a zero-balance test account.
19. Restore the account.
20. Log out.
21. Verify protected Savings routes require authentication.

Avoid brittle selectors.

Prefer:

- Roles
- Labels
- Accessible names
- Stable test IDs only when necessary

==================================================
STEP 37 - PERFORMANCE
==================================================

Avoid:

- Loading all transaction history at once
- Recalculating large histories repeatedly in Client Components
- Excessive client-side fetching
- Duplicate dashboard queries
- Unbounded chart datasets
- N+1 database queries
- Marking entire pages with "use client"

Use:

- Server Components for initial reads
- Pagination or cursor-based transaction loading
- Aggregated server-side queries where appropriate
- Reusable summary queries
- Indexed database lookups
- Route revalidation after mutations

Do not introduce complex caching until correctness is established.

Financial correctness is more important than aggressive caching.

==================================================
STEP 38 - DOCUMENTATION
==================================================

Update the project documentation with:

- Savings Tracker architecture
- Database tables
- Transaction types
- Balance-calculation rules
- Transfer behavior
- Reversal behavior
- Archiving behavior
- Savings-goal behavior
- Currency limitations
- Idempotency strategy
- Concurrency strategy
- Migration commands
- Test commands
- Known limitations
- Features deferred to later phases

Clearly state:

- Iponly does not synchronize with real banks in Phase 3.
- Balances depend on manually entered transactions.
- Cross-currency transfers are not supported without conversion data.
- Budget linkage is deferred to the Budget phase.
- Iponly AI actions are deferred to the AI phase.

==================================================
STEP 39 - VALIDATION
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

Do not invent script names.

Use the scripts present in package.json.

Fix errors introduced by Phase 3.

Do not hide errors using:

- any
- @ts-ignore
- @ts-nocheck
- Disabled lint rules
- Skipped authorization tests
- Commented-out tests
- Fake success responses

If database credentials or another external requirement is unavailable, report exactly which validation could not be completed.

==================================================
STEP 40 - PHASE 3 COMPLETION REPORT
==================================================

After implementation, provide a concise report containing:

1. Existing project architecture inspected

2. Savings features completed

3. Database tables and enums created

4. Migration files created

5. Migration status

6. Repositories created

7. Services created

8. Server Actions or Route Handlers created

9. Pages and components created

10. Existing files modified

11. Dependencies installed

12. Balance strategy used

13. Transfer transaction strategy

14. Reversal strategy

15. Idempotency strategy

16. Concurrency strategy

17. Security controls implemented

18. Tests created

19. Commands executed

20. Type-check status

21. Lint status

22. Test status

23. Build status

24. Known limitations

25. Items deferred to Phase 4

Be transparent about anything that could not be validated.

==================================================
PHASE 3 DEFINITION OF DONE
==================================================

Phase 3 is complete when:

- Authenticated users can create financial accounts.
- Opening balances create transaction history.
- Users can record deposits.
- Users can record withdrawals.
- Negative balances are prevented by default.
- Users can transfer between owned accounts.
- Transfers create two linked records atomically.
- Transfers do not change total savings.
- Cross-currency transfers are rejected.
- Users can make balance adjustments with reasons.
- Users can reverse incorrect transactions.
- Reversals preserve financial history.
- Users can create and manage savings goals.
- Users can view account transaction history.
- Users can filter and search transactions.
- Users can archive and restore accounts.
- Savings analytics use real authenticated data.
- Dashboard Savings data uses real authenticated data.
- Fixture Savings data is no longer presented as real user data.
- All money is stored using integer minor units.
- All operations resolve userId from the authenticated session.
- User A cannot access or modify User B's records.
- Duplicate submissions are protected.
- Concurrent withdrawals and transfers cannot overspend an account.
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

Do not proceed to Phase 4 automatically.

Stop after Phase 3 is implemented, tested, validated, documented, and summarized.
