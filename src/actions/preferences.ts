"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth-session";
import { getUserPreferences, saveUserPreferences } from "@/services/preferences-service";

async function saveForCurrentUser(input: unknown, completeOnboarding: boolean) {
  let currentUser;
  try {
    currentUser = await getCurrentUser();
  } catch {
    console.error("Iponly could not resolve the session for a preference update.");
    return { ok: false as const, message: "Your session could not be verified. Please sign in again." };
  }
  if (!currentUser) return { ok: false as const, message: "Your session has expired. Please sign in again." };

  try {
    const saved = await saveUserPreferences(currentUser.id, input, completeOnboarding);
    if (!saved.ok) {
      return { ok: false as const, message: saved.issues[0]?.message ?? "Check your preferences and try again." };
    }

    revalidatePath("/", "layout");
    return { ok: true as const };
  } catch {
    console.error("Iponly failed to save authenticated user preferences.");
    return { ok: false as const, message: "We couldn’t save your preferences. Please try again." };
  }
}

export async function savePreferencesAction(input: unknown) {
  let currentUser;
  try {
    currentUser = await getCurrentUser();
  } catch {
    console.error("Iponly could not resolve the session before loading preferences.");
    return { ok: false as const, message: "Your session could not be verified. Please sign in again." };
  }
  if (!currentUser) return { ok: false as const, message: "Your session has expired. Please sign in again." };

  try {
    const currentPreferences = await getUserPreferences(currentUser.id);
    return saveForCurrentUser(input, currentPreferences.onboardingCompleted);
  } catch {
    console.error("Iponly could not load preferences before an authenticated update.");
    return { ok: false as const, message: "We couldn’t load your preferences. Please try again." };
  }
}

export async function completeOnboardingAction(input: unknown) {
  return saveForCurrentUser(input, true);
}