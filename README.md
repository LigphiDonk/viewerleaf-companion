# ViewerLeaf Companion

ViewerLeaf Companion 是一个独立的 VS Code 学术写作扩展仓库，不依赖当前的 Tauri 桌面项目运行。

它不是另一个全量 LaTeX IDE，而是一个建立在现有 LaTeX 生态之上的 **学术工作台层**：

- Overleaf 风格的一键双栏工作区
- 项目级论文大纲，而不是单文件 outline
- 一个轻量、可爱、2D 动效的 Academic Skill Arsenal

## 为什么单开仓库

这个扩展和桌面版 ViewerLeaf 在运行时、发布链和依赖模型上都不一样：

- VS Code 扩展走 extension host
- 桌面版走 Tauri + Rust
- 两边不共享构建、lockfile、CI 或发布流程

这个仓库只复用少量纯逻辑代码思路，例如 LaTeX 项目大纲解析。

## 市场定位

市场上已经有成熟的 LaTeX 基础能力：

- `LaTeX Workshop`：编译、PDF、SyncTeX、基础 outline
- `LaTeX Utilities`：在 LaTeX Workshop 上叠加增强体验
- `Cloverleaf` / `LocalLeaf`：覆盖部分本地 Overleaf 工作流

ViewerLeaf Companion 的差异化不在“我也能编译 LaTeX”，而在：

- 更明确的论文项目视角
- 更轻的 Overleaf 式双栏工作区
- 更有识别度的 academic skill 武器系统

## v0.1 功能

### Academic Workspace

- `ViewerLeaf: Open Academic Workspace`
- 一键组织当前 `.tex` 文件和 PDF 预览的双栏布局
- 依赖 `LaTeX Workshop` 进行 build / view / SyncTeX

### Paper Outline

- 从 `main.tex` 递归解析 `\input` 和 `\include`
- 按论文真实组织顺序展示章节树
- 点击节点跳转到源码
- 跟随当前光标高亮章节

### Academic Arsenal

内置 5 个 skill 武器：

- `Outline Blade`
- `Citation Bow`
- `Figure Hammer`
- `Review Shield`
- `Submission Spear`

这些 skill 都是本地 workflow 命令，不调用 AI。

## 依赖

推荐安装：

- [LaTeX Workshop](https://marketplace.visualstudio.com/items?itemName=James-Yu.latex-workshop)

未安装时，本扩展仍会激活，但 PDF / SyncTeX 工作流会提示安装依赖。

## 开发

```bash
npm install
npm run build
npm run test
npm run package:vsix
```

然后在 VS Code 里运行 `Run Extension`。

`npm run package:vsix` 会在仓库根目录生成一个 `.vsix` 文件，可直接通过 VS Code 的 `Extensions: Install from VSIX...` 安装测试。

## GitHub Actions

仓库中的 CI 会在 `push`、`pull request` 和手动触发时执行：

- `npm run build`
- `npm run test`
- `npm run package:vsix`

打包完成后，GitHub Actions 会上传 `.vsix` artifact，下载后即可本地安装测试。

## Roadmap

见 [ROADMAP.md](./ROADMAP.md)。
