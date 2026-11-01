import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/assistant",
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/components/logout-button", () => ({ LogoutButton: () => null }));
vi.mock("@/actions/preferences", () => ({
  completeOnboardingAction: vi.fn(),
  savePreferencesAction: vi.fn(),
}));
vi.mock("@/components/assistant-chat", () => ({ AssistantChat: () => null }));
vi.mock("@/components/assistant-action-history", () => ({ AssistantActionHistory: () => null }));
vi.mock("@/lib/ai/config", () => ({ getAIConfiguration: vi.fn() }));
vi.mock("@/lib/auth-session", () => ({ requireUser: vi.fn() }));
vi.mock("@/services/ai-action-service", () => ({ getAIActionHistory: vi.fn() }));

import { AppShell } from "@/components/app-shell";
import { PreferencesForm } from "@/components/preferences-form";
import AssistantPage from "@/app/(protected)/(app)/assistant/page";
import AssistantHistoryPage from "@/app/(protected)/(app)/assistant/history/page";
import { getAIConfiguration } from "@/lib/ai/config";
import { requireUser } from "@/lib/auth-session";
import { getAIActionHistory } from "@/services/ai-action-service";

describe("Iponly AI production UI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "production");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("exposes the sidebar and mobile-accessible header AI links", () => {
    const props = {
      profile: { name: "Test User", email: "user@example.test" },
      theme: "system",
      children: null,
    } satisfies Parameters<typeof AppShell>[0];
    const html = renderToStaticMarkup(createElement(AppShell, props));
    expect(html.match(/href="\/assistant"/g)).toHaveLength(2);
    expect(html).toContain("Iponly AI");
    expect(html).toContain('aria-label="Ask Iponly AI"');
    expect(html).toContain('aria-label="Settings for Test User"');
    expect(html).toMatch(/<a(?=[^>]*class="topbar-profile")(?=[^>]*href="\/settings")(?=[^>]*title="Settings")[^>]*>/);
  });

  it("shows the AI Actions setting but preserves its default-off value and onboarding behavior", () => {
    const props = {
      displayName: "Test User",
      initialValues: {
        defaultCurrencyCode: "PHP",
        locale: "en-PH",
        timezone: "Asia/Manila",
        theme: "system",
        firstDayOfWeek: "monday",
        aiActionsEnabled: false,
      },
    } satisfies Parameters<typeof PreferencesForm>[0];
    const html = renderToStaticMarkup(createElement(PreferencesForm, props));
    expect(html).toContain("Enable Iponly AI Actions");
    expect(html).toContain('type="checkbox"');
    expect(html).not.toContain('checked=""');
    const onboarding = renderToStaticMarkup(createElement(PreferencesForm, { ...props, onboarding: true }));
    expect(onboarding).not.toContain("Enable Iponly AI Actions");
  });

  it.each([true, false])("renders the assistant page with provider availability %s", (available) => {
    vi.mocked(getAIConfiguration).mockReturnValue(available
      ? { provider: "openai", apiKey: "test-key", model: "gpt-4.1-mini" }
      : null);
    expect(AssistantPage().props).toEqual({ providerAvailable: available });
  });

  it("loads history only for the authenticated user in production", async () => {
    const user = {
      id: "production-history-user",
      name: "Test User",
      email: "user@example.test",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } satisfies Awaited<ReturnType<typeof requireUser>>;
    vi.mocked(requireUser).mockResolvedValue(user);
    vi.mocked(getAIActionHistory).mockResolvedValue([]);
    const html = renderToStaticMarkup(await AssistantHistoryPage());
    expect(requireUser).toHaveBeenCalledOnce();
    expect(getAIActionHistory).toHaveBeenCalledWith(user.id);
    expect(html).toContain("Action history");
  });
});
