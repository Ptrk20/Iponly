# Phase 6: Analytics and Financial Insights

The authenticated Analytics page reads the current Savings, Budget, and Debt ledgers through server-only, user-scoped repositories. It does not use the Phase 1 fixtures, persist duplicate analytics records, convert currencies, or call an AI service. The Home page reuses its existing Savings, Budget, and Debt summaries to show a few deterministic factual signals.

## Architecture and access control

The protected Server Component resolves the user with the authenticated session, loads that user's timezone and currency preferences, and calls `getAnalyticsDashboardData` inside a Suspense boundary. The service requests bounded, grouped data from `analytics-repository.ts`, reuses the established Savings balance and Debt overview services, normalizes posted spending events, and returns analytics DTOs. Chart components receive prepared values rather than database records. Every analytics repository method requires the server-derived user ID and scopes each query by that ID; no user ID is accepted from page search parameters.

The date filter uses GET parameters only for period and date selection. A custom period must have valid calendar dates, a start on or before its end, and span no more than 366 inclusive days. Invalid input is surfaced with an alert and the page explicitly displays current-month results until corrected. Date-only records use the selected user's calendar dates. Timestamped Savings transactions use a timezone-local, half-open interval (`startInclusive <= timestamp < endExclusive`).

Supported periods are this month to date, last month, the last 3 or 6 months to date, year to date, this year to date, and custom. Comparison values use an immediately preceding interval of the same number of calendar days. Percentage changes are omitted when the previous amount is zero. Values are summed as integer minor units and grouped by currency; PHP, USD, EUR, and JPY are never combined.

## Metric definitions

- **Savings balance:** Current ledger balance for accounts marked `includeInTotal`, grouped by currency. Archived accounts retain their ledger history and remain included only when their existing `includeInTotal` setting is true. Individual account rows also show accounts excluded from the total.
- **Savings balance trend:** Balance at the end of each chart bucket, calculated from all included-account ledger movements before the selected range plus movements inside it. Short periods use daily buckets; longer periods use monthly buckets. Deposits, withdrawals, adjustments, transfers, and reversal effects use the same signed ledger semantics as Savings. Paired same-currency transfers net to zero across included accounts. Reversed originals and their posted reversal both affect the ledger, so the two effects cancel.
- **Savings deposits and withdrawals:** Posted deposit and withdrawal transaction amounts in the selected timestamp range. Internal transfers are excluded from both measures. Net Savings change includes all ledger effects, including adjustments and reversals.
- **Actual income:** Received Budget income whose `receivedDate` is inside the selected range. Planned income, Savings withdrawals, transfers, and debt reversals are not income. Income-source rows group planned amounts from selected Budget months and received amounts by source name, income type, and currency.
- **Planned income and allocations:** Full planned income and category allocations from each monthly Budget whose month intersects the selected date range. These are monthly plan values; actual income and spending remain limited to the exact selected dates. For partial-month or multi-month filters, the chart labels distinguish actual activity from full monthly allocation values.
- **Spending:** Posted non-Savings Budget expenses dated in the selected range, plus posted Debt payments in that range that have no linked Budget expense. Savings contributions are reported separately. Standalone Savings withdrawals are not presumed to be spending because they do not identify their economic purpose.
- **Category spending:** Canonical spending events grouped by category name and currency; unlinked Debt payments appear under Debt Payments. Category percentage is that category's share of spending in the same currency. Allocation utilization is actual category spending divided by the summed full planned allocation for matching Budget months; over-allocation is not capped at 100%.
- **Debt paid:** Posted non-reversal Debt payments during the selected range. A linked Budget expense does not change this Debt-specific measure. Principal, interest, and fees are not inferred when payment allocation data is unavailable.
- **Outstanding debt:** Existing Debt overview's current balance grouped by currency and following its include-in-total and archived-debt behavior. Scheduled obligations and overdue amounts are separate and do not count as spending until paid.
- **Upcoming obligations:** Remaining amounts of active-debt installments due today through the next 30 days in the user's timezone. Overdue installments are summarized separately.

## Canonical event and reversal rules

Budget expense records are the canonical spending events when a Debt payment or Savings withdrawal is linked to them. The linked Debt payment is suppressed from cross-module spending, while its Debt-specific payment metric remains available. A linked Savings transaction is not independently added to spending. A Debt payment without a linked Budget expense is a canonical Debt Payments event. Savings contributions are excluded from spending and shown as contributions. Transfers are not income or spending.

Only posted Budget expenses and posted non-reversal Debt payments are normalized into spending. Reversed Budget expenses and reversed Debt payments are excluded. Savings ledger balance trends include both the original ledger effect and the reversal effect so they net to zero. Historical transaction lists remain unchanged.

## Historical records, performance, and privacy

Closed and archived monthly Budgets remain eligible for historical analytics. Archived Savings accounts retain their transaction history. Debt account and archive behavior follows the established Debt overview service. No copied analytics tables or cache are introduced. Repository requests run in parallel where independent, period reads are date-bounded, Savings trend values are grouped in SQL, and chart datasets are capped to daily points for short periods or monthly points for longer periods.

Analytics results contain user-facing account/category labels and aggregate values rather than raw transaction IDs. Account and Debt names remain user-owned data and are only queried for the authenticated user. Error states are not converted into fabricated financial results.

## Deterministic insights and known limitations

Insight cards report category utilization at or above 80%, over-allocation at or above 100%, nonzero Savings changes, unallocated planned income, and currently overdue installments. They are factual summaries, not personalized advice. They use no LLM or external AI service.

Cross-currency conversion, travel activity, predictive forecasts, historical interest/principal reconstruction when unallocated, and net worth are intentionally not calculated. Budget allocations are monthly values even when a selected range covers only part of a month; the UI identifies this distinction. Analytics integration and authorization use the same server-derived user ID discipline as existing services; automated end-to-end browser coverage remains dependent on the project's future Playwright setup.

Run `npm run typecheck`, `npm run lint`, and `npm run test` to validate the analytics changes. The focused analytics tests cover timezone boundaries, leap-year custom ranges, comparison math, currency grouping, reversal exclusion, and the linked Debt/Budget/Savings deduplication case.
