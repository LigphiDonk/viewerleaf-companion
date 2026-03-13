import * as vscode from "vscode";

export interface PromptContext {
  fileName?: string;
  filePath?: string;
  selection?: string;
  workspaceName?: string;
  lineNumber?: number;
}

const CLAUDE_TERMINAL_NAME = "Claude Code";

function expandPrompt(promptTemplate: string, context: PromptContext) {
  const replacements: Record<string, string> = {
    fileName: context.fileName ?? "",
    filePath: context.filePath ?? "",
    selection: context.selection ?? "",
    workspaceName: context.workspaceName ?? "",
    lineNumber: context.lineNumber !== undefined ? String(context.lineNumber) : "",
  };

  return promptTemplate.replace(/{{\s*(\w+)\s*}}/g, (_, key: string) => replacements[key] ?? "");
}

function findClaudeTerminal() {
  return vscode.window.terminals.find((terminal) => terminal.name.toLowerCase().includes("claude"));
}

export async function sendToClaudeCode(promptTemplate: string, context: PromptContext): Promise<void> {
  const terminal = findClaudeTerminal() ?? vscode.window.createTerminal({ name: CLAUDE_TERMINAL_NAME });
  const expandedPrompt = expandPrompt(promptTemplate, context);

  terminal.show(false);
  terminal.sendText(expandedPrompt, false);
}
