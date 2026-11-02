import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SectionTabs } from "@/components/section-tabs";

describe("section tabs", () => {
  it("labels the tablist and links each tab to its persistent panel", () => {
    const html = renderToStaticMarkup(createElement(SectionTabs, {
      label: "Debt sections",
      tabs: [
        { id: "progress", label: "Repayment progress", content: "Progress content" },
        { id: "payments", label: "Payments", content: "Payment form" },
      ],
    }));
    expect(html).toContain('aria-label="Debt sections"');
    expect(html).toMatch(/aria-selected="true"[^>]*role="tab"[^>]*tabindex="0"/);
    expect(html).toMatch(/aria-selected="false"[^>]*role="tab"[^>]*tabindex="-1"/);
    expect(html).toMatch(/hidden=""[^>]*id="[^"]*-payments-panel"/);
    expect(html).toContain("Payment form");
    const controls = [...html.matchAll(/aria-controls="([^"]+)"/g)].map((match) => match[1]);
    expect(controls).toHaveLength(2);
    for (const id of controls) expect(html).toContain(`id="${id}"`);
  });
});
