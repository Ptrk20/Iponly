Implement Phase 1 of Iponly.

Iponly is a mobile-first personal finance Progressive Web App for Filipinos.

Tagline:

"Ipon. Budget. Bayad. Gala."

Follow all architecture, coding standards, financial rules, security principles, and product guidelines defined in the project's agent instructions.

==================================================
PHASE 1 GOAL
==================================================

Build the frontend foundation and application shell for Iponly.

At the end of Phase 1, I should have a polished and responsive frontend prototype that demonstrates how the application will look and navigate, using fixture/mock data only.

DO NOT implement yet:

- PostgreSQL
- Neon
- Drizzle ORM
- Authentication
- Server Actions for financial mutations
- AI APIs
- Iponly AI backend
- Service worker/offline functionality
- Production persistence
- Real financial transactions

These belong to later phases.

Phase 1 should establish a clean architecture that later phases can extend without requiring a major frontend rewrite.

==================================================
STEP 1 - INSPECT THE PROJECT
==================================================

Before changing anything:

1. Inspect the existing project structure.
2. Inspect package.json.
3. Determine the installed Next.js version.
4. Check whether the project is using App Router.
5. Check the installed React version.
6. Inspect the current Tailwind CSS setup.
7. Check whether shadcn/ui is already configured.
8. Check whether Lucide React is installed.
9. Check whether Recharts is installed.
10. Check whether date-fns is installed.
11. Review existing global CSS.
12. Review existing application layouts and pages.
13. Review any existing components, utilities, hooks, and types.

Do not assume a package is installed.

Do not reinstall an existing dependency.

Do not replace working project configuration unnecessarily.

Before implementation, provide a concise summary of:

- Existing stack
- Existing relevant files
- Dependencies that need to be added
- Files you plan to create
- Files you plan to modify

Then proceed with the implementation.

==================================================
STEP 2 - ESTABLISH THE IPONLY DESIGN SYSTEM
==================================================

Create a clean and modern fintech visual identity.

Iponly should feel:

- Modern
- Friendly
- Trustworthy
- Simple
- Calm
- Filipino
- Financially clear
- Mobile-first

Do NOT make Iponly look like:

- Enterprise accounting software
- A corporate banking portal
- A crypto trading platform
- An overly playful children's application

Use a polished fintech aesthetic.

PRIMARY COLOR

Use an emerald/green palette as the main brand color.

Suggested direction:

Primary:
Emerald

Success:
Green

Warning:
Amber

Danger:
Red

Information:
Blue

Use warm/off-white neutral backgrounds in light mode.

Use dark slate surfaces rather than absolute black in dark mode.

Colors should support both light and dark themes.

Do not hard-code colors repeatedly throughout individual components.

Use centralized Tailwind/theme variables.

==================================================
TYPOGRAPHY
==================================================

Use clean, highly readable typography.

Establish clear hierarchy for:

- Page titles
- Section titles
- Card titles
- Important monetary values
- Supporting text
- Labels
- Form values
- Navigation labels

Financial amounts should be especially easy to scan.

Example:

Total Savings
₱125,500.00

The monetary value should visually dominate the supporting label.

==================================================
SPACING AND SHAPE
==================================================

Use:

- Consistent spacing
- Clean cards
- Rounded corners
- Subtle shadows
- Clear visual grouping
- Comfortable mobile padding
- Large touch targets

Keep interfaces uncluttered.

Avoid excessive borders and excessive shadows.

==================================================
STEP 3 - CREATE SHARED MONEY UTILITIES
==================================================

Create centralized money utilities.

Suggested location:

src/lib/money.ts

Money should internally follow the project's integer minor-unit convention.

Example:

₱500.00 -> 50000
₱1,250.75 -> 125075

Create utilities similar to:

formatMoney()
majorToMinor()
minorToMajor()
parseMoneyInput()
addMoney()
subtractMoney()
calculatePercentage()

PHP should be the default formatting currency for Phase 1.

Example output:

₱1,250.00

Do not expose raw floating-point calculations as authoritative financial values.

Write unit tests for the money utilities if the testing infrastructure already exists.

==================================================
STEP 4 - CREATE CORE TYPES
==================================================

Create frontend/domain types needed for fixture data.

Suggested location:

src/types/

Create types for:

FinancialAccount
AccountTransaction
SavingsGoal
Debt
Installment
MonthlyBudget
BudgetCategory
BudgetAllocation
ExpenseTransaction
Trip
TravelExpense
TravelTodo
ItineraryItem

Keep these types domain-focused rather than UI-specific.

Include currencyCode where monetary information requires it.

Do not create database-specific types yet.

==================================================
STEP 5 - CREATE FIXTURE DATA
==================================================

Create realistic but clearly synthetic Philippine financial data.

Suggested location:

src/data/fixtures/

Create fixture data for:

Savings accounts
Debts
Installments
Monthly budget
Budget categories
Expenses
Trips
Travel expenses
Recent transactions

Example accounts may include:

- BDO Savings
- Maya Savings
- GCash
- Emergency Fund
- Travel Fund

Example debts may include:

- Laptop Installment
- Smartphone Installment
- Credit Card Balance

Use Philippine Peso values.

Example monthly salary:

₱50,000.00

Example categories:

Housing
Utilities
Groceries
Transportation
Insurance
Healthcare
Debt Payments
Savings
Family Support
Subscriptions
Dining
Shopping
Entertainment
Travel
Other

Create a sample trip such as:

Japan 2027

All data must be clearly fixture/demo data.

Do not connect anything to persistent storage.

==================================================
STEP 6 - APPLICATION SHELL
==================================================

Create the main Iponly application shell.

The layout must work well on:

Mobile:
360px to 430px

Tablet

Desktop

The application shell should contain:

- Brand/logo area
- Main content area
- Navigation
- User/profile affordance placeholder
- Notification affordance placeholder
- Responsive layout

==================================================
MOBILE NAVIGATION
==================================================

Use a persistent bottom navigation.

Suggested primary navigation:

Home
Savings
Budget
Debt
Travel

Use Lucide React icons.

Suggested mapping:

Home -> House
Savings -> PiggyBank
Budget -> ChartPie
Debt -> CreditCard
Travel -> Plane

Each navigation item should contain:

Icon
Label
Active state

Touch targets should be comfortable on mobile.

The bottom navigation should not cover page content.

==================================================
DESKTOP NAVIGATION
==================================================

Switch to a sidebar on larger desktop screens.

Sidebar should contain:

Iponly branding

Home
Savings
Budget
Debt
Travel

Then place near the bottom:

Analytics
Settings

Do not display both the mobile and desktop navigation simultaneously when inappropriate.

==================================================
STEP 7 - BRANDING
==================================================

Display:

Iponly

and where appropriate:

"Ipon. Budget. Bayad. Gala."

Do not overuse the tagline.

Create a simple temporary logo mark using typography and/or an existing Lucide icon.

Do NOT generate complex SVG artwork or add external logo dependencies in Phase 1.

Structure the branding so a custom Iponly logo can replace the temporary mark later.

==================================================
STEP 8 - DASHBOARD
==================================================

Build the primary Home dashboard.

Create a welcoming header.

Example:

Good morning, Patrick

Include supporting text such as:

"Here's your money overview."

Do not hard-code Patrick deeply into reusable components.

Store the demo profile information with the fixture/demo data so authentication can replace it later.

==================================================
FINANCIAL SUMMARY
==================================================

Create summary cards for:

Total Savings
Outstanding Debt
Monthly Budget Remaining
Next Installment

Cards should provide:

Label
Formatted amount
Relevant supporting information
Icon
Optional trend/status

Example:

Total Savings
₱125,500

+₱5,000 this month

==================================================
BUDGET OVERVIEW
==================================================

Add a budget overview.

Show:

Monthly Income
Budget Allocated
Actual Spending
Remaining Budget

Include an accessible progress visualization showing budget usage.

Example:

Budget Used

████████░░

78%

Do not implement this visualization using text characters.

Use proper CSS or the existing component library.

==================================================
SAVINGS OVERVIEW
==================================================

Create a compact savings overview.

Display:

Total savings

Then several accounts such as:

BDO Savings
Maya Savings
Emergency Fund

Show each balance.

Include a:

"View Savings"

action.

==================================================
DEBT OVERVIEW
==================================================

Create an installment/debt overview.

Show:

Outstanding debt
Amount due this month
Next payment date

Add a list of upcoming installments.

Example:

Laptop Installment
₱5,000
Due Nov 15

Phone Installment
₱2,500
Due Nov 21

Include clear status badges.

==================================================
SPENDING OVERVIEW
==================================================

Add spending-by-category visualization using Recharts if available or appropriate.

Use a donut or bar chart.

Example categories:

Housing
Groceries
Transportation
Dining
Debt
Savings
Other

Charts must:

- Be responsive
- Fit mobile widths
- Have accessible information
- Have readable legends
- Handle empty datasets
- Not create horizontal scrolling

==================================================
RECENT ACTIVITY
==================================================

Create a recent activity section.

Example transactions:

Salary
+₱50,000

Maya Savings
-₱5,000

Groceries
-₱2,350

Laptop Installment
-₱5,000

Use visually distinct indicators for:

Income
Expense
Savings
Debt payment

Do not rely solely on color.

==================================================
TRAVEL OVERVIEW
==================================================

Create a compact travel card.

Example:

Japan 2027

Show:

Trip dates
Travel budget
Amount saved/planned
Remaining travel budget
Planning status

Add:

"View Trip"

action.

==================================================
STEP 9 - SAVINGS PAGE
==================================================

Create:

/savings

Use fixture data.

Show:

Total Savings
Savings Goal
Goal Progress
Financial Accounts

Each account card should display:

Account Name
Institution/Type
Balance
Currency
Optional goal

Example:

Maya Savings

₱25,000.00

Also display recent savings transactions.

Add UI buttons such as:

Add Account
Add Money
Transfer

These can be non-persistent UI placeholders in Phase 1.

If interaction is implemented, update temporary client-side fixture state only.

Do not create a backend.

==================================================
STEP 10 - BUDGET PAGE
==================================================

Create:

/budget

Show:

Current Month
Monthly Income
Total Allocated
Actual Spending
Remaining Budget

Include:

Budget utilization
Category allocation
Actual category spending
Remaining category budget

Create a visualization for:

"Where your money goes"

Use sample categories.

Provide responsive charts.

Add UI placeholders for:

Add Income
Add Expense
Edit Budget

No persistent modifications yet.

==================================================
STEP 11 - DEBT PAGE
==================================================

Create:

/debt

Show:

Total Outstanding
Due This Month
Next Payment
Active Debts

Each debt card should show:

Debt Name
Creditor
Original Amount
Remaining Balance
Regular Installment
Next Due Date
Progress
Status

Example:

Laptop Installment

Original:
₱60,000

Remaining:
₱40,000

Monthly:
₱5,000

8 installments remaining

Next payment:
Nov 15

Add UI placeholders:

Add Debt
Record Payment

No persistent modifications yet.

==================================================
STEP 12 - TRAVEL PAGE
==================================================

Create:

/travel

Show:

Upcoming Trips
Travel Budget
Planned Expenses
Actual Expenses

Use sample:

Japan 2027

Create navigation/tabs or sections for:

Overview
Expenses
Itinerary
To-dos
Packing

For itinerary fixture data, create something similar to:

Day 1
Arrival and hotel check-in

Day 2
Tokyo sightseeing

Day 3
Day trip

Create travel expense categories.

Example:

Flights
Hotel
Transportation
Food
Activities
Shopping

Add placeholder actions:

Add Expense
Add Itinerary
Add To-do

Do not persist anything.

==================================================
STEP 13 - ANALYTICS PAGE
==================================================

Create:

/analytics

Use fixture data to demonstrate future analytics.

Include:

Savings Trend

Income vs Spending

Budget by Category

Debt Repayment Progress

Monthly Spending Trend

Use Recharts where appropriate.

Allow layouts to collapse gracefully on mobile.

Do not build complicated analytics calculations yet.

Phase 1 analytics are primarily for establishing the visual system and component architecture.

==================================================
STEP 14 - SETTINGS PAGE
==================================================

Create:

/settings

Create frontend placeholders for:

Profile
Default Currency
PHP

Theme
Light / Dark / System

Notifications

Financial Preferences

Data & Privacy

Do not implement authentication or database persistence.

Theme selection may be implemented locally if a theme solution is already present.

==================================================
STEP 15 - REUSABLE COMPONENTS
==================================================

Extract reusable components where appropriate.

Examples:

AppShell
Sidebar
BottomNavigation
PageHeader
SummaryCard
MoneyDisplay
ProgressBar
EmptyState
StatusBadge
TransactionItem
AccountCard
DebtCard
BudgetCategoryRow
TripCard
SectionHeader
ChartCard

Do not over-engineer components that are only used once.

==================================================
STEP 16 - LOADING, EMPTY AND ERROR STATES
==================================================

Create reusable visual states.

Even though Phase 1 uses fixture data, important pages should demonstrate how they behave with no data.

Examples:

No savings accounts yet

"No savings accounts yet.
Add your first account to start tracking your ipon."

No debts:

"No active debts.
You're debt-free here, or you haven't added one yet."

No trips:

"No trips planned.
Start planning your next gala."

Keep Filipino personality subtle and natural.

==================================================
STEP 17 - ACCESSIBILITY
==================================================

Ensure:

Semantic HTML

Accessible button elements

Visible keyboard focus

Accessible labels

Screen-reader-friendly chart descriptions

Good contrast

Large enough touch targets

No functionality dependent exclusively on color

Use reduced-motion preferences where animations exist.

==================================================
STEP 18 - RESPONSIVENESS
==================================================

Verify layouts at approximately:

360px
390px
430px
768px
1024px
1440px

Do not assume desktop-only dimensions.

At small mobile sizes:

- No horizontal page scrolling
- Charts fit properly
- Cards remain readable
- Navigation remains usable
- Financial values do not overflow
- Buttons remain accessible
- Text does not overlap

==================================================
STEP 19 - PERFORMANCE
==================================================

Prefer React Server Components where appropriate.

Use client components only when client-side interactivity requires them.

Do not mark large page trees with "use client" unnecessarily.

Avoid unnecessary state.

Avoid unnecessary dependencies.

Do not prematurely optimize fixture data.

==================================================
STEP 20 - TESTING
==================================================

If testing libraries already exist, implement relevant Phase 1 tests.

At minimum test important pure utilities such as:

majorToMinor()
minorToMajor()
formatMoney()
addMoney()
subtractMoney()
calculatePercentage()

If Playwright already exists, create basic smoke tests for:

/
 /savings
 /budget
 /debt
 /travel
 /analytics
 /settings

Verify pages render without critical errors.

Do not add an excessive test framework solely for Phase 1 if the project has no testing infrastructure yet.

Instead, document the testing setup recommended for the later testing phase.

==================================================
STEP 21 - VALIDATION
==================================================

When implementation is complete:

Run the appropriate existing commands for:

Type checking
Linting
Build
Tests

Do not assume command names.

Inspect package.json scripts first.

Fix errors introduced by Phase 1.

Do not hide TypeScript errors using:

any
@ts-ignore
@ts-nocheck

unless absolutely unavoidable and explicitly justified.

==================================================
STEP 22 - PHASE 1 COMPLETION REPORT
==================================================

After implementation, provide a concise report containing:

1. Features completed

2. Files created

3. Important files modified

4. New dependencies installed

5. Design decisions

6. Tests performed

7. Build/type/lint status

8. Known limitations

9. Items intentionally deferred to Phase 2

==================================================
PHASE 1 DEFINITION OF DONE
==================================================

Phase 1 is complete when:

- Iponly has a polished application shell.
- Mobile bottom navigation works.
- Desktop sidebar works.
- Home dashboard is functional with fixture data.
- Savings page exists.
- Budget page exists.
- Debt page exists.
- Travel page exists.
- Analytics page exists.
- Settings page exists.
- Money formatting utilities exist.
- Domain types exist.
- Fixture data is centralized.
- Shared components are established.
- Charts work on mobile and desktop.
- Empty states exist.
- Basic accessibility requirements are met.
- No major horizontal overflow exists.
- TypeScript validation passes.
- Existing linting passes.
- Existing build passes.
- Relevant existing tests pass.

Everything must currently operate using clearly synthetic fixture data.

Do NOT proceed to Phase 2 automatically.

Stop after Phase 1 is implemented, validated, and summarized.