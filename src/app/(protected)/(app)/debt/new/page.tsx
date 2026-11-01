import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DebtCreateForm } from "@/components/debt-actions";
import { PageHeader, Panel, SectionHeading } from "@/components/ui";
import { requireUser } from "@/lib/auth-session";
import { getUserPreferences } from "@/services/preferences-service";

export const instant = false;

function todayInTimezone(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export default async function NewDebtPage() {
  const user = await requireUser();
  const preferences = await getUserPreferences(user.id);

  return (
    <div className="page-stack">
      <PageHeader
        action={<Link className="button button-secondary" href="/debt"><ArrowLeft aria-hidden="true" size={16} />All debts</Link>}
        description="Add the essential information first, then set up a schedule and any extra details."
        eyebrow="Debt setup"
        title="Add a debt"
      />
      <Panel>
        <SectionHeading detail="You can review and change your entries before saving." title="Create your debt" />
        <DebtCreateForm
          defaultCurrency={preferences.defaultCurrencyCode}
          today={todayInTimezone(preferences.timezone)}
        />
      </Panel>
    </div>
  );
}
