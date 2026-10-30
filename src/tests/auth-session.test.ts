import { beforeEach, describe, expect, it, vi } from "vitest";

const sessionMocks = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock("@/lib/auth", () => ({ getAuth: () => ({ api: { getSession: sessionMocks.getSession } }) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: (destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  },
}));

import { getCurrentUser, requireUser } from "@/lib/auth-session";

describe("server-side authentication guard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns null for unauthenticated requests", async () => {
    sessionMocks.getSession.mockResolvedValue(null);
    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it("redirects unauthenticated protected requests to login", async () => {
    sessionMocks.getSession.mockResolvedValue(null);
    await expect(requireUser()).rejects.toThrow("REDIRECT:/login");
  });

  it("returns only the authenticated user for protected requests", async () => {
    const authenticatedUser = { id: "user-a", name: "Alex", email: "alex@example.test" };
    sessionMocks.getSession.mockResolvedValue({ user: authenticatedUser });
    await expect(requireUser()).resolves.toEqual(authenticatedUser);
  });
});