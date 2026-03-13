import { describe, expect, it } from "vitest";

import {
  buildProjectOutline,
  computeSectionNumbers,
  findActiveHeading,
  parseLatexStructure,
  resolveIncludePath,
} from "../outline/latexOutline";

describe("latex outline parser", () => {
  it("parses headings and include targets", () => {
    const parsed = parseLatexStructure(
      "main.tex",
      [
        "\\section{Introduction}",
        "\\input{sections/method}",
        "% \\section{Ignored}",
        "\\subsection{Contribution}",
      ].join("\n"),
    );

    expect(parsed.headings.map((heading) => heading.title)).toEqual(["Introduction", "Contribution"]);
    expect(parsed.includes).toEqual(["sections/method"]);
  });

  it("builds project outline in include order", async () => {
    const source = new Map<string, string>([
      ["main.tex", "\\section{Intro}\n\\input{sections/method}\n\\section{Experiments}"],
      ["sections/method.tex", "\\subsection{Pipeline}\n\\subsection{Features}"],
    ]);

    const outline = await buildProjectOutline("main.tex", async (filePath) => {
      const content = source.get(filePath);
      if (!content) {
        throw new Error(`missing ${filePath}`);
      }
      return content;
    });

    expect(outline.headings.map((heading) => `${heading.filePath}:${heading.title}`)).toEqual([
      "main.tex:Intro",
      "sections/method.tex:Pipeline",
      "sections/method.tex:Features",
      "main.tex:Experiments",
    ]);

    const numbers = computeSectionNumbers(outline.tree);
    expect(numbers.get(outline.tree[0]?.id ?? "")).toBe("1");
    expect(numbers.get(outline.tree[0]?.children[0]?.id ?? "")).toBe("1.1");
  });

  it("reports missing includes as warnings and finds active heading", async () => {
    const outline = await buildProjectOutline("main.tex", async (filePath) => {
      if (filePath === "main.tex") {
        return "\\section{Intro}\n\\input{sections/missing}\n\\section{Method}";
      }
      throw new Error("not found");
    });

    expect(outline.warnings).toHaveLength(1);
    expect(resolveIncludePath("sections/main.tex", "../appendix")).toBe("appendix.tex");
    expect(findActiveHeading(outline.headings, "main.tex", 2)?.title).toBe("Intro");
    expect(findActiveHeading(outline.headings, "main.tex", 4)?.title).toBe("Method");
  });
});
