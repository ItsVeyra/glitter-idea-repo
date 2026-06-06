# Glitter

> 说明：本文是 `glitter-plugin/` 私有开发仓库的主说明，面向当前源码仓库的功能概览、开发验证流程、Obsidian 测试库联调，以及本地发布导出。后续功能或流程有变化时，应先更新本文。

Glitter 是一个面向 Obsidian 的灵感记录插件，核心目标不是让每个想法都立刻变成一篇正式笔记，而是先把那些值得留下、却不一定需要单独建文件的小点子、片段和灵感轻量收住，避免 vault 被大量临时笔记弄得杂乱。当前你可以在 Obsidian 内快速记录、查看、分类整理这些灵感；当其中某条需要沉淀为独立笔记或进入正文写作时，也可以按需创建 Markdown 文件或插入为片段。

## v0.1.16 开发更新要点
### 1. 英文界面覆盖补齐
- 首页、灵感池、写作片段、漫游导出、设置页与首次引导等主要界面文案已补齐英文版本。
- 首页【圆满】与【涟漪】两种视图的灵感池隔离态按钮现在会跟随界面语言显示，英文态使用 `Edit` / `Delete` / `Enter`，不再混入中文或冗余词。
- 设置页介绍文案与外露插件介绍分开维护，便于后续继续按社区插件说明和真实设置界面分别调整。

### 2. 首页池场双视图继续收口
- populated 首页支持在【圆满】与【涟漪】之间切换，切换范围只覆盖底层灵感池 / 灵感场，不改动标题、搜索、设置、状态筛选、新建池与灵感速记等首页外壳。
- 【圆满】继续沿用稳定聚合的池场基线；【涟漪】提供第二套池场排布、标题连接与 hover 隔离交互。
- 两种视图共用同一套本地化文案与状态模型，避免后续继续出现同一操作在不同视图里分叉维护。

### 3. 灵感池卡片媒体预览修复
- 图片、视频类型灵感保存为卡片后，缩略图区域已恢复点击放大查看能力。
- 预览触发区改为原生按钮语义，保留键盘可访问性，同时避免手写键盘事件造成重复触发。

### 4. 配套发布链路已跟上这轮开发
- 源码仓、公开发布仓与本地 release 导出目录已切到 `v0.1.16`。
- 社区插件风险回归测试继续覆盖权限、联网、DOM 安全与发布结构约束；GitHub Release 仍按独立发布流程处理。

## 当前能力
- 在 Obsidian 内全局快速记录灵感
- 支持纯文本、链接、图片、视频等内容类型
- 粘贴链接后自动识别并填充信息
- 支持快速记录文本的 AI 润色，用户可自填 API Key、Base URL、Model 直连模型
- AI 润色提供原文 / 结果并排复核，支持重做、取消与采纳结果
- 支持灵感漫游：把已保存灵感重新带入白板，继续排布、连接、比较与归纳
- 漫游来源块支持文本、链接、图片、视频直显，多图内容按单条灵感聚合展示
- 首页 populated 状态支持【圆满】/【涟漪】双视图切换，两种视图共用同一套首页壳层与操作入口
- 从编辑器选区创建灵感
- 在笔记正文中插入灵感片段，并可跳回原灵感
- 通过灵感池分类整理内容
- 搜索、筛选、排序与批量移动灵感，且批量移动弹窗内可直接新建池
- 可按需决定是否为灵感创建 Markdown 文件
- 提供 Design Review Mode，用于切换确定性场景做界面验证

## 后续开发要点
- **继续围绕 managed source block 语义扩展漫游**：后续新增漫游能力时，优先沿用当前已经收口的来源块结构、历史聚合、导出折叠与同步刷新路径，避免再次出现多套活跃运行时语义并存。
- **继续打磨首页多视图体验**：当前 populated 首页的【圆满】/【涟漪】双视图已经接通，后续可继续围绕背景雨效、更多浏览语义与状态细节做补强。
- **推进卡片分享链路**：后续如接入分享能力，优先明确分享对象、内容边界与来源回溯语义，避免只是表面增加一个导出入口。
- **持续做真实宿主回归**：后续所有 UI 和交互补强，仍需以 Obsidian 测试库的真实运行效果为准，重点防止漫游、速记、片段插入、池整理这几条已打通链路互相回归。

## 当前仓库状态
- `glitter-plugin/` 是当前唯一源码与开发主仓。
- Obsidian 测试库联调与本地 release 导出流程都已接通。
- 快速记录 AI 润色的本地实现、测试与预览场景已经接通；正式提交、合并与发布仍以真实 AI 配置验收为准。
- `glitter-plugin-release/` 是从源码仓库导出的运行时目录，只保留插件运行必需产物。
- 公开 release 仓库与最终对外 GitHub 地址仍按后续发布流程单独处理，不在本仓库直接手工维护运行时文件。

## 常用命令
```bash
npm install
npm run dev
npm run test
npm run test:watch
npm run check
npm run build
npm run release:local
npm run obsidian:test-vault:link
npm run obsidian:test-vault
```

### 命令说明
- `npm run dev`：本地开发构建，配合 Obsidian test vault + Hot Reload 使用。
- `npm run test`：运行 Vitest 全量测试。
- `npm run test:watch`：以 watch 模式运行测试。
- `npm run check`：运行 TypeScript typecheck。
- `npm run build`：生成生产构建。
- `npm run release:local`：先执行生产构建，再导出本地运行时发布目录。
- `npm run obsidian:test-vault:link`：把当前插件接到 Obsidian 测试库。
- `npm run obsidian:test-vault`：在测试库环境里执行一次完整重载。

## Obsidian 测试库联调（真实宿主）
当前真实联调以本地 Obsidian test vault 为准。

重要：所有 `obsidian:test-vault:link` 和 `obsidian:test-vault` 命令，都只能在规范主工作区 `glitter-plugin/` 目录运行；不要在 `.worktrees/`、其他 worktree 或旧分支副本里运行。

### 一次性接入
1. 在 `glitter-plugin/` 目录运行：
   ```bash
   npm run obsidian:test-vault:link
   ```
2. 安装或更新 Hot Reload：
   ```bash
   if [ ! -d "/Users/lqy/Documents/Test-Vault/Glitter-Test-Vault/.obsidian/plugins/hot-reload" ]; then
     git clone https://github.com/pjeby/hot-reload "/Users/lqy/Documents/Test-Vault/Glitter-Test-Vault/.obsidian/plugins/hot-reload"
   else
     git -C "/Users/lqy/Documents/Test-Vault/Glitter-Test-Vault/.obsidian/plugins/hot-reload" pull --ff-only
   fi
   ```
3. 在 Obsidian 中打开 **Settings → Community plugins**，启用 **Glitter** 和 **Hot Reload**。

### 日常联调循环
1. 在 `glitter-plugin/` 目录运行：
   ```bash
   npm run dev
   ```
2. 在 Obsidian 中使用以下命令打开真实宿主界面：
   - `Open Glitter home view`
   - `Open Glitter search view`
   - `Open Glitter pool view`
   - `Open Glitter quick capture`
3. 如需固定场景验证：
   - 打开 **Settings → Glitter**
   - 启用 **Enable design review mode**
   - 在 **Design review scenario** 里选择要验证的场景
   - 快速记录相关场景已补充 `quick-capture-ai-ready`、`quick-capture-ai-reviewing`、`quick-capture-ai-error`，可直接验证 AI 润色的按钮态、复核态与错误态
4. 需要排查运行时问题时，用 **Cmd+Option+I** 打开 DevTools。
5. 若 Hot Reload 未及时追上，执行完整重载：
   ```bash
   npm run obsidian:test-vault
   ```

非技术走查可参考 [docs/test-vault-walkthrough.md](docs/test-vault-walkthrough.md)。

## 质量门禁
交付前至少执行：

```bash
npm run test
npm run check
npm run build
```

若要输出本地发布目录，再执行：

```bash
npm run release:local
```

## 源码仓库与本地发布目录
- `glitter-plugin/`：唯一源码仓库，负责开发、测试、提交，以及 GitHub 私有开发仓的源码维护。
- `glitter-plugin-release/`：由源码仓库导出的本地运行时目录，仅用于用户交付、GitHub Release 资产整理、Obsidian 官方提交准备。
- 不要在 `glitter-plugin-release/` 中做开发、调试、提交或手工维护。
- 任何运行时发布物都应从 `glitter-plugin/` 重新导出，而不是直接在发布目录里改。

## 本地发布导出
```bash
npm run release:local
```

该命令会先重新构建插件，再清理并重建 `../glitter-plugin-release/`，最终只导出这三个运行时文件：
- `manifest.json`
- `main.js`
- `styles.css`

这三项也是后续 GitHub Release、用户手动安装、以及 Obsidian 官方插件提交流程需要使用的最小发布物集合。

## 手动安装到 Obsidian
1. 在 `glitter-plugin/` 目录运行 `npm run release:local`。
2. 在你的 vault 中创建 `.obsidian/plugins/glitter-idea/`。
3. 把 `glitter-plugin-release/` 里的 `manifest.json`、`main.js`、`styles.css` 复制进去。
4. 重启 Obsidian，并在 Community plugins 中启用 Glitter。

后续更新时，重新执行 `npm run release:local`，再用新导出的同名三个文件覆盖即可。

## 相关文档
- [docs/release-checklist.md](docs/release-checklist.md)：发布前逐项核对清单
- [docs/test-vault-walkthrough.md](docs/test-vault-walkthrough.md)：面向非技术走查的测试库操作说明
- `docs/superpowers/specs/`：重要设计说明
- `docs/superpowers/plans/`：对应设计的实现计划
