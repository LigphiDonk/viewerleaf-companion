import * as vscode from "vscode";

import { ensureActiveTexEditor, getPreferredWorkspaceFolder, isTexDocument } from "./workspace";

export const LATEX_WORKSHOP_EXTENSION_ID = "James-Yu.latex-workshop";

function focusViewCommand(viewId: string, fallbackCommand = "workbench.view.extension.viewerleaf") {
  return vscode.commands
    .executeCommand(viewId)
    .then(undefined, () => vscode.commands.executeCommand(fallbackCommand));
}

export function hasLatexWorkshop() {
  return Boolean(vscode.extensions.getExtension(LATEX_WORKSHOP_EXTENSION_ID));
}

export async function ensureLatexWorkshopInstalled(featureName: string) {
  if (hasLatexWorkshop()) {
    return true;
  }

  const message = `${featureName} 依赖 LaTeX Workshop 扩展。`;
  const action = await vscode.window.showWarningMessage(message, "查看扩展");

  if (action === "查看扩展") {
    await vscode.commands.executeCommand("workbench.extensions.search", `@id:${LATEX_WORKSHOP_EXTENSION_ID}`);
  }

  return false;
}

export async function applyAcademicWorkspacePreset() {
  const workspaceFolder = getPreferredWorkspaceFolder();
  if (!workspaceFolder) {
    vscode.window.showInformationMessage("请先打开一个工作区，再应用 ViewerLeaf Academic Workspace 预设。");
    return;
  }

  const action = await vscode.window.showInformationMessage(
    "这会向当前工作区写入少量 LaTeX Workshop 预设，用于更稳定地形成双栏学术工作台。",
    { modal: true },
    "应用预设",
  );

  if (action !== "应用预设") {
    return;
  }

  const config = vscode.workspace.getConfiguration(undefined, workspaceFolder.uri);
  await config.update("latex-workshop.view.pdf.viewer", "tab", vscode.ConfigurationTarget.WorkspaceFolder);
  await config.update("latex-workshop.view.pdf.tab.editorGroup", "right", vscode.ConfigurationTarget.WorkspaceFolder);
  await config.update("latex-workshop.synctex.afterBuild.enabled", true, vscode.ConfigurationTarget.WorkspaceFolder);
  await config.update("latex-workshop.view.autoFocus.enabled", false, vscode.ConfigurationTarget.WorkspaceFolder);

  vscode.window.showInformationMessage("ViewerLeaf Academic Workspace 预设已写入当前工作区。");
}

export async function revealPdf() {
  const editor = await ensureActiveTexEditor();
  if (!editor) {
    return;
  }

  if (!(await ensureLatexWorkshopInstalled("PDF 预览"))) {
    return;
  }

  await vscode.window.showTextDocument(editor.document, { preview: false, preserveFocus: true, viewColumn: vscode.ViewColumn.One });
  await vscode.commands.executeCommand("latex-workshop.view");
}

export async function syncTexToPdf() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !isTexDocument(editor.document)) {
    vscode.window.showInformationMessage("请先把光标放在一个 `.tex` 文件里。");
    return;
  }

  if (!(await ensureLatexWorkshopInstalled("SyncTeX"))) {
    return;
  }

  await vscode.commands.executeCommand("latex-workshop.synctex");
}

export async function autoSyncTexToPdf(editor: vscode.TextEditor) {
  const enabled = vscode.workspace.getConfiguration("viewerleaf").get("syncTexOnClick", true);
  if (!enabled || !hasLatexWorkshop() || !isTexDocument(editor.document)) {
    return;
  }

  await vscode.commands.executeCommand("latex-workshop.synctex");
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function hasCompiledPdf(editor: vscode.TextEditor) {
  const pdfUri = editor.document.uri.with({
    path: editor.document.uri.path.replace(/\.tex$/i, ".pdf"),
  });

  if (pdfUri.path === editor.document.uri.path) {
    return false;
  }

  try {
    await vscode.workspace.fs.stat(pdfUri);
    return true;
  } catch {
    return false;
  }
}

async function silentlyApplyAcademicWorkspacePreset(workspaceFolder: vscode.WorkspaceFolder) {
  const config = vscode.workspace.getConfiguration(undefined, workspaceFolder.uri);
  const presetEntries = [
    ["latex-workshop.view.pdf.viewer", "tab"],
    ["latex-workshop.view.pdf.tab.editorGroup", "right"],
    ["latex-workshop.synctex.afterBuild.enabled", true],
    ["latex-workshop.view.autoFocus.enabled", false],
  ] as const;

  for (const [key, value] of presetEntries) {
    const inspected = config.inspect(key);
    const hasExplicitValue = Boolean(
      inspected?.globalValue !== undefined
      || inspected?.workspaceValue !== undefined
      || inspected?.workspaceFolderValue !== undefined
      || inspected?.globalLanguageValue !== undefined
      || inspected?.workspaceLanguageValue !== undefined
      || inspected?.workspaceFolderLanguageValue !== undefined,
    );

    if (!hasExplicitValue) {
      await config.update(key, value, vscode.ConfigurationTarget.WorkspaceFolder);
    }
  }
}

export async function openAcademicWorkspace() {
  const editor = await ensureActiveTexEditor();
  if (!editor) {
    return;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Opening ViewerLeaf Academic Workspace",
    },
    async () => {
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
      if (workspaceFolder) {
        await silentlyApplyAcademicWorkspacePreset(workspaceFolder);
      }

      await vscode.commands.executeCommand("workbench.action.editorLayoutTwoColumns");
      await delay(300);
      await vscode.window.showTextDocument(editor.document, {
        preview: false,
        preserveFocus: true,
        viewColumn: vscode.ViewColumn.One,
      });

      await focusViewCommand("viewerleafOutline.focus");

      if (await ensureLatexWorkshopInstalled("Academic Workspace")) {
        const pdfExists = await hasCompiledPdf(editor);
        if (!pdfExists) {
          try {
            await vscode.commands.executeCommand("latex-workshop.build");
          } catch {
            // keep going even if build fails; preview may still exist
          }
        }

        const autoOpenPdf = vscode.workspace.getConfiguration("viewerleaf").get("workspace.autoOpenPdf", false);
        if (autoOpenPdf) {
          try {
            await vscode.commands.executeCommand("workbench.action.focusSecondEditorGroup");
          } catch {
            // ignore
          }

          await vscode.commands.executeCommand("latex-workshop.view");
        }

        await vscode.commands.executeCommand("workbench.action.focusFirstEditorGroup");
      }
    },
  );
}
