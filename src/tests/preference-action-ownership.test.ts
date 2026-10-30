import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
const preferenceMocks = vi.hoisted(() => ({
  getUserPreferences: vi.fn(),
  saveUserPreferences: vi.fn(),
}));

vi.mock("@/lib/auth-session", () => authMocks);
vi.mock("@/services/preferences-service", () => preferenceMocks);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { savePreferencesAction } from "@/actions/preferences";

describe("preference action ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.getCurrentUser.mockResolvedValue({ id: "user-a", name: "Alex", email: "alex@example.test" });
    preferenceMocks.getUserPreferences.mockResolvedValue({ onboardingCompleted: true });
    preferenceMocks.saveUserPreferences.mockResolvedValue({ ok: true, preferences: {} });
  });

  it("ignores a forged userId and saves against the authenticated session", async () => {
    const result = await savePreferencesAction({
      userId: "user-b",
      displayName: "Alex Updated",
      defaultCurrencyCode: "PHP",
      locale: "en-PH",
      timezone: "Asia/Manila",
      theme: "system",
      firstDayOfWeek: "monday",
    });

    expect(result).toEqual({ ok: true });
    expect(preferenceMocks.saveUserPreferences).toHaveBeenCalledWith("user-a", expect.objectContaining({ displayName: "Alex Updated" }), true);
  });

  it("rejects preference writes without an authenticated session", async () => {
    authMocks.getCurrentUser.mockResolvedValue(null);

    const result = await savePreferencesAction({
      displayName: "Alex Updated",
      defaultCurrencyCode: "PHP",
      locale: "en-PH",
      timezone: "Asia/Manila",
      theme: "system",
      firstDayOfWeek: "monday",
    });

    expect(result).toMatchObject({ ok: false, message: "Your session has expired. Please sign in again." });
    expect(preferenceMocks.saveUserPreferences).not.toHaveBeenCalled();
  });
});