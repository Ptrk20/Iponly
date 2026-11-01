"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { AIActionProposalStatus } from "@/types/ai-actions";
import { getSafeIponlyRouteByPath } from "@/lib/ai/safety";

interface ActionHistoryEntry {
  id: string;
  actionType: string;
  status: AIActionProposalStatus;
  display: {
    title: string;
    summary: string;
    details: Array<{ label: string; value: string }>;
  };
  createdAt: string;
  expiresAt: string;
  result: unknown;
}

function resultText(value: unknown) {
  if (typeof value !== "object" || value === null || !("message" in value) || typeof value.message !== "string") return null;
  return value.message;
}

function resultLink(value: unknown) {
  if (typeof value !== "object" || value === null || !("href" in value) || typeof value.href !== "string") return undefined;
  return getSafeIponlyRouteByPath(value.href);
}

export function AssistantActionHistory({ initialEntries }: { initialEntries: ActionHistoryEntry[] }) {
  const [entries, setEntries] = useState(initialEntries);
  const [filter, setFilter] = useState<"all" | AIActionProposalStatus>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const visibleEntries = useMemo(
    () => filter === "all" ? entries : entries.filter((entry) => entry.status === filter),
    [entries, filter],
  );

  async function act(entry: ActionHistoryEntry, action: "confirm" | "cancel") {
    if (busyId) return;
    setBusyId(entry.id);
    setError("");
    try {
      const response = await fetch("/api/ai-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, proposalId: entry.id }),
      });
      const body: unknown = await response.json().catch(() => null);
      const message = resultText(body) ??
        (typeof body === "object" && body !== null && "error" in body && typeof body.error === "string" ? body.error : "The action request could not be completed.");
      if (!response.ok) {
        setError(message);
        if (/expired/i.test(message)) {
          setEntries((current) => current.map((item) => item.id === entry.id ? { ...item, status: "expired" } : item));
        }
        return;
      }

      const status: AIActionProposalStatus = action === "confirm" ? "completed" : "cancelled";
      setEntries((current) => current.map((item) => item.id === entry.id
        ? { ...item, status, result: { message, href: typeof body === "object" && body !== null && "href" in body ? body.href : undefined } }
        : item));
    } catch {
      setError("I couldn’t reach Iponly. Check the related page before trying again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="page-stack">
      <label className="form-field assistant-history-filter">
        <span>Filter actions</span>
        <select onChange={(event) => setFilter(event.target.value as "all" | AIActionProposalStatus)} value={filter}>
          <option value="all">All statuses</option>
          <option value="completed">Completed</option>
          <option value="pending_confirmation">Needs confirmation</option>
          <option value="cancelled">Cancelled</option>
          <option value="expired">Expired</option>
          <option value="failed">Failed</option>
        </select>
      </label>
      {error ? <p className="assistant-error" role="alert">{error}</p> : null}
      {visibleEntries.length ? visibleEntries.map((entry) => (
        <article className="panel assistant-history-entry" key={entry.id}>
          <div className="assistant-history-heading">
            <div>
              <p className="eyebrow">{entry.actionType.replaceAll("_", " ")}</p>
              <h2>{entry.display.title}</h2>
            </div>
            <span className={`assistant-history-status status-${entry.status}`}>{entry.status.replaceAll("_", " ")}</span>
          </div>
          <p>{entry.display.summary}</p>
          <dl>
            {entry.display.details.map((detail) => (
              <div key={`${detail.label}-${detail.value}`}><dt>{detail.label}</dt><dd>{detail.value}</dd></div>
            ))}
          </dl>
          <p className="assistant-action-expiry">
            Proposed {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.createdAt))}
            {entry.status === "pending_confirmation"
              ? ` · Expires ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.expiresAt))}`
              : ""}
          </p>
          {resultText(entry.result) ? <p role="status">{resultText(entry.result)}</p> : null}
          {entry.status === "pending_confirmation" ? (
            <div className="assistant-action-buttons">
              <button className="button button-secondary" disabled={busyId === entry.id} onClick={() => void act(entry, "cancel")} type="button">Cancel</button>
              <button className="button button-primary" disabled={busyId === entry.id} onClick={() => void act(entry, "confirm")} type="button">
                {busyId === entry.id ? "Processing…" : "Confirm this action"}
              </button>
            </div>
          ) : null}
          {resultLink(entry.result) ? <Link className="assistant-route-link" href={resultLink(entry.result)!.href}>{resultLink(entry.result)!.label}</Link> : null}
        </article>
      )) : <p className="empty-state">No AI actions match this filter.</p>}
    </div>
  );
}
