import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import type { IponlyDatabase } from "@/db";
import { createActionPreparationTools } from "@/ai/action-tools";
import {
  cancelAIActionProposal,
  confirmAIActionProposal,
  createAIActionProposal,
} from "@/services/ai-action-service";
import { createSavingsAccount, recordSavingsDeposit } from "@/services/savings-service";

describe("confirmed Iponly AI actions", () => {
  let client: PGlite;
  let database: IponlyDatabase;

  beforeEach(async () => {
    client = new PGlite();
    const testDatabase = drizzle({ client, schema });
    database = testDatabase as unknown as IponlyDatabase;
    await migrate(testDatabase, { migrationsFolder: "src/db/migrations" });
    await testDatabase.insert(schema.user).values([
      { id: "ai-action-user-a", name: "Alex A", email: "ai-action-a@example.test" },
      { id: "ai-action-user-b", name: "Bailey B", email: "ai-action-b@example.test" },
    ]);
  });

  afterEach(async () => {
    await client.close();
  });

  async function createAccount(userId = "ai-action-user-a") {
    return createSavingsAccount(userId, {
      name: "Maya Savings",
      accountType: "digital_wallet",
      currencyCode: "PHP",
      openingBalance: "1000.00",
      includeInTotal: true,
      idempotencyKey: crypto.randomUUID(),
    }, database);
  }

  async function depositProposal(accountId: string) {
    return createAIActionProposal("ai-action-user-a", "savings_deposit", {
      accountId,
      amountMinor: 50_000,
      currencyCode: "PHP",
      transactionDate: new Date().toISOString().slice(0, 10),
      description: "AI-prepared deposit",
    }, {
      title: "Savings deposit",
      summary: "₱500.00 PHP to Maya Savings",
      details: [
        { label: "Account", value: "Maya Savings" },
        { label: "Amount", value: "₱500.00 PHP" },
      ],
      href: "/savings",
      confirmLabel: "Confirm deposit",
    }, database);
  }

  it("prepares a savings action without mutating domain records", async () => {
    const account = await createAccount();
    const before = await database.select().from(schema.accountTransactions);
    let proposalId: string | undefined;
    const tools = createActionPreparationTools({
      userId: "ai-action-user-a",
      timezone: "Asia/Manila",
      defaultCurrencyCode: "PHP",
      originalMessage: "Add ₱500 to my Maya Savings.",
      database,
      onPrepared: (proposal) => { proposalId = proposal.id; },
    });

    await tools.prepareSavingsDeposit.execute?.({
      accountName: "Maya Savings",
      amount: "500",
      currencyCode: undefined,
      transactionDate: undefined,
      description: undefined,
      notes: undefined,
    }, { toolCallId: "prepare-test", messages: [], context: {} });

    expect(proposalId).toBeTruthy();
    expect(await database.select().from(schema.accountTransactions)).toHaveLength(before.length);
    const [proposal] = await database.select().from(schema.aiActionProposals)
      .where(eq(schema.aiActionProposals.id, proposalId!));
    expect(proposal?.status).toBe("pending_confirmation");
    expect((await database.select().from(schema.aiActionAudits))).toHaveLength(1);
    expect(account.currencyCode).toBe("PHP");
  });

  it("creates at most one proposal when preparation tools run concurrently", async () => {
    const account = await createAccount();
    const tools = createActionPreparationTools({
      userId: "ai-action-user-a",
      timezone: "Asia/Manila",
      defaultCurrencyCode: "PHP",
      originalMessage: "Add ₱500 to my Maya Savings.",
      database,
      onPrepared: () => undefined,
    });
    const input = {
      accountName: "Maya Savings",
      amount: "500",
      currencyCode: undefined,
      transactionDate: undefined,
      description: undefined,
      notes: undefined,
    };

    const results = await Promise.all([
      tools.prepareSavingsDeposit.execute?.(input, { toolCallId: "prepare-a", messages: [], context: {} }),
      tools.prepareSavingsDeposit.execute?.(input, { toolCallId: "prepare-b", messages: [], context: {} }),
    ]);
    const proposals = results.filter((result) =>
      typeof result === "object" && result !== null && "status" in result &&
      typeof result.status === "string" && result.status === "proposal-ready",
    );

    expect(proposals).toHaveLength(1);
    expect(await database.select().from(schema.aiActionProposals)).toHaveLength(1);
    expect(account.currencyCode).toBe("PHP");
  });

  it("requires confirmation and executes a deposit exactly once", async () => {
    const account = await createAccount();
    const before = await database.select().from(schema.accountTransactions);
    const proposal = await depositProposal(account.accountId);

    expect(await database.select().from(schema.accountTransactions)).toHaveLength(before.length);
    const first = await confirmAIActionProposal("ai-action-user-a", proposal.id, database);
    const duplicate = await confirmAIActionProposal("ai-action-user-a", proposal.id, database);
    const transactions = await database.select().from(schema.accountTransactions)
      .where(eq(schema.accountTransactions.transactionType, "deposit"));
    const savedProposal = await database.select().from(schema.aiActionProposals)
      .where(eq(schema.aiActionProposals.id, proposal.id));

    expect(first).toMatchObject({ ok: true, duplicate: false });
    expect(first.message).toContain("Updated balance");
    expect(duplicate).toMatchObject({ ok: true, duplicate: true });
    expect(transactions).toHaveLength(1);
    expect(savedProposal[0]?.status).toBe("completed");
  });

  it("reuses an identical active proposal instead of creating duplicates", async () => {
    const account = await createAccount();
    const first = await depositProposal(account.accountId);
    const second = await depositProposal(account.accountId);

    expect(second.id).toBe(first.id);
    expect(await database.select().from(schema.aiActionProposals)).toHaveLength(1);
    expect(await database.select().from(schema.aiActionAudits)).toHaveLength(2);
  });

  it("recovers a stale execution without duplicating a completed domain write", async () => {
    const account = await createAccount();
    const proposal = await depositProposal(account.accountId);
    const stored = await database.query.aiActionProposals.findFirst({
      where: eq(schema.aiActionProposals.id, proposal.id),
    });
    expect(stored).toBeTruthy();
    await recordSavingsDeposit("ai-action-user-a", {
      accountId: account.accountId,
      amount: "500.00",
      transactionDate: new Date().toISOString().slice(0, 10),
      description: "AI-prepared deposit",
      idempotencyKey: stored!.idempotencyKey,
    }, database);
    await database.update(schema.aiActionProposals)
      .set({ status: "executing", updatedAt: new Date(Date.now() - 31_000) })
      .where(eq(schema.aiActionProposals.id, proposal.id));

    const recovered = await confirmAIActionProposal("ai-action-user-a", proposal.id, database);
    const transactions = await database.select().from(schema.accountTransactions)
      .where(eq(schema.accountTransactions.transactionType, "deposit"));

    expect(recovered).toMatchObject({ ok: true, duplicate: false });
    expect(transactions).toHaveLength(1);
  });

  it("allows concurrent duplicate confirmations to create only one deposit", async () => {
    const account = await createAccount();
    const proposal = await depositProposal(account.accountId);

    const results = await Promise.all([
      confirmAIActionProposal("ai-action-user-a", proposal.id, database),
      confirmAIActionProposal("ai-action-user-a", proposal.id, database),
    ]);
    const transactions = await database.select().from(schema.accountTransactions)
      .where(eq(schema.accountTransactions.transactionType, "deposit"));

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(transactions).toHaveLength(1);
  });

  it("cancels without mutation and prevents later confirmation", async () => {
    const account = await createAccount();
    const proposal = await depositProposal(account.accountId);
    const result = await cancelAIActionProposal("ai-action-user-a", proposal.id, database);
    const confirmation = await confirmAIActionProposal("ai-action-user-a", proposal.id, database);

    expect(result).toMatchObject({ ok: true });
    expect(confirmation).toMatchObject({ ok: false });
    expect(await database.select().from(schema.accountTransactions)
      .where(eq(schema.accountTransactions.transactionType, "deposit"))).toHaveLength(0);
    const saved = await database.select().from(schema.aiActionProposals)
      .where(eq(schema.aiActionProposals.id, proposal.id));
    expect(saved[0]?.status).toBe("cancelled");
  });

  it("does not allow another user to confirm or cancel a proposal", async () => {
    const account = await createAccount();
    const proposal = await depositProposal(account.accountId);

    expect(await confirmAIActionProposal("ai-action-user-b", proposal.id, database)).toMatchObject({ ok: false });
    expect(await cancelAIActionProposal("ai-action-user-b", proposal.id, database)).toMatchObject({ ok: false });
    expect(await database.select().from(schema.accountTransactions)
      .where(eq(schema.accountTransactions.transactionType, "deposit"))).toHaveLength(0);
  });

  it("expires proposals and rejects confirmation", async () => {
    const account = await createAccount();
    const proposal = await depositProposal(account.accountId);
    await database.update(schema.aiActionProposals)
      .set({ expiresAt: new Date(Date.now() - 1_000) })
      .where(eq(schema.aiActionProposals.id, proposal.id));

    expect(await confirmAIActionProposal("ai-action-user-a", proposal.id, database)).toMatchObject({ ok: false });
    const saved = await database.select().from(schema.aiActionProposals)
      .where(eq(schema.aiActionProposals.id, proposal.id));
    expect(saved[0]?.status).toBe("expired");
    expect(await database.select().from(schema.accountTransactions)
      .where(eq(schema.accountTransactions.transactionType, "deposit"))).toHaveLength(0);
  });
});
