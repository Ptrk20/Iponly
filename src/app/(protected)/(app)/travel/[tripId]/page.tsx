import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { SharedTripPlan, TravelLeaveButton, TravelTripActions } from "@/components/travel-actions";
import { EmptyState, PageHeader, Panel, ProgressBar, SectionHeading, StatusBadge } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { requireUser } from "@/lib/auth-session";
import { getSharedTripDetail, getTravelChoices, getTravelTripDetail } from "@/services/travel-service";

export const instant = false;

export default async function TravelTripPage({ params }: { params: Promise<{ tripId: string }> }) {
  const [{ tripId }, user] = await Promise.all([params, requireUser()]);
  const [detail, choices] = await Promise.all([
    getTravelTripDetail(tripId, user.id),
    getTravelChoices(user.id),
  ]);
  if (!detail) {
    const shared = await getSharedTripDetail(tripId, user.id);
    if (!shared) notFound();
    const { trip } = shared;
    return (
      <div className="page-stack">
        <PageHeader
          action={<Link className="button button-secondary" href="/travel"><ArrowLeft aria-hidden="true" size={14} /> All trips</Link>}
          description={`${trip.destination}${trip.startDate ? ` · ${formatDate(trip.startDate, "MMM d")}` : ""}${trip.endDate ? `–${formatDate(trip.endDate, "MMM d, yyyy")}` : ""}`}
          eyebrow="Shared trip"
          title={trip.name}
        />
        <Panel>
          <div className="trip-mini-top"><StatusBadge tone={trip.status}>{trip.status}</StatusBadge><span>Shared by {shared.ownerName} · {shared.role === "editor" ? "You can edit" : "View only"}</span></div>
          <div className="travel-leave-right"><TravelLeaveButton tripId={trip.id} /></div>
          <p>Budget, expenses, and bookings are private to the trip owner.</p>
        </Panel>
        <SharedTripPlan detail={shared} />
      </div>
    );
  }
  const { trip, summary } = detail;
  const matchingActual = summary.actualTotals.find((total) => total.currencyCode === trip.baseCurrencyCode)?.amountMinor ?? 0;
  const matchingPlanned = summary.plannedTotals.find((total) => total.currencyCode === trip.baseCurrencyCode)?.amountMinor ?? 0;
  return (
    <div className="page-stack">
      <PageHeader
        action={<Link className="button button-secondary" href="/travel"><ArrowLeft aria-hidden="true" size={14} /> All trips</Link>}
        description={`${trip.destination}${trip.startDate ? ` · ${formatDate(trip.startDate, "MMM d")}` : ""}${trip.endDate ? `–${formatDate(trip.endDate, "MMM d, yyyy")}` : ""}`}
        eyebrow="Travel planner"
        title={trip.name}
      />
      <Panel>
        <div className="trip-mini-top"><StatusBadge tone={trip.status}>{trip.status}</StatusBadge><span>{trip.travelerCount} traveler{trip.travelerCount === 1 ? "" : "s"} · {trip.baseCurrencyCode}</span></div>
        <SectionHeading detail="Actual expenses are counted only once in overall spending, even when linked to a Monthly Budget." title="Trip budget" />
        {trip.totalBudgetMinor > 0 ? (
          <ProgressBar
            displayValue={summary.utilizationPercent === null ? "0% used" : `${summary.utilizationPercent}% used`}
            label={`Actual ${formatMoney(matchingActual, trip.baseCurrencyCode)} · Planned ${formatMoney(matchingPlanned, trip.baseCurrencyCode)} · Remaining ${formatMoney(summary.budgetRemainingMinor ?? trip.totalBudgetMinor, trip.baseCurrencyCode)}`}
            max={trip.totalBudgetMinor}
            value={matchingActual}
          />
        ) : <EmptyState description="Edit trip details to set a budget. Currencies remain separate; no exchange rates are assumed." title="No trip budget set" />}
        {detail.savingsGoal ? <p className="travel-linked-goal">Savings goal: <strong>{detail.savingsGoal.name}</strong> · {formatMoney(detail.savingsGoal.balanceMinor, detail.savingsGoal.currencyCode)} saved of {formatMoney(detail.savingsGoal.targetAmountMinor, detail.savingsGoal.currencyCode)}{detail.savingsGoal.archived ? " · archived goal" : ""}</p> : null}
        {trip.notes ? <p>{trip.notes}</p> : null}
      </Panel>
      <TravelTripActions choices={choices} detail={detail} />
    </div>
  );
}
