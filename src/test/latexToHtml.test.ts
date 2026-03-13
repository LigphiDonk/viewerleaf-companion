import { describe, expect, it } from "vitest";

import { latexToHtml } from "../latex/latexToHtml";

describe("latexToHtml", () => {
  it("renders headings, inline formatting, citations, and inline math", () => {
    const html = latexToHtml([
      "% Ignore this line",
      "\\section{Introduction}",
      "This is \\textbf{important} and \\emph{italicized} with \\cite{smith2024,doe2023} plus $a+b$.",
    ].join("\n"));

    expect(html).toContain("<h2>Introduction</h2>");
    expect(html).toContain("<strong>important</strong>");
    expect(html).toContain("<em>italicized</em>");
    expect(html).toContain('<span class="citation">[smith2024, doe2023]</span>');
    expect(html).toContain('class="vl-math-inline"');
    expect(html).toContain('data-latex="a+b"');
    expect(html).not.toContain("Ignore this line");
  });

  it("renders display math, lists, figures, and paragraph breaks", () => {
    const html = latexToHtml([
      "First paragraph.",
      "",
      "$$",
      "E = mc^2",
      "$$",
      "",
      "\\begin{itemize}",
      "\\item First item",
      "\\item Second item with \\textit{style}",
      "\\end{itemize}",
      "",
      "\\begin{enumerate}",
      "\\item One",
      "\\item Two",
      "\\end{enumerate}",
      "",
      "\\begin{figure}",
      "  \\includegraphics[width=0.8\\linewidth]{figures/plot.pdf}",
      "  \\caption{Main result}",
      "\\end{figure}",
    ].join("\n"));

    expect(html).toContain("<p>First paragraph.</p>");
    expect(html).toContain('class="vl-math-display"');
    expect(html).toContain("<ul><li>First item</li><li>Second item with <em>style</em></li></ul>");
    expect(html).toContain("<ol><li>One</li><li>Two</li></ol>");
    expect(html).toContain('class="vl-figure"');
    expect(html).toContain("Figure: figures/plot.pdf");
    expect(html).toContain("<figcaption>Main result</figcaption>");
  });
});
