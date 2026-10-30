import { z } from "zod";

const timezoneSchema = z.string().trim().min(1).max(100).refine((timezone) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}, "Choose a valid timezone.");

export const preferencesInputSchema = z.object({
  displayName: z.string().trim().min(2).max(80),
  defaultCurrencyCode: z.enum(["PHP", "USD", "EUR", "JPY"]),
  locale: z.enum(["en-PH", "fil-PH"]),
  timezone: timezoneSchema,
  theme: z.enum(["light", "dark", "system"]),
  firstDayOfWeek: z.enum(["monday", "sunday"]),
});

export type PreferencesInput = z.infer<typeof preferencesInputSchema>;