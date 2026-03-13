import * as path from "path";
import * as vscode from "vscode";

const TEX_LANGUAGE_IDS = new Set(["latex", "tex"]);
const TEX_GLOB = "**/*.tex";
const TEX_EXCLUDES = "**/{node_modules,.git,out,dist,build}/**";
const textDecoder = new TextDecoder("utf-8");

export interface MainTexResolution {
  workspaceFolder: vscode.WorkspaceFolder;
  relativePath: string;
  uri: vscode.Uri;
}

export function isTexDocument(document?: vscode.TextDocument) {
  if (!document) {
    return false;
  }
  return TEX_LANGUAGE_IDS.has(document.languageId) || document.uri.fsPath.endsWith(".tex");
}

export function getPreferredWorkspaceFolder() {
  const active = vscode.window.activeTextEditor?.document;
  if (active) {
    const folder = vscode.workspace.getWorkspaceFolder(active.uri);
    if (folder) {
      return folder;
    }
  }

  return vscode.workspace.workspaceFolders?.[0];
}

export function toWorkspaceRelativePath(workspaceFolder: vscode.WorkspaceFolder, uri: vscode.Uri) {
  return path.relative(workspaceFolder.uri.fsPath, uri.fsPath).replace(/\\/g, "/");
}

export async function readWorkspaceRelativeFile(
  workspaceFolder: vscode.WorkspaceFolder,
  relativePath: string,
) {
  const uri = vscode.Uri.joinPath(workspaceFolder.uri, ...relativePath.split("/"));
  const raw = await vscode.workspace.fs.readFile(uri);
  return textDecoder.decode(raw);
}

export async function listTexFiles(workspaceFolder: vscode.WorkspaceFolder) {
  return vscode.workspace.findFiles(
    new vscode.RelativePattern(workspaceFolder, TEX_GLOB),
    TEX_EXCLUDES,
    200,
  );
}

export async function ensureActiveTexEditor() {
  const activeEditor = vscode.window.activeTextEditor;
  if (isTexDocument(activeEditor?.document)) {
    return activeEditor;
  }

  const workspaceFolder = getPreferredWorkspaceFolder();
  if (!workspaceFolder) {
    vscode.window.showInformationMessage("请先打开一个包含 LaTeX 项目的工作区。");
    return undefined;
  }

  const texFiles = await listTexFiles(workspaceFolder);
  if (texFiles.length === 0) {
    vscode.window.showInformationMessage("当前工作区里没有找到 `.tex` 文件。");
    return undefined;
  }

  const picked = await vscode.window.showQuickPick(
    texFiles.map((uri) => ({
      label: path.basename(uri.fsPath),
      description: toWorkspaceRelativePath(workspaceFolder, uri),
      uri,
    })),
    {
      placeHolder: "选择一个 TeX 文件作为学术工作台入口",
    },
  );

  if (!picked) {
    return undefined;
  }

  const document = await vscode.workspace.openTextDocument(picked.uri);
  return vscode.window.showTextDocument(document, { preview: false, preserveFocus: false });
}

export async function resolveMainTexFile() {
  const workspaceFolder = getPreferredWorkspaceFolder();
  if (!workspaceFolder) {
    return undefined;
  }

  const configured = vscode.workspace
    .getConfiguration("viewerleaf", workspaceFolder.uri)
    .get<string>("outline.mainTex", "auto")
    .trim();

  if (configured && configured !== "auto") {
    const normalized = configured.replace(/\\/g, "/");
    const uri = vscode.Uri.joinPath(workspaceFolder.uri, ...normalized.split("/"));
    try {
      await vscode.workspace.fs.stat(uri);
      return {
        workspaceFolder,
        relativePath: normalized,
        uri,
      } satisfies MainTexResolution;
    } catch {
      vscode.window.showWarningMessage(`viewerleaf.outline.mainTex 指向的文件不存在: ${normalized}`);
    }
  }

  const rootMainUri = vscode.Uri.joinPath(workspaceFolder.uri, "main.tex");
  try {
    await vscode.workspace.fs.stat(rootMainUri);
    return {
      workspaceFolder,
      relativePath: "main.tex",
      uri: rootMainUri,
    } satisfies MainTexResolution;
  } catch {
    // ignore and keep scanning
  }

  const texFiles = await listTexFiles(workspaceFolder);
  for (const uri of texFiles) {
    try {
      const content = textDecoder.decode(await vscode.workspace.fs.readFile(uri));
      if (/\\documentclass(?:\[[^\]]*\])?\s*\{[^}]+\}/.test(content)) {
        return {
          workspaceFolder,
          relativePath: toWorkspaceRelativePath(workspaceFolder, uri),
          uri,
        } satisfies MainTexResolution;
      }
    } catch {
      // ignore and keep scanning
    }
  }

  const activeDocument = vscode.window.activeTextEditor?.document;
  if (activeDocument && isTexDocument(activeDocument) && vscode.workspace.getWorkspaceFolder(activeDocument.uri)?.uri.toString() === workspaceFolder.uri.toString()) {
    return {
      workspaceFolder,
      relativePath: toWorkspaceRelativePath(workspaceFolder, activeDocument.uri),
      uri: activeDocument.uri,
    } satisfies MainTexResolution;
  }

  const fallback = texFiles[0];
  if (!fallback) {
    return undefined;
  }

  return {
    workspaceFolder,
    relativePath: toWorkspaceRelativePath(workspaceFolder, fallback),
    uri: fallback,
  } satisfies MainTexResolution;
}
