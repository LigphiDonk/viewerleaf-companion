import * as vscode from "vscode";

import { ACADEMIC_SKILLS } from "../skills/catalog";
import type { AcademicSkill, WeaponType } from "../types";

type ArsenalMessage =
  | { type: "run-skill"; skillId: string }
  | { type: "open-workspace" }
  | { type: "show-outline" }
  | { type: "install-latex-workshop" };

function getNonce() {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let text = "";
  for (let index = 0; index < 24; index += 1) {
    text += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return text;
}

function renderWeaponIcon(weaponType: WeaponType, primary: string, accent: string) {
  switch (weaponType) {
    case "blade":
      return `
        <svg viewBox="0 0 96 96" aria-hidden="true">
          <circle cx="48" cy="48" r="40" fill="${accent}" opacity="0.12" />
          <path d="M51 16L62 30L52 40L70 58L60 68L42 50L32 60L24 52L34 42L20 28L30 18L40 28L51 16Z" fill="${primary}" />
        </svg>
      `;
    case "bow":
      return `
        <svg viewBox="0 0 96 96" aria-hidden="true">
          <circle cx="48" cy="48" r="40" fill="${accent}" opacity="0.12" />
          <path d="M28 72C56 60 60 36 52 18" stroke="${primary}" stroke-width="7" stroke-linecap="round" />
          <path d="M28 72C44 50 46 36 40 22" stroke="${primary}" stroke-width="7" stroke-linecap="round" opacity="0.42" />
          <path d="M26 28L68 66" stroke="${primary}" stroke-width="4" stroke-linecap="round" />
          <path d="M62 60L76 62L72 76" fill="none" stroke="${primary}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      `;
    case "hammer":
      return `
        <svg viewBox="0 0 96 96" aria-hidden="true">
          <circle cx="48" cy="48" r="40" fill="${accent}" opacity="0.12" />
          <rect x="22" y="24" width="34" height="18" rx="6" fill="${primary}" />
          <path d="M46 40L70 64" stroke="${primary}" stroke-width="8" stroke-linecap="round" />
          <path d="M64 58L76 70" stroke="${accent}" stroke-width="10" stroke-linecap="round" />
        </svg>
      `;
    case "shield":
      return `
        <svg viewBox="0 0 96 96" aria-hidden="true">
          <circle cx="48" cy="48" r="40" fill="${accent}" opacity="0.12" />
          <path d="M48 18L72 28V46C72 61 61 74 48 80C35 74 24 61 24 46V28L48 18Z" fill="${primary}" />
          <path d="M48 28V68" stroke="white" stroke-width="5" stroke-linecap="round" />
          <path d="M33 46H63" stroke="white" stroke-width="5" stroke-linecap="round" />
        </svg>
      `;
    case "spear":
      return `
        <svg viewBox="0 0 96 96" aria-hidden="true">
          <circle cx="48" cy="48" r="40" fill="${accent}" opacity="0.12" />
          <path d="M26 72L66 32" stroke="${primary}" stroke-width="7" stroke-linecap="round" />
          <path d="M62 18L78 22L74 38L58 34L62 18Z" fill="${primary}" />
        </svg>
      `;
  }
}

function renderSkillCard(skill: AcademicSkill, featured = false) {
  return `
    <article class="weapon-card ${featured ? "weapon-card--featured" : ""}" style="--skill-primary:${skill.themeColors.primary};--skill-secondary:${skill.themeColors.secondary};--skill-accent:${skill.themeColors.accent}">
      <div class="weapon-card__header">
        <div class="weapon-card__icon">${renderWeaponIcon(skill.weaponType, skill.themeColors.primary, skill.themeColors.accent)}</div>
        <div class="weapon-card__copy">
          <div class="weapon-card__name">${skill.name}</div>
          <div class="weapon-card__type">${skill.weaponType}</div>
        </div>
      </div>
      <p class="weapon-card__desc">${skill.description}</p>
      <button class="weapon-card__action" data-action="run-skill" data-skill-id="${skill.id}">
        ${skill.actionLabel}
      </button>
    </article>
  `;
}

export class ArsenalViewProvider implements vscode.WebviewViewProvider {
  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.html = this.getHtml(webviewView.webview);
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
        case "install-latex-workshop":
          await vscode.commands.executeCommand("workbench.extensions.search", "@id:James-Yu.latex-workshop");
      }
    });
  }

  private getHtml(webview: vscode.Webview) {
    const nonce = getNonce();
    const animationsEnabled = vscode.workspace.getConfiguration("viewerleaf").get<boolean>("skillAnimations.enabled", true);
    const animationIntensity = vscode.workspace.getConfiguration("viewerleaf").get<string>("skillAnimations.intensity", "light");
    const featured = ACADEMIC_SKILLS[0];
    const remaining = ACADEMIC_SKILLS.slice(1);

    return `<!DOCTYPE html>
      <html lang="zh-CN">
        <head>
          <meta charset="UTF-8" />
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <style>
            :root {
              color-scheme: light dark;
            }
            * { box-sizing: border-box; }
            body {
              margin: 0;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
              color: var(--vscode-foreground);
              background:
                radial-gradient(circle at top right, rgba(20, 184, 166, 0.08), transparent 28%),
                linear-gradient(180deg, var(--vscode-sideBar-background), color-mix(in srgb, var(--vscode-editor-background) 88%, white 12%));
            }
            .arsenal-shell {
              padding: 16px 14px 18px;
              display: flex;
              flex-direction: column;
              gap: 14px;
            }
            .arsenal-hero {
              padding: 16px;
              border-radius: 18px;
              border: 1px solid color-mix(in srgb, var(--vscode-editorWidget-border, #d9dee7) 70%, transparent);
              background: linear-gradient(180deg, rgba(255,255,255,0.92), rgba(248,250,252,0.96));
              box-shadow: 0 10px 30px rgba(15, 23, 42, 0.06);
            }
            .arsenal-eyebrow {
              font-size: 11px;
              letter-spacing: 0.08em;
              text-transform: uppercase;
              color: color-mix(in srgb, var(--vscode-descriptionForeground) 84%, #475569 16%);
              font-weight: 700;
            }
            .arsenal-title {
              margin: 8px 0 6px;
              font-size: 26px;
              line-height: 1.1;
              color: #0f172a;
              font-weight: 800;
            }
            .arsenal-copy {
              margin: 0;
              font-size: 13px;
              line-height: 1.65;
              color: #475569;
            }
            .arsenal-hero__actions {
              display: flex;
              gap: 8px;
              margin-top: 14px;
              flex-wrap: wrap;
            }
            .hero-btn {
              border: 1px solid #d8e2ec;
              border-radius: 12px;
              padding: 8px 12px;
              background: #ffffff;
              color: #1f2937;
              font-size: 12px;
              font-weight: 700;
              cursor: pointer;
            }
            .hero-btn--primary {
              background: linear-gradient(180deg, #14b8a6, #0f766e);
              border-color: #0f766e;
              color: white;
            }
            .arsenal-note {
              padding: 10px 12px;
              border-radius: 14px;
              background: rgba(255,255,255,0.8);
              border: 1px dashed #d6dde8;
              font-size: 12px;
              line-height: 1.55;
              color: #475569;
            }
            .weapon-list {
              display: flex;
              flex-direction: column;
              gap: 12px;
            }
            .weapon-card {
              border-radius: 18px;
              padding: 14px;
              border: 1px solid color-mix(in srgb, var(--skill-primary) 14%, #d6dce6 86%);
              background: linear-gradient(180deg, color-mix(in srgb, var(--skill-secondary) 88%, white 12%), #ffffff);
              box-shadow: 0 10px 24px rgba(15, 23, 42, 0.05);
            }
            .weapon-card--featured {
              padding: 16px;
              box-shadow: 0 16px 36px rgba(15, 23, 42, 0.08);
            }
            .weapon-card__header {
              display: flex;
              align-items: center;
              gap: 12px;
            }
            .weapon-card__icon {
              width: 58px;
              height: 58px;
              flex: 0 0 auto;
              border-radius: 18px;
              display: grid;
              place-items: center;
              background: linear-gradient(180deg, rgba(255,255,255,0.7), rgba(255,255,255,0.98));
              border: 1px solid rgba(255,255,255,0.86);
              box-shadow: inset 0 1px 0 rgba(255,255,255,0.8), 0 8px 18px rgba(15, 23, 42, 0.06);
            }
            .weapon-card__icon svg {
              width: 46px;
              height: 46px;
              display: block;
            }
            .weapon-card__copy {
              min-width: 0;
              flex: 1;
            }
            .weapon-card__name {
              font-size: 16px;
              font-weight: 800;
              color: #0f172a;
            }
            .weapon-card__type {
              margin-top: 3px;
              font-size: 11px;
              text-transform: uppercase;
              letter-spacing: 0.08em;
              color: color-mix(in srgb, var(--skill-primary) 76%, #475569 24%);
              font-weight: 700;
            }
            .weapon-card__desc {
              margin: 12px 0 14px;
              font-size: 12.5px;
              line-height: 1.65;
              color: #334155;
            }
            .weapon-card__action {
              width: 100%;
              border: none;
              border-radius: 12px;
              padding: 10px 12px;
              background: var(--skill-primary);
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
              .weapon-card__icon {
                animation: float 3.6s ease-in-out infinite;
              }
              .weapon-card:nth-child(2) .weapon-card__icon { animation-delay: 0.5s; }
              .weapon-card:nth-child(3) .weapon-card__icon { animation-delay: 1s; }
              .weapon-card:nth-child(4) .weapon-card__icon { animation-delay: 1.4s; }
              .weapon-card:nth-child(5) .weapon-card__icon { animation-delay: 1.8s; }
              @keyframes float {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-4px); }
              }
            ` : ""}
            @media (prefers-reduced-motion: reduce) {
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
              <p class="arsenal-copy">把学术 workflow 做成一套轻量武器。这里没有 agent，只有你在 VS Code 里真正会反复使用的本地战术。</p>
              <div class="arsenal-hero__actions">
                <button class="hero-btn hero-btn--primary" data-action="open-workspace">Open Academic Workspace</button>
                <button class="hero-btn" data-action="show-outline">Project Outline</button>
                <button class="hero-btn" data-action="install-latex-workshop">LaTeX Workshop</button>
              </div>
            </section>
            <div class="arsenal-note">PDF 预览、编译和 SyncTeX 依赖 LaTeX Workshop。ViewerLeaf Companion 负责工作台编排、项目级大纲和武器化学术 skill。</div>
            <div class="weapon-list">
              ${featured ? renderSkillCard(featured, true) : ""}
              ${remaining.map((skill) => renderSkillCard(skill)).join("")}
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
