import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarkdownText, balanceFencedCode } from "./MarkdownText";

describe("MarkdownText", () => {
  it("renders common markdown structures", () => {
    const html = renderToStaticMarkup(
      <MarkdownText text={"# Title\n\n- one\n- two\n\n| a | b |\n| - | - |\n| 1 | 2 |"} />,
    );

    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<li>one</li>");
    expect(html).toContain("<table>");
  });

  it("does not render raw html or unsafe links", () => {
    const html = renderToStaticMarkup(
      <MarkdownText text={'<script>alert("x")</script>\n\n[bad](javascript:alert("x"))'} />,
    );

    expect(html).not.toContain("<script>");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("bad");
  });

  it("closes a dangling fenced code block so following text stays formatted", () => {
    const html = renderToStaticMarkup(
      <MarkdownText text={"```\nKlar\n\n**Bold tail**"} />,
    );
    expect(html).toContain("<strong>Bold tail</strong>");
  });
});

describe("balanceFencedCode", () => {
  it("leaves balanced fences untouched", () => {
    const text = "before\n```\ncode\n```\nafter";
    expect(balanceFencedCode(text)).toBe(text);
  });

  it("removes a dangling opener so the remainder stays markdown", () => {
    expect(balanceFencedCode("intro\n\n```\nKlar\n\n**Bold tail**")).toBe(
      "intro\n\nKlar\n\n**Bold tail**",
    );
  });

  it("removes a dangling tilde opener", () => {
    expect(balanceFencedCode("~~~\nhello")).toBe("hello");
  });

  it("ignores triple backticks inside inline text", () => {
    const text = "see `let x = ``` code` for details";
    expect(balanceFencedCode(text)).toBe(text);
  });
});
