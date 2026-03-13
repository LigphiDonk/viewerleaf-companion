import * as vscode from "vscode";
import * as path from "node:path";

import { BUILTIN_SKILLS } from "./catalog";
import { sendToClaudeCode } from "./claudeCodeBridge";
import type { AcademicSkill } from "../types";
import { isTexDocument } from "../workspace";

function markdownDocumentTitle(title: string, body: string) {
  return `# ${title}\n\n${body}`;
}

async function openChecklist(title: string, body: string) {
  const document = await vscode.workspace.openTextDocument({
    language: "markdown",
    content: markdownDocumentTitle(title, body),
  });
  await vscode.window.showTextDocument(document, {
    preview: false,
    viewColumn: vscode.ViewColumn.Beside,
  });
}

async function insertSnippet(snippet: string) {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !isTexDocument(editor.document)) {
    vscode.window.showInformationMessage("请先把焦点放在一个 `.tex` 编辑器里。");
    return false;
  }

  await editor.insertSnippet(new vscode.SnippetString(snippet));
  return true;
}

async function openFirstBibliographyFile() {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    return false;
  }

  const bibFiles = await vscode.workspace.findFiles(
    new vscode.RelativePattern(workspaceFolder, "**/*.bib"),
    "**/{node_modules,.git,out,dist,build}/**",
    20,
  );

  const target = bibFiles[0];
  if (!target) {
    return false;
  }

  const document = await vscode.workspace.openTextDocument(target);
  await vscode.window.showTextDocument(document, { preview: false, viewColumn: vscode.ViewColumn.Beside });
  return true;
}

export async function runSkill(skillId: string | undefined, skills: AcademicSkill[]): Promise<void>;
export async function runSkill(skillId?: string, skills: AcademicSkill[] = BUILTIN_SKILLS) {
  const resolvedSkillId = skillId ?? await pickSkillId(skills);
  if (!resolvedSkillId) {
    return;
  }

  const skill = skills.find((item) => item.id === resolvedSkillId);
  if (!skill) {
    vscode.window.showWarningMessage(`未知 skill: ${resolvedSkillId}`);
    return;
  }

  if (skill.action) {
    await runCustomSkillAction(skill);
    return;
  }

  switch (resolvedSkillId) {
    case "outline-blade":
      await runOutlineBlade();
      return;
    case "citation-bow":
      await runCitationBow();
      return;
    case "figure-hammer":
      await runFigureHammer();
      return;
    case "review-shield":
      await runReviewShield();
      return;
    case "submission-spear":
      await runSubmissionSpear();
      return;
    default:
      vscode.window.showWarningMessage(`未知 skill: ${resolvedSkillId}`);
  }
}

async function pickSkillId(skills: AcademicSkill[]) {
  const picked = await vscode.window.showQuickPick(
    skills.filter((skill) => skill.enabled).map((skill) => ({
      label: skill.name,
      description: skill.description,
      skillId: skill.id,
    })),
    {
      placeHolder: "选择一个 Academic Skill",
    },
  );

  return picked?.skillId;
}

function buildPromptContext() {
  const editor = vscode.window.activeTextEditor;
  const document = editor?.document;
  const workspaceFolder = document ? vscode.workspace.getWorkspaceFolder(document.uri) : undefined;

  return {
    fileName: document ? path.basename(document.uri.fsPath) : undefined,
    filePath: document?.uri.fsPath,
    selection: editor && document && !editor.selection.isEmpty ? document.getText(editor.selection) : "",
    workspaceName: workspaceFolder?.name,
    lineNumber: editor ? editor.selection.active.line + 1 : undefined,
  };
}

export async function runCustomSkillAction(skill: AcademicSkill) {
  if (!skill.action) {
    vscode.window.showWarningMessage(`Skill ${skill.name} 没有可执行 action。`);
    return;
  }

  switch (skill.action.type) {
    case "snippet":
      if (!skill.action.snippet) {
        vscode.window.showWarningMessage(`Skill ${skill.name} 的 snippet action 缺少内容。`);
        return;
      }
      await insertSnippet(skill.action.snippet);
      return;
    case "checklist":
      if (!skill.action.checklist) {
        vscode.window.showWarningMessage(`Skill ${skill.name} 的 checklist action 缺少内容。`);
        return;
      }
      await openChecklist(skill.name, skill.action.checklist);
      return;
    case "command":
      if (!skill.action.command) {
        vscode.window.showWarningMessage(`Skill ${skill.name} 的 command action 缺少命令 ID。`);
        return;
      }

      try {
        await vscode.commands.executeCommand(skill.action.command);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showWarningMessage(`Skill ${skill.name} 执行命令失败: ${message}`);
      }
      return;
    case "claudeCode":
      if (!skill.action.prompt) {
        vscode.window.showWarningMessage(`Skill ${skill.name} 的 claudeCode action 缺少 prompt。`);
        return;
      }
      await sendToClaudeCode(skill.action.prompt, buildPromptContext());
      return;
    default:
      vscode.window.showWarningMessage(`Skill ${skill.name} 使用了不支持的 action 类型。`);
  }
}

async function runOutlineBlade() {
  const choice = await vscode.window.showQuickPick(
    [
      {
        label: "插入 \\section 骨架",
        value: "\\section{${1:Section Title}}\n\\label{sec:${2:section-label}}\n\n${0}",
      },
      {
        label: "插入 \\subsection 骨架",
        value: "\\subsection{${1:Subsection Title}}\n\\label{subsec:${2:subsection-label}}\n\n${0}",
      },
      {
        label: "只打开项目级大纲",
        value: "__show-outline__",
      },
    ],
    { placeHolder: "Outline Blade 要做什么？" },
  );

  if (!choice) {
    return;
  }

  if (choice.value === "__show-outline__") {
    await vscode.commands.executeCommand("viewerleaf.showProjectOutline");
    return;
  }

  const inserted = await insertSnippet(choice.value);
  if (inserted) {
    await vscode.commands.executeCommand("viewerleaf.showProjectOutline");
  }
}

async function runCitationBow() {
  const inserted = await insertSnippet("\\cite{${1:ref-key}}$0");
  if (inserted) {
    return;
  }

  const openedBib = await openFirstBibliographyFile();
  if (!openedBib) {
    vscode.window.showInformationMessage("当前既没有活动的 `.tex` 编辑器，也没有找到 `.bib` 文件。");
  }
}

async function runFigureHammer() {
  await insertSnippet(
    [
      "\\begin{figure}[htbp]",
      "  \\centering",
      "  \\includegraphics[width=${1:0.8}\\linewidth]{${2:figure-path}}",
      "  \\caption{${3:Figure caption}}",
      "  \\label{fig:${4:figure-label}}",
      "\\end{figure}",
      "${0}",
    ].join("\n"),
  );
}

async function runReviewShield() {
  await openChecklist(
    "Review Shield",
    [
      "## 结构自检",
      "- [ ] 摘要是否明确说明问题、方法、结果",
      "- [ ] 引言是否说清楚贡献而不是只堆背景",
      "- [ ] 方法章节是否能单独复现",
      "",
      "## 论证自检",
      "- [ ] 每个实验是否对应一个明确 claim",
      "- [ ] 图表标题能否脱离正文独立理解",
      "- [ ] 结论是否没有超出实验支持范围",
      "",
      "## 表达自检",
      "- [ ] 术语是否前后一致",
      "- [ ] 同一段是否只讲一件事",
      "- [ ] 是否存在明显的 AI 腔套话",
    ].join("\n"),
  );
}

async function runSubmissionSpear() {
  await openChecklist(
    "Submission Spear",
    [
      "## 投稿前核查",
      "- [ ] 目标会议/期刊模板版本正确",
      "- [ ] 作者、单位、致谢信息符合匿名或非匿名要求",
      "- [ ] 所有引用都能在参考文献中解析",
      "- [ ] 所有图表都能在最终 PDF 中正常显示",
      "- [ ] 附录、补充材料、代码链接状态正确",
      "- [ ] 最终 PDF 页数、字体、嵌图清晰度符合要求",
      "- [ ] 文件命名和版本号一致",
    ].join("\n"),
  );
}
