import * as vscode from "vscode";

import { hasLatexWorkshop, suppressAutoBuildDuring } from "../latexWorkshop";

export class VisualEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = "viewerleaf.visualEditor";

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    return vscode.window.registerCustomEditorProvider(
      VisualEditorProvider.viewType,
      new VisualEditorProvider(context),
      { supportsMultipleEditorsPerDocument: false },
    );
  }

  private constructor(private readonly context: vscode.ExtensionContext) {}

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
    };

    let pendingEdits = 0;

    const getLines = () => document.getText().split("\n");

    webviewPanel.webview.html = buildHtml(webviewPanel.webview, getLines());

    const docChangeSub = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() !== document.uri.toString()) {
        return;
      }
      if (pendingEdits > 0) {
        pendingEdits--;
        return;
      }
      void webviewPanel.webview.postMessage({ type: "documentChanged", lines: getLines() });
    });

    webviewPanel.onDidDispose(() => docChangeSub.dispose());

    webviewPanel.webview.onDidReceiveMessage(async (msg: WebviewMessage) => {
      const edit = new vscode.WorkspaceEdit();

      switch (msg.type) {
        case "editLine": {
          if (msg.line < 0 || msg.line >= document.lineCount) {
            return;
          }
          edit.replace(document.uri, document.lineAt(msg.line).range, msg.text);
          break;
        }
        case "splitLine": {
          if (msg.line < 0 || msg.line >= document.lineCount) {
            return;
          }
          const srcLine = document.lineAt(msg.line);
          const before = srcLine.text.substring(0, msg.offset);
          const after = srcLine.text.substring(msg.offset);
          edit.replace(document.uri, srcLine.range, before + "\n" + after);
          break;
        }
        case "mergeLineUp": {
          if (msg.line <= 0 || msg.line >= document.lineCount) {
            return;
          }
          const prev = document.lineAt(msg.line - 1);
          const curr = document.lineAt(msg.line);
          const range = new vscode.Range(prev.range.start, curr.range.end);
          edit.replace(document.uri, range, prev.text + curr.text);
          break;
        }
        case "insertCommand": {
          if (msg.line < 0 || msg.line >= document.lineCount) {
            return;
          }
          const ln = document.lineAt(msg.line);
          const pre = ln.text.substring(0, msg.offset);
          const sel = ln.text.substring(msg.offset, msg.offsetEnd);
          const post = ln.text.substring(msg.offsetEnd);
          edit.replace(document.uri, ln.range, pre + msg.before + sel + msg.after + post);
          break;
        }
        case "switchToCode": {
          await vscode.commands.executeCommand("vscode.openWith", document.uri, "default");
          return;
        }
        case "focusLine": {
          if (!hasLatexWorkshop()) {
            return;
          }
          await suppressAutoBuildDuring(async () => {
            const textEditor = await vscode.window.showTextDocument(document, {
              viewColumn: webviewPanel.viewColumn,
              preview: true,
              preserveFocus: false,
            });
            const pos = new vscode.Position(msg.line, 0);
            textEditor.selection = new vscode.Selection(pos, pos);
            textEditor.revealRange(new vscode.Range(pos, pos));
            await vscode.commands.executeCommand("latex-workshop.synctex");
            await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
          });
          return;
        }
        default:
          return;
      }

      pendingEdits++;
      await vscode.workspace.applyEdit(edit);
    });
  }
}

type WebviewMessage =
  | { type: "editLine"; line: number; text: string }
  | { type: "splitLine"; line: number; offset: number }
  | { type: "mergeLineUp"; line: number }
  | { type: "switchToCode" }
  | { type: "focusLine"; line: number }
  | { type: "insertCommand"; line: number; offset: number; offsetEnd: number; before: string; after: string };

function getNonce() {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let text = "";
  for (let i = 0; i < 24; i++) {
    text += chars[Math.floor(Math.random() * chars.length)];
  }
  return text;
}

function buildHtml(webview: vscode.Webview, lines: string[]): string {
  const nonce = getNonce();
  const linesJson = JSON.stringify(lines);

  return /* html */ `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: "Iosevka", "Fira Code", "SF Mono", Menlo, Consolas, monospace;
      font-size: 14px;
      line-height: 1.65;
      color: var(--vscode-editor-foreground);
      background: var(--vscode-editor-background);
    }

    /* ── Toolbar ── */

    .toolbar {
      position: sticky;
      top: 0;
      z-index: 10;
      display: flex;
      align-items: center;
      gap: 2px;
      padding: 4px 8px;
      background: var(--vscode-editorGroupHeader-tabsBackground, var(--vscode-editor-background));
      border-bottom: 1px solid color-mix(in srgb, var(--vscode-editor-foreground) 10%, transparent);
    }

    .toolbar__sep {
      width: 1px;
      height: 18px;
      margin: 0 4px;
      background: color-mix(in srgb, var(--vscode-editor-foreground) 12%, transparent);
    }

    .toolbar__btn {
      display: grid;
      place-items: center;
      width: 28px;
      height: 28px;
      border: none;
      border-radius: 4px;
      background: transparent;
      color: var(--vscode-editor-foreground);
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      transition: background 100ms ease;
      font-family: inherit;
    }

    .toolbar__btn:hover {
      background: color-mix(in srgb, var(--vscode-editor-foreground) 10%, transparent);
    }

    .toolbar__btn--toggle {
      display: flex;
      align-items: center;
      gap: 4px;
      width: auto;
      padding: 0 8px;
      font-size: 11px;
      font-weight: 600;
      border: 1px solid color-mix(in srgb, var(--vscode-editor-foreground) 12%, transparent);
      border-radius: 4px;
    }

    .toolbar__btn--toggle svg {
      width: 14px;
      height: 14px;
    }

    .toolbar__btn svg {
      width: 16px;
      height: 16px;
    }

    .toolbar__label {
      font-size: 11px;
      font-weight: 500;
      opacity: 0.5;
      margin-left: 6px;
      user-select: none;
    }

    /* ── Editor ── */

    .editor {
      display: flex;
      min-height: calc(100vh - 37px);
      max-width: 100vw;
      overflow-x: hidden;
    }

    .gutter {
      width: 52px;
      flex-shrink: 0;
      padding: 8px 0;
      text-align: right;
      user-select: none;
      border-right: 1px solid color-mix(in srgb, var(--vscode-editor-foreground) 8%, transparent);
      background: color-mix(in srgb, var(--vscode-editor-foreground) 2%, var(--vscode-editor-background));
    }

    .ln {
      padding: 0 10px 0 0;
      height: calc(1.65em);
      color: color-mix(in srgb, var(--vscode-editor-foreground) 30%, transparent);
      font-size: 12px;
      line-height: 1.65;
      font-variant-numeric: tabular-nums;
    }

    .ln--active {
      color: var(--vscode-editor-foreground);
    }

    .content {
      flex: 1;
      padding: 8px 0;
      min-width: 0;
    }

    .line {
      padding: 0 16px;
      min-height: calc(1.65em);
      outline: none;
      white-space: pre-wrap;
      word-wrap: break-word;
      overflow-wrap: anywhere;
      border-left: 2px solid transparent;
      transition: border-color 120ms ease;
    }

    .line:focus {
      border-left-color: var(--vscode-focusBorder, #007acc);
      background: color-mix(in srgb, var(--vscode-editor-foreground) 3%, transparent);
    }

    /* ── LaTeX Syntax Styling ── */

    .cmd {
      color: var(--vscode-symbolIcon-functionForeground, #4ec9b0);
    }

    .brc {
      opacity: 0.35;
    }

    .cmt {
      opacity: 0.35;
      font-style: italic;
    }

    .math {
      color: var(--vscode-symbolIcon-variableForeground, #dcdcaa);
      background: color-mix(in srgb, var(--vscode-symbolIcon-variableForeground, #dcdcaa) 8%, transparent);
      border-radius: 2px;
      padding: 0 2px;
    }

    .env {
      color: var(--vscode-symbolIcon-classForeground, #4ec9b0);
      font-weight: 600;
    }

    .b { font-weight: 700; }
    .i { font-style: italic; }

    /* ── Section Heading Lines ── */

    .line--h1 {
      font-size: 1.6em;
      font-weight: 700;
      margin: 0.3em 0 0.1em;
    }

    .line--h1 .cmd, .line--h1 .brc {
      font-size: 0.55em;
      font-weight: 400;
      vertical-align: middle;
    }

    .line--h2 {
      font-size: 1.3em;
      font-weight: 600;
      margin: 0.2em 0 0.05em;
    }

    .line--h2 .cmd, .line--h2 .brc {
      font-size: 0.6em;
      font-weight: 400;
      vertical-align: middle;
    }

    .line--h3 {
      font-size: 1.1em;
      font-weight: 600;
    }

    .line--h3 .cmd, .line--h3 .brc {
      font-size: 0.7em;
      font-weight: 400;
    }

    .line--env {
      opacity: 0.6;
    }

    .line--comment {
      opacity: 0.35;
      font-style: italic;
    }

    .line--empty {
      min-height: 0.6em;
    }

    /* ── Preamble (dimmed) ── */

    .line--preamble {
      opacity: 0.4;
      font-size: 0.92em;
    }

    .line--preamble:focus {
      opacity: 0.8;
    }

    @media (prefers-reduced-motion: reduce) {
      * { transition-duration: 0.01ms !important; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <button class="toolbar__btn toolbar__btn--toggle" id="tb-code" title="Switch to Code Editor">
      <svg viewBox="0 0 16 16" fill="currentColor"><path d="M5.854 4.146a.5.5 0 0 1 0 .708L2.707 8l3.147 3.146a.5.5 0 0 1-.708.708l-3.5-3.5a.5.5 0 0 1 0-.708l3.5-3.5a.5.5 0 0 1 .708 0zM10.146 4.146a.5.5 0 0 1 .708 0l3.5 3.5a.5.5 0 0 1 0 .708l-3.5 3.5a.5.5 0 0 1-.708-.708L13.293 8l-3.147-3.146a.5.5 0 0 1 0-.708z"/></svg>
      Code
    </button>
    <span class="toolbar__label">Visual Editor</span>
    <span style="flex:1"></span>
    <button class="toolbar__btn" id="tb-bold" title="Bold (\\textbf)"><b>B</b></button>
    <button class="toolbar__btn" id="tb-italic" title="Italic (\\textit)"><i>I</i></button>
    <span class="toolbar__sep"></span>
    <button class="toolbar__btn" id="tb-section" title="\\section">H1</button>
    <button class="toolbar__btn" id="tb-subsection" title="\\subsection">H2</button>
  </div>

  <div class="editor">
    <div class="gutter" id="gutter"></div>
    <div class="content" id="content"></div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const gutter = document.getElementById("gutter");
    const content = document.getElementById("content");

    let lines = ${linesJson};
    let activeLine = -1;
    let editTimer = null;

    /* ── Tokenizer ── */

    function tokenize(raw) {
      const tokens = [];
      let i = 0;
      while (i < raw.length) {
        if (raw[i] === "%" && (i === 0 || raw[i - 1] !== "\\\\")) {
          tokens.push({ t: "cmt", s: raw.substring(i) });
          break;
        }
        if (raw[i] === "\\\\" && i + 1 < raw.length && /[a-zA-Z]/.test(raw[i + 1])) {
          let j = i + 1;
          while (j < raw.length && /[a-zA-Z@]/.test(raw[j])) j++;
          tokens.push({ t: "cmd", s: raw.substring(i, j) });
          i = j;
          continue;
        }
        if (raw[i] === "$" && !(i > 0 && raw[i - 1] === "\\\\")) {
          let j = i + 1;
          if (j < raw.length && raw[j] === "$") {
            let k = j + 1;
            while (k < raw.length - 1 && !(raw[k] === "$" && raw[k + 1] === "$")) k++;
            if (k < raw.length - 1) {
              tokens.push({ t: "math", s: raw.substring(i, k + 2) });
              i = k + 2;
              continue;
            }
          }
          while (j < raw.length && raw[j] !== "$") j++;
          if (j < raw.length) {
            tokens.push({ t: "math", s: raw.substring(i, j + 1) });
            i = j + 1;
            continue;
          }
        }
        if (raw[i] === "{" || raw[i] === "}") {
          tokens.push({ t: "brc", s: raw[i] });
          i++;
          continue;
        }
        let j = i;
        while (j < raw.length && !"\\\\$%{}".includes(raw[j])) j++;
        if (j > i) {
          tokens.push({ t: "txt", s: raw.substring(i, j) });
          i = j;
        } else {
          tokens.push({ t: "txt", s: raw[i] });
          i++;
        }
      }
      return tokens;
    }

    function esc(s) {
      return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    function renderTokens(raw) {
      const tokens = tokenize(raw);
      let html = "";
      let fmtStack = [];
      let braceCount = [];

      for (const tk of tokens) {
        const e = esc(tk.s);
        if (tk.t === "cmd") {
          const name = tk.s.substring(1);
          if (name === "textbf" || name === "mathbf") {
            fmtStack.push("b");
            braceCount.push(0);
          } else if (name === "textit" || name === "emph" || name === "mathit") {
            fmtStack.push("i");
            braceCount.push(0);
          }
          html += '<span class="cmd">' + e + "</span>";
          continue;
        }
        if (tk.t === "brc") {
          if (tk.s === "{") {
            if (fmtStack.length > 0 && braceCount[braceCount.length - 1] === 0) {
              braceCount[braceCount.length - 1] = 1;
              html += '<span class="brc">{</span><span class="' + fmtStack[fmtStack.length - 1] + '">';
              continue;
            }
            if (braceCount.length > 0) braceCount[braceCount.length - 1]++;
            html += '<span class="brc">{</span>';
            continue;
          }
          if (tk.s === "}") {
            if (braceCount.length > 0) {
              braceCount[braceCount.length - 1]--;
              if (braceCount[braceCount.length - 1] === 0) {
                fmtStack.pop();
                braceCount.pop();
                html += "</span>" + '<span class="brc">}</span>';
                continue;
              }
            }
            html += '<span class="brc">}</span>';
            continue;
          }
        }
        if (tk.t === "cmt") { html += '<span class="cmt">' + e + "</span>"; continue; }
        if (tk.t === "math") { html += '<span class="math">' + e + "</span>"; continue; }
        html += e;
      }
      return html;
    }

    function lineClass(raw) {
      const t = raw.trimStart();
      if (/^\\\\(section|chapter|part)\\b/.test(t)) return "line--h1";
      if (/^\\\\subsection\\b/.test(t)) return "line--h2";
      if (/^\\\\subsubsection\\b/.test(t)) return "line--h3";
      if (/^\\\\(begin|end)\\b/.test(t)) return "line--env";
      if (/^%/.test(t)) return "line--comment";
      if (t === "") return "line--empty";
      return "";
    }

    function isPreambleLine(idx) {
      for (let i = 0; i <= idx; i++) {
        if (/^\\s*\\\\begin\\{document\\}/.test(lines[i])) return false;
      }
      return true;
    }

    /* ── DOM Build ── */

    function buildAll() {
      gutter.innerHTML = "";
      content.innerHTML = "";
      let inPreamble = true;
      for (let i = 0; i < lines.length; i++) {
        if (/^\\s*\\\\begin\\{document\\}/.test(lines[i])) inPreamble = false;
        addLineDOM(i, lines[i], inPreamble);
        if (/^\\s*\\\\end\\{document\\}/.test(lines[i])) inPreamble = true;
      }
    }

    function addLineDOM(idx, raw, preamble) {
      const ln = document.createElement("div");
      ln.className = "ln";
      ln.textContent = String(idx + 1);
      ln.dataset.line = String(idx);
      gutter.appendChild(ln);

      const div = document.createElement("div");
      div.className = "line " + lineClass(raw) + (preamble ? " line--preamble" : "");
      div.contentEditable = "true";
      div.spellcheck = false;
      div.dataset.line = String(idx);
      div.innerHTML = renderTokens(raw) || "<br>";
      content.appendChild(div);
    }

    /* ── Caret Helpers ── */

    function getCaretOffset(el) {
      const sel = window.getSelection();
      if (!sel.rangeCount) return 0;
      const r = sel.getRangeAt(0);
      const pre = r.cloneRange();
      pre.selectNodeContents(el);
      pre.setEnd(r.startContainer, r.startOffset);
      return pre.toString().length;
    }

    function setCaretOffset(el, offset) {
      const sel = window.getSelection();
      const range = document.createRange();
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let remaining = offset;
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (remaining <= node.textContent.length) {
          range.setStart(node, remaining);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
          return;
        }
        remaining -= node.textContent.length;
      }
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }

    /* ── Events ── */

    content.addEventListener("focus", (e) => {
      const div = e.target.closest && e.target.closest(".line");
      if (!div) return;
      const idx = parseInt(div.dataset.line);
      if (activeLine >= 0 && activeLine !== idx) {
        const prev = gutter.querySelector('[data-line="' + activeLine + '"]');
        if (prev) prev.classList.remove("ln--active");
      }
      activeLine = idx;
      const lnEl = gutter.querySelector('[data-line="' + idx + '"]');
      if (lnEl) lnEl.classList.add("ln--active");
    }, true);

    content.addEventListener("input", (e) => {
      const div = e.target.closest && e.target.closest(".line");
      if (!div) return;
      const idx = parseInt(div.dataset.line);
      const text = div.textContent || "";
      lines[idx] = text;
      clearTimeout(editTimer);
      editTimer = setTimeout(() => {
        vscode.postMessage({ type: "editLine", line: idx, text: text });
      }, 300);
    }, true);

    content.addEventListener("focusout", (e) => {
      const div = e.target;
      if (!div || !div.classList || !div.classList.contains("line")) return;
      const idx = parseInt(div.dataset.line);
      const text = div.textContent || "";
      lines[idx] = text;
      clearTimeout(editTimer);
      vscode.postMessage({ type: "editLine", line: idx, text: text });
      div.className = "line " + lineClass(text);
      div.innerHTML = renderTokens(text) || "<br>";
    }, true);

    content.addEventListener("keydown", (e) => {
      const div = e.target.closest && e.target.closest(".line");
      if (!div) return;
      const idx = parseInt(div.dataset.line);

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const offset = getCaretOffset(div);
        const text = div.textContent || "";
        const before = text.substring(0, offset);
        const after = text.substring(offset);

        lines[idx] = before;
        lines.splice(idx + 1, 0, after);

        clearTimeout(editTimer);
        vscode.postMessage({ type: "splitLine", line: idx, offset: offset });

        buildAll();
        const newDiv = content.querySelector('[data-line="' + (idx + 1) + '"]');
        if (newDiv) {
          newDiv.focus();
          setCaretOffset(newDiv, 0);
        }
        return;
      }

      if (e.key === "Backspace") {
        const offset = getCaretOffset(div);
        if (offset === 0 && idx > 0) {
          e.preventDefault();
          const prevText = lines[idx - 1];
          const curText = lines[idx];
          lines[idx - 1] = prevText + curText;
          lines.splice(idx, 1);

          clearTimeout(editTimer);
          vscode.postMessage({ type: "mergeLineUp", line: idx });

          buildAll();
          const prevDiv = content.querySelector('[data-line="' + (idx - 1) + '"]');
          if (prevDiv) {
            prevDiv.focus();
            setCaretOffset(prevDiv, prevText.length);
          }
          return;
        }
      }

      if (e.key === "ArrowUp" && idx > 0) {
        e.preventDefault();
        const offset = Math.min(getCaretOffset(div), (lines[idx - 1] || "").length);
        const prevDiv = content.querySelector('[data-line="' + (idx - 1) + '"]');
        if (prevDiv) { prevDiv.focus(); setCaretOffset(prevDiv, offset); }
        return;
      }

      if (e.key === "ArrowDown" && idx < lines.length - 1) {
        e.preventDefault();
        const offset = Math.min(getCaretOffset(div), (lines[idx + 1] || "").length);
        const nextDiv = content.querySelector('[data-line="' + (idx + 1) + '"]');
        if (nextDiv) { nextDiv.focus(); setCaretOffset(nextDiv, offset); }
        return;
      }

      if (e.key === "Tab") {
        e.preventDefault();
        document.execCommand("insertText", false, "  ");
      }
    }, true);

    /* ── SyncTeX on Ctrl/Cmd+Click ── */

    content.addEventListener("click", (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      const div = e.target.closest && e.target.closest(".line");
      if (!div) return;
      e.preventDefault();
      const idx = parseInt(div.dataset.line);
      vscode.postMessage({ type: "focusLine", line: idx });
    });

    /* ── Toolbar ── */

    document.getElementById("tb-code").addEventListener("click", () => {
      vscode.postMessage({ type: "switchToCode" });
    });

    function wrapSelection(before, after) {
      const sel = window.getSelection();
      if (!sel.rangeCount) return;
      const range = sel.getRangeAt(0);
      const div = range.startContainer.closest ? range.startContainer.closest(".line")
                : range.startContainer.parentElement.closest(".line");
      if (!div) return;
      const idx = parseInt(div.dataset.line);
      const text = div.textContent || "";
      const start = getCaretOffset(div);

      const r2 = range.cloneRange();
      r2.selectNodeContents(div);
      r2.setEnd(range.endContainer, range.endOffset);
      const end = r2.toString().length;

      if (start === end) return;

      vscode.postMessage({
        type: "insertCommand",
        line: idx,
        offset: start,
        offsetEnd: end,
        before: before,
        after: after,
      });

      const newText = text.substring(0, start) + before + text.substring(start, end) + after + text.substring(end);
      lines[idx] = newText;
      div.innerHTML = renderTokens(newText);
      setCaretOffset(div, end + before.length + after.length);
    }

    document.getElementById("tb-bold").addEventListener("click", () => wrapSelection("\\\\textbf{", "}"));
    document.getElementById("tb-italic").addEventListener("click", () => wrapSelection("\\\\textit{", "}"));

    document.getElementById("tb-section").addEventListener("click", () => {
      if (activeLine < 0) return;
      const div = content.querySelector('[data-line="' + activeLine + '"]');
      if (!div) return;
      const text = div.textContent || "";
      const newText = "\\\\section{" + text.replace(/^\\s*\\\\(sub)*section\\{(.*)\\}\\s*$/, "$2") + "}";
      lines[activeLine] = newText;
      div.className = "line " + lineClass(newText);
      div.innerHTML = renderTokens(newText);
      vscode.postMessage({ type: "editLine", line: activeLine, text: newText });
    });

    document.getElementById("tb-subsection").addEventListener("click", () => {
      if (activeLine < 0) return;
      const div = content.querySelector('[data-line="' + activeLine + '"]');
      if (!div) return;
      const text = div.textContent || "";
      const newText = "\\\\subsection{" + text.replace(/^\\s*\\\\(sub)*section\\{(.*)\\}\\s*$/, "$2") + "}";
      lines[activeLine] = newText;
      div.className = "line " + lineClass(newText);
      div.innerHTML = renderTokens(newText);
      vscode.postMessage({ type: "editLine", line: activeLine, text: newText });
    });

    /* ── External Updates ── */

    window.addEventListener("message", (e) => {
      if (e.data.type === "documentChanged") {
        lines = e.data.lines;
        buildAll();
      }
    });

    /* ── Init ── */

    buildAll();
  </script>
</body>
</html>`;
}
