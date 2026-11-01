# Travel Planner

## Scope and ownership

Travel data is persisted in the `trips`, `travel_planned_expenses`, `travel_expenses`, `travel_itinerary_items`, `travel_todos`, `travel_packing_items`, and `travel_bookings` tables. Protected pages resolve the owner from the server session. Server Actions validate external fields with Zod, and services call repositories whose reads and writes include the authenticated `userId`. Composite foreign keys enforce that child records, linked savings goals, Savings transactions, and Budget expenses belong to the same user.

Trips can be archived and restored without deleting their history. Archived trips are excluded from the active trip list and cannot be edited. Travel expenses are posted or reversed; reversal preserves the original and atomically reverses any linked Savings withdrawal and Budget row.

## Financial behavior

- Monetary values use integer minor units. Currency values remain grouped separately; Iponly does not infer or fetch exchange rates.
- A trip's budget and progress use only expenses denominated in the trip's base currency. An expense in another currency remains visible in its own currency total and does not change base-currency remaining budget.
- A linked Savings account must be active and use the expense currency. A withdrawal is written as an account transaction rather than changing a balance directly.
- A linked Budget must be active, use the expense currency, and match the expense's calendar month. Travel, Savings, and Budget writes are in one database transaction.
- A converted planned expense is marked as converted to avoid counting both its plan and its actual entry in trip summaries.
- Expense submission and reversal use idempotency keys to protect against retries.

## Analytics and dashboard

Travel actual expenses appear in spending analytics. If an expense also has a linked Budget row, the Budget representation is retained as the overall spending event and the standalone Travel event is suppressed. Travel-specific summaries still show the actual Travel record once. Planned travel amounts are grouped by their expected date; if no expected date is set, the trip start date is used. Items without either date do not appear in date-filtered planned analytics.

The dashboard links to the next non-cancelled, incomplete trip whose end date has not passed. Users without a dated upcoming trip can open the Travel Planner to view planning and undated trips.

## Trip sharing

An owner can turn on sharing for any trip to get an 8-character trip code. Other users join from **Travel → Join a trip**.

- Members see only the itinerary, to-dos, and packing list. Budget, expenses, bookings, notes, and linked Savings/Budget data stay owner-only.
- Access is `viewer` or `editor` (itinerary, to-dos, packing only). The owner sets the default for new members and can change or remove any member.
- The owner can regenerate the code (old code stops working, members keep access) or turn sharing off (members lose access until it is turned back on). Members can leave.
- Edits by an editor are stored under the owner's records and authorized against the trip's membership on the server.

## Known limits

- There is no automatic currency conversion, external booking or airline integration, maps service, flight search, visa lookup, receipt scanning, shared trip, or offline financial synchronization.
- Travel dates are calendar dates. Booking timestamps are stored with timezone offsets when provided.
- Budget links are limited to the matching calendar month and currency; trip budgets are independent of monthly budget allocations.
- Analytics does not estimate planned expenses without an expected date or trip start date.

Apply the checked-in migration to a configured development database with `npm run db:migrate`. Tests use an isolated PGlite database and apply checked-in migrations; do not run tests against production.
