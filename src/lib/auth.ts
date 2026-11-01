import "server-only";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { getDatabase } from "@/db";
import type { IponlyDatabase } from "@/db";
import { account, session, user, verification } from "@/db/schema";
import { deleteUserFinancialData } from "@/repositories/account-deletion-repository";
import { initializeUserPreferences } from "@/services/preferences-service";
import { getServerEnv, type ServerEnv } from "@/lib/server-env";

export function createAuth(
  database: IponlyDatabase,
  env: Pick<ServerEnv, "BETTER_AUTH_SECRET" | "BETTER_AUTH_URL" | "NEXT_PUBLIC_APP_URL">,
  preferenceInitializer: (userId: string) => Promise<void> = initializeUserPreferences,
) {
  return betterAuth({
      appName: "Iponly",
      baseURL: env.BETTER_AUTH_URL,
      secret: env.BETTER_AUTH_SECRET,
      trustedOrigins: [env.BETTER_AUTH_URL, env.NEXT_PUBLIC_APP_URL],
      database: drizzleAdapter(database, {
        provider: "pg",
        schema: { user, session, account, verification },
      }),
      emailAndPassword: {
        enabled: true,
        minPasswordLength: 10,
        maxPasswordLength: 128,
        autoSignIn: true,
      },
      user: {
        deleteUser: {
          enabled: true,
          beforeDelete: async (deletedUser) => {
            await deleteUserFinancialData(deletedUser.id, database);
          },
        },
      },
      session: {
        expiresIn: 60 * 60 * 24 * 7,
        updateAge: 60 * 60 * 24,
      },
      advanced: {
        database: { generateId: () => crypto.randomUUID() },
      },
      databaseHooks: {
        user: {
          create: {
            after: async (createdUser) => {
              try {
                await preferenceInitializer(createdUser.id);
              } catch {
                console.error("Iponly could not initialize new-user preferences; the next authenticated request will retry.");
              }
            },
          },
        },
      },
      plugins: [nextCookies()],
  });
}

type AuthInstance = ReturnType<typeof createAuth>;
let authInstance: AuthInstance | undefined;

export function getAuth(): AuthInstance {
  if (!authInstance) authInstance = createAuth(getDatabase(), getServerEnv());
  return authInstance;
}