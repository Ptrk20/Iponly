import "server-only";
import { getDatabase, type IponlyDatabase } from "@/db";
import { aiActionProposals } from "@/db/schema";
import {
  aiActionDisplayPayloadSchema,
  aiActionPayloadSchemas,
  type AIActionDisplayPayload,
  type AIActionPayloadMap,
  type AIActionType,
} from "@/lib/validations/ai-actions";
import { formatMoney } from "@/lib/money";
import {
  findAIActionProposalForUser,
  findPendingAIActionProposals,
  insertAIActionAudit,
  insertAIActionProposal,
  listAIActionProposalsForUser,
  transitionAIActionProposal,
} from "@/repositories/ai-action-repository";
import {
  recordSavingsDeposit,
  recordSavingsWithdrawal,
  transferSavings,
} from "@/services/savings-service";
import { createBudgetExpense, createBudgetIncome } from "@/services/budget-service";
import { recordDebtPayment } from "@/services/debt-service";
import { createItineraryItem, createTravelTodo, recordTravelExpense } from "@/services/travel-service";
import type { AIActionProposalStatus } from "@/types/ai-actions";

const proposalLifetimeMs = 5 * 60_000;
const maximumPendingProposals = 5;
const defaultMaximumAmountMinor = 10_000_000;

export class AIActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIActionError";
  }
}

export interface AIActionProposalDTO {
  id: string;
  actionType: AIActionType;
  status: AIActionProposalStatus;
  display: AIActionDisplayPayload;
  expiresAt: string;
}

export interface AIActionResultDTO {
  ok: boolean;
  message: string;
  href?: string;
  duplicate?: boolean;
}

function maximumAmountMinor() {
  const configured = process.env.AI_ACTION_MAX_AMOUNT_MINOR;
  if (!configured) return defaultMaximumAmountMinor;
  const value = Number(configured);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("AI_ACTION_MAX_AMOUNT_MINOR must be a positive safe integer.");
  }
  return value;
}

function validatePayload(actionType: AIActionType, payload: unknown) {
  const parsed = aiActionPayloadSchemas[actionType].safeParse(payload);
  if (!parsed.success) throw new AIActionError("I couldn’t validate that action. Please check the details and try again.");
  const amountMinor = "amountMinor" in parsed.data ? parsed.data.amountMinor : undefined;
  if (amountMinor !== undefined && amountMinor > maximumAmountMinor()) {
    throw new AIActionError("This amount is above the Iponly AI action limit. Use the regular form to record it.");
  }
  return parsed.data;
}

export async function createAIActionProposal<K extends AIActionType>(
  userId: string,
  actionType: K,
  payload: AIActionPayloadMap[K],
  display: AIActionDisplayPayload,
  database: IponlyDatabase = getDatabase(),
): Promise<AIActionProposalDTO> {
  const validatedPayload = validatePayload(actionType, payload);
  const validatedDisplay = aiActionDisplayPayloadSchema.parse(display);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + proposalLifetimeMs);

  const proposal = await database.transaction(async (transaction) => {
    const proposals = await listAIActionProposalsForUser(userId, ["pending_confirmation"], transaction);
    const active = proposals.filter((item) => item.expiresAt > now);
    const duplicate = active.find((item) =>
      item.actionType === actionType &&
      JSON.stringify(validatePayload(item.actionType, item.normalizedPayload)) === JSON.stringify(validatedPayload),
    );
    if (duplicate) {
      await insertAIActionAudit({
        userId,
        proposalId: duplicate.id,
        actionType,
        eventType: "viewed",
        status: "pending_confirmation",
      }, transaction);
      return duplicate;
    }
    if (active.length >= maximumPendingProposals) {
      throw new AIActionError("You already have several pending AI actions. Confirm or cancel one before preparing another.");
    }

    for (const expired of proposals.filter((item) => item.expiresAt <= now)) {
      const changed = await transitionAIActionProposal(
        expired.id, userId, "pending_confirmation", "expired", {}, transaction,
      );
      if (changed) {
        await insertAIActionAudit({
          userId,
          proposalId: changed.id,
          actionType: changed.actionType,
          eventType: "expired",
          status: "expired",
        }, transaction);
      }
    }

    return insertAIActionProposal({
      userId,
      actionType,
      normalizedPayload: validatedPayload,
      displayPayload: validatedDisplay,
      idempotencyKey: crypto.randomUUID(),
      expiresAt,
    }, transaction);
  });

  return {
    id: proposal.id,
    actionType: proposal.actionType,
    status: proposal.status,
    display: aiActionDisplayPayloadSchema.parse(proposal.displayPayload),
    expiresAt: proposal.expiresAt.toISOString(),
  };
}

function toDomainAmount(amountMinor: number, currencyCode: "PHP" | "USD" | "EUR" | "JPY") {
  if (currencyCode === "JPY") return String(amountMinor);
  const whole = Math.floor(amountMinor / 100);
  const fraction = String(amountMinor % 100).padStart(2, "0");
  return `${whole}.${fraction}`;
}

function safeResultMessage(display: AIActionDisplayPayload, amountMinor?: number, currencyCode?: "PHP" | "USD" | "EUR" | "JPY") {
  const amount = amountMinor !== undefined && currencyCode
    ? `${formatMoney(amountMinor, currencyCode)} ${currencyCode}`
    : display.summary;
  return `${amount} — ${display.summary}`;
}

function resultHref(actionType: AIActionType) {
  switch (actionType) {
    case "savings_deposit":
    case "savings_withdrawal":
      return "/savings";
    case "account_transfer":
    case "budget_expense":
    case "budget_income":
      return "/budget";
    case "debt_payment":
      return "/debt";
    case "travel_expense":
    case "travel_todo":
    case "itinerary_item":
      return "/travel";
    default:
      return "/assistant";
  }
}

async function executeAction(
  userId: string,
  proposal: typeof aiActionProposals.$inferSelect,
  database: IponlyDatabase,
) {
  validatePayload(proposal.actionType, proposal.normalizedPayload);
  const display = aiActionDisplayPayloadSchema.parse(proposal.displayPayload);
  const key = proposal.idempotencyKey;

  switch (proposal.actionType) {
    case "savings_deposit": {
      const payload = aiActionPayloadSchemas.savings_deposit.parse(proposal.normalizedPayload);
      const result = await recordSavingsDeposit(userId, {
        accountId: payload.accountId,
        amount: toDomainAmount(payload.amountMinor, payload.currencyCode),
        transactionDate: payload.transactionDate,
        description: payload.description,
        notes: payload.notes,
        idempotencyKey: key,
      }, database);
      return {
        referenceType: "savings_transaction",
        referenceId: result.transactionId,
        message: `Deposit recorded. Updated balance: ${formatMoney(result.balanceMinor, result.currencyCode)} ${result.currencyCode}.`,
        href: resultHref(proposal.actionType),
      };
    }
    case "savings_withdrawal": {
      const payload = aiActionPayloadSchemas.savings_withdrawal.parse(proposal.normalizedPayload);
      const result = await recordSavingsWithdrawal(userId, {
        accountId: payload.accountId,
        amount: toDomainAmount(payload.amountMinor, payload.currencyCode),
        transactionDate: payload.transactionDate,
        description: payload.description,
        notes: payload.notes,
        idempotencyKey: key,
      }, database);
      return {
        referenceType: "savings_transaction",
        referenceId: result.transactionId,
        message: `Withdrawal recorded. Updated balance: ${formatMoney(result.balanceMinor, result.currencyCode)} ${result.currencyCode}.`,
        href: resultHref(proposal.actionType),
      };
    }
    case "account_transfer": {
      const payload = aiActionPayloadSchemas.account_transfer.parse(proposal.normalizedPayload);
      const result = await transferSavings(userId, {
        sourceAccountId: payload.sourceAccountId,
        destinationAccountId: payload.destinationAccountId,
        amount: toDomainAmount(payload.amountMinor, payload.currencyCode),
        transactionDate: payload.transactionDate,
        description: payload.description,
        idempotencyKey: key,
      }, database);
      return {
        referenceType: "savings_transfer",
        referenceId: result.transferId,
        message: `Transfer recorded. Source balance: ${formatMoney(result.sourceBalanceMinor, result.currencyCode)} ${result.currencyCode}; destination balance: ${formatMoney(result.destinationBalanceMinor, result.currencyCode)} ${result.currencyCode}.`,
        href: resultHref(proposal.actionType),
      };
    }
    case "budget_expense": {
      const payload = aiActionPayloadSchemas.budget_expense.parse(proposal.normalizedPayload);
      const result = await createBudgetExpense(userId, {
        budgetId: payload.budgetId,
        categoryId: payload.categoryId,
        amount: toDomainAmount(payload.amountMinor, payload.currencyCode),
        transactionDate: payload.transactionDate,
        merchant: payload.merchant,
        description: payload.description,
        paymentAccountId: payload.paymentAccountId,
        notes: payload.notes,
        idempotencyKey: key,
      }, database);
      return {
        referenceType: "budget_expense",
        referenceId: result.id,
        message: `Budget expense recorded: ${safeResultMessage(display, payload.amountMinor, payload.currencyCode)}.`,
        href: resultHref(proposal.actionType),
      };
    }
    case "budget_income": {
      const payload = aiActionPayloadSchemas.budget_income.parse(proposal.normalizedPayload);
      const result = await createBudgetIncome(userId, {
        budgetId: payload.budgetId,
        name: payload.name,
        incomeType: payload.incomeType,
        plannedAmount: toDomainAmount(payload.amountMinor, payload.currencyCode),
        expectedDate: payload.expectedDate,
        receivedDate: payload.receivedDate,
        idempotencyKey: key,
      }, database);
      return {
        referenceType: "budget_income",
        referenceId: result.id,
        message: `${payload.receivedDate ? "Received income recorded" : "Planned income added"}: ${formatMoney(payload.amountMinor, payload.currencyCode)} ${payload.currencyCode}.`,
        href: resultHref(proposal.actionType),
      };
    }
    case "debt_payment": {
      const payload = aiActionPayloadSchemas.debt_payment.parse(proposal.normalizedPayload);
      const result = await recordDebtPayment(userId, {
        debtId: payload.debtId,
        installmentId: payload.installmentId,
        amount: toDomainAmount(payload.amountMinor, payload.currencyCode),
        paymentDate: payload.paymentDate,
        paymentType: payload.paymentType,
        sourceAccountId: payload.sourceAccountId,
        description: payload.description,
        idempotencyKey: key,
      }, database);
      return {
        referenceType: "debt_payment",
        referenceId: result.paymentId,
        message: `Debt payment recorded. Updated debt balance: ${formatMoney(result.debtBalanceMinor, result.currencyCode)} ${result.currencyCode}.`,
        href: resultHref(proposal.actionType),
      };
    }
    case "travel_expense": {
      const payload = aiActionPayloadSchemas.travel_expense.parse(proposal.normalizedPayload);
      const result = await recordTravelExpense(userId, {
        tripId: payload.tripId,
        category: payload.category,
        amount: toDomainAmount(payload.amountMinor, payload.currencyCode),
        currencyCode: payload.currencyCode,
        transactionDate: payload.transactionDate,
        description: payload.description,
        paymentAccountId: payload.paymentAccountId,
        budgetId: payload.budgetId,
        budgetCategoryId: payload.budgetCategoryId,
        notes: payload.notes,
        idempotencyKey: key,
      }, database);
      return {
        referenceType: "travel_expense",
        referenceId: result.expense.id,
        message: `Travel expense recorded: ${safeResultMessage(display, payload.amountMinor, payload.currencyCode)}.`,
        href: resultHref(proposal.actionType),
      };
    }
    case "travel_todo": {
      const payload = aiActionPayloadSchemas.travel_todo.parse(proposal.normalizedPayload);
      const result = await createTravelTodo(userId, {
        tripId: payload.tripId,
        title: payload.title,
        description: payload.description,
        dueDate: payload.dueDate,
        priority: payload.priority,
        idempotencyKey: key,
      }, database);
      return {
        referenceType: "travel_todo",
        referenceId: result.id,
        message: `Travel task added: ${payload.title}.`,
        href: resultHref(proposal.actionType),
      };
    }
    case "itinerary_item": {
      const payload = aiActionPayloadSchemas.itinerary_item.parse(proposal.normalizedPayload);
      const result = await createItineraryItem(userId, {
        tripId: payload.tripId,
        date: payload.date,
        startTime: payload.startTime,
        endTime: payload.endTime,
        title: payload.title,
        location: payload.location,
        category: payload.category,
        description: payload.description,
        sortOrder: 0,
        idempotencyKey: key,
      }, database);
      return {
        referenceType: "itinerary_item",
        referenceId: result.id,
        message: `Itinerary item added: ${payload.title}.`,
        href: resultHref(proposal.actionType),
      };
    }
  }
}

function safeFailureMessage(error: unknown) {
  if (error instanceof Error && /RuleError$/.test(error.name)) return error.message;
  if (error instanceof RangeError) return error.message;
  return "I couldn’t complete that action. Your records were not reported as changed; check the relevant page before retrying.";
}

export async function cancelAIActionProposal(
  userId: string,
  proposalId: string,
  database: IponlyDatabase = getDatabase(),
): Promise<AIActionResultDTO> {
  const proposal = await findAIActionProposalForUser(proposalId, userId, database);
  if (!proposal) return { ok: false, message: "This proposal was not found." };
  if (proposal.status === "cancelled") return { ok: true, message: "This proposal is already cancelled." };
  if (proposal.status !== "pending_confirmation") {
    return { ok: false, message: "This proposal can no longer be cancelled." };
  }

  const now = new Date();
  const expired = proposal.expiresAt <= now;
  const status = expired ? "expired" : "cancelled";
  const updated = await database.transaction(async (transaction) => {
    const changed = await transitionAIActionProposal(
      proposal.id,
      userId,
      "pending_confirmation",
      status,
      expired ? {} : { cancelledAt: now },
      transaction,
    );
    if (!changed) return null;
    await insertAIActionAudit({
      userId,
      proposalId: proposal.id,
      actionType: proposal.actionType,
      eventType: status,
      status,
    }, transaction);
    return changed;
  });

  if (!updated) return { ok: false, message: "This proposal is already being processed." };
  return expired
    ? { ok: false, message: "This proposal expired. Prepare a new action to continue." }
    : { ok: true, message: "Proposal cancelled. No changes were made." };
}

export async function confirmAIActionProposal(
  userId: string,
  proposalId: string,
  database: IponlyDatabase = getDatabase(),
): Promise<AIActionResultDTO> {
  let proposal = await findAIActionProposalForUser(proposalId, userId, database);
  if (!proposal) return { ok: false, message: "This proposal was not found." };
  if (proposal.status === "completed" && proposal.resultPayload) {
    const result = proposal.resultPayload as { message?: unknown; href?: unknown };
    return {
      ok: true,
      duplicate: true,
      message: typeof result.message === "string" ? result.message : "This action was already completed.",
      href: typeof result.href === "string" ? result.href : undefined,
    };
  }
  const now = new Date();
  const mayRecoverExecution = proposal.status === "executing" && now.getTime() - proposal.updatedAt.getTime() >= 30_000;
  if (proposal.status !== "pending_confirmation" && !mayRecoverExecution) {
    return { ok: false, message: proposal.status === "executing" ? "This action is still being processed. Please wait before retrying." : "This proposal can no longer be confirmed." };
  }
  if (proposal.status === "pending_confirmation" && proposal.expiresAt <= now) {
    const changed = await transitionAIActionProposal(
      proposal.id, userId, "pending_confirmation", "expired", {}, database,
    );
    if (changed) {
      await insertAIActionAudit({
        userId, proposalId: proposal.id, actionType: proposal.actionType, eventType: "expired", status: "expired",
      }, database);
    }
    return { ok: false, message: "This proposal expired. Prepare a new action to continue." };
  }

  const claimed = mayRecoverExecution ? proposal : await database.transaction(async (transaction) => {
    const confirmed = await transitionAIActionProposal(
      proposal.id, userId, "pending_confirmation", "confirmed", { confirmedAt: now }, transaction,
    );
    if (!confirmed) return null;
    await insertAIActionAudit({
      userId, proposalId: proposal.id, actionType: proposal.actionType, eventType: "confirmed", status: "confirmed",
    }, transaction);
    const executing = await transitionAIActionProposal(
      proposal.id, userId, "confirmed", "executing", {}, transaction,
    );
    if (!executing) throw new Error("The confirmed proposal could not enter execution.");
    await insertAIActionAudit({
      userId, proposalId: proposal.id, actionType: proposal.actionType, eventType: "execution_started", status: "executing",
    }, transaction);
    return executing;
  });
  if (!claimed) {
    proposal = await findAIActionProposalForUser(proposalId, userId, database);
    if (proposal?.status === "completed" && proposal.resultPayload) {
      const result = proposal.resultPayload as { message?: unknown; href?: unknown };
      return { ok: true, duplicate: true, message: typeof result.message === "string" ? result.message : "This action was already completed.", href: typeof result.href === "string" ? result.href : undefined };
    }
    return { ok: false, message: "This proposal is already being processed or is no longer available." };
  }

  try {
    const result = await executeAction(userId, claimed, database);
    await database.transaction(async (transaction) => {
      const changed = await transitionAIActionProposal(
        claimed.id,
        userId,
        "executing",
        "completed",
        {
          executedAt: new Date(),
          resultReferenceType: result.referenceType,
          resultReferenceId: result.referenceId,
          resultPayload: { message: result.message, href: result.href },
        },
        transaction,
      );
      if (!changed) throw new Error("The executed proposal could not be completed.");
      await insertAIActionAudit({
        userId,
        proposalId: claimed.id,
        actionType: claimed.actionType,
        eventType: "completed",
        status: "completed",
        targetType: result.referenceType,
        targetId: result.referenceId,
      }, transaction);
      return changed;
    });
    return {
      ok: true,
      message: result.message,
      href: result.href,
      duplicate: false,
    };
  } catch (error) {
    const terminalFailure = error instanceof RangeError ||
      (error instanceof Error && /RuleError$/.test(error.name));
    if (terminalFailure) {
      const updated = await transitionAIActionProposal(
        claimed.id,
        userId,
        "executing",
        "failed",
        { failedAt: new Date(), failureCode: error instanceof Error ? error.name.slice(0, 80) : "unknown" },
        database,
      );
      if (updated) {
        await insertAIActionAudit({
          userId,
          proposalId: claimed.id,
          actionType: claimed.actionType,
          eventType: "failed",
          status: "failed",
          errorCode: updated.failureCode,
        }, database);
      }
    } else {
      await insertAIActionAudit({
        userId,
        proposalId: claimed.id,
        actionType: claimed.actionType,
        eventType: "failed",
        status: "executing",
        errorCode: "transient_execution_error",
      }, database);
      console.error("Iponly AI action execution failed.", { category: "execution" });
      return { ok: false, message: "I couldn’t verify the result yet. Check the related Iponly page, then retry this same proposal after a short wait. Do not prepare a duplicate action." };
    }
    return { ok: false, message: safeFailureMessage(error) };
  }
}

export async function getAIActionHistory(
  userId: string,
  statuses: AIActionProposalStatus[] = [],
  database: IponlyDatabase = getDatabase(),
) {
  const expiredProposals = await findPendingAIActionProposals(userId, database);
  for (const expired of expiredProposals) {
    const changed = await transitionAIActionProposal(
      expired.id, userId, "pending_confirmation", "expired", {}, database,
    );
    if (changed) {
      await insertAIActionAudit({
        userId,
        proposalId: changed.id,
        actionType: changed.actionType,
        eventType: "expired",
        status: "expired",
      }, database);
    }
  }
  const proposals = await listAIActionProposalsForUser(userId, statuses, database);
  return proposals.map((proposal) => ({
    id: proposal.id,
    actionType: proposal.actionType,
    status: proposal.status,
    display: aiActionDisplayPayloadSchema.parse(proposal.displayPayload),
    createdAt: proposal.createdAt.toISOString(),
    expiresAt: proposal.expiresAt.toISOString(),
    result: proposal.resultPayload,
  }));
}
