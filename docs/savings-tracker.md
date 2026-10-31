# Savings Tracker (Phase 3)

## Architecture

Authenticated Savings reads use Server Components. Mutations use authenticated Server Actions, Zod validation, the savings service, user-scoped Drizzle repositories, and PostgreSQL. The browser never supplies an authoritative `userId`.

Tables and enums are defined in `src/db/schema/savings.ts`; migrations are under `src/db/migrations`.

- `financial_accounts` stores active and archived manually tracked accounts. Account creation is idempotent per user.
- `account_transactions` is the authoritative ledger. Every amount is a positive `bigint` in minor units; transaction type determines its signed balance effect. Currency must match the owning account.
- `savings_goals` stores target details and optional account linkage. Linked progress uses the live account balance rather than a duplicated saved balance.

## Ledger rules

Opening balance, deposit, adjustment increase, and transfer-in increase an account. Withdrawal, adjustment decrease, and transfer-out decrease it. A reversal points to the original transaction and applies its opposite effect. An original entry is retained and marked reversed; transactions are never hard-deleted. Opening-balance reversals are disallowed and must be corrected through a reasoned balance adjustment.

Transfers use two rows sharing a transfer ID. Both accounts are locked in stable ID order, checked for active status, ownership, matching currency, and sufficient funds, and both rows are inserted in one database transaction. Any error rolls back both rows. A transfer is not income or an expense and is neutral to combined totals.

Withdrawals, decreasing adjustments, and transfers lock the owned account row before recalculating the ledger balance. This serializes competing balance reductions. Idempotency keys are unique within a user; a transfer uses distinct `:out` and `:in` keys from its action key. The account-creation key is persisted separately. No balance cache is maintained.

An account can be archived only with a zero balance and no active linked goals. Archiving preserves both account and transaction history; restoration is supported. Totals are grouped by currency and respect `includeInTotal`, including for archived accounts. There is no foreign-exchange conversion.

## Limitations and deferred work

- Iponly does not synchronize with real banks. Account balances depend on user-entered activity.
- Cross-currency transfers are rejected; currency conversion is not supported.
- Savings is not linked to the monthly Budget module yet.
- Iponly AI actions, debt persistence, Budget persistence, Travel persistence, and full offline transaction synchronization are deferred.
- Savings charts are bounded to the recent activity window; account balances themselves are ledger-derived.
- Playwright is not configured in this repository; automated coverage uses the existing Vitest and isolated PGlite setup.

## Validation commands

```bash
npm run db:generate
npm run db:migrate
npm run db:health
npm run typecheck
npm run lint
npm test
npm run build
```

The migration is applied by the checked-in migration runner; tests apply all migrations to a fresh in-memory PGlite database. Do not point automated tests at production.
