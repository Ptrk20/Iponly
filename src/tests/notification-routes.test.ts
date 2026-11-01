import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/server-env", () => ({ getServerEnv: vi.fn() }));
vi.mock("@/services/notification-service", () => ({ dispatchScheduledNotifications: vi.fn() }));
vi.mock("@/repositories/notification-repository", () => ({
  deleteAllPushSubscriptions: vi.fn(),
  deletePushSubscription: vi.fn(),
  savePushSubscription: vi.fn(),
}));

import { DELETE, POST } from "@/app/api/push-subscriptions/route";
import { GET as dispatch } from "@/app/api/cron/notifications/route";
import { getCurrentUser } from "@/lib/auth-session";
import { getServerEnv, type ServerEnv } from "@/lib/server-env";
import { dispatchScheduledNotifications } from "@/services/notification-service";
import {
  deleteAllPushSubscriptions,
  deletePushSubscription,
  savePushSubscription,
} from "@/repositories/notification-repository";

describe("notification routes", () => {
  const user = {
    id: "notification-owner",
    name: "Alex",
    email: "alex@example.test",
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } satisfies NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
  const env = {
    DATABASE_URL: "postgresql://localhost/iponly",
    BETTER_AUTH_SECRET: "a".repeat(32),
    BETTER_AUTH_URL: "https://iponly.test",
    NEXT_PUBLIC_APP_URL: "https://iponly.test",
    VAPID_PUBLIC_KEY: "public-key",
    VAPID_PRIVATE_KEY: "private-key",
    VAPID_SUBJECT: "mailto:admin@example.test",
    NOTIFICATION_CRON_SECRET: "c".repeat(40),
  } satisfies ServerEnv;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    vi.mocked(getServerEnv).mockReturnValue(env);
    vi.mocked(dispatchScheduledNotifications).mockResolvedValue({ checked: 1, sent: 2, failed: 0, removed: 0 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("requires the configured cron secret before dispatching", async () => {
    const response = await dispatch(new Request("https://iponly.test/api/cron/notifications", {
      headers: { authorization: `Bearer ${"x".repeat(40)}` },
    }));

    expect(response.status).toBe(401);
    expect(dispatchScheduledNotifications).not.toHaveBeenCalled();
  });

  it("dispatches notifications only with the matching cron bearer token", async () => {
    const response = await dispatch(new Request("https://iponly.test/api/cron/notifications", {
      headers: { authorization: `Bearer ${env.NOTIFICATION_CRON_SECRET}` },
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ checked: 1, sent: 2 });
  });

  it("requires a signed-in user and same-origin request for subscription changes", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);
    const unauthenticated = await POST(new Request("https://iponly.test/api/push-subscriptions", {
      method: "POST",
      body: JSON.stringify({}),
    }));
    expect(unauthenticated.status).toBe(401);

    const crossOrigin = await POST(new Request("https://iponly.test/api/push-subscriptions", {
      method: "POST",
      headers: { origin: "https://evil.test", "content-type": "application/json" },
      body: JSON.stringify({
        endpoint: "https://fcm.googleapis.com/push/token",
        keys: { p256dh: "key", auth: "auth" },
      }),
    }));

    expect(crossOrigin.status).toBe(403);
    expect(savePushSubscription).not.toHaveBeenCalled();
  });

  it("stores and deletes subscriptions only for the authenticated user", async () => {
    const body = {
      endpoint: "https://fcm.googleapis.com/push/token",
      expirationTime: null,
      keys: { p256dh: "key", auth: "auth" },
    };
    const saved = await POST(new Request("https://iponly.test/api/push-subscriptions", {
      method: "POST",
      headers: { origin: "https://iponly.test", "content-type": "application/json" },
      body: JSON.stringify(body),
    }));
    const deleted = await DELETE(new Request("https://iponly.test/api/push-subscriptions", {
      method: "DELETE",
      headers: { origin: "https://iponly.test", "content-type": "application/json" },
      body: JSON.stringify({ endpoint: body.endpoint }),
    }));

    expect(saved.status).toBe(200);
    expect(deleted.status).toBe(200);
    expect(savePushSubscription).toHaveBeenCalledWith("notification-owner", {
      endpoint: body.endpoint,
      p256dh: "key",
      auth: "auth",
    });
    expect(deletePushSubscription).toHaveBeenCalledWith("notification-owner", body.endpoint);
    expect(deleteAllPushSubscriptions).not.toHaveBeenCalled();
  });
});
