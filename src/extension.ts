import * as vscode from "vscode";

import { applyAcademicWorkspacePreset, autoSyncTexToPdf, openAcademicWorkspace, revealPdf, syncTexToPdf } from "./latexWorkshop";
import { BUILTIN_SKILLS } from "./skills/catalog";
import { DEFAULT_GLOBAL_SKILLS_PATH, loadAllSkills, watchSkillManifests } from "./skills/skillLoader";
import { runSkill } from "./skills/skillRunner";
import type { AcademicSkill } from "./types";
import { ArsenalViewProvider } from "./views/arsenalViewProvider";
import { ViewerLeafOutlineProvider } from "./views/outlineProvider";
import { RichPreviewProvider } from "./views/richPreviewProvider";
import { VisualEditorProvider } from "./editors/visualEditorProvider";
import { isTexDocument } from "./workspace";

export function activate(context: vscode.ExtensionContext) {
  const outlineProvider = new ViewerLeafOutlineProvider();
  const outlineTreeView = vscode.window.createTreeView("viewerleafOutline", {
    treeDataProvider: outlineProvider,
    showCollapseAll: true,
  });
  outlineProvider.bindTreeView(outlineTreeView);

  let currentSkills: AcademicSkill[] = BUILTIN_SKILLS;
  let skillWatcher: { dispose(): void } | undefined;
  let lastSkillWarningSignature = "";

  const getSkills = () => currentSkills;
  const richPreviewProvider = new RichPreviewProvider(context.extensionUri);
  const arsenalProvider = new ArsenalViewProvider(context.extensionUri, getSkills);

  const getSkillConfig = () => vscode.workspace.getConfiguration("viewerleaf");
  const getGlobalManifestPath = () => getSkillConfig().get<string>("skills.globalManifestPath", DEFAULT_GLOBAL_SKILLS_PATH);

  const reloadSkills = async (announce = false) => {
    const result = await loadAllSkills({
      workspaceRoots: vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath) ?? [],
      enableCustomSkills: getSkillConfig().get("skills.enableCustomSkills", true),
      globalManifestPath: getGlobalManifestPath(),
    });

    currentSkills = result.skills;
    arsenalProvider.refreshSkills();

    const warningSignature = result.warnings.join("\n");
    if (result.warnings.length === 0) {
      lastSkillWarningSignature = "";
    } else if (warningSignature !== lastSkillWarningSignature) {
      lastSkillWarningSignature = warningSignature;
      const suffix = result.warnings.length > 1 ? ` 等 ${result.warnings.length} 项` : "";
      vscode.window.showWarningMessage(`自定义 Skills 加载时跳过了部分条目：${result.warnings[0]}${suffix}`);
    }

    if (announce) {
      const customSkillCount = result.skills.filter((skill) => skill.isCustom).length;
      vscode.window.showInformationMessage(
        `ViewerLeaf Skills 已刷新：${customSkillCount} 个自定义 skill，${result.sources.length} 个清单来源。`,
      );
    }
  };

  const recreateSkillWatcher = () => {
    skillWatcher?.dispose();
    skillWatcher = undefined;

    if (!getSkillConfig().get("skills.enableCustomSkills", true)) {
      return;
    }

    skillWatcher = watchSkillManifests(vscode, getGlobalManifestPath(), () => void reloadSkills());
  };

  context.subscriptions.push(
    outlineTreeView,
    richPreviewProvider,
    VisualEditorProvider.register(context),
    { dispose: () => skillWatcher?.dispose() },
    vscode.window.registerWebviewViewProvider("viewerleafArsenal", arsenalProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand("viewerleaf.openAcademicWorkspace", () => void openAcademicWorkspace()),
    vscode.commands.registerCommand("viewerleaf.applyWorkspacePreset", () => void applyAcademicWorkspacePreset()),
    vscode.commands.registerCommand("viewerleaf.revealPdf", () => void revealPdf()),
    vscode.commands.registerCommand("viewerleaf.syncTexToPdf", () => void syncTexToPdf()),
    vscode.commands.registerCommand("viewerleaf.runSkill", (skillId?: string) => void runSkill(skillId, currentSkills)),
    vscode.commands.registerCommand("viewerleaf.reloadSkills", () => void reloadSkills(true)),
    vscode.commands.registerCommand("viewerleaf.openRichPreview", () => {
      richPreviewProvider.open();
    }),
    vscode.commands.registerCommand("viewerleaf.openVisualEditor", async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor && isTexDocument(editor.document)) {
        await vscode.commands.executeCommand("vscode.openWith", editor.document.uri, VisualEditorProvider.viewType);
      }
    }),
    vscode.commands.registerCommand("viewerleaf.refreshOutline", () => void outlineProvider.refresh()),
    vscode.commands.registerCommand("viewerleaf.showProjectOutline", async () => {
      await outlineProvider.refresh();
      await vscode.commands.executeCommand("viewerleafOutline.focus").then(
        undefined,
        () => vscode.commands.executeCommand("workbench.view.extension.viewerleaf"),
      );
    }),
    vscode.commands.registerCommand("viewerleaf.openArsenal", async () => {
      await vscode.commands.executeCommand("viewerleafArsenal.focus").then(
        undefined,
        () => vscode.commands.executeCommand("workbench.view.extension.viewerleaf"),
      );
    }),
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (isTexDocument(document)) {
        void outlineProvider.refresh();
      }
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      void outlineProvider.refresh();
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration("viewerleaf.skills.enableCustomSkills")
        || event.affectsConfiguration("viewerleaf.skills.globalManifestPath")
      ) {
        recreateSkillWatcher();
        void reloadSkills();
      }
    }),
    vscode.window.onDidChangeActiveTextEditor(() => {
      outlineProvider.handleEditorContextChange();
    }),
    vscode.window.onDidChangeTextEditorSelection((event) => {
      if (isTexDocument(event.textEditor.document)) {
        outlineProvider.handleEditorContextChange();
        if (event.kind === vscode.TextEditorSelectionChangeKind.Mouse) {
          void autoSyncTexToPdf(event.textEditor);
        }
      }
    }),
  );

  recreateSkillWatcher();
  void Promise.all([
    outlineProvider.refresh(),
    reloadSkills(),
  ]);
}

export function deactivate() {
  // no-op
}
