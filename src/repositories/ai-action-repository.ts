import "server-only";
import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { getDatabase, type IponlyDatabase } from "@/db";
import { aiActionAudits, aiActionProposals } from "@/db/schema";
import type { AIActionDisplayPayload, AIActionType } from "@/lib/validations/ai-actions";
import type { AIActionProposalStatus } from "@/types/ai-actions";

type AIActionTransaction = Parameters<Parameters<IponlyDatabase["transaction"]>[0]>[0];
export type AIActionExecutor = IponlyDatabase | AIActionTransaction;

export async function insertAIActionProposal(
  values: {
    userId: string;
    actionType: AIActionType;
    normalizedPayload: unknown;
    displayPayload: AIActionDisplayPayload;
    idempotencyKey: string;
    expiresAt: Date;
  },
  database: AIActionExecutor = getDatabase(),
) {
  const [proposal] = await database.insert(aiActionProposals).values({
    ...values,
    status: "pending_confirmation",
  }).returning();
  if (!proposal) throw new Error("The AI action proposal could not be created.");
  await insertAIActionAudit({
    userId: values.userId,
    proposalId: proposal.id,
    actionType: values.actionType,
    eventType: "proposed",
    status: "pending_confirmation",
    amountMinor: getAmount(values.normalizedPayload),
    currencyCode: getCurrency(values.normalizedPayload),
  }, database);
  return proposal;
}

export async function findAIActionProposalForUser(
  proposalId: string,
  userId: string,
  database: AIActionExecutor = getDatabase(),
) {
  const [proposal] = await database.select().from(aiActionProposals)
    .where(and(eq(aiActionProposals.id, proposalId), eq(aiActionProposals.userId, userId)))
    .limit(1);
  return proposal ?? null;
}

export async function findPendingAIActionProposals(userId: string, database: AIActionExecutor = getDatabase()) {
  return database.select({ id: aiActionProposals.id })
    .from(aiActionProposals)
    .where(and(
      eq(aiActionProposals.userId, userId),
      eq(aiActionProposals.status, "pending_confirmation"),
      lt(aiActionProposals.expiresAt, new Date()),
    ));
}

export async function listAIActionProposalsForUser(
  userId: string,
  statuses: AIActionProposalStatus[] = [],
  database: AIActionExecutor = getDatabase(),
) {
  return database.select().from(aiActionProposals)
    .where(and(
      eq(aiActionProposals.userId, userId),
      statuses.length ? inArray(aiActionProposals.status, statuses) : undefined,
    ))
    .orderBy(desc(aiActionProposals.createdAt))
    .limit(100);
}

export async function transitionAIActionProposal(
  proposalId: string,
  userId: string,
  fromStatus: AIActionProposalStatus,
  toStatus: AIActionProposalStatus,
  changes: Partial<Pick<typeof aiActionProposals.$inferInsert,
    "confirmedAt" | "cancelledAt" | "executedAt" | "failedAt" | "failureCode" |
    "resultReferenceType" | "resultReferenceId" | "resultPayload">> = {},
  database: AIActionExecutor = getDatabase(),
) {
  const [proposal] = await database.update(aiActionProposals)
    .set({ ...changes, status: toStatus, updatedAt: new Date() })
    .where(and(
      eq(aiActionProposals.id, proposalId),
      eq(aiActionProposals.userId, userId),
      eq(aiActionProposals.status, fromStatus),
    ))
    .returning();
  return proposal ?? null;
}

export async function insertAIActionAudit(
  values: Omit<typeof aiActionAudits.$inferInsert, "id" | "createdAt">,
  database: AIActionExecutor = getDatabase(),
) {
  await database.insert(aiActionAudits).values(values);
}

function getAmount(payload: unknown) {
  return typeof payload === "object" && payload !== null && "amountMinor" in payload &&
    typeof payload.amountMinor === "number" ? payload.amountMinor : null;
}

function getCurrency(payload: unknown) {
  return typeof payload === "object" && payload !== null && "currencyCode" in payload &&
    (payload.currencyCode === "PHP" || payload.currencyCode === "USD" || payload.currencyCode === "EUR" || payload.currencyCode === "JPY")
    ? payload.currencyCode
    : null;
}
