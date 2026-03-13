import * as path from "path";
import * as vscode from "vscode";

import {
  buildProjectOutline,
  computeSectionNumbers,
  findActiveHeading,
} from "../outline/latexOutline";
import type { OutlineHeading, OutlineNode } from "../types";
import { readWorkspaceRelativeFile, resolveMainTexFile, toWorkspaceRelativePath } from "../workspace";

type ViewNode =
  | {
      kind: "heading";
      id: string;
      label: string;
      description: string;
      tooltip: string;
      filePath: string;
      line: number;
      children: ViewNode[];
      collapsibleState: vscode.TreeItemCollapsibleState;
    }
  | {
      kind: "warning-group";
      id: string;
      label: string;
      description: string;
      tooltip: string;
      children: ViewNode[];
      collapsibleState: vscode.TreeItemCollapsibleState;
    }
  | {
      kind: "warning";
      id: string;
      label: string;
      description: string;
      tooltip: string;
      children: ViewNode[];
      collapsibleState: vscode.TreeItemCollapsibleState;
    }
  | {
      kind: "empty";
      id: string;
      label: string;
      description: string;
      tooltip: string;
      children: ViewNode[];
      collapsibleState: vscode.TreeItemCollapsibleState;
    };

function createEmptyNode(label: string, description: string): ViewNode {
  return {
    kind: "empty",
    id: `empty:${label}:${description}`,
    label,
    description,
    tooltip: description,
    children: [],
    collapsibleState: vscode.TreeItemCollapsibleState.None,
  };
}

export class ViewerLeafOutlineProvider implements vscode.TreeDataProvider<ViewNode> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<ViewNode | undefined | void>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  private roots: ViewNode[] = [createEmptyNode("No paper outline yet", "Open a LaTeX workspace to begin.")];
  private headings: OutlineHeading[] = [];
  private activeHeadingId = "";
  private treeView?: vscode.TreeView<ViewNode>;
  private nodesById = new Map<string, ViewNode>();

  bindTreeView(treeView: vscode.TreeView<ViewNode>) {
    this.treeView = treeView;
  }

  getTreeItem(element: ViewNode) {
    const item = new vscode.TreeItem(element.label, element.collapsibleState);
    item.id = element.id;
    item.description = element.description;
    item.tooltip = element.tooltip;

    if (element.kind === "heading") {
      item.command = {
        command: "vscode.open",
        title: "Open heading",
        arguments: [
          vscode.Uri.file(path.resolve(this.currentWorkspaceRoot ?? "", element.filePath)),
          {
            selection: new vscode.Range(element.line - 1, 0, element.line - 1, 0),
            preview: false,
          },
        ],
      };
      item.iconPath =
        element.id === this.activeHeadingId
          ? new vscode.ThemeIcon("target")
          : new vscode.ThemeIcon("symbol-number");
      if (element.id === this.activeHeadingId) {
        item.description = `${element.description} · 当前`;
      }
    } else if (element.kind === "warning-group") {
      item.iconPath = new vscode.ThemeIcon("warning");
    } else if (element.kind === "warning") {
      item.iconPath = new vscode.ThemeIcon("alert");
    } else {
      item.iconPath = new vscode.ThemeIcon("info");
    }

    return item;
  }

  getChildren(element?: ViewNode) {
    return element ? element.children : this.roots;
  }

  private currentWorkspaceRoot?: string;

  async refresh() {
    const mainTex = await resolveMainTexFile();
    if (!mainTex) {
      this.currentWorkspaceRoot = undefined;
      this.headings = [];
      this.activeHeadingId = "";
      this.nodesById.clear();
      this.roots = [createEmptyNode("No main TeX file", "Configure viewerleaf.outline.mainTex or open a LaTeX workspace.")];
      this.onDidChangeTreeDataEmitter.fire();
      return;
    }

    this.currentWorkspaceRoot = mainTex.workspaceFolder.uri.fsPath;
    const result = await buildProjectOutline(mainTex.relativePath, async (relativePath) =>
      readWorkspaceRelativeFile(mainTex.workspaceFolder, relativePath)
    );

    this.headings = result.headings;
    this.nodesById.clear();
    const sectionNumbers = computeSectionNumbers(result.tree);
    const headingNodes = result.tree.map((node) => this.toViewNode(node, sectionNumbers));
    const warningNodes = result.warnings.length
      ? [{
          kind: "warning-group" as const,
          id: "warnings",
          label: "Warnings",
          description: `${result.warnings.length} issue(s)`,
          tooltip: result.warnings.join("\n"),
          collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
          children: result.warnings.map((warning, index) => ({
            kind: "warning" as const,
            id: `warning:${index}`,
            label: warning,
            description: "include not resolved",
            tooltip: warning,
            children: [],
            collapsibleState: vscode.TreeItemCollapsibleState.None,
          })),
        }]
      : [];

    this.roots = headingNodes.length ? [...headingNodes, ...warningNodes] : [
      createEmptyNode("No sections found", "No sectioning commands were found from the detected main TeX file."),
      ...warningNodes,
    ];

    this.updateActiveHeading(false);
    this.onDidChangeTreeDataEmitter.fire();
    void this.revealActiveHeading();
  }

  handleEditorContextChange() {
    this.updateActiveHeading(true);
  }

  private updateActiveHeading(emit: boolean) {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !this.currentWorkspaceRoot) {
      if (this.activeHeadingId) {
        this.activeHeadingId = "";
        if (emit) {
          this.onDidChangeTreeDataEmitter.fire();
        }
      }
      return;
    }

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
    if (!workspaceFolder || workspaceFolder.uri.fsPath !== this.currentWorkspaceRoot) {
      return;
    }

    const filePath = toWorkspaceRelativePath(workspaceFolder, editor.document.uri);
    const line = editor.selection.active.line + 1;
    const activeHeading = findActiveHeading(this.headings, filePath, line);
    const nextId = activeHeading?.id ?? "";

    if (nextId === this.activeHeadingId) {
      return;
    }

    this.activeHeadingId = nextId;
    if (emit) {
      this.onDidChangeTreeDataEmitter.fire();
      void this.revealActiveHeading();
    }
  }

  private async revealActiveHeading() {
    if (!this.treeView || !this.activeHeadingId) {
      return;
    }

    const node = this.nodesById.get(this.activeHeadingId);
    if (!node) {
      return;
    }

    try {
      await this.treeView.reveal(node, {
        select: false,
        focus: false,
        expand: true,
      });
    } catch {
      // ignore reveal failures during tree refresh
    }
  }

  private toViewNode(node: OutlineNode, sectionNumbers: Map<string, string>): ViewNode {
    const sectionNumber = sectionNumbers.get(node.id);
    const label = sectionNumber ? `${sectionNumber} ${node.heading.title}` : node.heading.title;
    const description = `${node.heading.filePath}:${node.heading.line}`;
    const tooltip = `${node.heading.command} · ${node.heading.filePath}:${node.heading.line}`;

    const viewNode: ViewNode = {
      kind: "heading",
      id: node.id,
      label,
      description,
      tooltip,
      filePath: node.heading.filePath,
      line: node.heading.line,
      children: node.children.map((child) => this.toViewNode(child, sectionNumbers)),
      collapsibleState:
        node.children.length > 0
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None,
    };

    this.nodesById.set(viewNode.id, viewNode);
    return viewNode;
  }
}
