import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { BUILTIN_SKILLS } from "./catalog";
import type { AcademicSkill, SkillAction, WeaponType } from "../types";

export const WORKSPACE_SKILLS_FILE_NAME = ".viewerleaf-skills.json";
export const DEFAULT_GLOBAL_SKILLS_PATH = "~/.viewerleaf/skills.json";

const DEFAULT_THEME_COLORS: Record<WeaponType, AcademicSkill["themeColors"]> = {
  blade: {
    primary: "#0f766e",
    secondary: "#ccfbf1",
    accent: "#14b8a6",
  },
  bow: {
    primary: "#92400e",
    secondary: "#fef3c7",
    accent: "#f59e0b",
  },
  hammer: {
    primary: "#1d4ed8",
    secondary: "#dbeafe",
    accent: "#3b82f6",
  },
  shield: {
    primary: "#9d174d",
    secondary: "#fce7f3",
    accent: "#ec4899",
  },
  spear: {
    primary: "#334155",
    secondary: "#e2e8f0",
    accent: "#64748b",
  },
};

const WEAPON_TYPES = new Set<WeaponType>(["blade", "bow", "hammer", "shield", "spear"]);
const SKILL_ACTION_TYPES = new Set<SkillAction["type"]>(["snippet", "checklist", "command", "claudeCode"]);

interface JsonObject {
  [key: string]: unknown;
}

export interface SkillManifestSource {
  kind: "workspace" | "global";
  label: string;
  path: string;
}

export interface ParsedSkillManifest {
  skills: AcademicSkill[];
  warnings: string[];
}

export interface LoadAllSkillsOptions {
  builtins?: AcademicSkill[];
  enableCustomSkills?: boolean;
  globalManifestPath?: string;
  readFile?: (filePath: string) => Promise<string>;
  fileExists?: (filePath: string) => Promise<boolean>;
  workspaceRoots?: string[];
}

export interface LoadAllSkillsResult {
  skills: AcademicSkill[];
  sources: string[];
  warnings: string[];
}

export interface DisposableLike {
  dispose(): void;
}

interface FileSystemWatcherLike extends DisposableLike {
  onDidChange(listener: () => void): DisposableLike;
  onDidCreate(listener: () => void): DisposableLike;
  onDidDelete(listener: () => void): DisposableLike;
}

export interface SkillManifestWatcherApi {
  RelativePattern: new (...args: any[]) => unknown;
  workspace: {
    createFileSystemWatcher(globPattern: unknown): FileSystemWatcherLike;
    onDidChangeWorkspaceFolders(listener: () => void): DisposableLike;
    workspaceFolders?: readonly { uri: { fsPath: string } }[];
  };
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim());
}

function normalizeCustomSkillId(id: string) {
  return `custom:${id.replace(/^custom:/, "").trim()}`;
}

function describeSkill(sourceLabel: string, index: number, id?: string) {
  const suffix = id ? ` (${id})` : "";
  return `${sourceLabel} 第 ${index + 1} 个 skill${suffix}`;
}

function parseThemeColors(
  raw: unknown,
  weaponType: WeaponType,
  warnings: string[],
  label: string,
): AcademicSkill["themeColors"] {
  const defaults = DEFAULT_THEME_COLORS[weaponType];
  if (!isJsonObject(raw)) {
    return defaults;
  }

  const resolved = {
    primary: isHexColor(raw.primary) ? raw.primary.trim() : defaults.primary,
    secondary: isHexColor(raw.secondary) ? raw.secondary.trim() : defaults.secondary,
    accent: isHexColor(raw.accent) ? raw.accent.trim() : defaults.accent,
  };

  if (
    (raw.primary !== undefined && !isHexColor(raw.primary))
    || (raw.secondary !== undefined && !isHexColor(raw.secondary))
    || (raw.accent !== undefined && !isHexColor(raw.accent))
  ) {
    warnings.push(`${label} 的 themeColors 含有非法颜色值，已回退到默认配色。`);
  }

  return resolved;
}

function parseAction(raw: unknown, warnings: string[], label: string): SkillAction | undefined {
  if (!isJsonObject(raw) || !isNonEmptyString(raw.type) || !SKILL_ACTION_TYPES.has(raw.type as SkillAction["type"])) {
    warnings.push(`${label} 缺少有效的 action.type。`);
    return undefined;
  }

  switch (raw.type) {
    case "snippet":
      if (!isNonEmptyString(raw.snippet)) {
        warnings.push(`${label} 的 snippet action 缺少 snippet 内容。`);
        return undefined;
      }
      return {
        type: raw.type,
        snippet: raw.snippet,
      };
    case "checklist":
      if (!isNonEmptyString(raw.checklist)) {
        warnings.push(`${label} 的 checklist action 缺少 checklist 内容。`);
        return undefined;
      }
      return {
        type: raw.type,
        checklist: raw.checklist,
      };
    case "command":
      if (!isNonEmptyString(raw.command)) {
        warnings.push(`${label} 的 command action 缺少 command。`);
        return undefined;
      }
      return {
        type: raw.type,
        command: raw.command,
      };
    case "claudeCode":
      if (!isNonEmptyString(raw.prompt)) {
        warnings.push(`${label} 的 claudeCode action 缺少 prompt。`);
        return undefined;
      }
      return {
        type: raw.type,
        prompt: raw.prompt,
      };
    default:
      warnings.push(`${label} 使用了不支持的 action.type: ${String(raw.type)}`);
      return undefined;
  }
}

function parseCustomSkill(raw: unknown, sourceLabel: string, index: number): ParsedSkillManifest {
  const warnings: string[] = [];
  if (!isJsonObject(raw)) {
    warnings.push(`${describeSkill(sourceLabel, index)} 不是对象，已跳过。`);
    return { skills: [], warnings };
  }

  const skillLabel = describeSkill(sourceLabel, index, isNonEmptyString(raw.id) ? raw.id : undefined);
  if (!isNonEmptyString(raw.id)) {
    warnings.push(`${skillLabel} 缺少有效的 id。`);
    return { skills: [], warnings };
  }
  if (!isNonEmptyString(raw.name)) {
    warnings.push(`${skillLabel} 缺少有效的 name。`);
    return { skills: [], warnings };
  }
  if (!isNonEmptyString(raw.weaponType) || !WEAPON_TYPES.has(raw.weaponType as WeaponType)) {
    warnings.push(`${skillLabel} 缺少有效的 weaponType。`);
    return { skills: [], warnings };
  }
  if (!isNonEmptyString(raw.description)) {
    warnings.push(`${skillLabel} 缺少有效的 description。`);
    return { skills: [], warnings };
  }
  if (!isNonEmptyString(raw.actionLabel)) {
    warnings.push(`${skillLabel} 缺少有效的 actionLabel。`);
    return { skills: [], warnings };
  }

  const weaponType = raw.weaponType as WeaponType;
  const action = parseAction(raw.action, warnings, skillLabel);
  if (!action) {
    return { skills: [], warnings };
  }

  return {
    skills: [
      {
        id: normalizeCustomSkillId(raw.id),
        name: raw.name.trim(),
        weaponType,
        description: raw.description.trim(),
        actionLabel: raw.actionLabel.trim(),
        themeColors: parseThemeColors(raw.themeColors, weaponType, warnings, skillLabel),
        enabled: typeof raw.enabled === "boolean" ? raw.enabled : true,
        action,
        isCustom: true,
      },
    ],
    warnings,
  };
}

export function resolveGlobalSkillManifestPath(configuredPath = DEFAULT_GLOBAL_SKILLS_PATH) {
  if (configuredPath === "~") {
    return os.homedir();
  }
  if (configuredPath.startsWith("~/")) {
    return path.join(os.homedir(), configuredPath.slice(2));
  }
  return configuredPath;
}

export function getSkillManifestSources(
  workspaceRoots: string[],
  globalManifestPath = DEFAULT_GLOBAL_SKILLS_PATH,
): SkillManifestSource[] {
  const workspaceSources = workspaceRoots.map((workspaceRoot) => ({
    kind: "workspace" as const,
    label: `${path.basename(workspaceRoot)}/${WORKSPACE_SKILLS_FILE_NAME}`,
    path: path.join(workspaceRoot, WORKSPACE_SKILLS_FILE_NAME),
  }));

  return [
    ...workspaceSources,
    {
      kind: "global" as const,
      label: resolveGlobalSkillManifestPath(globalManifestPath),
      path: resolveGlobalSkillManifestPath(globalManifestPath),
    },
  ];
}

export function parseSkillManifest(content: string, sourceLabel: string): ParsedSkillManifest {
  const warnings: string[] = [];
  let parsed: unknown;

  try {
    parsed = JSON.parse(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      skills: [],
      warnings: [`${sourceLabel} 不是合法 JSON: ${message}`],
    };
  }

  if (!isJsonObject(parsed) || !Array.isArray(parsed.skills)) {
    return {
      skills: [],
      warnings: [`${sourceLabel} 缺少 skills 数组，已跳过。`],
    };
  }

  const skills: AcademicSkill[] = [];
  for (const [index, rawSkill] of parsed.skills.entries()) {
    const parsedSkill = parseCustomSkill(rawSkill, sourceLabel, index);
    skills.push(...parsedSkill.skills);
    warnings.push(...parsedSkill.warnings);
  }

  return { skills, warnings };
}

async function defaultReadFile(filePath: string) {
  return fs.readFile(filePath, "utf8");
}

async function defaultFileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function loadAllSkills(options: LoadAllSkillsOptions = {}): Promise<LoadAllSkillsResult> {
  const builtins = options.builtins ?? BUILTIN_SKILLS;
  if (options.enableCustomSkills === false) {
    return {
      skills: [...builtins],
      sources: [],
      warnings: [],
    };
  }

  const readFile = options.readFile ?? defaultReadFile;
  const fileExists = options.fileExists ?? defaultFileExists;
  const manifestSources = getSkillManifestSources(options.workspaceRoots ?? [], options.globalManifestPath);
  const loadedSources: string[] = [];
  const warnings: string[] = [];
  const customSkills: AcademicSkill[] = [];
  const seenIds = new Set<string>();

  for (const source of manifestSources) {
    if (!(await fileExists(source.path))) {
      continue;
    }

    loadedSources.push(source.path);

    let content: string;
    try {
      content = await readFile(source.path);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`${source.label} 读取失败: ${message}`);
      continue;
    }

    const parsedManifest = parseSkillManifest(content, source.label);
    warnings.push(...parsedManifest.warnings);

    for (const skill of parsedManifest.skills) {
      if (seenIds.has(skill.id)) {
        warnings.push(`${source.label} 中的 skill id 重复: ${skill.id}，已跳过后续定义。`);
        continue;
      }

      seenIds.add(skill.id);
      customSkills.push(skill);
    }
  }

  return {
    skills: [...builtins, ...customSkills],
    sources: loadedSources,
    warnings,
  };
}

export function watchSkillManifests(
  api: SkillManifestWatcherApi,
  globalManifestPath: string,
  onChange: () => void,
): DisposableLike {
  const rootDisposables: DisposableLike[] = [];
  let manifestDisposables: DisposableLike[] = [];

  const disposeManifestWatchers = () => {
    for (const disposable of manifestDisposables.splice(0)) {
      disposable.dispose();
    }
  };

  const attachWatcher = (globPattern: unknown) => {
    const watcher = api.workspace.createFileSystemWatcher(globPattern);
    manifestDisposables.push(
      watcher,
      watcher.onDidChange(onChange),
      watcher.onDidCreate(onChange),
      watcher.onDidDelete(onChange),
    );
  };

  const rebuildWatchers = () => {
    disposeManifestWatchers();

    for (const workspaceFolder of api.workspace.workspaceFolders ?? []) {
      attachWatcher(new api.RelativePattern(workspaceFolder.uri, WORKSPACE_SKILLS_FILE_NAME));
    }

    const absoluteGlobalPath = resolveGlobalSkillManifestPath(globalManifestPath);
    attachWatcher(new api.RelativePattern(path.dirname(absoluteGlobalPath), path.basename(absoluteGlobalPath)));
  };

  rebuildWatchers();
  rootDisposables.push(
    api.workspace.onDidChangeWorkspaceFolders(() => {
      rebuildWatchers();
      onChange();
    }),
  );

  return {
    dispose() {
      disposeManifestWatchers();
      for (const disposable of rootDisposables.splice(0)) {
        disposable.dispose();
      }
    },
  };
}
