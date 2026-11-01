import { beforeEach, describe, expect, it, vi } from "vitest";

const streamState = vi.hoisted(() => ({
  parts: [] as Array<{ type: "text-delta"; text: string } | { type: "error" | "tool-error"; error: unknown }>,
}));

vi.mock("@/lib/auth-session", () => ({
  getCurrentUser: vi.fn(),
}));
vi.mock("@/services/preferences-service", () => ({
  getUserPreferences: vi.fn(),
}));
vi.mock("@/lib/ai/config", () => ({
  getAIConfiguration: vi.fn(),
}));
vi.mock("@/ai/tools", () => ({
  createReadOnlyTools: vi.fn(() => ({})),
}));
vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: vi.fn(() => ({ chat: vi.fn(() => "test-model") })),
}));
vi.mock("ai", async (importOriginal) => ({
  ...await importOriginal<typeof import("ai")>(),
  createGateway: vi.fn(() => vi.fn(() => "test-gateway-model")),
  stepCountIs: vi.fn(),
  streamText: vi.fn(() => ({
    fullStream: new ReadableStream({
      start(controller) {
        for (const part of streamState.parts) controller.enqueue(part);
        controller.close();
      },
    }),
  })),
}));

import { createOpenAI } from "@ai-sdk/openai";
import { APICallError, createGateway, streamText } from "ai";
import { POST } from "@/app/api/chat/route";
import { getCurrentUser } from "@/lib/auth-session";
import { getAIConfiguration } from "@/lib/ai/config";
import { getUserPreferences } from "@/services/preferences-service";

describe("Iponly AI chat route", () => {
  const authenticatedUser = {
    id: `assistant-route-${crypto.randomUUID()}`,
    name: "Test User",
    email: "assistant-route@example.test",
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } satisfies NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

  beforeEach(() => {
    vi.clearAllMocks();
    streamState.parts = [{ type: "text-delta", text: "Test answer" }];
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    vi.mocked(getAIConfiguration).mockReturnValue({
      provider: "openrouter",
      apiKey: "test-router-key",
      model: "inclusionai/ling-3.1-flash-1019",
      baseURL: "https://openrouter.ai/api/v1",
    });
    vi.mocked(getUserPreferences).mockResolvedValue({
      id: crypto.randomUUID(),
      userId: authenticatedUser.id,
      timezone: "Asia/Manila",
      defaultCurrencyCode: "PHP",
      locale: "en-PH",
      theme: "system",
      firstDayOfWeek: "monday",
      onboardingCompleted: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it("rejects direct unauthenticated chat API requests", async () => {
    const response = await POST(new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "Show my savings." }] }),
    }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Please sign in to use Iponly AI." });
  });

  it("uses the configured OpenRouter endpoint for chat requests", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ ...authenticatedUser, id: crypto.randomUUID() });
    const response = await POST(new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({ messages: [{ role: "user", content: "Show my savings." }] }),
    }));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("Test answer");
    expect(createOpenAI).toHaveBeenCalledWith({
      apiKey: "test-router-key",
      baseURL: "https://openrouter.ai/api/v1",
    });

  });

  it("uses native Vercel AI Gateway without sending the key to OpenRouter", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ ...authenticatedUser, id: crypto.randomUUID() });
    vi.mocked(getAIConfiguration).mockReturnValue({
      provider: "vercel",
      apiKey: "test-gateway-key",
      model: "inclusionai/ling-3.1-flash-1019",
    });
    const response = await POST(new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({ messages: [{ role: "user", content: "hello" }] }),
    }));
    expect(await response.text()).toBe("Test answer");
    expect(createGateway).toHaveBeenCalledWith({ apiKey: "test-gateway-key" });
    expect(vi.mocked(createGateway).mock.results[0].value).toHaveBeenCalledWith("inclusionai/ling-3.1-flash-1019");
    expect(streamText).toHaveBeenCalledWith(expect.objectContaining({ model: "test-gateway-model" }));
    expect(createOpenAI).not.toHaveBeenCalled();
  });

  it("blocks every representative write request before preferences or AI configuration are loaded", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(authenticatedUser);
    const writeRequests = [
      "Add ₱500 to my Maya savings.",
      "Withdraw ₱1,000 from BDO.",
      "Transfer ₱2,000 to GCash.",
      "Mark my laptop installment paid.",
      "Add a groceries expense.",
      "Delete my last transaction.",
      "Create a Japan trip.",
      "Complete my passport task.",
      "Change my currency to USD.",
    ];

    for (const content of writeRequests) {
      const response = await POST(new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content }] }),
      }));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.type).toBe("read-only");
      expect(body.reply).toContain("can't make changes yet");
      expect(body.reply).not.toContain("saved");
      expect(body.route.href.startsWith("/")).toBe(true);
    }

    expect(getUserPreferences).not.toHaveBeenCalled();
    expect(getAIConfiguration).not.toHaveBeenCalled();
  });

  it.each([
    [401, "rejected access"],
    [402, "requires credits"],
    [404, "model is unavailable"],
    [400, "tool-calling support"],
    [429, "rate or usage limit"],
  ])("surfaces provider status %i without exposing provider error details", async (statusCode, expected) => {
    vi.mocked(getCurrentUser).mockResolvedValue({ ...authenticatedUser, id: crypto.randomUUID() });
    streamState.parts = [{
      type: "error",
      error: new APICallError({
        message: "private provider details",
        url: "https://openrouter.ai/api/v1/chat/completions",
        requestBodyValues: {},
        statusCode,
        responseBody: "private provider details",
      }),
    }];
    const response = await POST(new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({ messages: [{ role: "user", content: "hello" }] }),
    }));
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.error).toContain(expected);
    expect(body.error).not.toContain("private provider details");
  });

  it("rejects an empty provider response instead of returning a successful empty stream", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ ...authenticatedUser, id: crypto.randomUUID() });
    streamState.parts = [];
    const response = await POST(new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({ messages: [{ role: "user", content: "hello" }] }),
    }));
    expect(response.status).toBe(502);
    expect((await response.json()).error).toContain("returned no answer");
  });

  it("recognizes gateway status codes and an HTML proxy denial in the error cause", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ ...authenticatedUser, id: crypto.randomUUID() });
    streamState.parts = [{
      type: "error",
      error: {
        name: "GatewayResponseError",
        statusCode: 403,
        cause: new APICallError({
          message: "private access policy details",
          url: "https://ai-gateway.vercel.sh",
          requestBodyValues: {},
          statusCode: 403,
          responseHeaders: { "content-type": "text/html; charset=utf-8" },
          responseBody: "<html>private access policy details</html>",
        }),
      },
    }];
    const response = await POST(new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({ messages: [{ role: "user", content: "hello" }] }),
    }));
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.error).toContain("network or proxy access policy");
    expect(body.error).not.toContain("private access policy details");
  });

  it("recognizes a native gateway authentication status without an APICallError", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ ...authenticatedUser, id: crypto.randomUUID() });
    streamState.parts = [{ type: "error", error: { name: "GatewayAuthenticationError", statusCode: 401 } }];
    const response = await POST(new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({ messages: [{ role: "user", content: "hello" }] }),
    }));
    expect(response.status).toBe(502);
    expect((await response.json()).error).toContain("rejected access");
  });

  it("fails an interrupted answer instead of appending error text to it", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ ...authenticatedUser, id: crypto.randomUUID() });
    streamState.parts = [
      { type: "text-delta", text: "Partial answer" },
      { type: "error", error: new Error("private provider details") },
    ];
    const response = await POST(new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({ messages: [{ role: "user", content: "hello" }] }),
    }));
    await expect(response.text()).rejects.toThrow("The AI response was interrupted.");
  });
});
