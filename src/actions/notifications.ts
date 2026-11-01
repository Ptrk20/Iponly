"use server";

import { getCurrentUser } from "@/lib/auth-session";
import { notificationPreferencesSchema } from "@/lib/validations/notifications";
import { getUserPreferences } from "@/services/preferences-service";
import { updateNotificationPreferences } from "@/repositories/notification-repository";

export async function saveNotificationPreferencesAction(input: unknown) {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    console.error("Iponly could not resolve the session for a notification preference update.");
    return { ok: false as const, message: "Your session could not be verified. Please sign in again." };
  }
  if (!user) return { ok: false as const, message: "Your session has expired. Please sign in again." };

  const parsed = notificationPreferencesSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, message: parsed.error.issues[0]?.message ?? "Check your notification preferences." };
  }

  try {
    await getUserPreferences(user.id);
    await updateNotificationPreferences(user.id, parsed.data);
    return { ok: true as const };
  } catch {
    console.error("Iponly could not save notification preferences.");
    return { ok: false as const, message: "We couldn’t save your notification preferences. Please try again." };
  }
}
