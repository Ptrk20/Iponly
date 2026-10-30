import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth-session";
import { getUserPreferences } from "@/services/preferences-service";

export const instant = false;

export default async function FinanceAppLayout({ children }: { children: ReactNode }) {
  const currentUser = await requireUser();
  const preferences = await getUserPreferences(currentUser.id);
  if (!preferences.onboardingCompleted) redirect("/onboarding");

  return <AppShell profile={{ name: currentUser.name, email: currentUser.email }} theme={preferences.theme}>{children}</AppShell>;
}