import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AssistantMessageText } from "@/components/assistant-message-text";

function render(content: string) {
  return renderToStaticMarkup(createElement(AssistantMessageText, { content }));
}

describe("AI reply bold formatting", () => {
  it("renders amounts and multiple emphasized phrases as inline strong elements", () => {
    expect(render("Savings: **PHP 10,000** and **no debt**."))
      .toBe("Savings: <strong>PHP 10,000</strong> and <strong>no debt</strong>.");
  });

  it("preserves line breaks and ordinary text", () => {
    expect(render("Summary\n**Savings**\nNothing else."))
      .toBe("Summary\n<strong>Savings</strong>\nNothing else.");
  });

  it("keeps incomplete streaming markers literal until closed", () => {
    expect(render("Your **savings")).toBe("Your **savings");
    expect(render("Your **savings**")).toBe("Your <strong>savings</strong>");
    expect(render("****")).toBe("****");
  });

  it("escapes HTML even inside bold and does not create model-provided links", () => {
    const html = render('**<script>alert(1)</script>** [link](https://example.test)');
    expect(html).toBe("<strong>&lt;script&gt;alert(1)&lt;/script&gt;</strong> [link](https://example.test)");
  });
});
