import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
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
});