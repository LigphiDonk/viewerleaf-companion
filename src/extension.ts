import * as vscode from "vscode";

import { applyAcademicWorkspacePreset, openAcademicWorkspace, revealPdf, syncTexToPdf } from "./latexWorkshop";
import { runSkill } from "./skills/skillRunner";
import { ViewerLeafOutlineProvider } from "./views/outlineProvider";
import { ArsenalViewProvider } from "./views/arsenalViewProvider";
import { isTexDocument } from "./workspace";

export function activate(context: vscode.ExtensionContext) {
  const outlineProvider = new ViewerLeafOutlineProvider();
  const outlineTreeView = vscode.window.createTreeView("viewerleafOutline", {
    treeDataProvider: outlineProvider,
    showCollapseAll: true,
  });
  outlineProvider.bindTreeView(outlineTreeView);

  const arsenalProvider = new ArsenalViewProvider(context.extensionUri);

  context.subscriptions.push(
    outlineTreeView,
    vscode.window.registerWebviewViewProvider("viewerleafArsenal", arsenalProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand("viewerleaf.openAcademicWorkspace", () => void openAcademicWorkspace()),
    vscode.commands.registerCommand("viewerleaf.applyWorkspacePreset", () => void applyAcademicWorkspacePreset()),
    vscode.commands.registerCommand("viewerleaf.revealPdf", () => void revealPdf()),
    vscode.commands.registerCommand("viewerleaf.syncTexToPdf", () => void syncTexToPdf()),
    vscode.commands.registerCommand("viewerleaf.runSkill", (skillId?: string) => void runSkill(skillId)),
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
    vscode.window.onDidChangeActiveTextEditor(() => {
      outlineProvider.handleEditorContextChange();
    }),
    vscode.window.onDidChangeTextEditorSelection((event) => {
      if (isTexDocument(event.textEditor.document)) {
        outlineProvider.handleEditorContextChange();
      }
    }),
  );

  void outlineProvider.refresh();
}

export function deactivate() {
  // no-op
}
