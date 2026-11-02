import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  status: "active",
  quickPayment: vi.fn(),
}));

vi.mock("@/lib/auth-session", () => ({
  requireUser: async () => ({ id: "test-user" }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/services/preferences-service", () => ({
  getUserPreferences: async () => ({
    timezone: "Asia/Manila", defaultCurrencyCode: "PHP", firstDayOfWeek: "monday",
  }),
}));
vi.mock("@/components/debt-payment-calendar", () => ({ DebtPaymentCalendar: () => null }));
vi.mock("@/components/debt-actions", () => ({
  DebtLifecycleForms: () => null,
  QuickInstallmentPaymentForm: (props: unknown) => {
    mocks.quickPayment(props);
    return createElement("button", { type: "submit" }, "Mark as paid");
  },
}));
vi.mock("@/services/debt-service", () => ({
  getDebtOverview: async () => ({
    today: "2026-11-02",
    totalOutstandingByCurrency: new Map(),
    dueThisMonthByCurrency: new Map(),
    overdueByCurrency: new Map(),
    paidThisMonthByCurrency: new Map(),
    activeCount: 1,
    debts: [{
      id: "debt-1", name: "Laptop", status: mocks.status, debtType: "installment",
      currencyCode: "PHP", balanceMinor: 75000, originalPrincipalMinor: 100000,
      openingBalanceMinor: 100000, amountPaidMinor: 25000, progressPercent: 25,
      remainingInstallments: 1,
    }],
    overdueInstallments: [{
      id: "installment-1", debtId: "debt-1", debtName: "Laptop",
      dueDate: new Date("2026-10-15T00:00:00Z"),
      remainingAmountMinor: 75000, currencyCode: "PHP", status: "overdue",
    }],
    upcomingInstallments: [],
    nextPaymentsPerDebt: [],
    calendarInstallments: [],
    archivedDebts: [],
    recentPayments: [],
  }),
}));

import DebtPage from "@/app/(protected)/(app)/debt/page";

describe("overdue installment actions", () => {
  beforeEach(() => {
    mocks.status = "active";
    vi.clearAllMocks();
  });

  it("offers the existing quick payment flow for the remaining overdue amount", async () => {
    const html = renderToStaticMarkup(await DebtPage());
    expect(html).toContain("Overdue installments");
    expect(html).toContain("Mark as paid");
    expect(html).toContain('class="schedule-table debt-next-payments debt-overdue-selection"');
    expect(html).toContain('aria-label="Select all payable overdue installments"');
    expect(html).toContain('aria-label="Select Laptop, due');
    expect(html).toContain("Mark selected as paid (0)");
    expect(mocks.quickPayment).toHaveBeenCalledWith({
      installment: {
        canPay: true,
        id: "installment-1", debtId: "debt-1", debtName: "Laptop",
        dueDate: "2026-10-15", remainingAmountMinor: 75000, currencyCode: "PHP",
      },
      today: "2026-11-02",
    });
    expect(html).not.toMatch(/<a[^>]*class="schedule-row"/);
  });

  it.each(["paused", "defaulted"])("requires resuming a %s debt before quick payment", async (status) => {
    mocks.status = status;
    const html = renderToStaticMarkup(await DebtPage());
    expect(html).not.toContain(">Mark as paid<");
    expect(html).toContain("Open debt to resume payments");
    expect(mocks.quickPayment).not.toHaveBeenCalled();
  });
});
