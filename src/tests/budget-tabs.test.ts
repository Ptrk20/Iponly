import { isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ status: "active", exists: true }));
vi.mock("@/lib/auth-session", () => ({ requireUser: async () => ({ id: "budget-user" }) }));
vi.mock("@/services/preferences-service", () => ({
  getUserPreferences: async () => ({ timezone: "Asia/Manila", defaultCurrencyCode: "PHP" }),
}));
vi.mock("@/services/budget-service", () => ({
  getBudgetPageData: async () => ({
    budget: mocks.exists ? { id: "budget-one", name: "Monthly plan", status: mocks.status, currencyCode: "PHP" } : null,
    summary: {
      categories: [], plannedIncomeMinor: 0, actualIncomeMinor: 0, actualSpentMinor: 0,
      availableFromActualIncomeMinor: 0, totalAllocatedMinor: 0, unallocatedMinor: 0,
      savingsContributionMinor: 0, debtPaymentMinor: 0, utilizationPercent: 0,
    },
    allocations: [], categories: [], expenses: [], incomes: [], accounts: [], unlinkedDebtPayments: [],
  }),
  reconcileBudgetLinks: async () => ({ issues: ["Review linked record"] }),
}));
vi.mock("@/components/charts", () => ({
  ComparisonBarChart: () => null, SpendingDonutChart: () => null,
}));
vi.mock("@/components/budget-actions", () => ({
  ArchiveMonthlyBudgetForm: () => null, BudgetAllocationEditor: () => "Allocation editor",
  BudgetEntryForms: () => "Entry forms", BudgetMonthNavigation: () => null,
  BudgetTransactionActions: () => null, CopyPreviousBudgetForm: () => null,
  CreateBudgetForm: () => "Create budget", LinkDebtPaymentForm: () => null,
  MonthlyBudgetStatusForm: () => null,
}));

import BudgetPage from "@/app/(protected)/(app)/budget/page";
import { SectionTabs } from "@/components/section-tabs";

function findTabs(node: ReactNode): Parameters<typeof SectionTabs>[0] | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findTabs(child);
      if (found) return found;
    }
  } else if (isValidElement<{ children?: ReactNode }>(node)) {
    if (node.type === SectionTabs) return node.props as Parameters<typeof SectionTabs>[0];
    return findTabs(node.props.children);
  }
}

describe("Budget page tabs", () => {
  it.each(["active", "closed", "archived"])("groups sections while preserving %s restrictions", async (status) => {
    mocks.exists = true;
    mocks.status = status;
    const page = await BudgetPage({ searchParams: Promise.resolve({ month: "2026-11" }) });
    const tabs = findTabs(page);
    expect(tabs?.label).toBe("Budget sections");
    expect(tabs?.tabs.map((tab) => tab.label)).toEqual(["Overview", "Plan and record", "Analytics", "Activity"]);
    const panels = tabs!.tabs.map((tab) => renderToStaticMarkup(tab.content));
    expect(panels[0]).toContain("Budget usage");
    expect(panels[1]).toContain(status === "active" ? "Entry forms" : "Reopen it to edit");
    expect(panels[2]).toContain("Planned vs actual");
    expect(panels[3]).toContain("Recent expenses");
    const html = renderToStaticMarkup(page);
    expect(html.indexOf("Planned income")).toBeLessThan(html.indexOf('role="tablist"'));
    expect(html).toContain("Linked transaction review needed");
  });

  it("keeps the no-budget setup available without tabs", async () => {
    mocks.exists = false;
    const page = await BudgetPage({ searchParams: Promise.resolve({ month: "2026-11" }) });
    expect(findTabs(page)).toBeUndefined();
    expect(renderToStaticMarkup(page)).toContain("Create budget");
  });
});
