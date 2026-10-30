import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { ServerConfigurationNotice } from "@/components/server-configuration-notice";
import { getCurrentUser } from "@/lib/auth-session";
import { isServerConfigurationError } from "@/lib/server-env";
import { getUserPreferences } from "@/services/preferences-service";

export const instant = false;

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) redirect("/login");

    await getUserPreferences(currentUser.id);
    return children;
  } catch (error) {
    if (isServerConfigurationError(error)) return <ServerConfigurationNotice />;
    throw error;
  }
}