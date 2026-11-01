import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import type { IponlyDatabase } from "@/db";
import { getFinancialRecordsForExport } from "@/repositories/export-repository";

describe("financial data export ownership", () => {
  let client: PGlite;
  let database: IponlyDatabase;

  beforeEach(async () => {
    client = new PGlite();
    const testDatabase = drizzle({ client, schema });
    database = testDatabase as unknown as IponlyDatabase;
    await migrate(testDatabase, { migrationsFolder: "src/db/migrations" });
    await testDatabase.insert(schema.user).values([
      { id: "user-a", name: "Alex A", email: "alex-a@example.test" },
      { id: "user-b", name: "Bailey B", email: "bailey-b@example.test" },
    ]);

    await testDatabase.insert(schema.financialAccounts).values([
      { id: "10000000-0000-4000-8000-000000000001", userId: "user-a", name: "Maya", accountType: "digital_wallet" },
      { id: "10000000-0000-4000-8000-000000000002", userId: "user-b", name: "Private account", accountType: "savings" },
    ]);
    await testDatabase.insert(schema.accountTransactions).values([
      {
        userId: "user-a",
        accountId: "10000000-0000-4000-8000-000000000001",
        transactionType: "deposit",
        amountMinor: 125075,
        currencyCode: "PHP",
        transactionDate: new Date("2026-10-12T00:00:00.000Z"),
        description: "Savings deposit",
      },
      {
        userId: "user-b",
        accountId: "10000000-0000-4000-8000-000000000002",
        transactionType: "deposit",
        amountMinor: 999999,
        currencyCode: "PHP",
        transactionDate: new Date("2026-10-12T00:00:00.000Z"),
        description: "Private deposit",
      },
    ]);
  });

  afterEach(async () => {
    await client.close();
  });

  it("exports only the authenticated user's records and preserves minor-unit precision", async () => {
    const exported = await getFinancialRecordsForExport("user-a", database);

    expect(exported.savings.accounts.map((account) => account.name)).toEqual(["Maya"]);
    expect(exported.savings.transactions).toHaveLength(1);
    expect(exported.savings.transactions[0]).toMatchObject({
      amountMinor: 125075,
      currencyCode: "PHP",
      description: "Savings deposit",
    });
    expect(JSON.stringify(exported)).not.toContain("Private account");
    expect(JSON.stringify(exported)).not.toContain("Private deposit");
    expect(Object.keys(exported)).toEqual(["savings", "debt", "budget", "travel"]);
  });
});
