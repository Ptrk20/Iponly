# Iponly

Iponly is a mobile-first personal finance application for Filipino users.

**Ipon. Budget. Bayad. Gala.**

## Phase 2 architecture

- Next.js 16 App Router with server-enforced route-group protection.
- Better Auth email/password authentication and database-backed sessions.
- Neon PostgreSQL through the server-only Neon WebSocket pool and Drizzle ORM.
- Drizzle schema/migrations for Better Auth tables and one user-owned preferences row.
- Preference updates follow Action → Zod validation → service → user-scoped repository → Drizzle.
- Finance screens remain labeled **Demo Preview** and use synthetic fixtures only. No financial records are persisted in Phase 2.

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
2. Set `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, and `NEXT_PUBLIC_APP_URL` in the Vercel project for Development, Preview, and Production as appropriate. Never commit actual secrets.
3. Apply migrations to the intended database with `npm run db:migrate` before deploying code that requires the new schema.
4. Deploy the Next.js application to Vercel.
5. Verify registration, login, logout, protected-route redirects, onboarding, and saved preferences against the deployed environment.
6. Run `npm run db:health` with the target environment to verify connectivity without printing connection details.

Do not use a production database for tests. Local ownership tests use an isolated in-memory PGlite database and apply the checked-in migrations there.

## Security boundaries

- Better Auth hashes passwords and owns session-cookie handling. Passwords and tokens are never stored in localStorage or returned from Iponly preference actions.
- Protected pages resolve the user from the server session. Preference repository methods require that server-derived user ID; browser-supplied IDs are ignored.
- User preferences default to PHP, `en-PH`, `Asia/Manila`, system theme, Monday week start, and incomplete onboarding.
- Database/environment failures are returned as generic messages; logs contain no credentials, passwords, emails, or user IDs.
- Synthetic savings, debt, budget, transaction, and travel examples are never inserted into user accounts.

See [docs/data-ownership.md](docs/data-ownership.md) for the repository ownership convention.

## Deferred

Financial CRUD and real analytics, AI, social login, service workers/offline support, notifications, and bank integrations are not part of Phase 2.
# Iponly

Iponly is a mobile-first personal finance prototype for Filipino users.

**Ipon. Budget. Bayad. Gala.**

## Run locally

Use Node.js 20.9 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Checks

```bash
npm run typecheck
npm run lint
npm run build
```

## Phase 1 scope

The Home, Savings, Budget, Debt, Travel, Analytics, and Settings screens use synthetic fixture data in `src/data/fixtures`. Financial values are represented in integer minor units and formatted through `src/lib/money.ts`.

Actions are visual placeholders and do not write data. Authentication, databases, financial mutations, AI services, and offline/service-worker behavior are intentionally deferred.