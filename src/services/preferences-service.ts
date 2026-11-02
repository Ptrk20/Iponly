import "server-only";
import { cache } from "react";
import {
  ensureUserPreferences,
  getPreferencesForUser,
  updatePreferencesForUser,
} from "@/repositories/preferences-repository";
import { preferencesInputSchema, type PreferencesInput } from "@/lib/validations/preferences";

export async function initializeUserPreferences(userId: string) {
  await ensureUserPreferences(userId);
}

export const getUserPreferences = cache(async (userId: string) => {
  return getPreferencesForUser(userId);
});

export async function saveUserPreferences(
  userId: string,
  input: unknown,
  completeOnboarding = false,
) {
  const parsed = preferencesInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, issues: parsed.error.issues };

  const preferences = await updatePreferencesForUser(
    userId,
    parsed.data as PreferencesInput,
    completeOnboarding,
  );

  return { ok: true as const, preferences };
}