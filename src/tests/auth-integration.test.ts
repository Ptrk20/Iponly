import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import type { IponlyDatabase } from "@/db";
import { ensureUserPreferences } from "@/repositories/preferences-repository";
import { createAuth } from "@/lib/auth";

describe("email authentication with isolated PostgreSQL", () => {
  let client: PGlite;
  let database: IponlyDatabase;
  let auth: ReturnType<typeof createAuth>;

  beforeEach(async () => {
    client = new PGlite();
    const testDatabase = drizzle({ client, schema });
    database = testDatabase as unknown as IponlyDatabase;
    await migrate(testDatabase, { migrationsFolder: "src/db/migrations" });
    auth = createAuth(database, {
      BETTER_AUTH_SECRET: "phase-two-test-secret-with-at-least-32-characters",
      BETTER_AUTH_URL: "http://localhost:3000",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    }, (userId) => ensureUserPreferences(userId, database));
  });

  afterEach(async () => {
    await client.close();
  });

  it("registers, logs in, and logs out using hashed-password auth", async () => {
    const registration = await auth.api.signUpEmail({
      body: { name: "Alex Test", email: "alex@example.test", password: "secure-password-123" },
    });

    expect(registration.user.email).toBe("alex@example.test");
    expect(registration.user).not.toHaveProperty("password");

    const login = await auth.api.signInEmail({
      body: { email: "alex@example.test", password: "secure-password-123" },
    });
    expect(login.user.id).toBe(registration.user.id);

    const signOut = await auth.api.signOut({
      headers: new Headers({ cookie: `better-auth.session_token=${login.token}` }),
    });
    expect(signOut.success).toBe(true);
  });

  it("rejects invalid credentials and duplicate registration", async () => {
    await auth.api.signUpEmail({
      body: { name: "Alex Test", email: "alex@example.test", password: "secure-password-123" },
    });

    await expect(auth.api.signInEmail({
      body: { email: "alex@example.test", password: "incorrect-password" },
    })).rejects.toBeDefined();

    await expect(auth.api.signUpEmail({
      body: { name: "Alex Duplicate", email: "alex@example.test", password: "another-secure-password" },
    })).rejects.toBeDefined();
  });

  it("creates default preferences after registration", async () => {
    const registration = await auth.api.signUpEmail({
      body: { name: "Alex Test", email: "alex@example.test", password: "secure-password-123" },
    });
    const [preferences] = await database
      .select()
      .from(schema.userPreferences)
      .where((await import("drizzle-orm")).eq(schema.userPreferences.userId, registration.user.id));

    expect(preferences).toMatchObject({ defaultCurrencyCode: "PHP", locale: "en-PH", timezone: "Asia/Manila", theme: "system", firstDayOfWeek: "monday", onboardingCompleted: false });
  });

  it("deletes the authenticated user's financial data and account after password confirmation", async () => {
    const registration = await auth.api.signUpEmail({
      body: { name: "Alex Test", email: "delete-me@example.test", password: "secure-password-123" },
    });
    const otherRegistration = await auth.api.signUpEmail({
      body: { name: "Other User", email: "other-user@example.test", password: "secure-password-123" },
    });
    const accountId = "10000000-0000-4000-8000-000000000001";
    const otherAccountId = "10000000-0000-4000-8000-000000000002";
    const transactionId = "20000000-0000-4000-8000-000000000001";
    const reversalId = "20000000-0000-4000-8000-000000000002";
    const savingsGoalId = "30000000-0000-4000-8000-000000000001";
    const tripId = "40000000-0000-4000-8000-000000000001";

    await database.insert(schema.financialAccounts).values({
      id: accountId,
      userId: registration.user.id,
      name: "Maya",
      accountType: "digital_wallet",
    });
    await database.insert(schema.financialAccounts).values({
      id: otherAccountId,
      userId: otherRegistration.user.id,
      name: "Other user's account",
      accountType: "savings",
    });
    await database.insert(schema.accountTransactions).values({
      id: transactionId,
      userId: registration.user.id,
      accountId,
      transactionType: "deposit",
      amountMinor: 12500,
      currencyCode: "PHP",
      transactionDate: new Date("2026-10-12T00:00:00.000Z"),
      description: "Test deposit",
    });
    await database.insert(schema.accountTransactions).values({
      id: reversalId,
      userId: registration.user.id,
      accountId,
      transactionType: "reversal",
      amountMinor: 12500,
      currencyCode: "PHP",
      transactionDate: new Date("2026-10-13T00:00:00.000Z"),
      description: "Reverse test deposit",
      reason: "Test reversal",
      reversalOfTransactionId: transactionId,
    });
    await database
      .update(schema.accountTransactions)
      .set({ reversedByTransactionId: reversalId })
      .where(eq(schema.accountTransactions.id, transactionId));
    await database.insert(schema.savingsGoals).values({
      id: savingsGoalId,
      userId: registration.user.id,
      name: "Travel fund",
      targetAmountMinor: 500000,
    });
    await database.insert(schema.trips).values({
      id: tripId,
      userId: registration.user.id,
      name: "Test trip",
      destination: "Tokyo",
      linkedSavingsGoalId: savingsGoalId,
      creationIdempotencyKey: "test-trip",
    });
    const [pushSubscription] = await database.insert(schema.pushSubscriptions).values({
      userId: registration.user.id,
      endpoint: "https://fcm.googleapis.com/push/account-deletion-test",
      p256dh: "test-public-key",
      auth: "test-auth-key",
    }).returning();
    if (!pushSubscription) throw new Error("Push subscription insert returned no row.");
    await database.insert(schema.notificationDeliveries).values({
      subscriptionId: pushSubscription.id,
      notificationKey: "test-notification",
    });

    const loginResponse = await auth.handler(new Request("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "delete-me@example.test", password: "secure-password-123" }),
    }));
    const cookie = loginResponse.headers.get("set-cookie")?.split(";")[0];
    if (!cookie) throw new Error("Sign-in response did not include a session cookie.");

    const deletionResponse = await auth.handler(new Request("http://localhost:3000/api/auth/delete-user", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ password: "secure-password-123" }),
    }));
    const deletion: unknown = await deletionResponse.json();
    const [remainingUser] = await database
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, registration.user.id));
    const remainingAccounts = await database
      .select()
      .from(schema.financialAccounts)
      .where(eq(schema.financialAccounts.userId, registration.user.id));
    const otherUsersAccounts = await database
      .select()
      .from(schema.financialAccounts)
      .where(eq(schema.financialAccounts.userId, otherRegistration.user.id));
    const remainingTransactions = await database
      .select()
      .from(schema.accountTransactions)
      .where(eq(schema.accountTransactions.userId, registration.user.id));
    const remainingTrips = await database
      .select()
      .from(schema.trips)
      .where(eq(schema.trips.userId, registration.user.id));
    const remainingGoals = await database
      .select()
      .from(schema.savingsGoals)
      .where(eq(schema.savingsGoals.userId, registration.user.id));
    const remainingPreferences = await database
      .select()
      .from(schema.userPreferences)
      .where(eq(schema.userPreferences.userId, registration.user.id));
    const remainingSubscriptions = await database
      .select()
      .from(schema.pushSubscriptions)
      .where(eq(schema.pushSubscriptions.userId, registration.user.id));
    const remainingDeliveries = await database
      .select()
      .from(schema.notificationDeliveries)
      .where(eq(schema.notificationDeliveries.subscriptionId, pushSubscription.id));

    expect(deletionResponse.status).toBe(200);
    expect(deletion).toMatchObject({ success: true, message: "User deleted" });
    expect(remainingUser).toBeUndefined();
    expect(remainingAccounts).toHaveLength(0);
    expect(remainingTransactions).toHaveLength(0);
    expect(remainingTrips).toHaveLength(0);
    expect(remainingGoals).toHaveLength(0);
    expect(remainingPreferences).toHaveLength(0);
    expect(remainingSubscriptions).toHaveLength(0);
    expect(remainingDeliveries).toHaveLength(0);
    expect(otherUsersAccounts).toHaveLength(1);
  });

  it("does not delete an account when password confirmation fails", async () => {
    const registration = await auth.api.signUpEmail({
      body: { name: "Alex Test", email: "keep-me@example.test", password: "secure-password-123" },
    });
    const loginResponse = await auth.handler(new Request("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "keep-me@example.test", password: "secure-password-123" }),
    }));
    const cookie = loginResponse.headers.get("set-cookie")?.split(";")[0];
    if (!cookie) throw new Error("Sign-in response did not include a session cookie.");

    const deletionResponse = await auth.handler(new Request("http://localhost:3000/api/auth/delete-user", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ password: "incorrect-password" }),
    }));

    expect(deletionResponse.status).toBe(400);

    const [remainingUser] = await database
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, registration.user.id));
    expect(remainingUser?.email).toBe("keep-me@example.test");
  });
});