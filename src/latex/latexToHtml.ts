function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function stripComments(source: string) {
  return source
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => {
      for (let index = 0; index < line.length; index += 1) {
        if (line[index] !== "%") {
          continue;
        }

        let slashCount = 0;
        for (let cursor = index - 1; cursor >= 0 && line[cursor] === "\\"; cursor -= 1) {
          slashCount += 1;
        }

        if (slashCount % 2 === 0) {
          return line.slice(0, index);
        }
      }

      return line;
    })
    .join("\n");
}

function findMatchingBrace(source: string, openBraceIndex: number) {
  let depth = 0;
  for (let index = openBraceIndex; index < source.length; index += 1) {
    if (source[index] === "{") {
      depth += 1;
    } else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function findInlineMathEnd(source: string, startIndex: number) {
  for (let index = startIndex; index < source.length; index += 1) {
    if (source[index] !== "$") {
      continue;
    }

    let slashCount = 0;
    for (let cursor = index - 1; cursor >= 0 && source[cursor] === "\\"; cursor -= 1) {
      slashCount += 1;
    }

    if (slashCount % 2 === 0) {
      return index;
    }
  }

  return -1;
}

function normalizeParagraphText(lines: string[]) {
  return lines.join(" ").replace(/\s+/g, " ").trim();
}

function renderMathPlaceholder(latex: string, displayMode: boolean) {
  const className = displayMode ? "vl-math-display" : "vl-math-inline";
  const tagName = displayMode ? "div" : "span";
  return `<${tagName} class="${className}" data-latex="${escapeHtml(latex.trim())}"></${tagName}>`;
}

function renderCite(content: string) {
  const citation = content
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");

  return `<span class="citation">[${escapeHtml(citation)}]</span>`;
}

function renderInline(source: string): string {
  let html = "";
  let index = 0;

  while (index < source.length) {
    if (source[index] === "\\") {
      const commands = [
        { name: "textbf", render: (value: string) => `<strong>${renderInline(value)}</strong>` },
        { name: "textit", render: (value: string) => `<em>${renderInline(value)}</em>` },
        { name: "emph", render: (value: string) => `<em>${renderInline(value)}</em>` },
        { name: "cite", render: (value: string) => renderCite(value) },
      ] as const;

      const matchedCommand = commands.find(({ name }) => source.startsWith(`\\${name}{`, index));
      if (matchedCommand) {
        const openBraceIndex = index + matchedCommand.name.length + 1;
        const closeBraceIndex = findMatchingBrace(source, openBraceIndex);
        if (closeBraceIndex !== -1) {
          const innerContent = source.slice(openBraceIndex + 1, closeBraceIndex);
          html += matchedCommand.render(innerContent);
          index = closeBraceIndex + 1;
          continue;
        }
      }

      if (source.startsWith("\\\\", index)) {
        html += "<br />";
        index += 2;
        continue;
      }

      const escapedCharacter = source[index + 1];
      if (escapedCharacter && /[%&_#$\\{}]/.test(escapedCharacter)) {
        html += escapeHtml(escapedCharacter);
        index += 2;
        continue;
      }
    }

    if (source[index] === "$" && source[index + 1] !== "$") {
      const endIndex = findInlineMathEnd(source, index + 1);
      if (endIndex !== -1) {
        html += renderMathPlaceholder(source.slice(index + 1, endIndex), false);
        index = endIndex + 1;
        continue;
      }
    }

    html += escapeHtml(source[index] ?? "");
    index += 1;
  }

  return html;
}

function collectDelimitedBlock(lines: string[], startIndex: number, opening: string, closing: string) {
  const firstLine = lines[startIndex]?.trim() ?? "";
  const inlineContent = firstLine.slice(opening.length);
  const closingInFirstLine = inlineContent.indexOf(closing);

  if (closingInFirstLine !== -1) {
    return {
      content: inlineContent.slice(0, closingInFirstLine).trim(),
      nextIndex: startIndex + 1,
    };
  }

  const chunks = [inlineContent];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const closingIndex = line.indexOf(closing);
    if (closingIndex !== -1) {
      chunks.push(line.slice(0, closingIndex));
      return {
        content: chunks.join("\n").trim(),
        nextIndex: index + 1,
      };
    }

    chunks.push(line);
  }

  return {
    content: chunks.join("\n").trim(),
    nextIndex: lines.length,
  };
}

function extractCommandArgument(source: string, commandName: string) {
  const commandIndex = source.indexOf(`\\${commandName}`);
  if (commandIndex === -1) {
    return undefined;
  }

  const openBraceIndex = source.indexOf("{", commandIndex + commandName.length + 1);
  if (openBraceIndex === -1) {
    return undefined;
  }

  const closeBraceIndex = findMatchingBrace(source, openBraceIndex);
  if (closeBraceIndex === -1) {
    return undefined;
  }

  return source.slice(openBraceIndex + 1, closeBraceIndex);
}

function parseList(lines: string[], startIndex: number, ordered: boolean) {
  const items: string[] = [];
  let currentItemLines: string[] = [];
  let index = startIndex + 1;

  while (index < lines.length) {
    const trimmed = (lines[index] ?? "").trim();
    if (trimmed.startsWith("\\end{")) {
      break;
    }

    if (trimmed.startsWith("\\item")) {
      if (currentItemLines.length > 0) {
        items.push(normalizeParagraphText(currentItemLines));
      }
      currentItemLines = [trimmed.replace(/^\\item\s*/, "")];
    } else if (trimmed.length > 0) {
      currentItemLines.push(trimmed);
    }

    index += 1;
  }

  if (currentItemLines.length > 0) {
    items.push(normalizeParagraphText(currentItemLines));
  }

  const tagName = ordered ? "ol" : "ul";
  return {
    html: `<${tagName}>${items.map((item) => `<li>${renderInline(item)}</li>`).join("")}</${tagName}>`,
    nextIndex: index < lines.length ? index + 1 : lines.length,
  };
}

function parseFigure(lines: string[], startIndex: number) {
  const chunks: string[] = [];
  let index = startIndex + 1;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (line.trim().startsWith("\\end{figure}")) {
      break;
    }

    chunks.push(line);
    index += 1;
  }

  const figureContent = chunks.join("\n");
  const caption = extractCommandArgument(figureContent, "caption");
  const graphic = extractCommandArgument(figureContent, "includegraphics");
  const placeholderText = graphic ? `Figure: ${graphic.trim()}` : "Figure placeholder";

  return {
    html: [
      `<figure class="vl-figure">`,
      `  <div class="vl-figure__placeholder">${escapeHtml(placeholderText)}</div>`,
      caption ? `  <figcaption>${renderInline(caption)}</figcaption>` : "",
      `</figure>`,
    ].filter(Boolean).join(""),
    nextIndex: index < lines.length ? index + 1 : lines.length,
  };
}

export function latexToHtml(source: string) {
  const cleanSource = stripComments(source);
  const lines = cleanSource.split("\n");
  const blocks: string[] = [];
  let paragraphLines: string[] = [];

  const flushParagraph = () => {
    if (paragraphLines.length === 0) {
      return;
    }

    const paragraph = normalizeParagraphText(paragraphLines);
    paragraphLines = [];
    if (!paragraph) {
      return;
    }

    blocks.push(`<p>${renderInline(paragraph)}</p>`);
  };

  for (let index = 0; index < lines.length;) {
    const rawLine = lines[index] ?? "";
    const trimmed = rawLine.trim();

    if (!trimmed) {
      flushParagraph();
      index += 1;
      continue;
    }

    if (trimmed.startsWith("$$")) {
      flushParagraph();
      const block = collectDelimitedBlock(lines, index, "$$", "$$");
      blocks.push(renderMathPlaceholder(block.content, true));
      index = block.nextIndex;
      continue;
    }

    if (trimmed.startsWith("\\[")) {
      flushParagraph();
      const block = collectDelimitedBlock(lines, index, "\\[", "\\]");
      blocks.push(renderMathPlaceholder(block.content, true));
      index = block.nextIndex;
      continue;
    }

    if (trimmed.startsWith("\\begin{itemize}")) {
      flushParagraph();
      const list = parseList(lines, index, false);
      blocks.push(list.html);
      index = list.nextIndex;
      continue;
    }

    if (trimmed.startsWith("\\begin{enumerate}")) {
      flushParagraph();
      const list = parseList(lines, index, true);
      blocks.push(list.html);
      index = list.nextIndex;
      continue;
    }

    if (trimmed.startsWith("\\begin{figure}")) {
      flushParagraph();
      const figure = parseFigure(lines, index);
      blocks.push(figure.html);
      index = figure.nextIndex;
      continue;
    }

    const headingMatch = trimmed.match(/^\\(section|subsection|subsubsection)\*?\{(.+)\}$/);
    if (headingMatch) {
      flushParagraph();
      const tagName = headingMatch[1] === "section" ? "h2" : headingMatch[1] === "subsection" ? "h3" : "h4";
      blocks.push(`<${tagName}>${renderInline(headingMatch[2] ?? "")}</${tagName}>`);
      index += 1;
      continue;
    }

    paragraphLines.push(trimmed);
    index += 1;
  }

  flushParagraph();
  return blocks.join("\n");
}
