import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
const savingsMocks = vi.hoisted(() => ({
  archiveSavingsAccount: vi.fn(),
  changeSavingsGoalStatus: vi.fn(),
  createSavingsAccount: vi.fn(),
  createSavingsGoal: vi.fn(),
  recordSavingsAdjustment: vi.fn(),
  recordSavingsDeposit: vi.fn(),
  recordSavingsWithdrawal: vi.fn(),
  restoreSavingsAccount: vi.fn(),
  reverseSavingsTransaction: vi.fn(),
  transferSavings: vi.fn(),
  updateSavingsAccount: vi.fn(),
  updateSavingsGoal: vi.fn(),
}));
const preferencesMocks = vi.hoisted(() => ({ getUserPreferences: vi.fn() }));

vi.mock("@/lib/auth-session", () => authMocks);
vi.mock("@/services/savings-service", () => ({
  ...savingsMocks,
  SavingsRuleError: class SavingsRuleError extends Error {},
}));
vi.mock("@/services/preferences-service", () => preferencesMocks);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { depositSavingsAction } from "@/actions/savings";

describe("savings Server Action ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.getCurrentUser.mockResolvedValue({ id: "user-a", name: "Alex", email: "alex@example.test" });
    savingsMocks.recordSavingsDeposit.mockResolvedValue({});
  });

  it("uses only the authenticated user and ignores a forged userId field", async () => {
    const formData = new FormData();
    formData.set("userId", "user-b");
    formData.set("accountId", "c7a2c9c4-7034-4d15-823c-a5cbd6a56705");
    formData.set("amount", "500.00");
    formData.set("transactionDate", "2026-10-30");
    formData.set("description", "Deposit");
    formData.set("idempotencyKey", "e4317088-cbcf-442c-81d0-9431e605600f");

    await depositSavingsAction({ ok: false, message: "" }, formData);

    expect(savingsMocks.recordSavingsDeposit).toHaveBeenCalledWith(
      "user-a",
      expect.objectContaining({ accountId: "c7a2c9c4-7034-4d15-823c-a5cbd6a56705", amount: "500.00" }),
    );
    expect(savingsMocks.recordSavingsDeposit.mock.calls[0]?.[1]).not.toHaveProperty("userId");
  });

  it("rejects a savings mutation without an authenticated session", async () => {
    authMocks.getCurrentUser.mockResolvedValue(null);
    const formData = new FormData();
    formData.set("accountId", "c7a2c9c4-7034-4d15-823c-a5cbd6a56705");
    formData.set("amount", "500.00");
    formData.set("transactionDate", "2026-10-30");
    formData.set("description", "Deposit");
    formData.set("idempotencyKey", "e4317088-cbcf-442c-81d0-9431e605600f");

    const result = await depositSavingsAction({ ok: false, message: "" }, formData);

    expect(result).toMatchObject({ ok: false, message: "Your session has expired. Please sign in again." });
    expect(savingsMocks.recordSavingsDeposit).not.toHaveBeenCalled();
  });
});
