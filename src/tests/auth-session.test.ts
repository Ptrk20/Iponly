import { beforeEach, describe, expect, it, vi } from "vitest";

const sessionMocks = vi.hoisted(() => ({
  connection: vi.fn<() => Promise<void>>(),
  getAuth: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getAuth: sessionMocks.getAuth }));
vi.mock("next/server", () => ({ connection: sessionMocks.connection }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: (destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  },
}));

import { getCurrentSession, getCurrentUser, requireUser } from "@/lib/auth-session";

describe("server-side authentication guard", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    sessionMocks.connection.mockResolvedValue(undefined);
    sessionMocks.getAuth.mockReturnValue({ api: { getSession: sessionMocks.getSession } });
  });

  it("waits for a request before initializing authentication or reading the session", async () => {
    let resolveConnection!: () => void;
    sessionMocks.connection.mockReturnValue(new Promise<void>((resolve) => {
      resolveConnection = resolve;
    }));
    sessionMocks.getSession.mockResolvedValue(null);

    const pendingSession = getCurrentSession();

    expect(sessionMocks.connection).toHaveBeenCalledOnce();
    expect(sessionMocks.getAuth).not.toHaveBeenCalled();
    expect(sessionMocks.getSession).not.toHaveBeenCalled();

    resolveConnection();

    await expect(pendingSession).resolves.toBeNull();
    expect(sessionMocks.getAuth).toHaveBeenCalledOnce();
    expect(sessionMocks.getSession).toHaveBeenCalledWith({ headers: expect.any(Headers) });
  });

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