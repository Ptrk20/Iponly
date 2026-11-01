import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth-session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/ai/action-rate-limit", () => ({
  consumeAIActionRequest: vi.fn(() => ({ allowed: true, retryAfterSeconds: 0 })),
}));
vi.mock("@/services/preferences-service", () => ({ getUserPreferences: vi.fn() }));
vi.mock("@/services/ai-action-service", () => ({
  cancelAIActionProposal: vi.fn(),
  confirmAIActionProposal: vi.fn(),
}));
vi.mock("@/repositories/ai-action-repository", () => ({
  findAIActionProposalForUser: vi.fn(),
}));

import { POST } from "@/app/api/ai-actions/route";
import { getCurrentUser } from "@/lib/auth-session";
import { getUserPreferences } from "@/services/preferences-service";
import { cancelAIActionProposal, confirmAIActionProposal } from "@/services/ai-action-service";
import { findAIActionProposalForUser } from "@/repositories/ai-action-repository";
import { consumeAIActionRequest } from "@/lib/ai/action-rate-limit";

describe.each(["development", "production"])("Iponly AI action route in %s", (environment) => {
  const user = {
    id: `ai-action-route-${crypto.randomUUID()}`,
    name: "Test User",
    email: "ai-action-route@example.test",
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } satisfies NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
  const proposalId = crypto.randomUUID();
  const pendingProposal = {
    id: proposalId,
    userId: user.id,
    conversationId: null,
    messageId: null,
    actionType: "savings_deposit",
    status: "pending_confirmation",
    normalizedPayload: {},
    displayPayload: {
      title: "Savings deposit",
      summary: "₱500.00 PHP to Maya Savings",
      details: [],
      href: "/savings",
      confirmLabel: "Confirm deposit",
    },
    idempotencyKey: crypto.randomUUID(),
    expiresAt: new Date(Date.now() + 60_000),
    confirmedAt: null,
    cancelledAt: null,
    executedAt: null,
    failedAt: null,
    failureCode: null,
    resultReferenceType: null,
    resultReferenceId: null,
    resultPayload: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } satisfies NonNullable<Awaited<ReturnType<typeof findAIActionProposalForUser>>>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", environment);
    vi.stubEnv("BETTER_AUTH_URL", "https://iponly.test");
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    vi.mocked(consumeAIActionRequest).mockReturnValue({ allowed: true, retryAfterSeconds: 0 });
    vi.mocked(getUserPreferences).mockResolvedValue({
      id: crypto.randomUUID(),
      userId: user.id,
      timezone: "Asia/Manila",
      defaultCurrencyCode: "PHP",
      locale: "en-PH",
      theme: "system",
      firstDayOfWeek: "monday",
      onboardingCompleted: true,
      aiActionsEnabled: true,
      debtRemindersEnabled: true,
      tripRemindersEnabled: true,
      todoRemindersEnabled: true,
      monthlyAnalyticsEnabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(findAIActionProposalForUser).mockResolvedValue(pendingProposal);
    vi.mocked(confirmAIActionProposal).mockResolvedValue({
      ok: true,
      duplicate: false,
      message: "Deposit recorded.",
      href: "/savings",
    });
    vi.mocked(cancelAIActionProposal).mockResolvedValue({
      ok: true,
      message: "Proposal cancelled. No changes were made.",
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("requires an authenticated user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const response = await POST(new Request("https://iponly.test/api/ai-actions", {
      method: "POST",
      body: JSON.stringify({ action: "confirm", proposalId }),
    }));

    expect(response.status).toBe(401);
    expect(confirmAIActionProposal).not.toHaveBeenCalled();
  });

  it("rejects cross-origin confirmation requests", async () => {
    const response = await POST(new Request("https://iponly.test/api/ai-actions", {
      method: "POST",
      headers: { origin: "https://attacker.test" },
      body: JSON.stringify({ action: "confirm", proposalId }),
    }));

    expect(response.status).toBe(403);
    expect(confirmAIActionProposal).not.toHaveBeenCalled();
  });

  it("rejects client-supplied action details", async () => {
    const response = await POST(new Request("https://iponly.test/api/ai-actions", {
      method: "POST",
      body: JSON.stringify({ action: "confirm", proposalId, amountMinor: 1 }),
    }));

    expect(response.status).toBe(400);
    expect(confirmAIActionProposal).not.toHaveBeenCalled();
  });

  it("blocks confirmation when the user has disabled AI Actions", async () => {
    vi.mocked(getUserPreferences).mockResolvedValue({
      id: crypto.randomUUID(),
      userId: user.id,
      timezone: "Asia/Manila",
      defaultCurrencyCode: "PHP",
      locale: "en-PH",
      theme: "system",
      firstDayOfWeek: "monday",
      onboardingCompleted: true,
      aiActionsEnabled: false,
      debtRemindersEnabled: true,
      tripRemindersEnabled: true,
      todoRemindersEnabled: true,
      monthlyAnalyticsEnabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const response = await POST(new Request("https://iponly.test/api/ai-actions", {
      method: "POST",
      body: JSON.stringify({ action: "confirm", proposalId }),
    }));

    expect(response.status).toBe(403);
    expect(confirmAIActionProposal).not.toHaveBeenCalled();
  });

  it("scopes proposal lookup and confirmation to the session user", async () => {
    const response = await POST(new Request("https://iponly.test/api/ai-actions", {
      method: "POST",
      body: JSON.stringify({ action: "confirm", proposalId }),
    }));

    expect(response.status).toBe(200);
    expect(findAIActionProposalForUser).toHaveBeenCalledWith(proposalId, user.id);
    expect(confirmAIActionProposal).toHaveBeenCalledWith(user.id, proposalId);
    expect(await response.json()).toMatchObject({ ok: true, message: "Deposit recorded." });
  });
});
