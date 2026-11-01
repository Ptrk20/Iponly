import { LockKeyhole } from "lucide-react";
import { DeleteAccountForm } from "@/components/delete-account-form";
import { NotificationSettings } from "@/components/notification-settings";
import { PreferencesForm } from "@/components/preferences-form";
import { PageHeader, Panel, SectionHeading } from "@/components/ui";
import { requireUser } from "@/lib/auth-session";
import { getServerEnv } from "@/lib/server-env";
import { getPushSubscriptionCount } from "@/repositories/notification-repository";
import { getUserPreferences } from "@/services/preferences-service";

export const instant = false;

export default async function SettingsPage() {
  const currentUser = await requireUser();
  const [preferences, pushSubscriptionCount] = await Promise.all([
    getUserPreferences(currentUser.id),
    getPushSubscriptionCount(currentUser.id),
  ]);
  const serverEnv = getServerEnv();

  return (
    <div className="page-stack">
      <PageHeader description="Manage your preferences, notifications, and privacy." eyebrow="Your preferences" title="Settings" />

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
              aiActionsEnabled: preferences.aiActionsEnabled,
            }}
          />
          <div className="settings-account-summary"><span>Signed in as</span><strong>{currentUser.email}</strong></div>
        </Panel>

        <Panel className="settings-span-two">
          <SectionHeading detail="Download a private JSON export of your saved financial records." title="Data & privacy" />
          <div className="settings-row">
            <div className="settings-row-copy">
              <strong>Download your Iponly data</strong>
              <span>Includes your savings, debts, budgets, trips, and related histories. Amounts retain integer minor-unit precision and currency.</span>
            </div>
            <a className="button button-secondary" href="/api/export">Download JSON</a>
          </div>
          <p className="settings-footnote"><LockKeyhole aria-hidden="true" className="settings-icon" size={15} />This export contains only your records and is not a replacement for a database backup.</p>
        </Panel>

        <Panel className="settings-span-two">
          <SectionHeading detail="Get reminders for debts, trips, and trip to-dos, plus a monthly financial summary." title="Notifications" />
          <NotificationSettings
            hasPushSubscription={pushSubscriptionCount > 0}
            initialPreferences={{
              debtRemindersEnabled: preferences.debtRemindersEnabled,
              tripRemindersEnabled: preferences.tripRemindersEnabled,
              todoRemindersEnabled: preferences.todoRemindersEnabled,
              monthlyAnalyticsEnabled: preferences.monthlyAnalyticsEnabled,
            }}
            vapidPublicKey={serverEnv.VAPID_PUBLIC_KEY ?? null}
          />
        </Panel>

        <Panel className="settings-span-two delete-account-panel">
          <SectionHeading detail="You can permanently remove your account at any time." title="Delete account" />
          <p className="delete-account-warning">
            This permanently deletes your profile, sign-in credentials, preferences, and all saved financial and travel records. This cannot be undone. Download your data first if you want to keep a copy.
          </p>
          <DeleteAccountForm />
        </Panel>
      </div>
    </div>
  );
}