# Iponly AI (Phases 8–9)

> **v1.0 release status:** Iponly AI is development-only and is not included in the production release. The `/assistant` pages and AI POST endpoints return not-found responses in production; no AI provider variables are required or should be configured for the v1.0 deployment. The provider setup below applies only to a separately authorized development environment.

Iponly AI is an authenticated assistant for information already recorded in Iponly. It can summarize Savings, Debt, Budget, Analytics, and Travel data, and—when enabled—prepare supported changes for explicit user confirmation. It does not provide personalized financial, investment, tax, legal, or credit advice.

## Architecture and access control

The chat UI sends a bounded conversation to `POST /api/chat`. The route resolves the Better Auth session with `getCurrentUser()`; no user ID is accepted from a request or model tool argument. It loads the authenticated user's timezone and currency preferences, validates the chat payload, and runs the Vercel AI SDK with OpenAI-compatible chat completions (OpenAI or OpenRouter), or native Vercel AI Gateway, and a fixed registry of read-only tools.

The read-only tools are:

- `getSavingsSummary`
- `getDebtSummary`
- `getBudgetSummary`
- `getFinancialComparison`
- `getTravelSummary`
- `getIponlyRoute`

Read tools call only query services. Analytics questions use the existing Analytics service, which owns cross-module deduplication and period calculations. The model has no database client, SQL interface, Server Action, mutation service, or arbitrary navigation mechanism. Tool arguments are strict Zod objects, bounded, and do not contain a `userId`. Results are reduced to display names, dates, status, exact minor-unit values, and formatted currency values; internal record IDs and booking references are not sent to the model.

### Confirmed actions

AI Actions are off by default and can be enabled in Settings. With the setting off, write requests are not sent to the provider. When enabled, supported requests use preparation-only tools: the server resolves user-owned records, validates the requested amount/currency/date and any related record, and stores a short-lived proposal. The model cannot execute a write. The UI shows the proposal details and requires a separate authenticated confirmation request; cancellation makes no financial change. Editing means cancelling the old proposal and editing/resubmitting the request.

Supported actions are Savings deposits and withdrawals, transfers between the user's own accounts, Budget expenses and income, Debt payments, Travel expenses, Travel tasks, and itinerary items. Each confirmation reloads the stored, validated payload and calls the existing domain service; client-supplied amounts, record IDs, and action details are not trusted. User ownership is checked by those services. Financial amounts are kept in integer minor units, currencies must match, and each action is bounded by `AI_ACTION_MAX_AMOUNT_MINOR` (default 10,000,000 minor units). Iponly AI never moves real money; it only records data inside Iponly and does not communicate with banks or creditors. It cannot delete financial history. Regular Iponly forms remain available, and users can disable AI Actions at any time in Settings.

Proposals expire after five minutes, and no more than five unexpired proposals can be pending at once. Identical pending requests reuse their proposal. Domain writes use the proposal UUID as an idempotency key. A confirmation that is interrupted between the domain write and audit completion can be retried after a 30-second execution lease; the domain idempotency key prevents duplicate financial records. Proposal status changes and meaningful lifecycle events are recorded in an owner-scoped audit table. The authenticated Action history page shows recent actions and allows pending proposals to be cancelled.

The server controls the proposal state machine: `pending_confirmation → confirmed → executing → completed`, with cancellation and expiry from the pending state and terminal failure after validation errors. The confirmation endpoint is bound to the authenticated user and reloads the immutable stored proposal; the browser sends only the proposal UUID and requested operation. Existing Savings, Budget, Debt, and Travel services own current-state validation and linked-record transactions. Linked economic events keep the same Analytics deduplication semantics as manually entered records.

Stored names and descriptions are untrusted data. System guidance instructs the model not to follow directions embedded in tool results. The assistant screen renders paired `**text**` in AI replies as semantic bold text. Other content, including HTML and Markdown links, stays escaped plain text; incomplete bold markers remain literal during streaming. User messages remain plain text. Any navigation links for blocked write/advice requests are selected from a fixed internal route allowlist.

## Provider configuration

Set these server-side environment variables:

```dotenv
AI_API_KEY="your-provider-api-key"
AI_PROVIDER="openai"
AI_MODEL="gpt-4.1-mini"
```

`AI_API_KEY` is a server secret and must never use a `NEXT_PUBLIC_` prefix. `AI_PROVIDER` defaults to `openai`; `AI_MODEL` defaults to `gpt-4.1-mini` for OpenAI.

For OpenRouter, use an OpenRouter API key and an explicit model identifier:

```dotenv
AI_API_KEY="your-openrouter-api-key"
AI_PROVIDER="openrouter"
AI_MODEL="inclusionai/ling-3.1-flash-1019"
```

OpenRouter requests go to `https://openrouter.ai/api/v1`, not OpenAI. Select a model/provider route that supports tool calling; model availability and access depend on your provider account. Setting a model identifier alone does not switch providers. Missing keys, unsupported providers, or invalid model identifiers keep the assistant unavailable.

For a key issued by Vercel AI Gateway, use the native gateway integration:

```dotenv
AI_API_KEY="your-vercel-ai-gateway-key"
AI_PROVIDER="vercel"
AI_MODEL="inclusionai/ling-3.1-flash-1019"
```

Vercel AI Gateway keys are not OpenRouter or OpenAI keys. The gateway uses its own endpoint through the AI SDK's `createGateway`; it requires an explicit gateway model identifier, tool-calling support, and available credits/access. A 401/403 may indicate that the key was issued by a different service than the selected provider.

Set these values only in the project-root `.env.local` for local development, then restart the server. Do not configure these variables in the Iponly v1.0 production environment. Provider requests and model usage may incur cost.

An HTTP 403 with an HTML response instead of a gateway error can indicate a network/proxy access-policy block. The assistant reports this separately from credential failures. Ask your network administrator to allow `https://ai-gateway.vercel.sh` for Vercel AI Gateway; trusting a corporate CA fixes certificate verification but does not override network access policies. Do not disable TLS checks or bypass organization network controls.

## Data, privacy, and storage

The user's current message, the bounded recent user-authored questions, and only the tool results needed to answer the request may be processed by OpenAI, or by OpenRouter or Vercel AI Gateway and their selected upstream provider. Assistant messages from the browser are not sent back to the model, so client-forged prior answers cannot become financial evidence. Tool calls are server-side and user-scoped. The application does not persist conversations, raw prompts, or tool outputs; chat history is held in browser memory and is lost on refresh or when cleared. AI Action proposals and their lifecycle audit events are persisted, but do not include raw prompts. The route does not log message bodies, tool arguments, or financial data.

Do not submit secrets or information that is not needed to answer a question. Provider-side data handling is governed by the selected provider account and its applicable terms; Iponly does not make a claim about provider retention.

## Limits and safety

- Messages are limited to 4,000 characters; at most 8 user-authored messages and 12,000 total characters are accepted.
- A request can take at most 5 model/tool steps and returns at most 700 output tokens.
- The in-memory per-user limit is 10 requests per 60 seconds. It protects a single running application instance; deployments with multiple or serverless instances should use a shared rate-limit store for globally consistent enforcement.
- The confirmation endpoint applies a per-user rate limit and checks the authenticated origin. A shared rate-limit store is needed for globally consistent enforcement across multiple instances.
- AI Actions do not create or edit accounts, budgets, trips, installment plans, or other unsupported records. They cannot delete or reverse transactions, and do not contact banks, creditors, or booking providers.
- Relative action dates are limited to supported explicit ISO dates and today/yesterday in the user's timezone. Ambiguous dates require clarification instead of a guess.
- Professional-advice requests receive a boundary response. Factual descriptions and comparisons remain available.
- The assistant keeps currencies separate and uses the user's saved timezone for service calculations. Relative periods are resolved by the Analytics and Debt services, not guessed by the model.
- Provider failures before any answer text return a failed HTTP response with safe guidance for access, credits, unavailable models, rejected requests, or usage limits. Empty responses also fail explicitly. Mid-answer failures interrupt the stream rather than appending an error as if it were model output. Server logs include only an error category, provider name, and HTTP status when available, not raw provider errors, prompts, or returned financial details.

## Testing

Run:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

Tests cover bounded chat validation, write/advice detection, safe routes, rate limiting, read-only tool selection, output minimization, malicious stored text, preparation without mutation, explicit confirmation, duplicate confirmation, cancellation, ownership, and expiry. The application has no automated Playwright suite configured yet; validate the authenticated chat and action flow in a configured browser environment before deployment.

## Operational limitations

There is no persisted conversation history, distributed rate limiter, provider-side retention control, booking-reference lookup, or offline chat. The model can misunderstand a request; verify the proposal details before confirming and check the corresponding Iponly page afterward. AI Actions never replace the normal financial forms or domain authorization checks.
