import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SpendingDonutChart } from "@/components/charts";

describe("planned allocation chart", () => {
  const props = {
    label: "Planned allocations by category",
    totalLabel: "Allocated",
    emptyMessage: "Set category allocations to see your budget plan.",
    currencyCode: "PHP" as const,
  };

  it("shows a planning-specific empty state for zero allocations", () => {
    const html = renderToStaticMarkup(createElement(SpendingDonutChart, {
      ...props, data: [{ name: "Pets", value: 0, color: "#b58a68" }],
    }));
    expect(html).toContain(props.emptyMessage);
    expect(html).not.toContain("No spending");
  });

  it("labels planned amounts separately from spending and supports a single allocation", () => {
    const html = renderToStaticMarkup(createElement(SpendingDonutChart, {
      ...props, data: [{ name: "Pets", value: 150000, color: "#b58a68" }],
    }));
    expect(html).toContain("Planned allocations by category");
    expect(html).toContain("Allocated");
    expect(html).toContain("Pets");
    expect(html).toContain("1,500.00");
    expect(html).not.toContain("Spent");
  });

  it("preserves existing spending labels by default", () => {
    const html = renderToStaticMarkup(createElement(SpendingDonutChart, {
      data: [{ name: "Groceries", value: 10000, color: "#90a955" }],
    }));
    expect(html).toContain("Spending by category");
    expect(html).toContain("Spent");
  });
});
