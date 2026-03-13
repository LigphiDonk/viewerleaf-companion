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

  return `<svg viewBox="0 0 96 96" aria-hidden="true" shape-rendering="crispEdges"><circle cx="48" cy="48" r="40" fill="${accent}" opacity="0.16" />${pixels.join("")}</svg>`;
}

function renderWeaponIcon(skill: AcademicSkill) {
  return pixelGridToSvg(
    WEAPON_PIXEL_GRIDS[skill.weaponType],
    skill.themeColors.primary,
    skill.themeColors.accent,
    skill.themeColors.secondary,
  );
}

function renderSkillCard(skill: AcademicSkill, index: number, featured = false) {
  const customBadge = skill.isCustom ? `<span class="weapon-card__badge">Custom</span>` : "";

  return `
    <article class="weapon-card ${featured ? "weapon-card--featured" : ""}" style="--skill-primary:${skill.themeColors.primary};--skill-secondary:${skill.themeColors.secondary};--skill-accent:${skill.themeColors.accent};--delay-index:${index}">
      <div class="weapon-card__header">
        <div class="weapon-card__icon">${renderWeaponIcon(skill)}</div>
        <div class="weapon-card__copy">
          <div class="weapon-card__meta">${customBadge}<span class="weapon-card__type">${escapeHtml(skill.weaponType)}</span></div>
          <div class="weapon-card__name">${escapeHtml(skill.name)}</div>
        </div>
      </div>
      <p class="weapon-card__desc">${escapeHtml(skill.description)}</p>
      <button class="weapon-card__action" data-action="run-skill" data-skill-id="${escapeHtml(skill.id)}">
        ${escapeHtml(skill.actionLabel)}
      </button>
    </article>
  `;
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
    const animationsEnabled = vscode.workspace.getConfiguration("viewerleaf").get<boolean>("skillAnimations.enabled", true);
    const animationIntensity = vscode.workspace.getConfiguration("viewerleaf").get<string>("skillAnimations.intensity", "light");
    const skills = this.getSkills().filter((skill) => skill.enabled);
    const featured = skills[0];
    const remaining = skills.slice(1);

    return `<!DOCTYPE html>
      <html lang="zh-CN">
        <head>
          <meta charset="UTF-8" />
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <style>
            :root {
              color-scheme: light dark;
              --paper-bg: color-mix(in srgb, var(--vscode-sideBar-background) 86%, #f8f5ee 14%);
              --paper-ink: color-mix(in srgb, var(--vscode-foreground) 78%, #20150f 22%);
              --paper-muted: color-mix(in srgb, var(--vscode-descriptionForeground) 84%, #6f6358 16%);
              --panel-border: color-mix(in srgb, var(--vscode-editorWidget-border, #cfcbc1) 72%, #8d7d68 28%);
            }
            * { box-sizing: border-box; }
            body {
              margin: 0;
              color: var(--paper-ink);
              font-family: "Avenir Next", "Segoe UI", sans-serif;
              background:
                radial-gradient(circle at top, rgba(244, 189, 102, 0.14), transparent 34%),
                linear-gradient(180deg, color-mix(in srgb, var(--paper-bg) 92%, #fff8ea 8%), color-mix(in srgb, var(--paper-bg) 94%, #e8dcc6 6%));
            }
            .arsenal-shell {
              padding: 16px 14px 18px;
              display: flex;
              flex-direction: column;
              gap: 14px;
            }
            .arsenal-hero {
              position: relative;
              overflow: hidden;
              padding: 18px 16px 16px;
              border-radius: 20px;
              border: 1px solid var(--panel-border);
              background:
                linear-gradient(180deg, rgba(255,255,255,0.92), rgba(249,243,229,0.98)),
                repeating-linear-gradient(0deg, rgba(89, 63, 37, 0.02), rgba(89, 63, 37, 0.02) 1px, transparent 1px, transparent 6px);
              box-shadow: 0 14px 34px rgba(43, 23, 8, 0.08);
            }
            .arsenal-hero::after {
              content: "";
              position: absolute;
              inset: auto -34px -48px auto;
              width: 140px;
              height: 140px;
              border-radius: 999px;
              background: radial-gradient(circle, rgba(217, 119, 6, 0.18), transparent 68%);
              pointer-events: none;
            }
            .arsenal-eyebrow {
              display: inline-flex;
              align-items: center;
              gap: 6px;
              font-size: 11px;
              letter-spacing: 0.12em;
              text-transform: uppercase;
              color: var(--paper-muted);
              font-weight: 800;
            }
            .arsenal-eyebrow::before {
              content: "";
              width: 10px;
              height: 10px;
              background:
                linear-gradient(90deg, #8b5cf6 50%, transparent 50%),
                linear-gradient(180deg, #f59e0b 50%, transparent 50%);
              background-size: 5px 5px;
              border: 1px solid rgba(122, 89, 52, 0.28);
              image-rendering: pixelated;
            }
            .arsenal-title {
              margin: 10px 0 6px;
              font-family: "Iowan Old Style", "Palatino Linotype", serif;
              font-size: 29px;
              line-height: 1.02;
              letter-spacing: -0.02em;
              color: #1f1b14;
              font-weight: 700;
            }
            .arsenal-copy {
              margin: 0;
              max-width: 32ch;
              font-size: 13px;
              line-height: 1.68;
              color: #4e4338;
            }
            .arsenal-hero__actions {
              display: flex;
              gap: 8px;
              margin-top: 14px;
              flex-wrap: wrap;
            }
            .hero-btn {
              border: 1px solid rgba(105, 77, 47, 0.2);
              border-radius: 12px;
              padding: 9px 12px;
              background: rgba(255,255,255,0.84);
              color: #3d2f22;
              font-size: 12px;
              font-weight: 800;
              cursor: pointer;
              backdrop-filter: blur(8px);
            }
            .hero-btn--primary {
              background: linear-gradient(180deg, #ef8f32, #c46710);
              border-color: #a85712;
              color: white;
              box-shadow: 0 10px 18px rgba(186, 96, 18, 0.24);
            }
            .arsenal-note {
              padding: 11px 12px;
              border-radius: 16px;
              background: rgba(255,255,255,0.78);
              border: 1px dashed rgba(117, 90, 61, 0.24);
              font-size: 12px;
              line-height: 1.6;
              color: #5d5143;
            }
            .weapon-list {
              display: flex;
              flex-direction: column;
              gap: 12px;
            }
            .weapon-card {
              border-radius: 18px;
              padding: 14px;
              border: 1px solid color-mix(in srgb, var(--skill-primary) 18%, rgba(107, 82, 54, 0.18) 82%);
              background:
                linear-gradient(180deg, color-mix(in srgb, var(--skill-secondary) 88%, white 12%), rgba(255,255,255,0.98)),
                repeating-linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0.18) 1px, transparent 1px, transparent 4px);
              box-shadow: 0 12px 26px rgba(36, 22, 8, 0.06);
            }
            .weapon-card--featured {
              padding: 16px;
              box-shadow: 0 18px 38px rgba(36, 22, 8, 0.1);
            }
            .weapon-card__header {
              display: flex;
              align-items: center;
              gap: 12px;
            }
            .weapon-card__icon {
              width: 62px;
              height: 62px;
              flex: 0 0 auto;
              border-radius: 18px;
              display: grid;
              place-items: center;
              background: linear-gradient(180deg, rgba(255,255,255,0.78), rgba(255,255,255,0.98));
              border: 1px solid rgba(255,255,255,0.9);
              box-shadow: inset 0 1px 0 rgba(255,255,255,0.82), 0 8px 18px rgba(31, 20, 9, 0.08);
            }
            .weapon-card__icon svg {
              width: 48px;
              height: 48px;
              display: block;
            }
            .weapon-card__copy {
              min-width: 0;
              flex: 1;
            }
            .weapon-card__meta {
              display: flex;
              align-items: center;
              gap: 6px;
              margin-bottom: 3px;
              flex-wrap: wrap;
            }
            .weapon-card__badge,
            .weapon-card__type {
              display: inline-flex;
              align-items: center;
              min-height: 20px;
              padding: 0 7px;
              border-radius: 999px;
              font-size: 10px;
              line-height: 1;
              text-transform: uppercase;
              letter-spacing: 0.1em;
              font-weight: 800;
            }
            .weapon-card__badge {
              background: color-mix(in srgb, var(--skill-accent) 20%, white 80%);
              color: color-mix(in srgb, var(--skill-primary) 78%, #62452a 22%);
            }
            .weapon-card__type {
              background: rgba(255,255,255,0.68);
              color: color-mix(in srgb, var(--skill-primary) 74%, #564537 26%);
            }
            .weapon-card__name {
              font-size: 16px;
              font-weight: 800;
              color: #16120d;
            }
            .weapon-card__desc {
              margin: 12px 0 14px;
              font-size: 12.5px;
              line-height: 1.65;
              color: #40362c;
            }
            .weapon-card__action {
              width: 100%;
              border: none;
              border-radius: 12px;
              padding: 10px 12px;
              background: linear-gradient(180deg, color-mix(in srgb, var(--skill-accent) 82%, white 18%), var(--skill-primary));
              color: white;
              font-size: 12px;
              font-weight: 800;
              cursor: pointer;
              box-shadow: 0 10px 20px color-mix(in srgb, var(--skill-primary) 28%, transparent);
            }
            .weapon-card__action:hover,
            .hero-btn:hover {
              filter: brightness(1.03);
            }
            ${animationsEnabled && animationIntensity === "light" ? `
              .weapon-card {
                animation: enter 240ms ease-out both;
                animation-delay: calc(var(--delay-index) * 70ms);
              }
              .weapon-card__icon {
                animation: float 3.8s ease-in-out infinite;
                animation-delay: calc(var(--delay-index) * 140ms);
              }
              @keyframes enter {
                from { opacity: 0; transform: translateY(8px); }
                to { opacity: 1; transform: translateY(0); }
              }
              @keyframes float {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-4px); }
              }
            ` : ""}
            @media (max-width: 420px) {
              .arsenal-title {
                font-size: 26px;
              }
              .arsenal-copy {
                max-width: none;
              }
            }
            @media (prefers-reduced-motion: reduce) {
              .weapon-card,
              .weapon-card__icon {
                animation: none !important;
              }
            }
          </style>
        </head>
        <body>
          <main class="arsenal-shell">
            <section class="arsenal-hero">
              <div class="arsenal-eyebrow">ViewerLeaf Companion</div>
              <h1 class="arsenal-title">Academic Arsenal</h1>
              <p class="arsenal-copy">把本地论文 workflow 压成几件能反复挥出的工具。现在内置武器和自定义技能共用一套装填逻辑，动作会直接落到编辑器、命令或 Claude Code 终端里。</p>
              <div class="arsenal-hero__actions">
                <button class="hero-btn hero-btn--primary" data-action="open-workspace">Open Workspace</button>
                <button class="hero-btn" data-action="open-rich-preview">Rich Preview</button>
                <button class="hero-btn" data-action="show-outline">Project Outline</button>
                <button class="hero-btn" data-action="install-latex-workshop">LaTeX Workshop</button>
              </div>
            </section>
            <div class="arsenal-note">PDF 预览、编译和 SyncTeX 依赖 LaTeX Workshop。自定义技能可从工作区根目录的 <code>.viewerleaf-skills.json</code> 或全局清单导入，并支持把 prompt 预填到 Claude Code 终端。</div>
            <div class="weapon-list">
              ${featured ? renderSkillCard(featured, 0, true) : ""}
              ${remaining.map((skill, index) => renderSkillCard(skill, index + 1)).join("")}
            </div>
          </main>
          <script nonce="${nonce}">
            const vscode = acquireVsCodeApi();
            document.querySelectorAll("[data-action]").forEach((element) => {
              element.addEventListener("click", () => {
                const action = element.getAttribute("data-action");
                const skillId = element.getAttribute("data-skill-id");
                if (action === "run-skill" && skillId) {
                  vscode.postMessage({ type: "run-skill", skillId });
                  return;
                }
                vscode.postMessage({ type: action });
              });
            });
          </script>
        </body>
      </html>`;
  }
}
