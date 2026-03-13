export type SectionCommand =
  | "part"
  | "chapter"
  | "section"
  | "subsection"
  | "subsubsection"
  | "paragraph"
  | "subparagraph";

export interface OutlineHeading {
  id: string;
  filePath: string;
  line: number;
  level: number;
  command: SectionCommand;
  title: string;
}

export interface OutlineNode {
  id: string;
  heading: OutlineHeading;
  children: OutlineNode[];
}

export interface OutlineBuildResult {
  headings: OutlineHeading[];
  tree: OutlineNode[];
  warnings: string[];
}

export type WeaponType = "blade" | "bow" | "hammer" | "shield" | "spear";

export type SkillActionType = "snippet" | "checklist" | "command" | "claudeCode";

export interface SkillAction {
  type: SkillActionType;
  snippet?: string;
  checklist?: string;
  command?: string;
  prompt?: string;
}

export interface AcademicSkill {
  id: string;
  name: string;
  weaponType: WeaponType;
  description: string;
  actionLabel: string;
  themeColors: {
    primary: string;
    secondary: string;
    accent: string;
  };
  enabled: boolean;
  action?: SkillAction;
  isCustom?: boolean;
}
