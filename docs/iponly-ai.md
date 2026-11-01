# Iponly AI (Phase 8)

Iponly AI is an authenticated, read-only assistant for information already recorded in Iponly. It can summarize Savings, Debt, Budget, Analytics, and Travel data. It cannot create, change, delete, reverse, or complete records and does not provide personalized financial, investment, tax, legal, or credit advice.

## Architecture and access control

The chat UI sends a bounded conversation to `POST /api/chat`. The route resolves the Better Auth session with `getCurrentUser()`; no user ID is accepted from a request or model tool argument. It loads the authenticated user's timezone and currency preferences, validates the chat payload, and runs the Vercel AI SDK with OpenAI-compatible chat completions (OpenAI or OpenRouter), or native Vercel AI Gateway, and a fixed registry of read-only tools.

The approved tools are:

- `getSavingsSummary`
- `getDebtSummary`
- `getBudgetSummary`
- `getFinancialComparison`
- `getTravelSummary`
- `getIponlyRoute`

Tools call only read/query services. Analytics questions use the existing Analytics service, which owns cross-module deduplication and period calculations. The model has no database client, SQL interface, Server Action, mutation service, or arbitrary navigation mechanism. Tool arguments are strict Zod objects, bounded, and do not contain a `userId`. Results are reduced to display names, dates, status, exact minor-unit values, and formatted currency values; internal record IDs and booking references are not sent to the model.

Stored names and descriptions are untrusted data. System guidance instructs the model not to follow directions embedded in tool results. The assistant screen renders plain text rather than user/model-provided HTML or Markdown. Any navigation links for blocked write/advice requests are selected from a fixed internal route allowlist.

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

Set these values in the project-root `.env.local` for local development, then restart the server. For production, configure the deployment environment and rebuild/redeploy. Provider requests and model usage may incur cost.

An HTTP 403 with an HTML response instead of a gateway error can indicate a network/proxy access-policy block. The assistant reports this separately from credential failures. Ask your network administrator to allow `https://ai-gateway.vercel.sh` for Vercel AI Gateway; trusting a corporate CA fixes certificate verification but does not override network access policies. Do not disable TLS checks or bypass organization network controls.

## Data, privacy, and storage

The user's current message, the bounded recent user-authored questions, and only the tool results needed to answer the request may be processed by OpenAI, or by OpenRouter or Vercel AI Gateway and their selected upstream provider. Assistant messages from the browser are not sent back to the model, so client-forged prior answers cannot become financial evidence. Tool calls are server-side and user-scoped. The application does not persist conversations, raw prompts, tool outputs, or AI audit records; chat history is held in browser memory and is lost on refresh or when cleared. The route does not log message bodies, tool arguments, or financial data.

Do not submit secrets or information that is not needed to answer a question. Provider-side data handling is governed by the selected provider account and its applicable terms; Iponly does not make a claim about provider retention.

## Limits and safety

- Messages are limited to 4,000 characters; at most 8 user-authored messages and 12,000 total characters are accepted.
- A request can take at most 5 model/tool steps and returns at most 700 output tokens.
- The in-memory per-user limit is 10 requests per 60 seconds. It protects a single running application instance; deployments with multiple or serverless instances should use a shared rate-limit store for globally consistent enforcement.
- Explicit write requests are answered without calling the provider and link to a fixed relevant Iponly page. The assistant never claims a write succeeded.
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

Unit tests cover bounded chat validation, write/advice detection, safe routes, rate limiting, read-only tool selection, output minimization, and malicious stored text. The application has no automated Playwright suite configured yet; validate the authenticated chat in a configured browser environment before deployment.

## Phase 9 boundary and known limitations

Phase 8 is strictly read-only. Adding or changing Savings transactions, Budget entries, Debt payments, trips, itinerary items, tasks, preferences, or other records remains out of scope until Phase 9. There is no persisted conversation history, distributed rate limiter, provider-side retention control, booking-reference lookup, offline chat, or AI audit trail. The model can misunderstand a question; verify important figures against the corresponding Iponly page.
