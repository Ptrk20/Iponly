Implement Phase 2 of Iponly.

Iponly is a mobile-first personal finance Progressive Web App designed primarily for Filipino users.

Product name:
Iponly

Tagline:
"Ipon. Budget. Bayad. Gala."

Phase 1 established the responsive application shell, design system, navigation, shared components, money utilities, domain types, charts, pages, and synthetic fixture data.

Follow all architecture, security, financial correctness, coding, testing, accessibility, and product rules defined in the project's agent instructions.

==================================================
PHASE 2 GOAL
==================================================

Implement the secure backend foundation for Iponly.

This phase must introduce:

1. PostgreSQL database integration
2. Neon PostgreSQL compatibility
3. Drizzle ORM
4. Database migrations
5. User authentication
6. Protected application routes
7. User preferences
8. Server-side authorization foundations
9. Secure environment variable handling
10. Database health verification
11. Initial authenticated user onboarding
12. Data ownership tests

At the end of Phase 2:

- A user can register.
- A user can log in.
- A user can log out.
- Protected Iponly pages require authentication.
- Authenticated users have isolated accounts.
- User preferences are stored in PostgreSQL.
- Database migrations run successfully.
- The application can be deployed to Vercel using Neon PostgreSQL.
- Phase 1 fixture data remains available only as clearly identified demo UI data.
- Real Savings, Debt, Budget, and Travel records are not yet created through the UI.

Do not implement the full financial modules in this phase.

==================================================
FEATURES DEFERRED TO LATER PHASES
==================================================

Do NOT implement the following yet:

- Real savings account management
- Savings deposits and withdrawals
- Account transfers
- Debt creation
- Installment schedule generation
- Debt payment recording
- Monthly budget creation
- Expense tracking
- Travel-plan persistence
- Travel expenses
- Financial analytics based on real records
- Iponly AI
- AI provider integration
- AI-generated financial actions
- Service worker
- Advanced offline support
- Push notifications
- Bank integrations
- Receipt scanning
- Currency conversion APIs
- Social authentication unless explicitly required
- Multi-user household accounts

Phase 2 is strictly for database, authentication, authorization, user preferences, onboarding, and deployment foundations.

==================================================
STEP 1 - INSPECT THE EXISTING PROJECT
==================================================

Before changing any code:

1. Inspect the complete project structure.
2. Review package.json.
3. Identify the installed Next.js version.
4. Identify the installed React version.
5. Confirm whether App Router is being used.
6. Review the current root layout.
7. Review route groups and pages.
8. Review the application shell.
9. Review the mobile bottom navigation.
10. Review the desktop sidebar.
11. Review existing TypeScript configuration.
12. Review environment variable handling.
13. Review existing domain types.
14. Review money utilities.
15. Review fixture data.
16. Review tests and testing configuration.
17. Check whether an authentication library is already installed.
18. Check whether Drizzle ORM is already installed.
19. Check whether any database client is already configured.
20. Check whether Zod is already installed.

Do not assume a dependency is missing.

Do not reinstall existing dependencies.

Do not replace working Phase 1 components or configurations unnecessarily.

Before implementation, provide a concise implementation plan containing:

- Existing relevant architecture
- Authentication approach
- Database approach
- Dependencies to install
- Files to create
- Files to modify
- Environment variables required
- Database schema to introduce
- Migration strategy
- Tests to add

After presenting the plan, proceed with implementation without waiting for confirmation.

==================================================
STEP 2 - CHOOSE THE AUTHENTICATION APPROACH
==================================================

First inspect whether the project already has an authentication system.

If authentication already exists:

- Reuse it.
- Do not install a competing authentication library.
- Validate whether it supports the required session and user ownership rules.
- Make only the changes necessary for Iponly.

If authentication does not exist:

Use a stable authentication solution that works with:

- Next.js App Router
- TypeScript
- PostgreSQL
- Drizzle ORM
- Server Components
- Server Actions or Route Handlers
- Vercel deployment

Prefer the authentication solution already specified in the project or agent instructions.

Do not introduce multiple authentication systems.

For Phase 2, implement email and password authentication.

Social login is optional and should not be added unless it is already part of the existing project.

==================================================
AUTHENTICATION REQUIREMENTS
==================================================

Implement:

- User registration
- User login
- User logout
- Secure session management
- Protected application routes
- Authenticated server-side user retrieval
- Authentication error handling
- Logged-in user display
- Session expiration handling
- Redirects for protected and public routes

Public pages:

- Login
- Registration
- Any explicitly public landing page

Protected pages:

- Home dashboard
- Savings
- Budget
- Debt
- Travel
- Analytics
- Settings
- Onboarding

Unauthenticated visitors attempting to access protected pages should be redirected to the login page.

Authenticated users attempting to open login or registration should be redirected to the main application or onboarding when appropriate.

==================================================
PASSWORD SECURITY
==================================================

Use the password-handling behavior recommended by the selected authentication library.

Never:

- Store plaintext passwords
- Log passwords
- Return password hashes to the client
- Expose password hashes in API responses
- Store passwords in localStorage
- Store passwords in cookies
- Include passwords in application logs
- Include passwords in query parameters

Apply reasonable validation to registration passwords according to the selected authentication system.

Display clear validation messages without exposing sensitive implementation details.

==================================================
STEP 3 - INSTALL DATABASE DEPENDENCIES
==================================================

Use:

- PostgreSQL
- Neon-compatible database driver
- Drizzle ORM
- Drizzle Kit

Before installing anything:

1. Inspect package.json.
2. Verify the package is not already installed.
3. Verify compatibility with the installed Next.js version.
4. Install only necessary packages.
5. Avoid database clients that duplicate existing functionality.

Add development dependencies separately when appropriate.

Do not expose the database connection string to browser code.

==================================================
STEP 4 - CONFIGURE ENVIRONMENT VARIABLES
==================================================

Create or update the appropriate example environment file.

Use placeholders only.

Never commit actual credentials.

Expected environment variables may include:

DATABASE_URL
AUTH_SECRET
NEXT_PUBLIC_APP_URL

The exact authentication variables may differ depending on the selected authentication library.

Requirements:

- Validate required server environment variables.
- Fail with a clear server-side configuration error when required values are missing.
- Do not import server-only environment values into Client Components.
- Never prefix secrets with NEXT_PUBLIC_.
- Do not print secrets to logs.
- Keep `.env.local` excluded from version control.
- Document the variables in `.env.example`.

Example:

DATABASE_URL="postgresql://username:password@host/database?sslmode=require"
AUTH_SECRET="replace-with-a-secure-secret"
NEXT_PUBLIC_APP_URL="http://localhost:3000"

The example must not contain real credentials.

If the selected authentication library requires additional environment variables, add clearly named placeholders.

==================================================
STEP 5 - CONFIGURE DRIZZLE ORM
==================================================

Create a centralized database configuration.

Suggested structure:

src/
├── db/
│   ├── index.ts
│   ├── schema/
│   │   ├── auth.ts
│   │   └── users.ts
│   └── migrations/

Root:
├── drizzle.config.ts

Requirements:

- Export one reusable database client.
- Keep connection initialization in server-only code.
- Do not create database connections inside React components.
- Do not expose the database client to browser code.
- Organize schema files by domain.
- Use explicit table relationships.
- Create indexes for frequently queried ownership and identity fields.
- Use timestamps consistently.
- Keep schema naming consistent.

If the authentication library generates or requires its own schema, follow its supported integration pattern instead of manually creating conflicting tables.

==================================================
STEP 6 - CREATE THE USER SCHEMA
==================================================

Create the required authentication tables based on the selected authentication library.

The authenticated user model should support at least:

- id
- name
- email
- email verification status when supported
- image/avatar URL when supported
- createdAt
- updatedAt

Email must be unique.

Use secure, non-sequential identifiers when supported by the chosen stack.

Do not expose unnecessary authentication fields to the client.

If the library requires tables such as:

- users
- sessions
- accounts
- verification tokens

create them according to the official library integration pattern.

Do not invent incompatible authentication columns.

==================================================
STEP 7 - CREATE USER PREFERENCES
==================================================

Create a user preferences table.

Suggested fields:

- id
- userId
- defaultCurrencyCode
- locale
- timezone
- theme
- firstDayOfWeek
- onboardingCompleted
- createdAt
- updatedAt

Default values for Iponly:

defaultCurrencyCode:
PHP

locale:
en-PH

timezone:
Asia/Manila

theme:
system

firstDayOfWeek:
monday

onboardingCompleted:
false

Add a unique constraint so each user has only one preference record.

Establish the correct relationship between users and user preferences.

Deleting a user should follow the authentication library's expected behavior. Do not add destructive cascading behavior without understanding its consequences.

==================================================
STEP 8 - USER CREATION WORKFLOW
==================================================

When a new user successfully registers:

1. Create the authentication user.
2. Create default Iponly user preferences.
3. Set default currency to PHP.
4. Set locale to en-PH.
5. Set timezone to Asia/Manila.
6. Set theme to system.
7. Set onboardingCompleted to false.

Use an atomic or reliable workflow.

Do not leave users in a partially initialized state without handling the failure.

If the authentication library controls registration callbacks or hooks, use its supported mechanism.

Do not duplicate user records.

Make the initialization operation idempotent where practical.

==================================================
STEP 9 - CREATE AUTHENTICATION PAGES
==================================================

Create or update:

/login
/register

Use the Phase 1 Iponly design system.

The pages should display:

Iponly
"Ipon. Budget. Bayad. Gala."

Keep the UI:

- Mobile-first
- Friendly
- Simple
- Trustworthy
- Accessible
- Consistent with the existing application

==================================================
LOGIN PAGE
==================================================

Include:

- Email
- Password
- Show/hide password control
- Log In button
- Link to registration
- Loading state
- Invalid-credentials state
- General error state

Optional supporting text:

"Welcome back. Let's check your ipon."

Do not reveal whether an account exists through overly specific authentication errors if the selected authentication library recommends a generic message.

==================================================
REGISTRATION PAGE
==================================================

Include:

- Name
- Email
- Password
- Password confirmation
- Show/hide password control
- Create Account button
- Link to login
- Loading state
- Validation feedback
- Registration error state

Optional supporting text:

"Start organizing your ipon, budget, bayarin, and travel plans."

Use React Hook Form and Zod if they are already part of the project.

Validate on both client and server where appropriate.

Never rely exclusively on client-side validation.

==================================================
STEP 10 - CREATE ROUTE GROUPS
==================================================

Organize routes clearly.

Suggested structure:

src/app/
├── (auth)/
│   ├── login/
│   │   └── page.tsx
│   ├── register/
│   │   └── page.tsx
│   └── layout.tsx
│
├── (protected)/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── savings/
│   ├── budget/
│   ├── debt/
│   ├── travel/
│   ├── analytics/
│   ├── settings/
│   └── onboarding/
│
└── layout.tsx

Adapt this structure to the current repository.

Do not reorganize the entire project when the same result can be achieved with smaller changes.

Preserve working routes and navigation.

==================================================
STEP 11 - PROTECT THE APPLICATION
==================================================

Enforce authentication on the server.

Do not rely only on:

- Hidden navigation links
- Client-side redirects
- React state
- Browser localStorage

Use the selected authentication library's supported server-side approach.

Every protected layout or server operation must be able to obtain the currently authenticated user.

Create a reusable server-only helper such as:

requireUser()
getCurrentUser()
getCurrentSession()

Exact naming can follow the existing project conventions.

Expected behavior:

- `getCurrentUser()` can return no user.
- `requireUser()` redirects or throws when authentication is missing.
- Server Actions and Route Handlers can securely resolve the user's ID.

Never accept an authoritative user ID from client input.

==================================================
STEP 12 - USER ONBOARDING
==================================================

Create:

/onboarding

Show onboarding only to authenticated users whose preferences indicate:

onboardingCompleted = false

Create a short onboarding experience.

Collect:

1. Display name, if it is not already available
2. Default currency
3. Timezone
4. Preferred theme

Default suggestions:

Currency:
PHP - Philippine Peso

Timezone:
Asia/Manila

Theme:
System

Do not collect sensitive financial information during Phase 2.

Do not create savings, debt, budget, or travel records yet.

On completion:

- Validate the request.
- Update the authenticated user's preference record.
- Set onboardingCompleted to true.
- Redirect to the dashboard.

The update must use the authenticated session's user ID.

Do not accept userId from the submitted form.

==================================================
STEP 13 - UPDATE THE APPLICATION SHELL
==================================================

Replace the Phase 1 demo user area with authenticated user information.

Display where appropriate:

- User name
- Email
- Avatar or initials
- Settings link
- Logout action

Do not expose:

- Session token
- Database user ID unnecessarily
- Authentication provider IDs
- Internal account metadata

Keep mobile and desktop layouts responsive.

Ensure logout works from both appropriate mobile and desktop locations.

==================================================
STEP 14 - UPDATE SETTINGS
==================================================

Connect the Phase 1 Settings page to real user preferences.

Implement the following settings:

- Display name, if supported safely
- Default currency
- Locale
- Timezone
- Theme
- First day of week

For Phase 2:

- PHP must be available.
- en-PH must be available.
- Asia/Manila must be available.
- Light, dark, and system themes should be available.

Persist settings in PostgreSQL.

Every update must:

1. Resolve the authenticated user.
2. Validate input with Zod.
3. Update only the authenticated user's preference record.
4. Return a safe success or error result.
5. Never expose raw database errors to the browser.

Use an accessible saved status or toast.

==================================================
STEP 15 - THEME PERSISTENCE
==================================================

Connect the existing Phase 1 theme UI to the authenticated user's saved preference when practical.

Supported values:

- light
- dark
- system

Avoid flashing the incorrect theme during page load where possible.

If a theme library already exists, reuse it.

Do not install a competing theme library unnecessarily.

Ensure the application remains usable when preference loading fails.

==================================================
STEP 16 - HANDLE PHASE 1 FIXTURE DATA
==================================================

Do not present synthetic Phase 1 financial data as the authenticated user's real information.

Choose one clear approach:

Preferred approach:

- Show clearly labeled "Demo Preview" sections until financial module phases are implemented.

Alternative approach:

- Show empty financial states for authenticated users.
- Keep fixture data available only in development or Storybook-style previews.

Never write fixture financial data into production user accounts automatically.

Do not seed fake debts, savings, budgets, or trips for every registered user.

Do not make demo amounts appear to belong to a real authenticated user without a clear label.

The authenticated dashboard may show empty states such as:

"No savings accounts yet."

"No debts added yet."

"No monthly budget yet."

"No trips planned yet."

It may also include disabled or informational cards indicating that module implementation will occur in later phases.

==================================================
STEP 17 - CREATE SERVER-SIDE PREFERENCE SERVICES
==================================================

Follow the preferred architecture:

UI
→ Server Action or Route Handler
→ Zod validation
→ Service
→ Repository
→ Drizzle
→ PostgreSQL

Suggested files:

src/actions/preferences.ts
src/services/preferences-service.ts
src/repositories/preferences-repository.ts
src/lib/validations/preferences.ts

Responsibilities:

Server Action:
- Resolve authenticated user
- Parse form data
- Call validation
- Call service
- Return safe result

Service:
- Apply business rules
- Normalize locale, timezone, currency, and theme
- Call repository

Repository:
- Perform Drizzle queries
- Require a user scope
- Return typed records

Do not place direct Drizzle calls in Client Components.

==================================================
STEP 18 - DATABASE OWNERSHIP FOUNDATIONS
==================================================

Create reusable patterns for user-owned records.

Even though full financial tables are deferred, establish the ownership conventions that later phases must use.

Rules:

- Every financial table will include userId.
- Every read will be scoped to userId.
- Every update will include both recordId and userId.
- Every delete or archive will include both recordId and userId.
- A record ID alone must never authorize access.
- AI tools will later resolve userId from the session, never model arguments.

Create documentation or a typed code pattern demonstrating the expected repository method shape.

Example pattern:

findByIdForUser(recordId, userId)
updateForUser(recordId, userId, input)
archiveForUser(recordId, userId)

Do not create placeholder financial tables solely to demonstrate this pattern.

==================================================
STEP 19 - DATABASE MIGRATIONS
==================================================

Configure migration generation and execution.

Add package scripts appropriate to the selected Drizzle configuration.

Possible script categories:

- Generate migration
- Apply migration
- Open database studio
- Validate schema

Use names consistent with the existing project.

Do not add commands that do not work with the installed dependencies.

Requirements:

- Generate an initial migration.
- Review the generated SQL.
- Ensure expected auth and preference tables are present.
- Ensure unique constraints are present.
- Ensure userId relationships are present.
- Ensure indexes are present where useful.
- Apply the migration to the configured development database.
- Confirm that the migration is repeatable and tracked in version control.

Do not use schema push as the only production migration strategy.

If schema push is used during local prototyping, still preserve a proper migration workflow for deployment.

==================================================
STEP 20 - DATABASE HEALTH CHECK
==================================================

Create a safe server-side database connectivity check.

It may be implemented as:

- A development-only script
- A protected health route
- A server utility
- A deployment check

Do not expose:

- DATABASE_URL
- Database hostname unnecessarily
- Username
- Password
- Connection details
- Raw SQL errors

A safe successful response may include:

- Status
- Database reachable boolean
- Timestamp

A safe failure should return a generic message while logging an appropriately sanitized server-side error.

Do not expose a public endpoint containing sensitive diagnostic details.

==================================================
STEP 21 - VERCEL AND NEON DEPLOYMENT READINESS
==================================================

Prepare the project for deployment to Vercel with Neon PostgreSQL.

Document the expected deployment process in the project README or deployment documentation.

Include:

1. Create or select a Neon PostgreSQL database.
2. Obtain the appropriate PostgreSQL connection string.
3. Add DATABASE_URL to local `.env.local`.
4. Add DATABASE_URL to the Vercel project's environment variables.
5. Add authentication secrets.
6. Add the application URL.
7. Run or apply production migrations safely.
8. Deploy the Next.js application.
9. Verify registration.
10. Verify login.
11. Verify logout.
12. Verify protected route behavior.
13. Verify onboarding.
14. Verify settings persistence.

Do not store production secrets in the repository.

Do not include real secret values in documentation.

Where environment variables differ between:

- Development
- Preview
- Production

document the distinction clearly.

==================================================
STEP 22 - ERROR HANDLING
==================================================

Implement safe errors for:

- Database unavailable
- Invalid credentials
- Duplicate email
- Invalid registration data
- Expired session
- Missing preference record
- Failed onboarding update
- Failed settings update
- Missing environment variable
- Unauthorized access

User-facing errors should be clear but must not reveal:

- SQL statements
- Table names unnecessarily
- Stack traces
- Password hashes
- Authentication tokens
- Database credentials
- Internal server paths

Log server-side errors in a sanitized way.

==================================================
STEP 23 - ACCESSIBILITY
==================================================

Authentication and onboarding must support:

- Semantic form elements
- Visible labels
- Keyboard navigation
- Visible focus indicators
- Accessible validation messages
- Password show/hide control with an accessible label
- Loading states that do not trap the user
- Error summaries where appropriate
- aria-live feedback for login and save results
- Sufficient color contrast
- Touch-friendly controls

Do not rely only on placeholder text as the field label.

Do not rely only on color to show validation errors.

==================================================
STEP 24 - SECURITY REQUIREMENTS
==================================================

Apply the following security rules:

- No plaintext passwords
- No secrets in browser bundles
- No secrets in logs
- No secrets committed to Git
- No authoritative userId accepted from the browser
- No authorization based only on hidden UI
- No unprotected settings updates
- No detailed database errors returned to clients
- No fixture financial data written to registered accounts
- No authentication tokens stored in localStorage unless explicitly required by the selected authentication system and safely supported
- No open redirect from unvalidated callback URLs
- No HTML injection from user profile values
- No raw SQL constructed from user input
- No arbitrary database query endpoint

Use secure cookie behavior supported by the authentication system.

Use safe redirect validation.

Treat names and profile content as untrusted input when rendering.

==================================================
STEP 25 - AUTHENTICATION TESTS
==================================================

Add appropriate tests for:

- Successful registration
- Registration with invalid email
- Registration with mismatched passwords
- Registration with duplicate email
- Successful login
- Invalid login
- Successful logout
- Unauthenticated access to protected route
- Authenticated access to protected route
- Authenticated access to login page
- New user default preference creation
- New user onboarding redirect
- Completed user dashboard redirect
- Settings update by authenticated user
- Settings update without authentication

Use the existing testing tools.

Do not add multiple overlapping testing frameworks.

==================================================
STEP 26 - AUTHORIZATION TESTS
==================================================

Authorization and user isolation are mandatory.

Create at least two test users.

Verify:

- User A can read User A's preferences.
- User B can read User B's preferences.
- User A cannot read User B's preferences.
- User A cannot update User B's preferences.
- User B cannot update User A's preferences.
- Changing an ID in a request does not bypass authorization.
- Omitting userId from browser data does not prevent server-side ownership resolution.
- Sending a forged userId is ignored or rejected.

Do not consider Phase 2 complete without testing user isolation.

==================================================
STEP 27 - DATABASE TESTS
==================================================

Where the project testing setup permits, test:

- Preference record creation
- Default preference values
- Unique preference record per user
- Preference update
- User relationship
- Invalid theme rejection
- Invalid currency rejection
- Invalid locale rejection
- Invalid timezone rejection
- Duplicate user initialization behavior
- Migration success

Do not test against the production database.

Use an isolated test database or supported test strategy.

==================================================
STEP 28 - VERIFY EXISTING PHASE 1 FEATURES
==================================================

Ensure Phase 2 does not break:

- Responsive application shell
- Mobile bottom navigation
- Desktop sidebar
- Dashboard layout
- Savings page
- Budget page
- Debt page
- Travel page
- Analytics page
- Settings page
- Theme behavior
- Money formatting
- Charts
- Empty states
- Mobile responsiveness

Update navigation links only where necessary for protected route organization.

Do not remove Phase 1 components just because their data is still fictional.

Clearly separate demo data from real authenticated data.

==================================================
STEP 29 - VALIDATION COMMANDS
==================================================

After implementation, inspect package.json and run the relevant existing commands for:

- Type checking
- Linting
- Unit tests
- Integration tests
- End-to-end tests
- Production build
- Migration generation
- Migration application
- Database connectivity verification

Do not invent script names.

Use the scripts actually present in package.json.

Fix errors introduced by Phase 2.

Do not hide problems using:

- any
- @ts-ignore
- @ts-nocheck
- Disabled lint rules
- Skipped authorization tests
- Commented-out failing tests

If an issue cannot be fixed without external credentials, report the exact validation that could not run and why.

==================================================
STEP 30 - DOCUMENTATION
==================================================

Update the README or appropriate project documentation.

Document:

- Phase 2 architecture
- Authentication approach
- Database provider
- Drizzle configuration
- Environment variables
- Local setup
- Migration commands
- Development commands
- Test commands
- Deployment setup
- Security requirements
- User ownership pattern
- Features intentionally deferred

Do not include real credentials.

Provide copyable placeholder examples.

==================================================
STEP 31 - PHASE 2 COMPLETION REPORT
==================================================

After implementation, provide a concise report containing:

1. Existing project inspected

2. Authentication solution selected

3. Database solution configured

4. Schema and tables created

5. Migrations generated and applied

6. Pages created or updated

7. Server utilities created

8. Environment variables required

9. Dependencies installed

10. Tests created

11. Commands executed

12. Type-check status

13. Lint status

14. Test status

15. Build status

16. Migration status

17. Database connectivity status

18. Security and authorization checks completed

19. Known limitations

20. Items deferred to Phase 3

Be transparent about validations that could not run because external environment variables or credentials were unavailable.

==================================================
PHASE 2 DEFINITION OF DONE
==================================================

Phase 2 is complete when:

- PostgreSQL connectivity is configured.
- The application is compatible with Neon PostgreSQL.
- Drizzle ORM is configured.
- Database schema files exist.
- Initial migrations exist.
- Migrations can be applied successfully.
- Email/password registration works.
- Login works.
- Logout works.
- Sessions work.
- Protected routes reject unauthenticated users.
- Authenticated users can access the application.
- New users receive default preferences.
- New users complete onboarding.
- User preferences persist in PostgreSQL.
- Settings can update user preferences.
- The authenticated user's identity appears in the application shell.
- Server-side authorization resolves user identity from the session.
- User A cannot access or modify User B's data.
- Fixture financial data is clearly labeled or replaced with empty states.
- No fixture financial records are silently inserted into real accounts.
- Environment variables are documented safely.
- Secrets are not committed.
- Type checking passes.
- Linting passes.
- Existing tests pass.
- New authentication and authorization tests pass.
- Production build passes.
- Existing Phase 1 responsive UI remains functional.

Do not proceed to Phase 3 automatically.

Stop after Phase 2 is implemented, validated, documented, and summarized.