import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAIConfiguration } from "@/lib/ai/config";

describe("AI provider configuration", () => {
  beforeEach(() => {
    vi.stubEnv("AI_API_KEY", "test-key");
    vi.stubEnv("AI_PROVIDER", "");
    vi.stubEnv("AI_MODEL", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("preserves the default OpenAI configuration", () => {
    expect(getAIConfiguration()).toEqual({
      provider: "openai",
      apiKey: "test-key",
      model: "gpt-4.1-mini",
      baseURL: "https://api.openai.com/v1",
    });
  });

  it("accepts the Ling model and routes OpenRouter keys to OpenRouter", () => {
    vi.stubEnv("AI_PROVIDER", "openrouter");
    vi.stubEnv("AI_MODEL", "inclusionai/ling-3.1-flash-1019");
    expect(getAIConfiguration()).toEqual({
      provider: "openrouter",
      apiKey: "test-key",
      model: "inclusionai/ling-3.1-flash-1019",
      baseURL: "https://openrouter.ai/api/v1",
    });
  });

  it("accepts OpenRouter model variants", () => {
    vi.stubEnv("AI_PROVIDER", "openrouter");
    vi.stubEnv("AI_MODEL", "vendor/model:free");
    expect(getAIConfiguration()?.model).toBe("vendor/model:free");
  });

  it("accepts the Ling model for Vercel AI Gateway without an OpenRouter endpoint", () => {
    vi.stubEnv("AI_PROVIDER", "vercel");
    vi.stubEnv("AI_MODEL", "inclusionai/ling-3.1-flash-1019");
    expect(getAIConfiguration()).toEqual({
      provider: "vercel",
      apiKey: "test-key",
      model: "inclusionai/ling-3.1-flash-1019",
    });
  });

  it("requires an explicit model for Vercel AI Gateway", () => {
    vi.stubEnv("AI_PROVIDER", "vercel");
    expect(getAIConfiguration()).toBeNull();
  });

  it("rejects a provider/model mismatch instead of sending it to OpenAI", () => {
    vi.stubEnv("AI_MODEL", "inclusionai/ling-3.1-flash-1019");
    expect(getAIConfiguration()).toBeNull();
  });

  it("requires an explicit model for OpenRouter", () => {
    vi.stubEnv("AI_PROVIDER", "openrouter");
    expect(getAIConfiguration()).toBeNull();
  });

  it("rejects missing credentials and unsupported providers", () => {
    vi.stubEnv("AI_API_KEY", " ");
    expect(getAIConfiguration()).toBeNull();
    vi.stubEnv("AI_API_KEY", "test-key");
    vi.stubEnv("AI_PROVIDER", "unsupported");
    expect(getAIConfiguration()).toBeNull();
  });

  it.each(["https://example.test/model", "vendor/../model", "vendor/model?key=value", "vendor/model\nextra"])(
    "rejects invalid model identifiers: %s",
    (model) => {
      vi.stubEnv("AI_PROVIDER", "openrouter");
      vi.stubEnv("AI_MODEL", model);
      expect(getAIConfiguration()).toBeNull();
    },
  );
});
