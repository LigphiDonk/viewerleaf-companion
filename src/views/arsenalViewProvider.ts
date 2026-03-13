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

            .sidebar {
              padding: 20px 16px;
              display: flex;
              flex-direction: column;
              gap: 20px;
            }

            .brand {
              font-size: 12px;
              font-weight: 600;
              letter-spacing: 0.04em;
              text-transform: uppercase;
              opacity: 0.4;
            }

            .actions {
              display: flex;
              flex-direction: column;
              gap: 8px;
            }

            .action-btn {
              width: 100%;
              padding: 10px 14px;
              border: 1px solid color-mix(in srgb, var(--vscode-foreground) 10%, transparent);
              border-radius: 10px;
              background: color-mix(in srgb, var(--vscode-foreground) 5%, transparent);
              color: var(--vscode-foreground);
              font-size: 13px;
              font-weight: 500;
              cursor: pointer;
              transition: background 150ms ease, border-color 150ms ease;
              text-align: center;
            }

            .action-btn:hover {
              background: color-mix(in srgb, var(--vscode-foreground) 10%, transparent);
              border-color: color-mix(in srgb, var(--vscode-foreground) 16%, transparent);
            }

            .action-btn--primary {
              background: var(--vscode-button-background);
              color: var(--vscode-button-foreground);
              border-color: transparent;
              font-weight: 600;
            }

            .action-btn--primary:hover {
              background: var(--vscode-button-hoverBackground);
              border-color: transparent;
            }

            .action-btn--arsenal {
              font-weight: 600;
              letter-spacing: 0.02em;
            }

            .divider {
              height: 1px;
              background: color-mix(in srgb, var(--vscode-foreground) 8%, transparent);
            }

            .links {
              display: flex;
              gap: 16px;
              flex-wrap: wrap;
            }

            .link-btn {
              background: none;
              border: none;
              color: color-mix(in srgb, var(--vscode-foreground) 45%, transparent);
              font-size: 12px;
              cursor: pointer;
              padding: 0;
              transition: color 150ms ease;
            }

            .link-btn:hover {
              color: var(--vscode-foreground);
            }

            /* ── Overlay ── */

            .overlay {
              position: fixed;
              inset: 0;
              z-index: 100;
              display: flex;
              align-items: center;
              justify-content: center;
            }

            .overlay[hidden] {
              display: none;
            }

            .overlay__backdrop {
              position: absolute;
              inset: 0;
              background: rgba(0, 0, 0, 0.45);
              backdrop-filter: blur(6px);
              -webkit-backdrop-filter: blur(6px);
              animation: fadeIn 180ms ease;
            }

            .overlay__card {
              position: relative;
              width: calc(100% - 24px);
              max-width: 300px;
              background: var(--vscode-editor-background);
              border: 1px solid color-mix(in srgb, var(--vscode-foreground) 12%, transparent);
              border-radius: 16px;
              padding: 20px;
              box-shadow: 0 20px 48px rgba(0, 0, 0, 0.25);
              animation: slideUp 280ms cubic-bezier(0.16, 1, 0.3, 1);
            }

            .overlay__header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 18px;
            }

            .overlay__title {
              font-size: 15px;
              font-weight: 700;
              letter-spacing: -0.01em;
            }

            .overlay__close {
              width: 28px;
              height: 28px;
              border: none;
              border-radius: 8px;
              background: color-mix(in srgb, var(--vscode-foreground) 8%, transparent);
              color: var(--vscode-foreground);
              font-size: 16px;
              line-height: 1;
              cursor: pointer;
              display: grid;
              place-items: center;
              transition: background 150ms ease;
            }

            .overlay__close:hover {
              background: color-mix(in srgb, var(--vscode-foreground) 16%, transparent);
            }

            /* ── Weapon Grid ── */

            .weapon-grid {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 8px;
              justify-items: center;
            }

            .weapon-item {
              display: flex;
              flex-direction: column;
              align-items: center;
              gap: 8px;
              width: 100%;
              padding: 12px 4px;
              border: 1px solid transparent;
              border-radius: 12px;
              background: transparent;
              color: var(--vscode-foreground);
              cursor: pointer;
              transition: background 150ms ease, border-color 150ms ease;
              animation: itemEnter 280ms ease both;
              animation-delay: var(--delay);
            }

            .weapon-item:hover {
              background: color-mix(in srgb, var(--skill-accent) 10%, transparent);
              border-color: color-mix(in srgb, var(--skill-accent) 18%, transparent);
            }

            .weapon-item__icon {
              position: relative;
              width: 52px;
              height: 52px;
              border-radius: 14px;
              display: grid;
              place-items: center;
              background: color-mix(in srgb, var(--skill-accent) 8%, var(--vscode-editor-background));
              border: 1px solid color-mix(in srgb, var(--skill-accent) 12%, transparent);
              transition: border-color 150ms ease;
            }

            .weapon-item:hover .weapon-item__icon {
              animation: bounce 500ms ease;
              border-color: color-mix(in srgb, var(--skill-accent) 30%, transparent);
            }

            .weapon-item__icon svg {
              width: 36px;
              height: 36px;
              display: block;
            }

            .weapon-item__custom {
              position: absolute;
              top: -2px;
              right: -2px;
              width: 8px;
              height: 8px;
              border-radius: 50%;
              background: var(--skill-accent);
              border: 2px solid var(--vscode-editor-background);
            }

            .weapon-item__name {
              font-size: 11px;
              font-weight: 600;
              text-align: center;
              opacity: 0.7;
              line-height: 1.2;
            }

            .weapon-item:hover .weapon-item__name {
              opacity: 1;
            }

            /* ── Animations ── */

            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }

            @keyframes slideUp {
              from { opacity: 0; transform: translateY(16px) scale(0.95); }
              to { opacity: 1; transform: translateY(0) scale(1); }
            }

            @keyframes itemEnter {
              from { opacity: 0; transform: scale(0.8); }
              to { opacity: 1; transform: scale(1); }
            }

            @keyframes bounce {
              0% { transform: translateY(0) scale(1); }
              20% { transform: translateY(-14px) scale(1.1); }
              40% { transform: translateY(-2px) scale(1); }
              60% { transform: translateY(-8px) scale(1.04); }
              80% { transform: translateY(-1px) scale(1); }
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
          <main class="sidebar">
            <span class="brand">ViewerLeaf</span>

            <div class="actions">
              <button class="action-btn action-btn--primary" data-action="open-workspace">Open Workspace</button>
              <button class="action-btn action-btn--arsenal" id="arsenal-trigger">\u2694 Arsenal</button>
            </div>

            <div class="divider"></div>

            <div class="links">
              <button class="link-btn" data-action="show-outline">Outline</button>
              <button class="link-btn" data-action="open-rich-preview">Preview</button>
              <button class="link-btn" data-action="install-latex-workshop">LaTeX Workshop</button>
            </div>
          </main>

          <div class="overlay" id="arsenal-overlay" hidden>
            <div class="overlay__backdrop" id="overlay-backdrop"></div>
            <div class="overlay__card">
              <div class="overlay__header">
                <span class="overlay__title">Arsenal</span>
                <button class="overlay__close" id="arsenal-close">\u00d7</button>
              </div>
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
