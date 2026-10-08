# 阶段3 技术路线：IDE 页（03-ide-plan.md）

> 依据：仓库根 `IDE.md`（PR #1 合并的最终规格，91 行）+ 计划 §6。选型结论：**方案 A —— 在现有 Desktop 前端内扩展**，不引入外部 IDE（方案 B / code-server 否决：重、升级与裁剪都麻烦，且违背"缺的是位置不是另一套 IDE"的规格原则）。

## 1. 现状资产盘点（全部复用，不重造）

| 规格需求 | 已有资产 | 位置 |
|---|---|---|
| 标签/窗格系统 | pane-shell（tree store、edit-mode、geometry、workspace-scope） | `components/pane-shell/` |
| 文件树 | `ProjectTree`（右栏现成） | `app/right-sidebar/files/` |
| 编辑器 | CodeMirror 组件（现嵌在聊天/配置里） | `components/chat/code-editor.tsx` |
| 终端 | 持久终端（右栏现成） | `app/right-sidebar/terminal/` |
| Git 数据 | `repoStatus` / `fileDiff` / `branchList` / `branchSwitch` / `review.list` | `lib/desktop-git.ts` |
| GitHub | 本机 `gh`（gh-auth 检查、PR/议题/推拉/克隆走 CLI） | `api/git`（含 `/api/git/gh-auth`） |
| Markdown 渲染 | 对话同款渲染 + 预览条 | `components/assistant-ui/markdown-text.tsx` |
| 断点 | 640px 侧栏悬停规则 | `app/layout-constants.ts`（`SIDEBAR_DOCK_MIN_WIDTH_PX`） |
| 审查/diff | 右栏 review 区 + 代理改动流 | `app/right-sidebar/review/` |
| 命令面板 | 已存在 | `app/command-palette/` |

## 2. 路由与外壳策略

- 现状：`NEW_CHAT_ROUTE = '/'`，`appViewForPath` 把未保留路径默认成 `'chat'`（`app/routes.ts`）。
- 改造：新增 `AppView 'workspace'`；**`'/'` 的落地视图改为工作区**——工作区右栏承载当前会话（复用现有 ChatView/tile 机制），中间为编辑器标签区。
- 保留全部现有路由（settings / command-center / cron / capabilities…），从活动栏底部齿轮进入，与规格第 15 行一致。
- 会话深链（`sessionRoute`、`tile:<id>`）在工作区内解析，不产生第二套路由体系。
- 启动恢复：文件夹、标签、侧栏宽、底部面板高度 → 复用 pane-shell/workspace-scope 的既有持久化模式新增一个 workspace 恢复键；恢复失败回退空状态（打开文件夹/克隆/最近 8 个），**不回退到空白聊天**。

## 3. 分步计划（每步 = 实现 → vitest/tsc → commit → push → 镜像同步）

| 步 | 内容 | 验收要点 |
|---|---|---|
| **3A 布局壳** | `app/workspace/`：活动栏五项（文件/搜索/Git/GitHub/对话+齿轮）、五区框架（树｜编辑区｜对话｜终端｜状态栏）、`'/'` 接入、空状态（打开文件夹/克隆/最近8个） | 默认进工作区；设置等路由不受影响；tsc/vitest 绿 |
| **3B 树→标签** | ProjectTree 点击进中间标签；标签关/左右对开（上下不做）；CodeMirror 从聊天提出复用；代理改文件→标签标脏 | 开/关/分屏/脏标记 |
| **3C 终端+状态栏** | 终端/输出移入底部面板（默认收起成条）；状态栏：分支、改动数、行列、编码（`branchList`/`branchSwitch` 接入） | 数据实时、点分支可切换 |
| **3D Markdown** | 标签内编辑/预览开关、左右并排联动、相对链接→新标签、http→系统浏览器；不做数学/脚注/幻灯片 | 与对话渲染同源 |
| **3E Git 视图** | 活动栏 Git：状态标脏、fileDiff、暂存/取消暂存/提交（Hermes 代写说明停输入框）/丢弃二次确认、分支列表切换新建（脏工作区禁切）、review.list、冲突=左右+结果栏 | 规格 52-60 行逐条 |
| **3F GitHub 视图** | `gh-auth` 未登录只显 github-auth 引导；登录后四块：PR/议题/推拉/克隆；PR 描述与 diff 进中间标签，评论走右侧对话需人工确认 | 不接 GitHub MCP |
| **3G 搜索+面板** | Ctrl+P 快速打开（仓库路径）；全文搜索（行号、含/排除，默认排除 .git 与依赖）；命令面板固定第一入口并收编规格 81 行清单 | 与现有面板合流 |
| **3H 代理改动审查** | 改动先到 diff 标签：单文件留/丢、整批处理；留=写盘，丢=保持原样；非提交 | 规格 83-87 行 |

**重建检查点**：3A-3C 完成后第一次重建（新首屏可见）；3E、3F 完成后各一次；其余攒批。

## 4. 明确不做（规格"先不做"+ 计划铁律）

Tab 补全、Bugbot、云代理、语言服务器、调试器断点、扩展市场；上下分屏；检查流水线/Projects 看板进活动栏。共享模块里的跨平台分支不删。

## 5. 风险与对策

| 风险 | 对策 |
|---|---|
| 默认路由变更影响既有习惯与测试 | `'/'` 视图替换但保留 chat 视图与全部深链；改完跑 ui 测试套件 |
| 与 HUD/tile 的会话声明机制冲突 | 工作区右栏直接复用 tile 机制（pane-shell 已有），不新造会话所有权 |
| 恢复状态键污染既有持久化 | 新增独立 workspace 恢复键，读失败静默回退空状态 |
| 大改期间界面长时间不生效 | 分步 commit + 检查点重建（见上） |
