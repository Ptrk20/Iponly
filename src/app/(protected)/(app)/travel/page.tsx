import Link from "next/link";
import { MapPin } from "lucide-react";
import { PrototypeAction } from "@/components/prototype-action";
import { EmptyState, PageHeader, Panel, ProgressBar, SectionHeading, StatusBadge } from "@/components/ui";
import { itineraryItems, travelExpenses, travelTodos, trips } from "@/data/fixtures";
import { formatDate } from "@/lib/dates";
import { summarizeTrip } from "@/lib/finance";
import { formatMoney } from "@/lib/money";

export default function TravelPage() {
  const trip = trips.find((item) => item.status === "planning" || item.status === "booked");

  if (!trip) {
    return (
      <div className="page-stack">
        <PageHeader action={<PrototypeAction icon="plus" label="Plan a trip" variant="primary" />} description="Keep the plans and the budget together." eyebrow="Make room for a gala" title="Travel planner" />
        <Panel><EmptyState description="Start planning your next gala." title="No trips planned" /></Panel>
      </div>
    );
  }

  const expenses = travelExpenses.filter((expense) => expense.tripId === trip.id);
  const summary = summarizeTrip(trip, expenses);
  const itinerary = itineraryItems.filter((item) => item.tripId === trip.id);
  const todos = travelTodos.filter((item) => item.tripId === trip.id && item.list === "to-do");
  const packing = travelTodos.filter((item) => item.tripId === trip.id && item.list === "packing");

  return (
    <div className="page-stack">
      <PageHeader action={<PrototypeAction icon="plus" label="Add trip" variant="primary" />} description="Plan the experience and keep the numbers in view." eyebrow="Make room for a gala" title="Travel planner" />

      <section aria-labelledby="trip-title" className="trip-hero">
        <div className="trip-hero-content">
          <p className="eyebrow">Featured trip</p>
          <div className="trip-hero-title-row"><div><h2 id="trip-title">{trip.name}</h2><p><MapPin aria-hidden="true" size={14} /> {trip.destination} · {formatDate(trip.startDate, "MMM d")}–{formatDate(trip.endDate, "MMM d, yyyy")}</p></div><StatusBadge tone={trip.status}>{trip.status}</StatusBadge></div>
          <div className="trip-hero-stats">
            <div><span>Travel budget</span><strong>{formatMoney(trip.budgetMinor, trip.currencyCode)}</strong></div>
            <div><span>Planned expenses</span><strong>{formatMoney(summary.plannedMinor, trip.currencyCode)}</strong></div>
            <div><span>Actual so far</span><strong>{formatMoney(summary.actualMinor, trip.currencyCode)}</strong></div>
          </div>
          <div className="trip-progress"><ProgressBar displayValue={`${summary.utilizationPercent}% of budget spent`} label={`Remaining ${formatMoney(summary.remainingMinor, trip.currencyCode)}`} max={trip.budgetMinor} value={summary.actualMinor} /></div>
        </div>
      </section>

      <nav aria-label="Trip sections" className="trip-section-nav">
        <a href="#overview">Overview</a><a href="#expenses">Expenses</a><a href="#itinerary">Itinerary</a><a href="#to-dos">To-dos</a><a href="#packing">Packing</a>
      </nav>

      <div className="overview-grid" id="overview">
        <div className="span-7" id="expenses">
          <Panel>
            <SectionHeading action={<PrototypeAction icon="plus" label="Add expense" variant="quiet" />} detail="Planned and actual amounts · PHP" title="Trip expenses" />
            {expenses.length === 0 ? <EmptyState description="Add your first flight, stay, or activity." title="No expenses planned" /> : <div>{expenses.map((expense) => <div className="travel-expense-row" key={expense.id}><div><strong>{expense.name}</strong><small>{expense.category}</small></div><div className="travel-amounts"><small>Planned</small><strong>{formatMoney(expense.plannedMinor, expense.currencyCode)}</strong></div><div className="travel-amounts"><small>Actual</small><strong>{formatMoney(expense.actualMinor, expense.currencyCode)}</strong></div><StatusBadge>{expense.actualMinor > 0 ? "Deposit paid" : "Planned"}</StatusBadge></div>)}</div>}
          </Panel>
        </div>

        <div className="span-5" id="itinerary">
          <Panel>
            <SectionHeading action={<PrototypeAction icon="calendar" label="Add itinerary" variant="quiet" />} detail="A flexible first draft" title="Itinerary" />
            {itinerary.length === 0 ? <EmptyState description="Add a few anchor plans to get started." title="No itinerary yet" /> : <div className="itinerary-list">{itinerary.map((item) => <article className="itinerary-item" key={item.id}><time className="itinerary-date" dateTime={item.date}>{formatDate(item.date, "EEE, MMM d")}</time><div><h3>{item.title}</h3><p>{item.time} · {item.location}</p></div></article>)}</div>}
          </Panel>
        </div>

        <div className="span-6" id="to-dos">
          <Panel>
            <SectionHeading action={<PrototypeAction icon="todo" label="Add to-do" variant="quiet" />} detail="Before you go" title="To-dos" />
            {todos.length === 0 ? <EmptyState description="Trip prep items will show up here." title="Nothing on the list" /> : <div className="todo-list">{todos.map((item) => <label className="todo-item" key={item.id}><input className="todo-check" checked={item.completed} disabled type="checkbox" /><span className={item.completed ? "todo-complete" : ""}>{item.title}{item.dueDate ? <small>Due {formatDate(item.dueDate, "MMM d")}</small> : null}</span></label>)}</div>}
          </Panel>
        </div>

        <div className="span-6" id="packing">
          <Panel>
            <SectionHeading detail="A small list for the essentials" title="Packing list" />
            {packing.length === 0 ? <EmptyState description="Packing reminders will show up here." title="Your bag is still open" /> : <div className="todo-list">{packing.map((item) => <label className="todo-item" key={item.id}><input className="todo-check" checked={item.completed} disabled type="checkbox" /><span className={item.completed ? "todo-complete" : ""}>{item.title}</span></label>)}</div>}
          </Panel>
        </div>
      </div>

      <Link className="text-link travel-back-link" href="/budget">See how travel fits your monthly plan <span aria-hidden="true">→</span></Link>
    </div>
  );
}