import { describe, expect, it } from "vitest";
import { resolveAccountBrand } from "@/lib/account-brand";
import {
  calculateAccountBalance,
  calculateGoalProgress,
  calculateSavingsChange,
  calculateTotalSavings,
  getTransactionBalanceEffect,
  groupTransactionsByPeriod,
} from "@/lib/savings";
import type { SavingsAccountRecord, SavingsGoalRecord, SavingsTransactionRecord } from "@/types/domain";

function transaction(
  id: string,
  accountId: string,
  transactionType: SavingsTransactionRecord["transactionType"],
  amountMinor: number,
  extra: Partial<SavingsTransactionRecord> = {},
): SavingsTransactionRecord {
  return {
    id,
    userId: "user-a",
    accountId,
    transactionType,
    amountMinor,
    currencyCode: "PHP",
    transactionDate: new Date("2026-10-15T12:00:00.000Z"),
    description: id,
    notes: null,
    reason: null,
    transferId: null,
    reversalOfTransactionId: null,
    reversedByTransactionId: null,
    status: "posted",
    idempotencyKey: null,
    createdBy: "user",
    createdAt: new Date("2026-10-15T12:00:00.000Z"),
    updatedAt: new Date("2026-10-15T12:00:00.000Z"),
    ...extra,
  };
}

function account(
  id: string,
  currencyCode: SavingsAccountRecord["currencyCode"] = "PHP",
  includeInTotal = true,
): SavingsAccountRecord {
  const now = new Date("2026-10-15T12:00:00.000Z");
  return {
    id,
    userId: "user-a",
    name: id,
    institution: null,
    accountType: "savings",
    currencyCode,
    includeInTotal,
    color: null,
    icon: null,
    notes: null,
    status: "active",
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  };
}

describe("automatic savings account branding", () => {
  it.each([
    ["Maya", "maya"], ["GCash", "gcash"], ["BPI", "bpi"],
    ["Eastwest", "eastwest"], ["RCBC", "rcbc"], ["Maribank", "maribank"],
    ["Shopee", "shopee"], ["PNB", "pnb"], ["BDO", "bdo"], ["MetroBank", "metrobank"],
    ["  EAST-WEST Bank  ", "eastwest"], ["ShopeePay", "shopee"],
    ["Bank of the Philippine Islands", "bpi"], ["SeaBank", "maribank"],
    ["Union Bank", "unionbank"], ["Security Bank", "securitybank"],
    ["Landbank", "landbank"], ["GoTyme", "gotyme"], ["Tonik", "tonik"],
    ["CIMB", "cimb"], ["China Bank", "chinabank"], ["PSBank", "psbank"],
  ])("recognizes %s", (institution, expected) => {
    expect(resolveAccountBrand({ ...account("Emergency fund"), institution }).id).toBe(expected);
  });

  it("recognizes an institution in the account name when no institution is entered", () => {
    expect(resolveAccountBrand(account("My Maya Savings")).id).toBe("maya");
    expect(resolveAccountBrand(account("BDO - Payroll")).id).toBe("bdo");
  });

  it("prioritizes an explicit institution and avoids partial-name matches", () => {
    expect(resolveAccountBrand({ ...account("Maya Savings"), institution: "BPI" }).id).toBe("bpi");
    expect(resolveAccountBrand({ ...account("Maya Savings"), institution: "Community Bank" }).id).toBe("personal");
    expect(resolveAccountBrand(account("Mayann's savings")).id).toBe("personal");
  });

  it("uses readable custom colors for unrecognized institutions and cash", () => {
    expect(resolveAccountBrand({ ...account("Cash"), accountType: "cash", color: "#ffffff" })).toMatchObject({ label: "Cash", background: "#ffffff", foreground: "#000000" });
    expect(resolveAccountBrand({ ...account("Other"), color: "#000000" })).toMatchObject({ background: "#000000", foreground: "#ffffff" });
    expect(resolveAccountBrand({ ...account("Other"), color: "invalid" }).background).toBe("#243c36");
  });
});

describe("savings balance calculations", () => {
  it("calculates opening balance, deposit, withdrawal, and adjustment effects in exact minor units", () => {
    const transactions = [
      transaction("opening", "a", "opening_balance", 1_000_000),
      transaction("deposit", "a", "deposit", 250_000),
      transaction("withdrawal", "a", "withdrawal", 100_000),
      transaction("increase", "a", "adjustment_increase", 5_000),
      transaction("decrease", "a", "adjustment_decrease", 2_500),
    ];
    expect(calculateAccountBalance(transactions, "a")).toBe(1_152_500);
    expect(getTransactionBalanceEffect(transactions[1]!)).toBe(250_000);
    expect(getTransactionBalanceEffect(transactions[2]!)).toBe(-100_000);
    expect(getTransactionBalanceEffect(transactions[3]!)).toBe(5_000);
    expect(getTransactionBalanceEffect(transactions[4]!)).toBe(-2_500);
  });

  it("keeps a transfer neutral in combined savings totals", () => {
    const outgoing = transaction("out", "a", "transfer_out", 75_000);
    const incoming = transaction("in", "b", "transfer_in", 75_000);
    const change = calculateSavingsChange([outgoing, incoming], new Set(["a", "b"]), new Map());
    expect(change.get("PHP")).toBe(0);
    expect(getTransactionBalanceEffect(outgoing)).toBe(-75_000);
    expect(getTransactionBalanceEffect(incoming)).toBe(75_000);
  });

  it("applies reversal effects and includes them in period groups", () => {
    const original = transaction("deposit", "a", "deposit", 20_000, { status: "reversed" });
    const reversal = transaction("reversal", "a", "reversal", 20_000, { reversalOfTransactionId: "deposit" });
    expect(calculateAccountBalance([original, reversal], "a")).toBe(0);
    expect(getTransactionBalanceEffect(reversal, "deposit")).toBe(-20_000);
    const byPeriod = groupTransactionsByPeriod([reversal], new Map([["deposit", "deposit"]]));
    expect(byPeriod.get("2026-10")?.get("PHP")).toBe(-20_000);
  });

  it("keeps totals grouped by currency and excludes opted-out and archived accounts only when opted out", () => {
    const archived = { ...account("archived"), status: "archived" as const };
    const totals = calculateTotalSavings(
      [account("php"), account("usd", "USD"), account("excluded", "PHP", false), archived],
      new Map([["php", 150_000], ["usd", 200_000], ["excluded", 999_000], ["archived", 25_000]]),
    );
    expect(totals.get("PHP")).toBe(175_000);
    expect(totals.get("USD")).toBe(200_000);
    expect(totals.has("EUR")).toBe(false);
  });

  it("caps goal progress and handles a zero linked balance", () => {
    const goal: Pick<SavingsGoalRecord, "targetAmountMinor" | "accountId"> = {
      targetAmountMinor: 100_000,
      accountId: "a",
    };
    expect(calculateGoalProgress(goal, 0)).toEqual({ savedMinor: 0, remainingMinor: 100_000, progressPercent: 0 });
    expect(calculateGoalProgress(goal, 150_000)).toEqual({ savedMinor: 150_000, remainingMinor: 0, progressPercent: 100 });
    expect(calculateGoalProgress({ ...goal, accountId: null }, 50_000).savedMinor).toBe(0);
  });
});
