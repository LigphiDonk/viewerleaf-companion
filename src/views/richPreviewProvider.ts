import * as path from "node:path";
import * as vscode from "vscode";

import { latexToHtml } from "../latex/latexToHtml";
import { isTexDocument } from "../workspace";

function getNonce() {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let text = "";
  for (let index = 0; index < 24; index += 1) {
    text += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return text;
}

export class RichPreviewProvider implements vscode.Disposable {
  private panel?: vscode.WebviewPanel;
  private activeDocument?: vscode.TextDocument;
  private readonly disposables: vscode.Disposable[] = [];
  private updateHandle?: NodeJS.Timeout;

  constructor(private readonly extensionUri: vscode.Uri) {
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (!this.panel || !this.activeDocument) {
          return;
        }

        if (event.document.uri.toString() === this.activeDocument.uri.toString()) {
          this.scheduleUpdate();
        }
      }),
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (!this.panel) {
          return;
        }

        this.activeDocument = isTexDocument(editor?.document) ? editor?.document : undefined;
        this.scheduleUpdate(0);
      }),
    );
  }

  open() {
    const activeEditor = vscode.window.activeTextEditor;
    this.activeDocument = isTexDocument(activeEditor?.document) ? activeEditor?.document : undefined;

    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside, true);
      this.scheduleUpdate(0);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      "viewerleafRichPreview",
      "ViewerLeaf Rich Preview",
      {
        viewColumn: vscode.ViewColumn.Beside,
        preserveFocus: true,
      },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          this.extensionUri,
          vscode.Uri.joinPath(this.extensionUri, "media"),
          vscode.Uri.joinPath(this.extensionUri, "media", "katex"),
        ],
      },
    );

    this.panel.onDidDispose(() => {
      this.panel = undefined;
      if (this.updateHandle) {
        clearTimeout(this.updateHandle);
        this.updateHandle = undefined;
      }
    });
    this.panel.webview.html = this.getShellHtml(this.panel.webview);
    this.scheduleUpdate(0);
  }

  dispose() {
    if (this.updateHandle) {
      clearTimeout(this.updateHandle);
    }
    this.panel?.dispose();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  private scheduleUpdate(delay = 500) {
    if (this.updateHandle) {
      clearTimeout(this.updateHandle);
    }

    this.updateHandle = setTimeout(() => {
      this.updateHandle = undefined;
      void this.render();
    }, delay);
  }

  private async render() {
    if (!this.panel) {
      return;
    }

    if (!this.activeDocument) {
      this.panel.title = "ViewerLeaf Rich Preview";
      await this.panel.webview.postMessage({
        type: "render",
        fileName: "No TeX document",
        filePath: "",
        html: `<div class="empty-state"><h2>Rich Preview</h2><p>先把焦点放到一个 <code>.tex</code> 文件里，再打开预览。</p></div>`,
        updatedAt: "",
      });
      return;
    }

    const document = this.activeDocument;
    this.panel.title = `Rich Preview: ${path.basename(document.uri.fsPath)}`;
    await this.panel.webview.postMessage({
      type: "render",
      fileName: path.basename(document.uri.fsPath),
      filePath: document.uri.fsPath,
      html: latexToHtml(document.getText()),
      updatedAt: new Intl.DateTimeFormat("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(new Date()),
    });
  }

  private getShellHtml(webview: vscode.Webview) {
    const nonce = getNonce();
    const katexCssUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "media", "katex", "katex.min.css"));
    const katexJsUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "media", "katex", "katex.min.js"));

    return `<!DOCTYPE html>
      <html lang="zh-CN">
        <head>
          <meta charset="UTF-8" />
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'nonce-${nonce}'; font-src ${webview.cspSource};" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <link rel="stylesheet" href="${katexCssUri}" />
          <style>
            :root {
              color-scheme: light dark;
              --paper-surface: color-mix(in srgb, var(--vscode-editor-background) 92%, #f8f2e8 8%);
              --paper-card: color-mix(in srgb, var(--vscode-sideBar-background) 82%, #fffdf8 18%);
              --paper-ink: color-mix(in srgb, var(--vscode-foreground) 82%, #1b1a17 18%);
              --paper-muted: color-mix(in srgb, var(--vscode-descriptionForeground) 82%, #746657 18%);
              --paper-line: color-mix(in srgb, var(--vscode-editorWidget-border, #d6cec1) 78%, #b4946f 22%);
            }
            * { box-sizing: border-box; }
            body {
              margin: 0;
              color: var(--paper-ink);
              font-family: "Charter", "Iowan Old Style", "Palatino Linotype", serif;
              background:
                radial-gradient(circle at top, rgba(232, 169, 75, 0.12), transparent 28%),
                linear-gradient(180deg, var(--paper-surface), color-mix(in srgb, var(--paper-surface) 94%, #ecdfcc 6%));
            }
            .preview-shell {
              min-height: 100vh;
              padding: 18px 18px 28px;
            }
            .preview-card {
              max-width: 860px;
              margin: 0 auto;
              border-radius: 24px;
              border: 1px solid var(--paper-line);
              overflow: hidden;
              background: rgba(255,255,255,0.82);
              box-shadow: 0 18px 46px rgba(42, 25, 9, 0.08);
            }
            .preview-header {
              display: flex;
              justify-content: space-between;
              gap: 16px;
              padding: 16px 18px;
              border-bottom: 1px solid rgba(135, 108, 77, 0.14);
              background:
                linear-gradient(180deg, rgba(255,255,255,0.92), rgba(248,242,231,0.96)),
                repeating-linear-gradient(90deg, rgba(88, 64, 42, 0.04), rgba(88, 64, 42, 0.04) 1px, transparent 1px, transparent 8px);
            }
            .preview-kicker {
              font-size: 11px;
              letter-spacing: 0.14em;
              text-transform: uppercase;
              color: var(--paper-muted);
              font-weight: 800;
            }
            .preview-title {
              margin: 7px 0 0;
              font-size: 24px;
              line-height: 1.08;
              color: #1f1a15;
              font-weight: 700;
            }
            .preview-meta {
              text-align: right;
              font-family: "SF Mono", "Cascadia Code", monospace;
              font-size: 11px;
              line-height: 1.55;
              color: var(--paper-muted);
            }
            .preview-meta__path {
              max-width: 34ch;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            }
            .preview-content {
              padding: 28px 24px 34px;
              font-size: 17px;
              line-height: 1.78;
            }
            .preview-content h2,
            .preview-content h3,
            .preview-content h4 {
              margin: 2.2em 0 0.7em;
              line-height: 1.18;
              letter-spacing: -0.01em;
              color: #1d1712;
            }
            .preview-content h2 {
              font-size: 1.9em;
            }
            .preview-content h3 {
              font-size: 1.42em;
            }
            .preview-content h4 {
              font-size: 1.18em;
            }
            .preview-content p,
            .preview-content ul,
            .preview-content ol,
            .preview-content figure,
            .preview-content .vl-math-display {
              margin: 0 0 1.1em;
            }
            .preview-content ul,
            .preview-content ol {
              padding-left: 1.35em;
            }
            .preview-content li + li {
              margin-top: 0.4em;
            }
            .preview-content strong {
              color: #15120f;
            }
            .preview-content .citation {
              display: inline-block;
              padding: 0 0.42em;
              border-radius: 999px;
              background: rgba(217, 119, 6, 0.14);
              color: #8a4b10;
              font-size: 0.92em;
              font-family: "SF Mono", "Cascadia Code", monospace;
            }
            .vl-math-inline,
            .vl-math-display {
              color: #1b1a17;
            }
            .vl-math-display {
              padding: 0.9em 1em;
              border-radius: 16px;
              background: rgba(251, 247, 239, 0.92);
              border: 1px solid rgba(164, 137, 105, 0.16);
              overflow-x: auto;
            }
            .vl-figure {
              padding: 1em;
              border-radius: 18px;
              background: linear-gradient(180deg, rgba(251,247,239,0.98), rgba(246,239,227,0.96));
              border: 1px solid rgba(163, 132, 93, 0.2);
            }
            .vl-figure__placeholder {
              display: grid;
              place-items: center;
              min-height: 140px;
              border-radius: 14px;
              border: 1px dashed rgba(154, 125, 89, 0.34);
              background:
                linear-gradient(135deg, rgba(255,255,255,0.8), rgba(246,232,209,0.84)),
                repeating-linear-gradient(45deg, rgba(145, 111, 73, 0.06), rgba(145, 111, 73, 0.06) 8px, transparent 8px, transparent 16px);
              color: #7a6145;
              font-family: "SF Mono", "Cascadia Code", monospace;
              font-size: 0.88em;
            }
            .vl-figure figcaption {
              margin-top: 0.8em;
              color: #5d5143;
              font-size: 0.92em;
            }
            .empty-state {
              padding: 48px 0 22px;
              text-align: center;
            }
            .empty-state h2 {
              margin: 0 0 8px;
            }
            .empty-state p {
              margin: 0;
              color: var(--paper-muted);
            }
            code {
              font-family: "SF Mono", "Cascadia Code", monospace;
            }
            @media (max-width: 720px) {
              .preview-shell {
                padding: 10px;
              }
              .preview-header {
                flex-direction: column;
              }
              .preview-meta {
                text-align: left;
              }
              .preview-content {
                padding: 22px 18px 28px;
                font-size: 16px;
              }
            }
          </style>
        </head>
        <body>
          <main class="preview-shell">
            <section class="preview-card">
              <header class="preview-header">
                <div>
                  <div class="preview-kicker">ViewerLeaf Rich Preview</div>
                  <h1 class="preview-title" id="preview-title">Rich Preview</h1>
                </div>
                <div class="preview-meta">
                  <div id="preview-updated">Waiting for LaTeX…</div>
                  <div class="preview-meta__path" id="preview-path"></div>
                </div>
              </header>
              <article class="preview-content" id="preview-content">
                <div class="empty-state">
                  <h2>Rich Preview</h2>
                  <p>正在等待可预览的 <code>.tex</code> 文档。</p>
                </div>
              </article>
            </section>
          </main>
          <script nonce="${nonce}" src="${katexJsUri}"></script>
          <script nonce="${nonce}">
            function renderMath() {
              if (!window.katex) {
                return;
              }

              document.querySelectorAll(".vl-math-inline, .vl-math-display").forEach((element) => {
                const latex = element.getAttribute("data-latex") || "";
                try {
                  window.katex.render(latex, element, {
                    displayMode: element.classList.contains("vl-math-display"),
                    output: "mathml",
                    throwOnError: false,
                  });
                } catch (error) {
                  element.textContent = latex;
                }
              });
            }

            window.addEventListener("message", (event) => {
              const message = event.data;
              if (!message || message.type !== "render") {
                return;
              }

              document.getElementById("preview-title").textContent = message.fileName || "Rich Preview";
              document.getElementById("preview-path").textContent = message.filePath || "";
              document.getElementById("preview-updated").textContent = message.updatedAt ? "Updated " + message.updatedAt : "Waiting for LaTeX…";
              document.getElementById("preview-content").innerHTML = message.html;
              renderMath();
            });

            renderMath();
          </script>
        </body>
      </html>`;
  }
}
