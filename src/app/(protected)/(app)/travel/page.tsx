import Link from "next/link";
import { ArrowRight, MapPin, Plane } from "lucide-react";
import { TravelArchiveButton, TravelJoinTrip, TravelTripListActions } from "@/components/travel-actions";
import { EmptyState, PageHeader, Panel, StatusBadge } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { requireUser } from "@/lib/auth-session";
import { getUserPreferences } from "@/services/preferences-service";
import { getSharedTrips, getTravelChoices, getTravelPageData } from "@/services/travel-service";
import type { CurrencyCode } from "@/types/domain";

export const instant = false;

export default async function TravelPage() {
  const user = await requireUser();
  const [data, choices, preferences, shared] = await Promise.all([
    getTravelPageData(user.id),
    getTravelChoices(user.id),
    getUserPreferences(user.id),
    getSharedTrips(user.id),
  ]);
  return (
    <div className="page-stack">
      <PageHeader description="Plan the experience and keep the numbers in view." eyebrow="Make room for a gala" title="Travel planner" />
      <div className="travel-list-actions">
        <TravelTripListActions choices={choices} currencyCode={preferences.defaultCurrencyCode} />
        <TravelJoinTrip />
      </div>
      {shared.length > 0 ? (
        <section className="page-stack">
          <h2>Shared with me</h2>
          <div className="travel-trip-grid">
            {shared.map(({ trip, role, ownerName }) => (
              <Panel className="travel-trip-card" key={trip.id}>
                <div className="trip-mini-top"><StatusBadge tone={trip.status}>{trip.status}</StatusBadge><Plane aria-hidden="true" size={18} /></div>
                <h3>{trip.name}</h3>
                <p className="travel-trip-destination"><MapPin aria-hidden="true" size={14} />{trip.destination}</p>
                <p className="travel-trip-dates">Shared by {ownerName} · {role === "editor" ? "Can edit" : "View only"}</p>
                <div className="travel-trip-actions">
                  <Link className="text-link" href={`/travel/${trip.id}`}>Open trip <ArrowRight aria-hidden="true" size={14} /></Link>
                </div>
              </Panel>
            ))}
          </div>
        </section>
      ) : null}
      {data.activeTrips.length === 0 ? (
        <Panel><EmptyState description="Create a trip to keep the itinerary, bookings, and expenses in one place." title="No trips planned" /></Panel>
      ) : (
        <section aria-label="Your trips" className="travel-trip-grid">
          {data.activeTrips.map(({ trip, plannedTotals, actualTotals, budgetRemainingMinor, utilizationPercent }) => (
            <Panel className="travel-trip-card" key={trip.id}>
              <div className="trip-mini-top"><StatusBadge tone={trip.status}>{trip.status}</StatusBadge><Plane aria-hidden="true" size={18} /></div>
              <h2>{trip.name}</h2>
              <p className="travel-trip-destination"><MapPin aria-hidden="true" size={14} />{trip.destination}</p>
              <p className="travel-trip-dates">
                {trip.startDate ? formatDate(trip.startDate, "MMM d, yyyy") : "Dates not set"}
                {trip.endDate ? ` – ${formatDate(trip.endDate, "MMM d, yyyy")}` : ""}
              </p>
              <dl className="travel-trip-metrics">
                <div><dt>Trip budget</dt><dd>{formatMoney(trip.totalBudgetMinor, trip.baseCurrencyCode)}</dd></div>
                <div><dt>Planned</dt><dd>{formatCurrencyTotals(plannedTotals)}</dd></div>
                <div><dt>Actual</dt><dd>{formatCurrencyTotals(actualTotals)}</dd></div>
                <div><dt>Budget remaining</dt><dd>{budgetRemainingMinor === null ? "Not set" : formatMoney(budgetRemainingMinor, trip.baseCurrencyCode)}</dd></div>
                <div><dt>Budget used</dt><dd>{utilizationPercent === null ? "Not set" : `${utilizationPercent}%`}</dd></div>
              </dl>
              <div className="travel-trip-actions">
                <Link className="text-link" href={`/travel/${trip.id}`}>Open trip <ArrowRight aria-hidden="true" size={14} /></Link>
                                <TravelArchiveButton archived={false} tripId={trip.id} />
                              </div>
            </Panel>
          ))}
        </section>
      )}
      {data.archivedTrips.length > 0 ? (
        <section className="page-stack">
          <h2>Archived trips</h2>
          <div className="travel-trip-grid">
            {data.archivedTrips.map(({ trip }) => (
              <Panel className="travel-trip-card" key={trip.id}>
                <div className="trip-mini-top"><StatusBadge>archived</StatusBadge></div>
                <h3>{trip.name}</h3>
                <p>{trip.destination}</p>
                <TravelArchiveButton archived tripId={trip.id} />
              </Panel>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function formatCurrencyTotals(totals: Array<{ currencyCode: CurrencyCode; amountMinor: number }>) {
  return totals.length ? totals.map((total) => formatMoney(total.amountMinor, total.currencyCode)).join(" · ") : "—";
}
