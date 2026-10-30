import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import type { IponlyDatabase } from "@/db";
import {
  getPreferencesForUser,
  updatePreferencesForUser,
} from "@/repositories/preferences-repository";

describe("preference ownership", () => {
  let client: PGlite;
  let database: IponlyDatabase;

  beforeEach(async () => {
    client = new PGlite();
    const testDatabase = drizzle({ client, schema });
    database = testDatabase as unknown as IponlyDatabase;
    await migrate(testDatabase, { migrationsFolder: "src/db/migrations" });
    await testDatabase.insert(schema.user).values([
      { id: "user-a", name: "Alex A", email: "alex-a@example.test" },
      { id: "user-b", name: "Bailey B", email: "bailey-b@example.test" },
    ]);
  });

  afterEach(async () => {
    await client.close();
  });

  it("creates isolated default preferences for both users", async () => {
    const userA = await getPreferencesForUser("user-a", database);
    const userB = await getPreferencesForUser("user-b", database);

    expect(userA).toMatchObject({ defaultCurrencyCode: "PHP", locale: "en-PH", timezone: "Asia/Manila", theme: "system", firstDayOfWeek: "monday", onboardingCompleted: false });
    expect(userB.userId).toBe("user-b");
    expect(userA.id).not.toBe(userB.id);
  });

  it("updates only the selected user's preference and profile", async () => {
    await getPreferencesForUser("user-a", database);
    await getPreferencesForUser("user-b", database);

    await updatePreferencesForUser("user-a", {
      displayName: "Alex Updated",
      defaultCurrencyCode: "USD",
      locale: "fil-PH",
      timezone: "UTC",
      theme: "dark",
      firstDayOfWeek: "sunday",
    }, true, database);

    const userAPreferences = await getPreferencesForUser("user-a", database);
    const userBPreferences = await getPreferencesForUser("user-b", database);
    const [userA] = await database.select().from(schema.user).where((await import("drizzle-orm")).eq(schema.user.id, "user-a"));
    const [userB] = await database.select().from(schema.user).where((await import("drizzle-orm")).eq(schema.user.id, "user-b"));

    expect(userAPreferences).toMatchObject({ defaultCurrencyCode: "USD", locale: "fil-PH", timezone: "UTC", theme: "dark", firstDayOfWeek: "sunday", onboardingCompleted: true });
    expect(userBPreferences).toMatchObject({ defaultCurrencyCode: "PHP", locale: "en-PH", theme: "system", onboardingCompleted: false });
    expect(userA?.name).toBe("Alex Updated");
    expect(userB?.name).toBe("Bailey B");
  });

  it("makes preference initialization idempotent", async () => {
    const first = await getPreferencesForUser("user-a", database);
    const second = await getPreferencesForUser("user-a", database);
    expect(first.id).toBe(second.id);
  });
});