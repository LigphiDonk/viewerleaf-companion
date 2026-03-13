import type { AcademicSkill } from "../types";

export const BUILTIN_SKILLS: AcademicSkill[] = [
  {
    id: "outline-blade",
    name: "Outline Blade",
    weaponType: "blade",
    description: "插入章节骨架，或直接展开论文项目级大纲。",
    actionLabel: "挥出章节骨架",
    themeColors: {
      primary: "#0f766e",
      secondary: "#ccfbf1",
      accent: "#14b8a6",
    },
    enabled: true,
  },
  {
    id: "citation-bow",
    name: "Citation Bow",
    weaponType: "bow",
    description: "快速插入引用骨架，或跳转到 Bib 文件。",
    actionLabel: "发射引用",
    themeColors: {
      primary: "#92400e",
      secondary: "#fef3c7",
      accent: "#f59e0b",
    },
    enabled: true,
  },
  {
    id: "figure-hammer",
    name: "Figure Hammer",
    weaponType: "hammer",
    description: "插入 figure 模板，给图和图注留出标准位置。",
    actionLabel: "锻造图环境",
    themeColors: {
      primary: "#1d4ed8",
      secondary: "#dbeafe",
      accent: "#3b82f6",
    },
    enabled: true,
  },
  {
    id: "review-shield",
    name: "Review Shield",
    weaponType: "shield",
    description: "打开论文审稿前自检清单，先拦住明显问题。",
    actionLabel: "展开审稿护盾",
    themeColors: {
      primary: "#9d174d",
      secondary: "#fce7f3",
      accent: "#ec4899",
    },
    enabled: true,
  },
  {
    id: "submission-spear",
    name: "Submission Spear",
    weaponType: "spear",
    description: "打开投稿前核查单，确保版本、图表与附件都完整。",
    actionLabel: "刺穿投稿清单",
    themeColors: {
      primary: "#334155",
      secondary: "#e2e8f0",
      accent: "#64748b",
    },
    enabled: true,
  },
];

export const ACADEMIC_SKILLS = BUILTIN_SKILLS;
