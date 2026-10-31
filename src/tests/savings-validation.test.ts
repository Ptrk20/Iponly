import { describe, expect, it } from "vitest";
import {
  createAccountSchema,
  depositSchema,
  transferSchema,
} from "@/lib/validations/savings";

const transaction = {
  accountId: "c7a2c9c4-7034-4d15-823c-a5cbd6a56705",
  amount: "10.00",
  transactionDate: "2026-10-30",
  description: "Test deposit",
  idempotencyKey: "e4317088-cbcf-442c-81d0-9431e605600f",
};

describe("savings validation", () => {
  it("accepts zero opening balance and rejects malformed or over-precision values", () => {
    expect(createAccountSchema.safeParse({
      name: "Maya",
      accountType: "digital_wallet",
      currencyCode: "PHP",
      openingBalance: "0.00",
      includeInTotal: "true",
      idempotencyKey: "e4317088-cbcf-442c-81d0-9431e605600f",
    }).success).toBe(true);

    expect(createAccountSchema.safeParse({
      name: "Cash",
      accountType: "cash",
      currencyCode: "JPY",
      openingBalance: "100.25",
      includeInTotal: "true",
      idempotencyKey: "e4317088-cbcf-442c-81d0-9431e605600f",
    }).success).toBe(false);
  });

  it("rejects zero, negative, and malformed transaction amounts", () => {
    expect(depositSchema.safeParse({ ...transaction, amount: "0" }).success).toBe(false);
    expect(depositSchema.safeParse({ ...transaction, amount: "-1.00" }).success).toBe(false);
    expect(depositSchema.safeParse({ ...transaction, amount: "NaN" }).success).toBe(false);
    expect(depositSchema.safeParse({ ...transaction, transactionDate: "2026-02-30" }).success).toBe(false);
  });

  it("rejects transfers to the same account", () => {
    expect(transferSchema.safeParse({
      sourceAccountId: transaction.accountId,
      destinationAccountId: transaction.accountId,
      amount: "1.00",
      transactionDate: "2026-10-30",
      description: "Self transfer",
      idempotencyKey: transaction.idempotencyKey,
    }).success).toBe(false);
  });
});
