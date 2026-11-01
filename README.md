# Iponly

Iponly is a mobile-first personal finance application for Filipino users.

**Ipon. Budget. Bayad. Gala.**

## Iponly v1.0

The v1.0 release includes authenticated Savings, Debt & Installments, Monthly Budgeting, Financial Analytics, Travel Planning, account preferences, user-owned JSON data export, and installable PWA support. Iponly AI and AI actions are planned future features and are not available in the production v1.0 interface or API.

## Current architecture

- Next.js 16 App Router with server-enforced route-group protection.
- Better Auth email/password authentication and database-backed sessions.
- Neon PostgreSQL through the server-only Neon WebSocket pool and Drizzle ORM.
- Drizzle schema/migrations for Better Auth, preferences, Savings, Debt & Installments, Budget, Travel, and opt-in Web Push subscriptions.
- User-owned operations follow Server Action → Zod validation → service → scoped repository → Drizzle.
- Savings accounts, transaction history, goals, debts, installment schedules, payments, monthly budgets, and travel plans are persisted for the authenticated user. Analytics reports authenticated Savings, Debt, Budget, and Travel activity.

## Local setup

Use Node.js 20.9 or newer. Copy `.env.example` to `.env.local`, then replace every placeholder with local values. `.env.local` is ignored by Git.

Required variables:

```dotenv
DATABASE_URL="postgresql://username:password@ep-example.region.aws.neon.tech/iponly?sslmode=require"
BETTER_AUTH_SECRET="replace-with-at-least-32-random-characters"
BETTER_AUTH_URL="http://localhost:3000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

Install and migrate a development database before starting the app:

```bash
npm install
npm run db:generate
npm run db:migrate
npm run db:health
npm run dev
```

Open http://localhost:3000. Registration, login, onboarding, protected routes, and preference persistence require the configured PostgreSQL database.

### Local certificate trust

The project `.npmrc` enables Node's `--use-system-ca` for npm scripts, so HTTPS connections to Neon trust certificates installed in the operating system as well as Node's bundled roots. Use Node.js 22.19+ or 24.6+ (or a newer major version). This keeps TLS verification enabled and supports networks with an approved corporate CA installed in Windows.

If authentication reports "Failed to get session", run `npm run db:health`. A certificate error can prevent Better Auth from reading sessions. After changing certificate configuration, restart `npm run dev`; existing Node processes do not pick up the new trust settings. For direct Node commands outside npm, use `node --use-system-ca ...`. If the required CA is not installed in the operating system, obtain the approved certificate from IT and configure `NODE_EXTRA_CA_CERTS` before starting Node. Never disable TLS verification.

## Commands

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run db:generate
npm run db:migrate
npm run db:studio
npm run db:health
```

`db:generate` is offline. `db:migrate`, `db:studio`, and `db:health` require valid server environment variables and a reachable database. Migrations are checked into `src/db/migrations`; do not use schema push as the production migration strategy.

## Neon and Vercel deployment

1. Create a Neon PostgreSQL project and database. Use its TLS-enabled connection string; for Vercel/serverless usage, prefer the Neon pooled connection string.
2. Set `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, and `NEXT_PUBLIC_APP_URL` in Vercel's Development, Preview, and Production environments. Prefer separate databases for Development, Preview, and Production; never point automated tests or disposable preview data at the production database. Never commit actual secrets.
3. Apply migrations to the intended database with `npm run db:migrate` before deploying code that requires the new schema.
4. Deploy the Next.js application to Vercel.
5. Verify registration, login, logout, protected-route redirects, onboarding, and saved preferences against the deployed environment.
6. Run `npm run db:health` with the target environment to verify connectivity without printing connection details.

Do not use a production database for tests. Local ownership tests use an isolated in-memory PGlite database and apply the checked-in migrations there.

### Scheduled and phone notifications

Settings supports push reminders for debt installments (3 days before), trips (7 days before), trip to-dos (3 days before), and monthly analytics (the first day of the month). Delivery is scheduled for 9:00 AM in each user's profile timezone. Reminders use generic lock-screen text and open the relevant Iponly page; balances and private record names are not included in push payloads.

Push delivery requires HTTPS, VAPID keys, and a scheduler:

1. Generate a VAPID key pair with `npx web-push generate-vapid-keys`.
2. Set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, and a random `NOTIFICATION_CRON_SECRET` (at least 32 characters) in the app environment. Never expose the private key or cron secret.
3. Apply the latest database migrations.
4. Configure GitHub repository secrets `IPONLY_APP_URL` (the deployed origin) and `IPONLY_NOTIFICATION_CRON_SECRET` (the same value as the app secret). The included GitHub Actions workflow calls the protected scheduler endpoint every 15 minutes. GitHub can delay scheduled workflow starts; reminders are delivered after 9:00 AM when a scheduler run occurs on that local date.
5. In Settings, save the reminder types and enable push on each device. On iPhone or iPad (iOS/iPadOS 16.4 or newer), add Iponly to the Home Screen, launch the installed app, and grant notification permission. Android and desktop browsers must also grant permission. The browser/OS may suppress notifications based on device settings or power modes.

If using Vercel Cron instead of GitHub Actions, configure `/api/cron/notifications` with an every-15-minute schedule on a plan that supports that frequency, and send `Authorization: Bearer <NOTIFICATION_CRON_SECRET>`. Vercel Hobby cron jobs run at most once daily, which is not sufficient for reliable 9:00 AM reminders across user timezones. The endpoint is safe to invoke repeatedly; successful deliveries are deduplicated.

### PWA and offline behavior

Iponly uses the Next.js App Router manifest and a small service worker. It caches only the static offline page and an application icon; it does not cache authenticated pages, financial API responses, or mutation requests. Offline visits show a generic reconnect message instead of stale balances. Financial changes are never queued or replayed offline. When an application update is ready, the user explicitly chooses to refresh.

The service worker also displays opt-in Web Push reminders. On iOS/iPadOS, push is available to web apps added to the Home Screen; users must launch the installed app and grant permission. Push delivery requires the configured VAPID keys and scheduled server endpoint described above.

### Data export and backups

The authenticated Settings page downloads a JSON export of the signed-in user's Savings, Debt, Budget, and Travel records. Monetary values remain integer minor units with currency codes or a currency-bearing parent record; related record IDs preserve cross-module references. Authentication credentials, sessions, and provider secrets are excluded. This user export is not a database backup: maintain a separate database backup/restore plan for production.

## Phase 3: Savings Tracker

The Savings Tracker stores three user-owned record types:

- `financial_accounts`: manually tracked financial locations with currency, include-in-total preference, and active/archived state.
- `account_transactions`: immutable posted activity using positive integer minor units, with explicit transaction types, idempotency keys, transfer links, and reversal links.
- `savings_goals`: active/completed/archived targets. A linked goal derives its currency and progress from its account; an unlinked goal uses the user's preferred currency.

Balances are calculated from the transaction ledger; no separate cached balance is maintained. Deposits, withdrawals, adjustments, and reversals each add a ledger record. Opening balances are represented as `opening_balance` transactions. Posted transactions are not deleted. Reversals add an opposite record and mark the original as reversed; opening balances must be corrected with an adjustment.

Transfers lock both owned accounts in stable ID order, verify matching currency and sufficient funds, then insert linked `transfer_out` and `transfer_in` rows within one PostgreSQL transaction. Transfer movements cancel in totals. Withdrawals and transfers lock account rows before checking the ledger balance, preventing concurrent overspending. Transaction idempotency keys are unique per user; account creation also uses a per-user idempotency key.

Accounts are archived only after the balance reaches zero and active linked goals are resolved. Archived accounts retain history and may be restored. Totals remain grouped by currency; Iponly does not convert currencies or synchronize with banks.

Migration files are generated and checked in with Drizzle:

```bash
npm run db:generate
npm run db:migrate
npm run db:health
```

The migration has been exercised against isolated PGlite in tests. Apply it to a configured development database with `npm run db:migrate`; do not run tests against production.

## Security boundaries

- Better Auth hashes passwords and owns session-cookie handling. Passwords and tokens are never stored in localStorage or returned from Iponly preference actions.
- Protected pages resolve the user from the server session. Preference repository methods require that server-derived user ID; browser-supplied IDs are ignored.
- User preferences default to PHP, `en-PH`, `Asia/Manila`, system theme, Monday week start, and incomplete onboarding.
- Database/environment failures are returned as generic messages; logs contain no credentials, passwords, emails, or user IDs.
- Savings actions resolve ownership from the authenticated session and ignore browser-supplied user IDs. Composite foreign keys enforce same-user and same-currency account/transaction relationships.
- Synthetic debt, budget, and travel examples are never inserted into user accounts.

See [docs/data-ownership.md](docs/data-ownership.md) for the repository ownership convention, [docs/savings-tracker.md](docs/savings-tracker.md) for the Phase 3 ledger rules, and [docs/debt-tracker.md](docs/debt-tracker.md) for Phase 4 debt behavior.

## Phase 5: Monthly Budget Tracker

The authenticated Budget page stores monthly income, category allocations, posted expenses, and reversals. It keeps planned income, received income, allocations, and actual cash remaining as distinct measures. Categories are user-owned; system defaults can be customized and archived, and archived categories remain available to historical transactions. The dashboard and budget analytics read persisted monthly records.

Expenses linked to Savings withdrawals and Debt payments are represented once in the Budget ledger. Savings contributions can optionally create a Savings deposit; the Budget entry records the outflow from untracked monthly cash, not a transfer between tracked accounts. Reversals preserve history and atomically reverse linked Savings or Debt records. Currency conversion is not supported, and linked activity must match the budget currency.

See [docs/budget-tracker.md](docs/budget-tracker.md) for accounting rules, ownership, reversals, month copying, and operational limits. Apply migrations to the intended development database with `npm run db:migrate`; use isolated PGlite for tests and never run tests against production.

## Phase 6: Analytics and Financial Insights

The authenticated Analytics page summarizes Savings balances and trends, Budget income and spending, Debt balances and payments, upcoming obligations, period comparisons, and deterministic factual insights. Periods use the authenticated user's timezone; custom ranges are limited to 366 days. Money remains in minor units and all totals remain grouped by currency. Linked Budget, Savings, and Debt representations are deduplicated so an economic spending event is counted once. Transfers are neutral, reversals do not inflate finalized activity, and closed or archived Budgets remain historically reportable.

See [docs/analytics.md](docs/analytics.md) for metric definitions, date boundaries, currency behavior, deduplication, historical inclusion, security, and known limitations.

## Future plans

Iponly AI and confirmed AI actions are planned, but are excluded from the v1.0 production interface. The core application does not require AI credentials or an AI provider to build or run. The development-only AI work is not part of the production release.

## Phase 7: Travel Planner

The authenticated Travel Planner stores user-owned trips, planned and posted expenses, itinerary items, to-dos, packing lists, and bookings. Trip expenses may link to a same-currency Savings account withdrawal and/or a matching-month Budget category. Linked records are created and reversed transactionally; Analytics treats the Travel expense as canonical and does not add its linked Budget representation a second time. Dashboard travel data comes from the user's next upcoming trip rather than fixture records.

Amounts remain integer minor units and are grouped by currency. Trip-budget progress includes only the trip's base currency; no exchange rates are inferred. See [docs/travel-planner.md](docs/travel-planner.md) for data ownership, financial links, reversal behavior, analytics date rules, and known limits.

## Production release checklist

- [ ] Configure production-only Vercel environment variables and a separate production Neon database.
- [ ] Apply tracked migrations to the selected production database and run `npm run db:health`.
- [ ] Pass `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build`.
- [ ] Verify login, logout, onboarding, user ownership, core financial workflows, and the JSON export against a non-production account.
- [ ] Verify `/manifest.webmanifest`, both icon assets, install/standalone behavior, offline fallback, and explicit update behavior on supported browsers.
- [ ] Complete production smoke tests and confirm no AI routes or credentials are enabled.
- [ ] Confirm backup and restore procedures; the user JSON export is not a database backup.