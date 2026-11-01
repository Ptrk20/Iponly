"use client";

import { useActionState, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import {
  createItineraryItemAction,
  createPackingItemAction,
  createPlannedTravelExpenseAction,
  createTravelBookingAction,
  createTravelExpenseAction,
  createTravelTodoAction,
  createTripAction,
  deleteItineraryItemAction,
  deleteTravelTodoAction,
  deletePackingItemAction,
  disableTripSharingAction,
  enableTripSharingAction,
  joinTripAction,
  leaveTripAction,
  regenerateTripCodeAction,
  removeTripMemberAction,
  setTripDefaultRoleAction,
  setTripMemberRoleAction,
  reverseTravelExpenseAction,
  setTripArchivedAction,
  updateItineraryItemAction,
  updatePackingItemAction,
  updatePlannedTravelExpenseAction,
  updateTravelBookingAction,
  updateTravelTodoAction,
  updateTripAction,
  type TravelActionState,
} from "@/actions/travel";
import { BedDouble, Camera, Car, Check, Coffee, Copy, Flag, MapPin, Pencil, Plane, Printer, ShoppingBag, Utensils, type LucideIcon } from "lucide-react";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { SavingsActionDialog } from "@/components/savings-actions";
import type { getTravelChoices } from "@/services/travel-service";
import type { CurrencyCode, SavingsAccountRecord, SavingsGoalRecord } from "@/types/domain";
import type { SharedTripDetail, TravelTripDetail, TripRecord } from "@/types/travel";

type PlanDetail = Pick<TravelTripDetail, "itinerary" | "todos" | "packingItems"> & { trip: Pick<TripRecord, "id" | "name" | "destination" | "startDate" | "endDate"> };

type TravelAction = (previous: TravelActionState, formData: FormData) => Promise<TravelActionState>;
type TravelChoices = Awaited<ReturnType<typeof getTravelChoices>>;

const initialState: TravelActionState = { ok: false, message: "" };
const expenseCategories = ["flights", "accommodation", "local_transportation", "food", "activities", "shopping", "insurance", "visa", "connectivity", "emergency", "other"] as const;
const itineraryCategories = ["flight", "accommodation", "transport", "food", "activity", "sightseeing", "shopping", "free_time", "other"] as const;
const packingCategories = ["documents", "clothing", "electronics", "toiletries", "medicine", "money", "travel_gear", "other"] as const;
const bookingTypes = ["flight", "hotel", "transport", "activity", "restaurant", "insurance", "other"] as const;

function SubmitButton({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();
  return <button className="button button-primary" disabled={pending} type="submit">{pending ? "Saving…" : children}</button>;
}

function TravelForm({
  action,
  children,
  submitLabel,
  idempotent = false,
  confirm = false,
  autoSubmit = false,
}: {
  action: TravelAction;
  children: ReactNode;
  submitLabel: string;
  idempotent?: boolean;
  confirm?: boolean;
  autoSubmit?: boolean;
}) {
  const [state, formAction] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok && !autoSubmit) formRef.current?.reset();
  }, [state, autoSubmit]);
  return (
    <form
      action={formAction}
      className="savings-form travel-form"
      data-confirm={confirm ? "true" : undefined}
      onChange={autoSubmit ? () => formRef.current?.requestSubmit() : undefined}
      onSubmit={(event) => {
        const form = event.currentTarget;
        if (idempotent) {
          const key = form.elements.namedItem("idempotencyKey");
          if (key instanceof HTMLInputElement && !key.value) key.value = crypto.randomUUID();
        }
        if (form.dataset.confirm === "true" && !window.confirm("Record this financial expense with the selected Savings and Monthly Budget links?")) {
          event.preventDefault();
        }
      }}
      ref={formRef}
    >
      {idempotent ? <input name="idempotencyKey" type="hidden" /> : null}
      {children}
      <div className="savings-form-submit">
        {autoSubmit ? <button hidden type="submit">{submitLabel}</button> : <SubmitButton>{submitLabel}</SubmitButton>}
        <p aria-live="polite" className={state.ok ? "form-status is-success" : "form-status"} role={state.message ? "status" : undefined}>{state.message}</p>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="savings-field"><span>{label}</span>{children}</label>;
}

function todayInManila() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
}

export function TravelTripListActions({ choices, currencyCode }: { choices: TravelChoices; currencyCode: CurrencyCode }) {
  return (
    <SavingsActionDialog label="Plan a trip">
      <TravelForm action={createTripAction} idempotent submitLabel="Create trip">
        <Field label="Trip name"><input maxLength={100} name="name" placeholder="Summer in Japan" required /></Field>
        <Field label="Destination"><input maxLength={160} name="destination" placeholder="Tokyo, Japan" required /></Field>
        <div className="travel-form-grid">
          <Field label="Start date"><input name="startDate" type="date" /></Field>
          <Field label="End date"><input name="endDate" type="date" /></Field>
          <Field label="Travelers"><input defaultValue="1" max="100" min="1" name="travelerCount" required type="number" /></Field>
          <Field label="Country code"><input maxLength={2} name="countryCode" placeholder="JP" /></Field>
          <Field label="Currency">
            <select defaultValue={currencyCode} name="baseCurrencyCode">{currencyOptions()}</select>
          </Field>
          <Field label="Trip budget"><input inputMode="decimal" min="0" name="totalBudget" placeholder="0.00" step="0.01" type="number" /></Field>
        </div>
        <Field label="Savings goal (optional)">
          <select defaultValue="" name="linkedSavingsGoalId">
            <option value="">No linked goal</option>
            {choices.goals.map((goal: SavingsGoalRecord) => <option key={goal.id} value={goal.id}>{goal.name} · {goal.currencyCode}</option>)}
          </select>
        </Field>
        <input name="status" type="hidden" value="planning" />
        <Field label="Notes (optional)"><textarea maxLength={2000} name="notes" rows={3} /></Field>
      </TravelForm>
    </SavingsActionDialog>
  );
}

export function TravelJoinTrip() {
  return (
    <SavingsActionDialog label="Join a trip">
      <TravelForm action={joinTripAction} submitLabel="Join trip">
        <Field label="Trip code"><input autoCapitalize="characters" autoComplete="off" maxLength={20} name="code" placeholder="ABCD-2345" required /></Field>
        <p>Ask the trip owner for their code. You’ll see the itinerary, to-dos, and packing list — never their budget or expenses.</p>
      </TravelForm>
    </SavingsActionDialog>
  );
}

export function TravelLeaveButton({ tripId }: { tripId: string }) {
  return (
    <div className="travel-leave">
      <TravelForm action={leaveTripAction} confirm={false} submitLabel="Leave trip">
        <input name="tripId" type="hidden" value={tripId} />
      </TravelForm>
    </div>
  );
}

function formatShareCode(code: string) {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

function CopyCodeButton({ code }: { code: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
    window.setTimeout(() => setStatus("idle"), 2000);
  }
  return (
    <>
      <button className="button button-secondary travel-copy-code" onClick={copy} type="button">
        {status === "copied" ? <Check aria-hidden="true" size={13} /> : <Copy aria-hidden="true" size={13} />}
        {status === "copied" ? "Copied" : "Copy code"}
      </button>
      <span aria-live="polite" className="sr-only">{status === "copied" ? "Trip code copied to clipboard" : status === "failed" ? "Could not copy the trip code" : ""}</span>
      {status === "failed" ? <small className="travel-sharing-hint">Copy failed — select the code manually.</small> : null}
    </>
  );
}

function TravelSharingPanel({ detail }: { detail: TravelTripDetail }) {
  const { trip, sharing } = detail;
  return (
    <section className="travel-record-row travel-sharing">
      <h2>Share this trip</h2>
      {sharing.enabled && sharing.code ? (
        <>
          <p className="travel-share-code-row">Trip code: <strong className="travel-share-code">{formatShareCode(sharing.code)}</strong> <CopyCodeButton code={formatShareCode(sharing.code)} /></p>
          <p>People with this code can view your itinerary, to-dos, and packing list. Your budget, expenses, and bookings stay private.</p>
          <TravelForm action={setTripDefaultRoleAction} submitLabel="Save access">
            <input name="tripId" type="hidden" value={trip.id} />
            <Field label="Default access for new members">
              <select defaultValue={sharing.defaultRole} name="defaultRole">
                <option value="viewer">Can view</option>
                <option value="editor">Can edit itinerary, to-dos, packing</option>
              </select>
            </Field>
          </TravelForm>
          <div className="travel-sharing-actions">
            <TravelForm action={regenerateTripCodeAction} submitLabel="Generate new code">
              <input name="tripId" type="hidden" value={trip.id} />
            </TravelForm>
            <TravelForm action={disableTripSharingAction} submitLabel="Turn off sharing">
              <input name="tripId" type="hidden" value={trip.id} />
            </TravelForm>
          </div>
          <p className="travel-sharing-hint">A new code stops the old one from working; current members keep access. Turning sharing off removes access until you turn it back on.</p>
          <h3>Members ({sharing.members.length})</h3>
          {sharing.members.length === 0 ? <p className="travel-sharing-hint">No one has joined yet.</p> : (
            <div className="travel-table-wrap">
              <table className="travel-table travel-members-table">
                <thead>
                  <tr><th scope="col">Member</th><th scope="col">Access</th><th className="travel-table-amount" scope="col">Remove</th></tr>
                </thead>
                <tbody>
                  {sharing.members.map((member) => (
                    <tr key={member.userId}>
                      <td><strong>{member.name}</strong></td>
                      <td>
                        <TravelForm action={setTripMemberRoleAction} autoSubmit submitLabel="Update">
                          <input name="tripId" type="hidden" value={trip.id} />
                          <input name="memberId" type="hidden" value={member.userId} />
                          <select aria-label={`Access for ${member.name}`} defaultValue={member.role} name="role"><option value="viewer">Can view</option><option value="editor">Can edit</option></select>
                        </TravelForm>
                      </td>
                      <td className="travel-table-amount">
                        <TravelForm action={removeTripMemberAction} submitLabel="Remove">
                          <input name="tripId" type="hidden" value={trip.id} />
                          <input name="memberId" type="hidden" value={member.userId} />
                        </TravelForm>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <TravelForm action={enableTripSharingAction} submitLabel={sharing.code ? "Turn sharing back on" : "Create trip code"}>
          <input name="tripId" type="hidden" value={trip.id} />
          <p>Create a code so other Iponly users can join and see your plan.</p>
        </TravelForm>
      )}
    </section>
  );
}

export function SharedTripPlan({ detail }: { detail: SharedTripDetail }) {
  const canEdit = detail.role === "editor";
  return (
    <TravelTabs
      tabs={[
        {
          id: "itinerary",
          label: "Itinerary",
          content: canEdit ? <ItineraryList detail={detail} /> : (
            <section className="travel-record-row">
              <div className="travel-timeline-head"><h2>Itinerary</h2>{detail.itinerary.length > 0 ? <PrintItineraryButton /> : null}</div>
              <ItinerarySheet detail={detail} />
            </section>
          ),
        },
        {
          id: "todos",
          label: "To-dos",
          content: canEdit ? <TodoList detail={detail} /> : (
            <section className="travel-record-row">
              <TodoTable editable={false} todos={detail.todos} />
            </section>
          ),
        },
        {
          id: "packing",
          label: "Packing",
          content: canEdit ? <PackingList detail={detail} /> : (
            <section className="travel-record-row">
              <PackingTable editable={false} items={detail.packingItems} />
            </section>
          ),
        },
      ]}
    />
  );
}

export function TravelArchiveButton({ tripId, archived }: { tripId: string; archived: boolean }) {
  return (
    <TravelForm action={setTripArchivedAction} submitLabel={archived ? "Restore trip" : "Archive trip"}>
      <input name="tripId" type="hidden" value={tripId} />
      <input name="archived" type="hidden" value={String(!archived)} />
    </TravelForm>
  );
}

export function TravelTripActions({ detail, choices }: { detail: TravelTripDetail; choices: TravelChoices }) {
  const { trip } = detail;
  const editable = trip.archivedAt === null;
  const planned = detail.plannedExpenses.filter((expense) => expense.status !== "converted_to_actual");
  const detailsTab = editable ? (
    <TravelForm action={updateTripAction} submitLabel="Save trip">
      <input name="tripId" type="hidden" value={trip.id} />
      <Field label="Trip name"><input defaultValue={trip.name} maxLength={100} name="name" required /></Field>
      <Field label="Destination"><input defaultValue={trip.destination} maxLength={160} name="destination" required /></Field>
      <div className="travel-form-grid">
        <Field label="Start date"><input defaultValue={trip.startDate ?? ""} name="startDate" type="date" /></Field>
        <Field label="End date"><input defaultValue={trip.endDate ?? ""} name="endDate" type="date" /></Field>
        <Field label="Travelers"><input defaultValue={trip.travelerCount} max="100" min="1" name="travelerCount" required type="number" /></Field>
        <Field label="Country code"><input defaultValue={trip.countryCode ?? ""} maxLength={2} name="countryCode" /></Field>
        <Field label="Currency"><select defaultValue={trip.baseCurrencyCode} name="baseCurrencyCode">{currencyOptions()}</select></Field>
        <Field label="Trip budget"><input defaultValue={minorToInput(trip.totalBudgetMinor, trip.baseCurrencyCode)} inputMode="decimal" min="0" name="totalBudget" step="0.01" type="number" /></Field>
      </div>
      <Field label="Savings goal (optional)">
        <select defaultValue={trip.linkedSavingsGoalId ?? ""} name="linkedSavingsGoalId">
          <option value="">No linked goal</option>
          {trip.linkedSavingsGoalId && !choices.goals.some((goal) => goal.id === trip.linkedSavingsGoalId) && detail.savingsGoal ? (
            <option value={trip.linkedSavingsGoalId}>{detail.savingsGoal.name} · {detail.savingsGoal.currencyCode} · archived</option>
          ) : null}
          {choices.goals.map((goal: SavingsGoalRecord) => <option key={goal.id} value={goal.id}>{goal.name} · {goal.currencyCode}</option>)}
        </select>
      </Field>
      <Field label="Status">
        <select defaultValue={trip.status} name="status">
          {["idea", "planning", "booked", "ongoing", "completed", "cancelled"].map((status) => <option key={status} value={status}>{pretty(status)}</option>)}
        </select>
      </Field>
      <Field label="Notes (optional)"><textarea defaultValue={trip.notes ?? ""} maxLength={2000} name="notes" rows={3} /></Field>
    </TravelForm>
  ) : null;

  if (!editable) return <div className="travel-management"><p>This trip is archived and read-only.</p></div>;

  return (
    <div className="travel-management">
      <TravelTabs
        tabs={[
          { id: "details", label: "Details", content: detailsTab },
          {
            id: "expenses",
            label: "Expenses",
            content: (
              <RecordList
                actualAction={
                  <SavingsActionDialog label="Record actual expense">
                    <TravelForm action={createTravelExpenseAction} confirm idempotent submitLabel="Record expense">
                      <input name="tripId" type="hidden" value={trip.id} />
                      <Field label="Convert a plan (optional)">
                        <select defaultValue="" name="plannedExpenseId">
                          <option value="">No linked plan</option>
                          {planned.map((expense) => <option key={expense.id} value={expense.id}>{expense.description} · {formatMoney(expense.amountMinor, expense.currencyCode)}</option>)}
                        </select>
                      </Field>
                      <ExpenseFields currency={trip.baseCurrencyCode} />
                      <Field label="Merchant (optional)"><input maxLength={100} name="merchant" /></Field>
                      <Field label="Date"><input defaultValue={todayInManila()} name="transactionDate" required type="date" /></Field>
                      <Field label="Paid from Savings account (optional)">
                        <select defaultValue="" name="paymentAccountId"><option value="">No account link</option>{choices.accounts.map((account: SavingsAccountRecord) => <option key={account.id} value={account.id}>{account.name} · {account.currencyCode}</option>)}</select>
                      </Field>
                      <Field label="Add to Monthly Budget (optional)">
                        <select defaultValue="" name="budgetId"><option value="">No budget link</option>{choices.budgets.map(({ budget }) => <option key={budget.id} value={budget.id}>{budget.name} · {budget.year}-{String(budget.month).padStart(2, "0")} · {budget.currencyCode}</option>)}</select>
                      </Field>
                      <Field label="Budget category (optional)">
                        <select defaultValue="" name="budgetCategoryId"><option value="">No budget link</option>{choices.budgets.map(({ category }) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
                      </Field>
                      <Field label="Notes"><input maxLength={2000} name="notes" /></Field>
                    </TravelForm>
                  </SavingsActionDialog>
                }
                detail={detail}
                plannedAction={
                  <SavingsActionDialog label="Add planned expense">
                    <TravelForm action={createPlannedTravelExpenseAction} submitLabel="Add plan">
                      <input name="tripId" type="hidden" value={trip.id} />
                      <ExpenseFields currency={trip.baseCurrencyCode} />
                      <Field label="Expected date"><input name="expectedDate" type="date" /></Field>
                      <Field label="Notes"><input maxLength={2000} name="notes" /></Field>
                    </TravelForm>
                  </SavingsActionDialog>
                }
              />
            ),
          },
          { id: "itinerary", label: "Itinerary", content: <ItineraryList detail={detail} /> },
          { id: "todos", label: "To-dos", content: <TodoList detail={detail} /> },
          { id: "packing", label: "Packing", content: <PackingList detail={detail} /> },
          { id: "bookings", label: "Bookings", content: <BookingList detail={detail} /> },
          { id: "sharing", label: "Sharing", content: <TravelSharingPanel detail={detail} /> },
        ]}
      />
    </div>
  );
}

function TravelTabs({ tabs }: { tabs: { id: string; label: string; content: ReactNode }[] }) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");
  const baseId = useId();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const offset = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    const target = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : offset ? (index + offset + tabs.length) % tabs.length : -1;
    if (target < 0) return;
    event.preventDefault();
    const next = tabs[target];
    setActive(next.id);
    refs.current[next.id]?.focus();
  }
  return (
    <div className="travel-tabs">
      <div aria-label="Trip sections" className="travel-tablist" role="tablist">
        {tabs.map((tab, index) => (
          <button
            aria-controls={`${baseId}-${tab.id}-panel`}
            aria-selected={active === tab.id}
            className="travel-tab"
            id={`${baseId}-${tab.id}-tab`}
            key={tab.id}
            onClick={() => setActive(tab.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
            ref={(node) => { refs.current[tab.id] = node; }}
            role="tab"
            tabIndex={active === tab.id ? 0 : -1}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div
          aria-labelledby={`${baseId}-${tab.id}-tab`}
          className="travel-tabpanel"
          hidden={active !== tab.id}
          id={`${baseId}-${tab.id}-panel`}
          key={tab.id}
          role="tabpanel"
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}

function PlannedExpensesTable({ expenses }: { expenses: TravelTripDetail["plannedExpenses"] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  if (expenses.length === 0) return <p className="travel-sharing-hint">No planned expenses yet.</p>;
  return (
    <>
      <div className="travel-table-wrap">
        <table className="travel-table">
          <thead>
            <tr><th scope="col">Description</th><th scope="col">Category</th><th scope="col">Date</th><th scope="col">Status</th><th className="travel-table-amount" scope="col">Amount</th></tr>
          </thead>
          <tbody>
            {expenses.map((expense) => {
              const editable = expense.status !== "converted_to_actual";
              return (
                <tr
                  className={editable ? "is-clickable" : undefined}
                  key={expense.id}
                  onClick={editable ? () => setSelectedId(expense.id) : undefined}
                >
                  <td>
                    {editable ? (
                      <button aria-haspopup="dialog" className="travel-table-link" onClick={(event) => { event.stopPropagation(); setSelectedId(expense.id); }} type="button">{expense.description}</button>
                    ) : expense.description}
                  </td>
                  <td>{pretty(expense.category)}</td>
                  <td>{expense.expectedDate ?? "—"}</td>
                  <td>{pretty(expense.status)}</td>
                  <td className="travel-table-amount">{formatMoney(expense.amountMinor, expense.currencyCode)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {expenses.filter((expense) => expense.status !== "converted_to_actual").map((expense) => (
        <SavingsActionDialog key={expense.id} label="Edit planned expense" onClose={() => setSelectedId((current) => (current === expense.id ? null : current))} open={selectedId === expense.id} trigger={<></>}>
          <TravelForm action={updatePlannedTravelExpenseAction} submitLabel="Save">
            <input name="expenseId" type="hidden" value={expense.id} />
            <ExpenseFields currency={expense.currencyCode} initial={{ category: expense.category, description: expense.description, amountMinor: expense.amountMinor }} />
            <Field label="Status"><select defaultValue={expense.status} name="status"><option value="planned">Planned</option><option value="reserved">Reserved</option><option value="cancelled">Cancelled</option></select></Field>
            <Field label="Expected date"><input defaultValue={expense.expectedDate ?? ""} name="expectedDate" type="date" /></Field>
            <Field label="Notes"><input defaultValue={expense.notes ?? ""} maxLength={2000} name="notes" /></Field>
          </TravelForm>
        </SavingsActionDialog>
      ))}
    </>
  );
}

function RecordList({ detail, plannedAction, actualAction }: { detail: TravelTripDetail; plannedAction?: ReactNode; actualAction?: ReactNode }) {
  return (
    <div className="travel-record-list">
      <div className="travel-record-row">
        <div className="travel-record-head">
          <span><strong>Planned expenses</strong><small>{detail.plannedExpenses.length} item(s)</small></span>
          {plannedAction}
        </div>
        <PlannedExpensesTable expenses={detail.plannedExpenses} />
      </div>
      <div className="travel-record-row">
        <div className="travel-record-head">
          <span><strong>Actual expenses</strong><small>{detail.expenses.length} item(s)</small></span>
          {actualAction}
        </div>
        {detail.expenses.map((expense) => <ActualExpenseRow expense={expense} key={expense.id} />)}
      </div>
    </div>
  );
}

function ActualExpenseRow({ expense }: { expense: TravelTripDetail["expenses"][number] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="travel-expense-detail travel-expense-row">
      <span><strong>{expense.description}</strong><small>{expense.category.replaceAll("_", " ")} · {expense.transactionDate} · {expense.status}</small></span>
      <strong>{formatMoney(expense.amountMinor, expense.currencyCode)}</strong>
      {expense.status === "posted" ? (
        <>
          <button aria-haspopup="dialog" className="button button-secondary travel-reverse-trigger" onClick={() => setOpen(true)} type="button">Reverse</button>
          <SavingsActionDialog label="Reverse expense" onClose={() => setOpen(false)} open={open} trigger={<></>}>
            <TravelForm action={reverseTravelExpenseAction} confirm idempotent submitLabel="Reverse expense">
              <input name="expenseId" type="hidden" value={expense.id} />
              <p>{expense.description} · {formatMoney(expense.amountMinor, expense.currencyCode)}</p>
              <Field label="Reason"><input maxLength={300} name="reason" required /></Field>
            </TravelForm>
          </SavingsActionDialog>
        </>
      ) : null}
    </div>
  );
}

const itineraryIcons: Record<(typeof itineraryCategories)[number], LucideIcon> = {
  flight: Plane,
  accommodation: BedDouble,
  transport: Car,
  food: Utensils,
  activity: Flag,
  sightseeing: Camera,
  shopping: ShoppingBag,
  free_time: Coffee,
  other: MapPin,
};

function formatTime(value: string | null) {
  if (!value) return "";
  const [hours = "0", minutes = "00"] = value.split(":");
  const hour = Number(hours);
  return `${hour % 12 === 0 ? 12 : hour % 12}:${minutes} ${hour >= 12 ? "PM" : "AM"}`;
}

type ItineraryItem = PlanDetail["itinerary"][number];

export function ItineraryTimeline({ items, renderEdit }: { items: ItineraryItem[]; renderEdit?: (item: ItineraryItem) => ReactNode }) {
  const days = new Map<string, ItineraryItem[]>();
  for (const item of [...items].sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? "").localeCompare(b.startTime ?? "") || a.sortOrder - b.sortOrder)) {
    days.set(item.date, [...(days.get(item.date) ?? []), item]);
  }
  if (days.size === 0) return <p className="travel-hint">Nothing planned yet.</p>;
  return (
    <div className="travel-timeline">
      {[...days.entries()].map(([date, dayItems]) => (
        <section key={date}>
          <h3 className="travel-timeline-day">{formatDate(date, "EEE, MMM d")}</h3>
          <ol>
            {dayItems.map((item) => {
              const Icon = itineraryIcons[item.category];
              return (
                <li className="travel-timeline-item" key={item.id}>
                  <span className="travel-timeline-time">{item.startTime ? formatTime(item.startTime) : "—"}{item.endTime ? <small>to {formatTime(item.endTime)}</small> : null}</span>
                  <span aria-hidden="true" className="travel-timeline-rail"><span className="travel-timeline-icon"><Icon size={16} /></span><span className="travel-timeline-line" /></span>
                  <div className="travel-timeline-body">
                    <strong>{item.title}</strong>
                    {item.location ? <span>{item.location}</span> : null}
                    {item.description ? <span>{item.description}</span> : null}
                    {item.confirmationReference ? <span>Confirmation {item.confirmationReference}</span> : null}
                    {item.status !== "planned" ? <small>{pretty(item.status)}</small> : null}
                  </div>
                  {renderEdit ? renderEdit(item) : null}
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}

function ItineraryEditButton({ item }: { item: ItineraryItem }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="travel-timeline-edit" onClick={() => setOpen(true)} type="button"><Pencil aria-hidden="true" size={13} /> Edit</button>
      <SavingsActionDialog label="Edit itinerary item" onClose={() => setOpen(false)} open={open} trigger={<></>}>
        <TravelForm action={updateItineraryItemAction} key={[item.date, item.title, item.startTime, item.endTime, item.category, item.status, item.location, item.description].join("|")} submitLabel="Save">
          <input name="itemId" type="hidden" value={item.id} />
          <Field label="Date"><input defaultValue={item.date} name="date" required type="date" /></Field>
          <Field label="Title"><input defaultValue={item.title} maxLength={120} name="title" required /></Field>
          <div className="travel-form-grid">
            <Field label="Start time"><input defaultValue={item.startTime?.slice(0, 5) ?? ""} name="startTime" type="time" /></Field>
            <Field label="End time"><input defaultValue={item.endTime?.slice(0, 5) ?? ""} name="endTime" type="time" /></Field>
            <Field label="Category"><select defaultValue={item.category} name="category">{itineraryCategories.map((category) => <option key={category} value={category}>{pretty(category)}</option>)}</select></Field>
            <Field label="Status"><select defaultValue={item.status} name="status">{["planned", "confirmed", "completed", "cancelled"].map((status) => <option key={status} value={status}>{pretty(status)}</option>)}</select></Field>
          </div>
          <Field label="Location"><input defaultValue={item.location ?? ""} maxLength={160} name="location" /></Field>
          <Field label="Description"><input defaultValue={item.description ?? ""} maxLength={1000} name="description" /></Field>
          <input name="confirmationReference" type="hidden" value={item.confirmationReference ?? ""} />
          <input name="link" type="hidden" value={item.link ?? ""} />
          <input name="notes" type="hidden" value={item.notes ?? ""} />
          <input name="sortOrder" type="hidden" value={String(item.sortOrder)} />
        </TravelForm>
        <TravelForm action={deleteItineraryItemAction} submitLabel="Remove from itinerary">
          <input name="itemId" type="hidden" value={item.id} />
        </TravelForm>
      </SavingsActionDialog>
    </>
  );
}

function PrintItineraryButton() {
  function print() {
    const headers = document.querySelectorAll<HTMLElement>(".travel-print-header");
    const cleanup = () => {
      document.body.classList.remove("printing-itinerary");
      headers.forEach((header) => { header.style.display = "none"; });
      window.removeEventListener("afterprint", cleanup);
    };
    document.body.classList.add("printing-itinerary");
    headers.forEach((header) => { header.style.display = "block"; });
    window.addEventListener("afterprint", cleanup);
    window.print();
  }
  return <button className="button button-secondary" onClick={print} type="button"><Printer aria-hidden="true" size={14} /> Save as PDF</button>;
}

function ItinerarySheet({ detail, renderEdit }: { detail: Pick<PlanDetail, "itinerary"> & { trip: Pick<TripRecord, "name" | "destination" | "startDate" | "endDate"> }; renderEdit?: (item: ItineraryItem) => ReactNode }) {
  const { trip } = detail;
  const dates = trip.startDate ? `${formatDate(trip.startDate, "MMM d, yyyy")}${trip.endDate ? ` – ${formatDate(trip.endDate, "MMM d, yyyy")}` : ""}` : "";
  return (
    <div className="travel-print-area">
      <div className="travel-print-header" style={{ display: "none" }}>
        <h1>{trip.name}</h1>
        <p><strong>Location:</strong> {trip.destination}</p>
        {dates ? <p><strong>Dates:</strong> {dates}</p> : null}
      </div>
      <ItineraryTimeline items={detail.itinerary} renderEdit={renderEdit} />
    </div>
  );
}

function ItineraryList({ detail }: { detail: PlanDetail }) {
  return (
    <section className="travel-record-row">
      <div className="travel-timeline-head">
        <h2>Itinerary</h2>
        <div className="travel-list-actions">
          {detail.itinerary.length > 0 ? <PrintItineraryButton /> : null}
          <SavingsActionDialog label="Add a plan">
          <TravelForm action={createItineraryItemAction} submitLabel="Add itinerary item">
            <input name="tripId" type="hidden" value={detail.trip.id} />
            <Field label="Date"><input defaultValue={detail.trip.startDate ?? ""} name="date" required type="date" /></Field>
            <Field label="Title"><input maxLength={120} name="title" required /></Field>
            <div className="travel-form-grid">
              <Field label="Start time"><input name="startTime" type="time" /></Field>
              <Field label="End time"><input name="endTime" type="time" /></Field>
              <Field label="Category"><select defaultValue="other" name="category">{itineraryCategories.map((category) => <option key={category} value={category}>{pretty(category)}</option>)}</select></Field>
            </div>
            <Field label="Location"><input maxLength={160} name="location" /></Field>
            <Field label="Description"><input maxLength={1000} name="description" /></Field>
            <input name="sortOrder" type="hidden" value="0" />
          </TravelForm>
        </SavingsActionDialog>
        </div>
      </div>
      <ItinerarySheet detail={detail} renderEdit={(item) => <ItineraryEditButton item={item} />} />
    </section>
  );
}

type TodoItem = PlanDetail["todos"][number];

function TodoTable({ todos, editable }: { todos: TodoItem[]; editable: boolean }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  if (todos.length === 0) return <p className="travel-sharing-hint">No tasks yet.</p>;
  return (
    <>
      <div className="travel-table-wrap">
        <table className="travel-table">
          <thead>
            <tr><th scope="col">Task</th><th scope="col">Due date</th><th scope="col">Priority</th><th scope="col">Status</th></tr>
          </thead>
          <tbody>
            {todos.map((todo) => (
              <tr className={editable ? "is-clickable" : undefined} key={todo.id} onClick={editable ? () => setSelectedId(todo.id) : undefined}>
                <td>
                  {editable ? (
                    <button aria-haspopup="dialog" className="travel-table-link" onClick={(event) => { event.stopPropagation(); setSelectedId(todo.id); }} type="button">{todo.title}</button>
                  ) : todo.title}
                </td>
                <td>{todo.dueDate ?? "—"}</td>
                <td>{pretty(todo.priority)}</td>
                <td>{pretty(todo.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editable ? todos.map((todo) => (
        <SavingsActionDialog key={todo.id} label="Edit to-do" onClose={() => setSelectedId((current) => (current === todo.id ? null : current))} open={selectedId === todo.id} trigger={<></>}>
          <TravelForm action={updateTravelTodoAction} key={[todo.title, todo.dueDate, todo.priority, todo.status].join("|")} submitLabel="Save">
            <input name="todoId" type="hidden" value={todo.id} />
            <input name="description" type="hidden" value={todo.description ?? ""} />
            <Field label="Task"><input defaultValue={todo.title} maxLength={120} name="title" required /></Field>
            <div className="travel-form-grid">
              <Field label="Due date"><input defaultValue={todo.dueDate ?? ""} name="dueDate" type="date" /></Field>
              <Field label="Priority"><select defaultValue={todo.priority} name="priority"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option></select></Field>
              <Field label="Status"><select defaultValue={todo.status} name="status"><option value="pending">Pending</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></Field>
            </div>
          </TravelForm>
          <TravelForm action={deleteTravelTodoAction} submitLabel="Remove to-do">
            <input name="todoId" type="hidden" value={todo.id} />
          </TravelForm>
        </SavingsActionDialog>
      )) : null}
    </>
  );
}

function TodoList({ detail }: { detail: PlanDetail }) {
  return (
    <section className="travel-record-row">
      <div className="travel-timeline-head">
        <h2>To-dos</h2>
        <SavingsActionDialog label="Add to-do">
          <TravelForm action={createTravelTodoAction} submitLabel="Add to-do">
            <input name="tripId" type="hidden" value={detail.trip.id} />
            <Field label="Task"><input maxLength={120} name="title" required /></Field>
            <div className="travel-form-grid">
              <Field label="Due date"><input name="dueDate" type="date" /></Field>
              <Field label="Priority"><select defaultValue="normal" name="priority"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option></select></Field>
            </div>
          </TravelForm>
        </SavingsActionDialog>
      </div>
      <TodoTable editable todos={detail.todos} />
    </section>
  );
}

type PackingItem = PlanDetail["packingItems"][number];

function PackingTable({ items, editable }: { items: PackingItem[]; editable: boolean }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  if (items.length === 0) return <p className="travel-sharing-hint">No items yet.</p>;
  return (
    <>
      <div className="travel-table-wrap">
        <table className="travel-table">
          <thead>
            <tr><th scope="col">Item</th><th scope="col">Category</th><th scope="col">Quantity</th><th scope="col">Status</th></tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr className={editable ? "is-clickable" : undefined} key={item.id} onClick={editable ? () => setSelectedId(item.id) : undefined}>
                <td>
                  {editable ? (
                    <button aria-haspopup="dialog" className="travel-table-link" onClick={(event) => { event.stopPropagation(); setSelectedId(item.id); }} type="button">{item.name}</button>
                  ) : item.name}
                </td>
                <td>{pretty(item.category)}</td>
                <td>{item.quantity}</td>
                <td>{item.packed ? "Packed" : "Not packed"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editable ? items.map((item) => (
        <SavingsActionDialog key={item.id} label="Edit packing item" onClose={() => setSelectedId((current) => (current === item.id ? null : current))} open={selectedId === item.id} trigger={<></>}>
          <TravelForm action={updatePackingItemAction} key={[item.name, item.category, item.quantity, item.packed].join("|")} submitLabel="Save">
            <input name="itemId" type="hidden" value={item.id} />
            <input name="notes" type="hidden" value={item.notes ?? ""} />
            <Field label="Item"><input defaultValue={item.name} maxLength={120} name="name" required /></Field>
            <div className="travel-form-grid">
              <Field label="Category"><select defaultValue={item.category} name="category">{packingCategories.map((category) => <option key={category} value={category}>{pretty(category)}</option>)}</select></Field>
              <Field label="Quantity"><input defaultValue={item.quantity} max="1000" min="1" name="quantity" required type="number" /></Field>
              <Field label="Status"><select defaultValue={String(item.packed)} name="packed"><option value="false">Not packed</option><option value="true">Packed</option></select></Field>
            </div>
          </TravelForm>
          <TravelForm action={deletePackingItemAction} submitLabel="Remove item">
            <input name="itemId" type="hidden" value={item.id} />
          </TravelForm>
        </SavingsActionDialog>
      )) : null}
    </>
  );
}

function PackingList({ detail }: { detail: PlanDetail }) {
  return (
    <section className="travel-record-row">
      <div className="travel-timeline-head">
        <h2>Packing list</h2>
        <SavingsActionDialog label="Add item">
          <TravelForm action={createPackingItemAction} submitLabel="Add item">
            <input name="tripId" type="hidden" value={detail.trip.id} />
            <Field label="Item"><input maxLength={120} name="name" required /></Field>
            <div className="travel-form-grid">
              <Field label="Category"><select defaultValue="other" name="category">{packingCategories.map((category) => <option key={category} value={category}>{pretty(category)}</option>)}</select></Field>
              <Field label="Quantity"><input defaultValue="1" max="1000" min="1" name="quantity" required type="number" /></Field>
            </div>
          </TravelForm>
        </SavingsActionDialog>
      </div>
      <PackingTable editable items={detail.packingItems} />
    </section>
  );
}

type BookingItem = TravelTripDetail["bookings"][number];

function BookingFields({ booking }: { booking?: BookingItem }) {
  return (
    <>
      <Field label="Booking type"><select defaultValue={booking?.bookingType ?? "other"} name="bookingType">{bookingTypes.map((type) => <option key={type} value={type}>{pretty(type)}</option>)}</select></Field>
      <Field label="Title"><input defaultValue={booking?.title} maxLength={120} name="title" required /></Field>
      <div className="travel-form-grid">
        <Field label="Provider"><input defaultValue={booking?.provider ?? ""} maxLength={120} name="provider" /></Field>
        <Field label="Confirmation number"><input defaultValue={booking?.confirmationNumber ?? ""} maxLength={120} name="confirmationNumber" /></Field>
        <Field label="Booking date"><input defaultValue={booking?.bookingDate ?? ""} name="bookingDate" type="date" /></Field>
        <Field label="Status"><select defaultValue={booking?.status ?? "planned"} name="status"><option value="planned">Planned</option><option value="booked">Booked</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></Field>
      </div>
      <Field label="Reference link"><input defaultValue={booking?.link ?? ""} name="link" placeholder="https://…" type="url" /></Field>
      <div className="travel-form-grid">
        <Field label="Amount (optional)"><input defaultValue={booking && booking.amountMinor !== null && booking.currencyCode ? minorToInput(booking.amountMinor, booking.currencyCode) : ""} inputMode="decimal" min="0" name="amount" step="0.01" type="number" /></Field>
        <Field label="Currency (select with amount)"><select defaultValue={booking?.currencyCode ?? ""} name="currencyCode"><option value="">No amount</option>{currencyOptions()}</select></Field>
      </div>
      <Field label="Notes"><input defaultValue={booking?.notes ?? ""} maxLength={2000} name="notes" /></Field>
    </>
  );
}

function BookingTable({ bookings }: { bookings: BookingItem[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  if (bookings.length === 0) return <p className="travel-sharing-hint">No bookings yet.</p>;
  return (
    <>
      <div className="travel-table-wrap">
        <table className="travel-table">
          <thead>
            <tr><th scope="col">Booking</th><th scope="col">Type</th><th scope="col">Provider</th><th scope="col">Reference</th><th scope="col">Date</th><th scope="col">Status</th><th className="travel-table-amount" scope="col">Amount</th></tr>
          </thead>
          <tbody>
            {bookings.map((booking) => (
              <tr className="is-clickable" key={booking.id} onClick={() => setSelectedId(booking.id)}>
                <td><button aria-haspopup="dialog" className="travel-table-link" onClick={(event) => { event.stopPropagation(); setSelectedId(booking.id); }} type="button">{booking.title}</button></td>
                <td>{pretty(booking.bookingType)}</td>
                <td>{booking.provider ?? "—"}</td>
                <td>{booking.confirmationNumber ?? "—"}</td>
                <td>{booking.bookingDate ?? "—"}</td>
                <td>{pretty(booking.status)}</td>
                <td className="travel-table-amount">{booking.amountMinor !== null && booking.currencyCode ? formatMoney(booking.amountMinor, booking.currencyCode) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {bookings.map((booking) => (
        <SavingsActionDialog key={booking.id} label="Edit booking" onClose={() => setSelectedId((current) => (current === booking.id ? null : current))} open={selectedId === booking.id} trigger={<></>}>
          <TravelForm action={updateTravelBookingAction} key={[booking.title, booking.bookingType, booking.provider, booking.confirmationNumber, booking.bookingDate, booking.status, booking.amountMinor, booking.currencyCode, booking.link, booking.notes].join("|")} submitLabel="Save">
            <input name="bookingId" type="hidden" value={booking.id} />
            <input name="startDateTime" type="hidden" value={booking.startDateTime?.toISOString() ?? ""} />
            <input name="endDateTime" type="hidden" value={booking.endDateTime?.toISOString() ?? ""} />
            <BookingFields booking={booking} />
          </TravelForm>
          {booking.link ? <a href={booking.link} rel="noreferrer" target="_blank">Open booking link</a> : null}
        </SavingsActionDialog>
      ))}
    </>
  );
}

function BookingList({ detail }: { detail: TravelTripDetail }) {
  return (
    <section className="travel-record-row">
      <div className="travel-timeline-head">
        <h2>Bookings and references</h2>
        <SavingsActionDialog label="Add booking">
          <TravelForm action={createTravelBookingAction} submitLabel="Add booking">
            <input name="tripId" type="hidden" value={detail.trip.id} />
            <BookingFields />
          </TravelForm>
        </SavingsActionDialog>
      </div>
      <BookingTable bookings={detail.bookings} />
    </section>
  );
}

function ExpenseFields({
  currency,
  initial,
}: {
  currency: CurrencyCode;
  initial?: { category: string; description: string; amountMinor: number };
}) {
  return (
    <>
      <div className="travel-form-grid">
        <Field label="Category">
          <select defaultValue={initial?.category ?? "other"} name="category">{expenseCategories.map((category) => <option key={category} value={category}>{pretty(category)}</option>)}</select>
        </Field>
        <Field label="Currency"><select defaultValue={currency} name="currencyCode">{currencyOptions()}</select></Field>
      </div>
      <Field label="Description"><input defaultValue={initial?.description} maxLength={120} name="description" required /></Field>
      <Field label="Amount"><input defaultValue={initial ? minorToInput(initial.amountMinor, currency) : undefined} inputMode="decimal" min="0.01" name="amount" required step="0.01" type="number" /></Field>
    </>
  );
}

function currencyOptions() {
  return (["PHP", "USD", "EUR", "JPY"] as const).map((currency) => <option key={currency} value={currency}>{currency}</option>);
}

function minorToInput(amountMinor: number, currency: CurrencyCode) {
  const fractionDigits = currency === "JPY" ? 0 : 2;
  return (amountMinor / (10 ** fractionDigits)).toFixed(fractionDigits);
}

function pretty(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
