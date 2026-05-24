import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarkdownText } from "./MarkdownText";

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
});
