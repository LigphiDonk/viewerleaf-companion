import type { OutlineBuildResult, OutlineHeading, OutlineNode, SectionCommand } from "../types";

interface ParsedLatexFile {
  headings: OutlineHeading[];
  includes: string[];
  entries: ParsedEntry[];
}

type ParsedEntry =
  | {
      kind: "heading";
      heading: OutlineHeading;
    }
  | {
      kind: "include";
      target: string;
    };

const SECTION_COMMANDS: SectionCommand[] = [
  "part",
  "chapter",
  "section",
  "subsection",
  "subsubsection",
  "paragraph",
  "subparagraph",
];

const SECTION_LEVELS = new Map<SectionCommand, number>(
  SECTION_COMMANDS.map((command, index) => [command, index + 1]),
);

function stripLatexComment(line: string) {
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === "%" && line[index - 1] !== "\\") {
      return line.slice(0, index);
    }
  }
  return line;
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizePath(path: string) {
  const parts = path.replace(/\\/g, "/").split("/");
  const normalized: string[] = [];

  for (const part of parts) {
    if (!part || part === ".") {
      continue;
    }
    if (part === "..") {
      normalized.pop();
      continue;
    }
    normalized.push(part);
  }

  return normalized.join("/");
}

function dirname(path: string) {
  const normalized = normalizePath(path);
  const index = normalized.lastIndexOf("/");
  return index >= 0 ? normalized.slice(0, index) : "";
}

function joinPath(baseDir: string, target: string) {
  return normalizePath(baseDir ? `${baseDir}/${target}` : target);
}

export function resolveIncludePath(parentPath: string, includeTarget: string) {
  const trimmed = normalizeWhitespace(includeTarget);
  if (!trimmed) {
    return "";
  }

  const normalized = trimmed.endsWith(".tex") ? trimmed : `${trimmed}.tex`;
  return joinPath(dirname(parentPath), normalized);
}

export function parseLatexStructure(filePath: string, content: string): ParsedLatexFile {
  const headings: OutlineHeading[] = [];
  const includes: string[] = [];
  const entries: ParsedEntry[] = [];
  const lines = content.split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const line = stripLatexComment(lines[index] ?? "");
    const headingPattern = /\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)(\*)?\s*\{([^}]*)\}/g;
    let headingMatch = headingPattern.exec(line);

    while (headingMatch) {
      const commandName = headingMatch[1];
      const rawTitle = headingMatch[3];
      if (!commandName || rawTitle === undefined) {
        headingMatch = headingPattern.exec(line);
        continue;
      }

      const command = commandName as SectionCommand;
      const title = normalizeWhitespace(rawTitle);
      const heading: OutlineHeading = {
        id: `${filePath}:${lineNumber}:${command}:${title}`,
        filePath,
        line: lineNumber,
        level: SECTION_LEVELS.get(command) ?? SECTION_COMMANDS.length,
        command,
        title: title || command,
      };

      headings.push(heading);
      entries.push({ kind: "heading", heading });
      headingMatch = headingPattern.exec(line);
    }

    const includePattern = /\\(input|include)\s*\{([^}]+)\}/g;
    let includeMatch = includePattern.exec(line);

    while (includeMatch) {
      const rawIncludeTarget = includeMatch[2];
      const includeTarget = normalizeWhitespace(rawIncludeTarget ?? "");
      if (includeTarget) {
        includes.push(includeTarget);
        entries.push({ kind: "include", target: includeTarget });
      }
      includeMatch = includePattern.exec(line);
    }
  }

  return { headings, includes, entries };
}

export function buildOutlineTree(headings: OutlineHeading[]) {
  const roots: OutlineNode[] = [];
  const stack: OutlineNode[] = [];

  for (const heading of headings) {
    const node: OutlineNode = {
      id: heading.id,
      heading,
      children: [],
    };

    while (stack.length > 0 && (stack[stack.length - 1]?.heading.level ?? 0) >= heading.level) {
      stack.pop();
    }

    const parent = stack[stack.length - 1];
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }

    stack.push(node);
  }

  return roots;
}

export function computeSectionNumbers(nodeList: OutlineNode[], prefix = ""): Map<string, string> {
  const map = new Map<string, string>();

  nodeList.forEach((node, index) => {
    const sectionNumber = prefix ? `${prefix}.${index + 1}` : `${index + 1}`;
    map.set(node.id, sectionNumber);
    for (const [id, childNumber] of computeSectionNumbers(node.children, sectionNumber)) {
      map.set(id, childNumber);
    }
  });

  return map;
}

export async function buildProjectOutline(
  mainTexPath: string,
  readFile: (path: string) => Promise<string>,
): Promise<OutlineBuildResult> {
  const headings: OutlineHeading[] = [];
  const warnings: string[] = [];
  const visited = new Set<string>();
  const rootDir = dirname(mainTexPath);

  function includeCandidates(parentPath: string, includeTarget: string) {
    const normalized = includeTarget.endsWith(".tex") ? includeTarget : `${includeTarget}.tex`;
    const candidates = includeTarget.startsWith(".")
      ? [joinPath(dirname(parentPath), normalized), joinPath(rootDir, normalized)]
      : [joinPath(rootDir, normalized), joinPath(dirname(parentPath), normalized)];

    return Array.from(new Set(candidates.filter(Boolean)));
  }

  async function visit(path: string, options?: { silent?: boolean }) {
    const normalizedPath = normalizePath(path);
    if (!normalizedPath || visited.has(normalizedPath)) {
      return true;
    }

    let content: string;
    try {
      content = await readFile(normalizedPath);
    } catch (error) {
      if (!options?.silent) {
        warnings.push(
          `Unable to read included file "${normalizedPath}": ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return false;
    }

    visited.add(normalizedPath);
    const parsed = parseLatexStructure(normalizedPath, content);

    for (const entry of parsed.entries) {
      if (entry.kind === "heading") {
        headings.push(entry.heading);
        continue;
      }

      let resolved = false;

      for (const candidate of includeCandidates(normalizedPath, entry.target)) {
        if (await visit(candidate, { silent: true })) {
          resolved = true;
          break;
        }
      }

      if (!resolved) {
        warnings.push(`Unable to read included file "${entry.target}" from "${normalizedPath}"`);
      }
    }

    return true;
  }

  await visit(mainTexPath);

  return {
    headings,
    tree: buildOutlineTree(headings),
    warnings,
  };
}

export function findActiveHeading(headings: OutlineHeading[], filePath: string, line: number) {
  let active: OutlineHeading | null = null;

  for (const heading of headings) {
    if (heading.filePath !== filePath) {
      continue;
    }
    if (heading.line > line) {
      break;
    }
    active = heading;
  }

  return active;
}
