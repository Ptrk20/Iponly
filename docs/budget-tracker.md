# Monthly Budget Tracker

Phase 5 adds authenticated, persistent monthly budgets. The Budget page supports month navigation, planned and received income, user-owned categories, category allocations, actual expenses, linked Savings and Debt activity, transaction history, reversals, and copying a prior month's plan. The dashboard and budget analytics use the same stored records.

## Accounting model

The system keeps these values separate:

- **Planned income** is the sum of planned amounts from non-cancelled income sources.
- **Actual income** is the sum of received amounts from received income sources.
- **Total allocated** is the sum of category allocations. Allocations are plans, not spending.
- **Unallocated planned income** is planned income minus total allocations; it can be negative when the plan exceeds income.
- **Actual spending** is the sum of posted expense entries. Reversed entries remain in history but are excluded.
- **Available from actual income** is actual income received minus posted spending. Savings contributions and Debt payments are included once as spending.
- **Category remaining** is its planned allocation minus its posted spending. A negative result indicates overspending.

Amounts are stored as integer minor units and calculations reject unsafe integer inputs. Each budget uses one currency. No implicit conversion or exchange-rate lookup is performed.

## Ownership and persistence

The monthly budget, income, categories, allocations, and expense records are owned by the authenticated user. Server Actions obtain identity from the server session; a submitted record ID is always looked up with that owner. Composite foreign keys constrain same-user references and budget currency where applicable. Idempotency keys protect create/receive/reverse operations from duplicate submissions.

Categories are per-user. Default categories are initialized lazily and can be renamed, reordered, recolored, given an icon, archived, or restored. Existing entries retain their category reference if the category is archived. Duplicate names are not created by archiving and recreating a category.

To edit an allocation, choose an active category from the dropdown, update its prefilled planned amount, and select **Save allocation**.

## Savings and Debt links

- An expense can optionally record a Savings account withdrawal in the same database transaction. A successful reversal reverses both records atomically.
- A Savings contribution is a Budget expense and can optionally create a deposit in a selected Savings account. It is not treated as new income. Reversing it reverses its linked deposit in the same transaction.
- A Debt payment is recognized in the Budget for the matching month and currency. New payments are linked automatically when a matching budget exists; existing unlinked payments can be linked from the Budget page. If a Debt payment has a linked Savings withdrawal, the Budget reuses that event rather than creating a second expense.
- Debt payments linked to Budget must be reversed through the Debt workflow. The Debt service reverses the linked Budget entry in the same transaction.
- The reconciliation check reports inconsistent linked amounts, currencies, statuses, and Savings transaction types. A linked event with mismatched currency cannot be included without conversion data.

Transfers between the user's own Savings accounts are not Budget income or spending. Budget entries never duplicate the Savings transaction they reference.

## Month lifecycle and copy

Only an active budget accepts changes. Closed or archived budgets can be reopened before editing; archived records remain directly accessible for historical review but are omitted from ordinary budget lists and current dashboard summaries. Copying a month copies planned income and category allocations only. It never copies received income, expenses, Savings activity, or Debt payments. A budget is unique per user, month, and currency.

Dates use the user's configured timezone for the current month and date defaults. Budget transaction dates must fall within the selected budget month.

## Migrations and tests

The Phase 5 schema and reversal support are in migrations `0006_overrated_gorgon.sql` and `0007_complex_midnight.sql`. Apply them to a development database with:

```bash
npm run db:migrate
npm run db:health
```

Budget service tests use an isolated in-memory PGlite database and apply checked-in migrations. Do not point tests at a production database.

## Scope limits

Phase 5 does not include bank synchronization, automatic salary import, merchant auto-categorization, currency conversion, offline mutation synchronization, receipt processing, shared budgets, AI-generated transactions, or travel-plan persistence.
