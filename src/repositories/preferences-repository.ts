import "server-only";
import { eq } from "drizzle-orm";
import { getDatabase, type IponlyDatabase } from "@/db";
import { user, userPreferences } from "@/db/schema";
import type { PreferencesInput } from "@/lib/validations/preferences";

export async function ensureUserPreferences(
  userId: string,
  database: IponlyDatabase = getDatabase(),
) {
  await database.insert(userPreferences).values({ userId }).onConflictDoNothing();
}

export async function getPreferencesForUser(
  userId: string,
  database: IponlyDatabase = getDatabase(),
) {
  await ensureUserPreferences(userId, database);
  const [preferences] = await database
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);

  if (!preferences) throw new Error("User preferences could not be initialized.");
  return preferences;
}

export async function updatePreferencesForUser(
  userId: string,
  input: PreferencesInput,
  onboardingCompleted: boolean,
  database: IponlyDatabase = getDatabase(),
) {
  return database.transaction(async (transaction) => {
    await transaction
      .update(user)
      .set({ name: input.displayName, updatedAt: new Date() })
      .where(eq(user.id, userId));

    const [preferences] = await transaction
      .insert(userPreferences)
      .values({
        userId,
        defaultCurrencyCode: input.defaultCurrencyCode,
        locale: input.locale,
        timezone: input.timezone,
        theme: input.theme,
        firstDayOfWeek: input.firstDayOfWeek,
        aiActionsEnabled: input.aiActionsEnabled,
        onboardingCompleted,
      })
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: {
          defaultCurrencyCode: input.defaultCurrencyCode,
          locale: input.locale,
          timezone: input.timezone,
          theme: input.theme,
          firstDayOfWeek: input.firstDayOfWeek,
          aiActionsEnabled: input.aiActionsEnabled,
          onboardingCompleted,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (!preferences) throw new Error("User preferences could not be updated.");
    return preferences;
  });
}