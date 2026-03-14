import * as vscode from "vscode";

export interface PromptContext {
  fileName?: string;
  filePath?: string;
  selection?: string;
  workspaceName?: string;
  lineNumber?: number;
}

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
  // Try name-based match first
  const byName = vscode.window.terminals.find((terminal) =>
    /\bclaude\b/i.test(terminal.name),
  );
  if (byName) {
    return byName;
  }

  // Fall back to the currently active terminal (user is likely looking at Claude Code)
  return vscode.window.activeTerminal;
}

export async function sendToClaudeCode(promptTemplate: string, context: PromptContext): Promise<void> {
  const expandedPrompt = expandPrompt(promptTemplate, context);
  const terminal = findClaudeTerminal();

  if (!terminal) {
    // No terminal at all — copy to clipboard
    await vscode.env.clipboard.writeText(expandedPrompt);
    vscode.window.showInformationMessage(`已复制 "${expandedPrompt}" 到剪贴板。请打开 Claude Code 终端后粘贴。`);
    return;
  }

  terminal.show(false);

  // Save clipboard, paste prompt, then restore — most reliable with interactive CLI apps
  const savedClipboard = await vscode.env.clipboard.readText();
  await vscode.env.clipboard.writeText(expandedPrompt);
  await vscode.commands.executeCommand("workbench.action.terminal.paste");
  // Restore clipboard after a short delay
  setTimeout(() => {
    void vscode.env.clipboard.writeText(savedClipboard);
  }, 500);
}
