import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ selected: [] as string[], pending: false }));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useState: () => [mocks.selected, (value: string[] | ((current: string[]) => string[])) => {
    mocks.selected = typeof value === "function" ? value(mocks.selected) : value;
  }],
  useRef: () => ({ current: new Map() }),
}));
vi.mock("@/hooks/use-mutation-form", () => ({
  useMutationForm: () => ({
    state: { ok: false, message: "" }, formAction: vi.fn(),
    formRef: { current: null }, submittedRef: { current: false }, pending: mocks.pending,
  }),
}));
vi.mock("@/actions/debt", () => ({ recordBulkInstallmentPaymentsAction: vi.fn() }));
vi.mock("@/components/debt-actions", () => ({ QuickInstallmentPaymentForm: () => null }));

import { OverdueInstallments } from "@/components/overdue-installments";

function findProps(node: ReactNode, predicate: (props: Record<string, unknown>) => boolean): Record<string, unknown> {
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findProps(child, predicate);
      if (Object.keys(match).length) return match;
    }
  }
  if (isValidElement<Record<string, unknown>>(node)) {
    if (predicate(node.props)) return node.props;
    return findProps(node.props.children as ReactNode, predicate);
  }
  return {};
}

describe("overdue selection controls", () => {
  const installments = [
    { id: "one", debtId: "debt", debtName: "Laptop", dueDate: "2026-10-15", remainingAmountMinor: 50000, currencyCode: "PHP" as const, canPay: true },
    { id: "two", debtId: "debt", debtName: "Laptop", dueDate: "2026-09-15", remainingAmountMinor: 25000, currencyCode: "PHP" as const, canPay: true },
    { id: "paused", debtId: "paused-debt", debtName: "Paused", dueDate: "2026-09-15", remainingAmountMinor: 25000, currencyCode: "PHP" as const, canPay: false },
  ];
  const render = () => OverdueInstallments({ installments, today: "2026-11-02" });
  const selectAll = () => findProps(render(), (props) => props["aria-label"] === "Select all payable overdue installments");
  const bulkButton = () => findProps(render(), (props) => props.className === "button button-primary");
  function change(props: Record<string, unknown>, checked: boolean) {
    (props.onChange as (event: { target: { checked: boolean } }) => void)({ target: { checked } });
  }

  beforeEach(() => {
    mocks.selected = [];
    mocks.pending = false;
  });

  it("selects only payable rows, enables bulk payment, and can deselect all", () => {
    expect(bulkButton().disabled).toBe(true);
    change(selectAll(), true);
    expect(mocks.selected).toEqual(["one", "two"]);
    expect(selectAll().checked).toBe(true);
    expect(bulkButton().disabled).toBe(false);
    change(selectAll(), false);
    expect(mocks.selected).toEqual([]);
    expect(bulkButton().disabled).toBe(true);
  });

  it("allows individual selection and excludes paused rows", () => {
    const row = findProps(render(), (props) => typeof props["aria-label"] === "string" && props["aria-label"].startsWith("Select Laptop"));
    change(row, true);
    expect(mocks.selected).toEqual(["one"]);
    expect(selectAll().checked).toBe(false);
    const paused = findProps(render(), (props) => typeof props["aria-label"] === "string" && props["aria-label"].startsWith("Select Paused"));
    expect(paused.disabled).toBe(true);
  });

  it("disables selection and bulk submission while saving", () => {
    mocks.selected = ["one"];
    mocks.pending = true;
    expect(selectAll().disabled).toBe(true);
    expect(bulkButton().disabled).toBe(true);
  });
});
