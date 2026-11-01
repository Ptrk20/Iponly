import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { ServerConfigurationNotice } from "@/components/server-configuration-notice";
import { getCurrentUser } from "@/lib/auth-session";
import { isServerConfigurationError } from "@/lib/server-env";
import { getUserPreferences } from "@/services/preferences-service";

export const instant = false;

export default async function AuthLayout({ children }: { children: ReactNode }) {
  try {
    const currentUser = await getCurrentUser();
    if (currentUser) {
      const preferences = await getUserPreferences(currentUser.id);
      redirect(preferences.onboardingCompleted ? "/" : "/onboarding");
    }
  } catch (error) {
    if (isServerConfigurationError(error)) return <ServerConfigurationNotice />;
    throw error;
  }

  return (
    <>
      {children}
      <footer className="site-footer">
        <span>All Rights Reserved 2026 | Developed by PNase</span>
      </footer>
    </>
  );
}