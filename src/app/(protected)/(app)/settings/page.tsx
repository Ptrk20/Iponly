import { Bell, LockKeyhole } from "lucide-react";
import { PreferencesForm } from "@/components/preferences-form";
import { PageHeader, Panel, SectionHeading } from "@/components/ui";
import { requireUser } from "@/lib/auth-session";
import { getUserPreferences } from "@/services/preferences-service";

export const instant = false;

export default async function SettingsPage() {
  const currentUser = await requireUser();
  const preferences = await getUserPreferences(currentUser.id);

  return (
    <div className="page-stack">
      <PageHeader description="Manage how Iponly displays your money and dates." eyebrow="Your preferences" title="Settings" />

      <div className="settings-grid">
        <Panel>
          <SectionHeading detail="Only your authenticated account can update these settings" title="Profile & preferences" />
          <PreferencesForm
            displayName={currentUser.name}
            initialValues={{
              defaultCurrencyCode: preferences.defaultCurrencyCode,
              locale: preferences.locale as "en-PH" | "fil-PH",
              timezone: preferences.timezone,
              theme: preferences.theme,
              firstDayOfWeek: preferences.firstDayOfWeek,
            }}
          />
          <div className="settings-account-summary"><span>Signed in as</span><strong>{currentUser.email}</strong></div>
        </Panel>

        <Panel>
          <SectionHeading detail="Notifications are not active in Phase 2" title="Notifications" />
          <div className="settings-row"><div className="settings-row-copy"><strong>Payment reminders</strong><span>Upcoming installment dates</span></div><Bell aria-hidden="true" className="settings-icon" size={17} /></div>
          <div className="settings-row"><div className="settings-row-copy"><strong>Weekly money summary</strong><span>A short look at your budget</span></div><span className="settings-placeholder">Not enabled</span></div>
          <p className="settings-footnote">Preferences are stored in your account. Financial features are still demo-only.</p>
        </Panel>

        <Panel className="settings-span-two">
          <SectionHeading detail="Financial records are not created in Phase 2" title="Data & privacy" />
          <div className="settings-row"><div className="settings-row-copy"><strong>Demo Preview</strong><span>Savings, debt, budget, activity, travel, and chart amounts are synthetic examples only.</span></div><LockKeyhole aria-hidden="true" className="settings-icon" size={18} /></div>
        </Panel>
      </div>
    </div>
  );
}