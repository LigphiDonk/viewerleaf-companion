import * as vscode from "vscode";

import type { AcademicSkill, WeaponType } from "../types";

type ArsenalMessage =
  | { type: "run-skill"; skillId: string }
  | { type: "open-workspace" }
  | { type: "show-outline" }
  | { type: "open-rich-preview" }
  | { type: "install-latex-workshop" };

const PIXEL_SIZE = 6;

const WEAPON_PIXEL_GRIDS: Record<WeaponType, number[][]> = {
  blade: toPixelGrid([
    "0000000000000000",
    "0000000000000020",
    "0000000000000220",
    "0000000000002210",
    "0000000000022100",
    "0000000000221000",
    "0000000002210000",
    "0000000022100000",
    "0000000222100000",
    "0000000011100000",
    "0000000001110000",
    "0000000033310000",
    "0000000033300000",
    "0000000333000000",
    "0000000030000000",
    "0000000000000000",
  ]),
  bow: toPixelGrid([
    "0000000000000000",
    "0000100000000000",
    "0001100000000000",
    "0011000000000000",
    "0011000000002000",
    "0010000000022200",
    "0110000002221230",
    "0110001111111110",
    "0110000002221230",
    "0010000000022200",
    "0011000000002000",
    "0011000000000000",
    "0001100000000000",
    "0000100000000000",
    "0000000000000000",
    "0000000000000000",
  ]),
  hammer: toPixelGrid([
    "0000000000000000",
    "0000111111220000",
    "0001111122222000",
    "0001111122222000",
    "0000111111222000",
    "0000000011000000",
    "0000000011000000",
    "0000000011000000",
    "0000000011000000",
    "0000000001100000",
    "0000000001100000",
    "0000000000110000",
    "0000000000110000",
    "0000000000033000",
    "0000000000033000",
    "0000000000000000",
  ]),
  shield: toPixelGrid([
    "0000000000000000",
    "0000001111000000",
    "0000011221100000",
    "0000112222110000",
    "0001122232211000",
    "0001122132211000",
    "0001121332211000",
    "0000112332110000",
    "0000112332110000",
    "0000012332100000",
    "0000012332100000",
    "0000001231000000",
    "0000001231000000",
    "0000000300000000",
    "0000000000000000",
    "0000000000000000",
  ]),
  spear: toPixelGrid([
    "0000000000000000",
    "0000000000002000",
    "0000000000022200",
    "0000000000223220",
    "0000000000022200",
    "0000000000001000",
    "0000000000001000",
    "0000000000001000",
    "0000000000001000",
    "0000000000001000",
    "0000000000001000",
    "0000000000001000",
    "0000000000001000",
    "0000000000003000",
    "0000000000033000",
    "0000000000000000",
  ]),
};

function getNonce() {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let text = "";
  for (let index = 0; index < 24; index += 1) {
    text += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return text;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function toPixelGrid(rows: string[]) {
  return rows.map((row) => row.split("").map((cell) => Number(cell)));
}

function pixelGridToSvg(
  grid: number[][],
  primary: string,
  accent: string,
  highlight: string,
) {
  const pixels: string[] = [];
  for (const [rowIndex, row] of grid.entries()) {
    for (const [columnIndex, cell] of row.entries()) {
      if (cell === 0) {
        continue;
      }

      const fill = cell === 1 ? primary : cell === 2 ? accent : highlight;
      pixels.push(
        `<rect x="${columnIndex * PIXEL_SIZE}" y="${rowIndex * PIXEL_SIZE}" width="${PIXEL_SIZE}" height="${PIXEL_SIZE}" fill="${fill}" />`,
      );
    }
  }

  return `<svg viewBox="0 0 96 96" aria-hidden="true" shape-rendering="crispEdges"><circle cx="48" cy="48" r="40" fill="${accent}" opacity="0.12" />${pixels.join("")}</svg>`;
}

function renderWeaponIcon(skill: AcademicSkill) {
  return pixelGridToSvg(
    WEAPON_PIXEL_GRIDS[skill.weaponType],
    skill.themeColors.primary,
    skill.themeColors.accent,
    skill.themeColors.secondary,
  );
}

function renderWeaponItem(skill: AcademicSkill, index: number) {
  const customDot = skill.isCustom ? `<span class="weapon-item__custom" title="Custom skill"></span>` : "";

  return `
    <button class="weapon-item" data-action="run-skill" data-skill-id="${escapeHtml(skill.id)}"
            title="${escapeHtml(skill.description)}"
            style="--delay:${index * 60}ms;--skill-accent:${skill.themeColors.accent};--skill-primary:${skill.themeColors.primary}">
      <div class="weapon-item__icon">
        ${renderWeaponIcon(skill)}
        ${customDot}
      </div>
      <span class="weapon-item__name">${escapeHtml(skill.name)}</span>
    </button>`;
}

export class ArsenalViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly getSkills: () => AcademicSkill[],
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.html = this.getHtml(webviewView.webview);
    webviewView.onDidDispose(() => {
      if (this.view === webviewView) {
        this.view = undefined;
      }
    });
    webviewView.webview.onDidReceiveMessage(async (message: ArsenalMessage) => {
      switch (message.type) {
        case "run-skill":
          await vscode.commands.executeCommand("viewerleaf.runSkill", message.skillId);
          return;
        case "open-workspace":
          await vscode.commands.executeCommand("viewerleaf.openAcademicWorkspace");
          return;
        case "show-outline":
          await vscode.commands.executeCommand("viewerleaf.showProjectOutline");
          return;
        case "open-rich-preview":
          await vscode.commands.executeCommand("viewerleaf.openRichPreview");
          return;
        case "install-latex-workshop":
          await vscode.commands.executeCommand("workbench.extensions.search", "@id:James-Yu.latex-workshop");
      }
    });
  }

  refreshSkills() {
    if (!this.view) {
      return;
    }

    this.view.webview.html = this.getHtml(this.view.webview);
  }

  private getHtml(webview: vscode.Webview) {
    const nonce = getNonce();
    const skills = this.getSkills().filter((skill) => skill.enabled);

    return `<!DOCTYPE html>
      <html lang="zh-CN">
        <head>
          <meta charset="UTF-8" />
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }

            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              color: var(--vscode-foreground);
              background: var(--vscode-sideBar-background);
            }

            .toolbar {
              display: flex;
              gap: 8px;
              padding: 14px 12px;
            }

            .tb-btn {
              flex: 1;
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 6px;
              padding: 8px 0;
              border: 1px solid color-mix(in srgb, var(--vscode-foreground) 10%, transparent);
              border-radius: 8px;
              background: color-mix(in srgb, var(--vscode-foreground) 4%, transparent);
              color: var(--vscode-foreground);
              font-size: 12px;
              font-weight: 600;
              cursor: pointer;
              transition: background 120ms ease, border-color 120ms ease;
            }

            .tb-btn:hover {
              background: color-mix(in srgb, var(--vscode-foreground) 10%, transparent);
              border-color: color-mix(in srgb, var(--vscode-foreground) 18%, transparent);
            }

            .tb-btn--primary {
              background: var(--vscode-button-background);
              color: var(--vscode-button-foreground);
              border-color: transparent;
            }

            .tb-btn--primary:hover {
              background: var(--vscode-button-hoverBackground);
              border-color: transparent;
            }

            .tb-btn svg {
              width: 14px;
              height: 14px;
              flex-shrink: 0;
            }

            /* ── Overlay ── */

            .overlay {
              position: fixed;
              inset: 0;
              z-index: 100;
              overflow-y: auto;
            }

            .overlay[hidden] { display: none; }

            .overlay__backdrop {
              position: fixed;
              inset: 0;
              background: rgba(0, 0, 0, 0.5);
              backdrop-filter: blur(8px);
              -webkit-backdrop-filter: blur(8px);
              animation: fadeIn 160ms ease;
            }

            .overlay__card {
              position: relative;
              width: calc(100% - 20px);
              max-width: 280px;
              margin: 20px auto;
              background: var(--vscode-editor-background);
              border: 1px solid color-mix(in srgb, var(--vscode-foreground) 10%, transparent);
              border-radius: 14px;
              padding: 16px;
              box-shadow: 0 16px 40px rgba(0, 0, 0, 0.3);
              animation: slideUp 260ms cubic-bezier(0.16, 1, 0.3, 1);
            }

            .overlay__close {
              position: absolute;
              top: 10px;
              right: 10px;
              width: 24px;
              height: 24px;
              border: none;
              border-radius: 6px;
              background: color-mix(in srgb, var(--vscode-foreground) 6%, transparent);
              color: color-mix(in srgb, var(--vscode-foreground) 50%, transparent);
              font-size: 14px;
              line-height: 1;
              cursor: pointer;
              display: grid;
              place-items: center;
              transition: background 120ms ease, color 120ms ease;
            }

            .overlay__close:hover {
              background: color-mix(in srgb, var(--vscode-foreground) 14%, transparent);
              color: var(--vscode-foreground);
            }

            /* ── Weapon Grid ── */

            .weapon-grid {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 4px;
              padding-top: 4px;
            }

            .weapon-item {
              display: flex;
              flex-direction: column;
              align-items: center;
              gap: 6px;
              padding: 10px 4px 8px;
              border: 1px solid transparent;
              border-radius: 10px;
              background: transparent;
              color: var(--vscode-foreground);
              cursor: pointer;
              transition: background 120ms ease, border-color 120ms ease;
              animation: itemEnter 250ms ease both;
              animation-delay: var(--delay);
            }

            .weapon-item:hover {
              background: color-mix(in srgb, var(--skill-accent) 10%, transparent);
              border-color: color-mix(in srgb, var(--skill-accent) 16%, transparent);
            }

            .weapon-item__icon {
              position: relative;
              width: 44px;
              height: 44px;
              border-radius: 12px;
              display: grid;
              place-items: center;
              background: color-mix(in srgb, var(--skill-accent) 7%, var(--vscode-editor-background));
              border: 1px solid color-mix(in srgb, var(--skill-accent) 10%, transparent);
              transition: border-color 120ms ease;
            }

            .weapon-item:hover .weapon-item__icon {
              animation: bounce 500ms ease;
              border-color: color-mix(in srgb, var(--skill-accent) 28%, transparent);
            }

            .weapon-item__icon svg {
              width: 30px;
              height: 30px;
              display: block;
            }

            .weapon-item__custom {
              position: absolute;
              top: -2px;
              right: -2px;
              width: 7px;
              height: 7px;
              border-radius: 50%;
              background: var(--skill-accent);
              border: 1.5px solid var(--vscode-editor-background);
            }

            .weapon-item__name {
              font-size: 10px;
              font-weight: 500;
              text-align: center;
              opacity: 0.55;
              line-height: 1.2;
            }

            .weapon-item:hover .weapon-item__name {
              opacity: 0.9;
            }

            /* ── Animations ── */

            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }

            @keyframes slideUp {
              from { opacity: 0; transform: translateY(12px) scale(0.94); }
              to { opacity: 1; transform: translateY(0) scale(1); }
            }

            @keyframes itemEnter {
              from { opacity: 0; transform: scale(0.75); }
              to { opacity: 1; transform: scale(1); }
            }

            @keyframes bounce {
              0% { transform: translateY(0) scale(1); }
              18% { transform: translateY(-14px) scale(1.12); }
              38% { transform: translateY(-1px) scale(1); }
              56% { transform: translateY(-7px) scale(1.04); }
              76% { transform: translateY(0) scale(1); }
              100% { transform: translateY(0) scale(1); }
            }

            @media (prefers-reduced-motion: reduce) {
              *, *::before, *::after {
                animation-duration: 0.01ms !important;
                animation-iteration-count: 1 !important;
                transition-duration: 0.01ms !important;
              }
            }
          </style>
        </head>
        <body>
          <div class="toolbar">
            <button class="tb-btn tb-btn--primary" data-action="open-workspace" title="Open Workspace">
              <svg viewBox="0 0 16 16" fill="currentColor"><path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h2.764a1.5 1.5 0 0 1 1.07.449L8.5 3.5h4A1.5 1.5 0 0 1 14 5v7.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5v-9z"/></svg>
              Workspace
            </button>
            <button class="tb-btn" id="arsenal-trigger" title="Arsenal">
              <svg viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="6" height="6" rx="1.2"/><rect x="9" y="1" width="6" height="6" rx="1.2"/><rect x="1" y="9" width="6" height="6" rx="1.2"/><rect x="9" y="9" width="6" height="6" rx="1.2"/></svg>
              Arsenal
            </button>
          </div>

          <div class="overlay" id="arsenal-overlay" hidden>
            <div class="overlay__backdrop" id="overlay-backdrop"></div>
            <div class="overlay__card">
              <button class="overlay__close" id="arsenal-close">\u00d7</button>
              <div class="weapon-grid">
                ${skills.map((skill, index) => renderWeaponItem(skill, index)).join("")}
              </div>
            </div>
          </div>

          <script nonce="${nonce}">
            const vscode = acquireVsCodeApi();
            const overlay = document.getElementById("arsenal-overlay");

            document.getElementById("arsenal-trigger").addEventListener("click", () => {
              overlay.hidden = false;
            });

            function closeArsenal() {
              overlay.hidden = true;
            }

            document.getElementById("arsenal-close").addEventListener("click", closeArsenal);
            document.getElementById("overlay-backdrop").addEventListener("click", closeArsenal);

            document.addEventListener("keydown", (e) => {
              if (e.key === "Escape" && !overlay.hidden) {
                closeArsenal();
              }
            });

            document.querySelectorAll("[data-action]").forEach((el) => {
              el.addEventListener("click", () => {
                const action = el.getAttribute("data-action");
                const skillId = el.getAttribute("data-skill-id");
                if (action === "run-skill" && skillId) {
                  vscode.postMessage({ type: "run-skill", skillId });
                  closeArsenal();
                  return;
                }
                if (action) {
                  vscode.postMessage({ type: action });
                }
              });
            });
          </script>
        </body>
      </html>`;
  }
}
