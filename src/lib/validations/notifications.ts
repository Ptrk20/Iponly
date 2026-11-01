import { z } from "zod";

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(4096).refine((value) => {
    const hostname = new URL(value).hostname.toLowerCase();
    return [
      "fcm.googleapis.com",
      "push.services.mozilla.com",
      "push.apple.com",
      "notify.windows.com",
      "push.services.opera.com",
    ].some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  }, "Unsupported push service endpoint."),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(1).max(256),
    auth: z.string().min(1).max(256),
  }).strict(),
}).strict();

export const notificationPreferencesSchema = z.object({
  debtRemindersEnabled: z.boolean().optional(),
  tripRemindersEnabled: z.boolean().optional(),
  todoRemindersEnabled: z.boolean().optional(),
  monthlyAnalyticsEnabled: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "Choose at least one notification preference.");
