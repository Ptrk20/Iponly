import "server-only";
import { z } from "zod";

const serverEnvSchema = z.object({
  DATABASE_URL: z.string().url().refine(
    (value) => value.startsWith("postgres://") || value.startsWith("postgresql://"),
    "DATABASE_URL must be a PostgreSQL connection URL.",
  ),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  VAPID_PUBLIC_KEY: z.union([z.string().min(1), z.literal("")]).optional(),
  VAPID_PRIVATE_KEY: z.union([z.string().min(1), z.literal("")]).optional(),
  VAPID_SUBJECT: z.union([z.string().url(), z.string().startsWith("mailto:"), z.literal("")]).optional(),
  NOTIFICATION_CRON_SECRET: z.union([z.string().min(32), z.literal("")]).optional(),
}).superRefine((env, context) => {
  const vapidValues = [env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY, env.VAPID_SUBJECT];
  if (vapidValues.some(Boolean) && !vapidValues.every(Boolean)) {
    context.addIssue({
      code: "custom",
      message: "VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT must be set together.",
      path: ["VAPID_PUBLIC_KEY"],
    });
  }
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function isServerConfigurationError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith("Missing or invalid server configuration:");
}

export function getServerEnv(): ServerEnv {
  const parsed = serverEnvSchema.safeParse(process.env);

  if (!parsed.success) {
    const invalidNames = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))];
    throw new Error(`Missing or invalid server configuration: ${invalidNames.join(", ")}.`);
  }

  return parsed.data;
}