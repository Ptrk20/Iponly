import { redirect } from "next/navigation";
import { PreferencesForm } from "@/components/preferences-form";
import { requireUser } from "@/lib/auth-session";
import { getUserPreferences } from "@/services/preferences-service";

export const instant = false;

export default async function OnboardingPage() {
  const currentUser = await requireUser();
  const preferences = await getUserPreferences(currentUser.id);
  if (preferences.onboardingCompleted) redirect("/");

  return (
    <main className="onboarding-page">
      <section aria-labelledby="onboarding-title" className="onboarding-panel">
        <p className="eyebrow">A few preferences first</p>
        <h1 id="onboarding-title">Make Iponly feel like yours.</h1>
        <p className="onboarding-copy">Choose how your money is shown. You can change these settings anytime.</p>
        <PreferencesForm
          displayName={currentUser.name}
          initialValues={{
            defaultCurrencyCode: preferences.defaultCurrencyCode,
            locale: preferences.locale as "en-PH" | "fil-PH",
            timezone: preferences.timezone,
            theme: preferences.theme,
            firstDayOfWeek: preferences.firstDayOfWeek,
          }}
          onboarding
        />
      </section>
    </main>
  );
}