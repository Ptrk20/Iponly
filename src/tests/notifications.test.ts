import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import type { IponlyDatabase } from "@/db";
import {
  savePushSubscription,
  updateNotificationPreferences,
} from "@/repositories/notification-repository";
import { dispatchScheduledNotifications } from "@/services/notification-service";
import { pushSubscriptionSchema, notificationPreferencesSchema } from "@/lib/validations/notifications";

describe("scheduled notifications", () => {
  let client: PGlite;
  let database: IponlyDatabase;

  beforeEach(async () => {
    client = new PGlite();
    const testDatabase = drizzle({ client, schema });
    database = testDatabase as unknown as IponlyDatabase;
    await migrate(testDatabase, { migrationsFolder: "src/db/migrations" });
    await testDatabase.insert(schema.user).values([
      { id: "notification-user-a", name: "Alex A", email: "notification-a@example.test" },
      { id: "notification-user-b", name: "Bailey B", email: "notification-b@example.test" },
    ]);
    await testDatabase.insert(schema.userPreferences).values([
      { userId: "notification-user-a", timezone: "Asia/Manila" },
      { userId: "notification-user-b", timezone: "UTC" },
    ]);
    await testDatabase.insert(schema.pushSubscriptions).values([
      {
        id: "50000000-0000-4000-8000-000000000001",
        userId: "notification-user-a",
        endpoint: "https://fcm.googleapis.com/push/a",
        p256dh: "key-a",
        auth: "auth-a",
      },
      {
        id: "50000000-0000-4000-8000-000000000002",
        userId: "notification-user-b",
        endpoint: "https://fcm.googleapis.com/push/b",
        p256dh: "key-b",
        auth: "auth-b",
      },
    ]);
    await testDatabase.insert(schema.debts).values({
      id: "60000000-0000-4000-8000-000000000001",
      userId: "notification-user-a",
      name: "Laptop installment",
      debtType: "installment",
      currencyCode: "PHP",
      originalPrincipalMinor: 300000,
      openingBalanceMinor: 300000,
      creationIdempotencyKey: "laptop-debt",
    });
    await testDatabase.insert(schema.debtInstallments).values({
      id: "70000000-0000-4000-8000-000000000001",
      userId: "notification-user-a",
      debtId: "60000000-0000-4000-8000-000000000001",
      dueDate: new Date("2026-11-05T00:00:00.000Z"),
      scheduledAmountMinor: 100000,
    });
    await testDatabase.insert(schema.trips).values({
      id: "80000000-0000-4000-8000-000000000001",
      userId: "notification-user-a",
      name: "Tokyo trip",
      destination: "Tokyo",
      startDate: "2026-11-09",
      creationIdempotencyKey: "tokyo-trip",
    });
    await testDatabase.insert(schema.travelTodos).values({
      userId: "notification-user-a",
      tripId: "80000000-0000-4000-8000-000000000001",
      title: "Check passport",
      dueDate: "2026-11-05",
    });
  });

  afterEach(async () => {
    await client.close();
  });

  it("sends debt, trip, and to-do reminders at 9 AM in the user's timezone once", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const beforeNine = await dispatchScheduledNotifications({
      database,
      now: new Date("2026-11-02T00:59:00.000Z"),
      send,
    });

    expect(beforeNine.sent).toBe(0);
    expect(send).not.toHaveBeenCalled();

    const atNine = await dispatchScheduledNotifications({
      database,
      now: new Date("2026-11-02T01:00:00.000Z"),
      send,
    });

    expect(atNine.sent).toBe(3);
    expect(send.mock.calls.map(([, candidate]) => candidate.category).sort()).toEqual(["debt", "todo", "trip"]);
    expect(send.mock.calls.every(([, candidate]) => !candidate.body.includes("Laptop"))).toBe(true);

    const repeated = await dispatchScheduledNotifications({
      database,
      now: new Date("2026-11-02T01:15:00.000Z"),
      send,
    });
    expect(repeated.sent).toBe(0);
    expect(send).toHaveBeenCalledTimes(3);
  });

  it("sends the monthly summary on the first day after 9 AM local time", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    await dispatchScheduledNotifications({
      database,
      now: new Date("2026-11-01T00:59:00.000Z"),
      send,
    });
    expect(send).not.toHaveBeenCalled();

    await dispatchScheduledNotifications({
      database,
      now: new Date("2026-11-01T01:00:00.000Z"),
      send,
    });

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[1]).toMatchObject({
      category: "monthly",
      key: "monthly-analytics:2026-10",
      url: "/analytics?period=last-month",
    });
  });

  it("releases a failed delivery claim so a later scheduler run can retry", async () => {
    const send = vi.fn()
      .mockRejectedValueOnce(new Error("temporary push-service failure"))
      .mockResolvedValue(undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const failedRun = await dispatchScheduledNotifications({
        database,
        now: new Date("2026-11-02T01:00:00.000Z"),
        send,
      });
      const retryRun = await dispatchScheduledNotifications({
        database,
        now: new Date("2026-11-02T01:15:00.000Z"),
        send,
      });

      expect(failedRun.failed).toBe(1);
      expect(retryRun.sent).toBe(1);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("rejects untrusted push endpoints and invalid notification preferences", () => {
    expect(pushSubscriptionSchema.safeParse({
      endpoint: "https://fcm.googleapis.com/push/token",
      keys: { p256dh: "p256", auth: "auth" },
    }).success).toBe(true);
    expect(pushSubscriptionSchema.safeParse({
      endpoint: "https://127.0.0.1/admin",
      keys: { p256dh: "p256", auth: "auth" },
    }).success).toBe(false);
    expect(notificationPreferencesSchema.safeParse({ debtRemindersEnabled: true }).success).toBe(true);
    expect(notificationPreferencesSchema.safeParse({ userId: "another-user", debtRemindersEnabled: true }).success).toBe(false);
  });

  it("keeps subscriptions and reminder preferences scoped to the signed-in user", async () => {
    const subscription = {
      endpoint: "https://fcm.googleapis.com/push/owned-device",
      p256dh: "key-a",
      auth: "auth-a",
    };
    await savePushSubscription("notification-user-a", subscription, database);
    await expect(savePushSubscription("notification-user-b", subscription, database)).rejects.toThrow(
      "Push endpoint is already registered to another account.",
    );
    await updateNotificationPreferences("notification-user-a", {
      debtRemindersEnabled: false,
      monthlyAnalyticsEnabled: false,
    }, database);

    const [userA, userB] = await Promise.all([
      database.select().from(schema.userPreferences).where(eq(schema.userPreferences.userId, "notification-user-a")),
      database.select().from(schema.userPreferences).where(eq(schema.userPreferences.userId, "notification-user-b")),
    ]);
    const subscriptions = await database.select().from(schema.pushSubscriptions);

    expect(userA[0]).toMatchObject({ debtRemindersEnabled: false, monthlyAnalyticsEnabled: false });
    expect(userB[0]).toMatchObject({ debtRemindersEnabled: true, monthlyAnalyticsEnabled: true });
    expect(subscriptions).toHaveLength(3);
    expect(subscriptions.find((item) => item.endpoint === subscription.endpoint)?.userId).toBe("notification-user-a");
  });
});
