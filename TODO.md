# 待办清单（Hermes-IDE）

> 记录于 2026-10-10。已完成的改动全部在工作区**未提交**（`git diff` 可逐条审阅，未 push）。
>
> **工作规则**：每完成一项就 `git commit` 并推送到 GitHub（origin/main），再开始下一项。

---

## 一、侧边栏左右互换的三个 bug

### 1. 翻转后聊天界面显示异常 ✅ 已修复（2026-10-10）

- **现象**：侧边栏左右互换（⌘\ / “Swap sidebar sides”）后，聊天界面渲染异常：内容透出背景、文字互相叠印、区域错位（见用户截图）。
- **根因（与第 2 条同根因，已修复）**：树布局重排（翻转/拖动换边）把顶部标签条**挪走但不改变尺寸**，`usePanelTitlebar` 的标题栏测量没有任何触发源 → `--panel-titlebar-left/right` 保持旧位置的值甚至从未设置。`tree-group.tsx` 左垫片 `width: var(--panel-titlebar-left, 100%)` 在变量缺失时回退 **100%**，整条标题栏内容被挤没/错位（聊天头部“异常”）。
- **修复**：`app/contrib/layout-sides.ts` 在 `$layoutTree` 变化后（双 rAF、每帧合并）派发 `TITLEBAR_CHROME_CHANGED_EVENT`，让所有标签条在移动后的那一帧重新测量。已在真实实例验证：翻转、开机恢复翻转布局、正常布局三种场景变量均正确落值。
- 截图中“透出背景/叠印”的另一半来自第 3 条 glass 分界缺陷（已同批修复）。

### 2. 翻转到右侧 + 最大化窗口 → 按钮无法点击 ✅ 已修复（2026-10-10，同第 1 条修复）

- **现象**：侧栏换到右边后，在最大化（全屏）窗口下界面按钮点不动，取消最大化才恢复。
- **根因（已修复）**：同第 1 条——翻转后标题栏测量失联，左垫片回退 100% 把标签条/按钮挤到零宽或压在不可命中区域下；窗口 resize（取消最大化）恰好触发 `measure()` 补测，所以“取消最大化就好了”。命中测试（`document.elementFromPoint` + `-webkit-app-region:drag` 原生吞点击扫描）在修复后四种状态组合均无遮挡/无吞点击。
- **排查记录**：曾排除首启安装/连接中遮罩（`z-setup`/`z-connecting`，仅启动期显示）、hover 才启用的标签关闭按钮（误报）。

### 3. 缩小窗口后“透明模糊 / 不透明”两种模式随机混搭 ✅ 已修复（2026-10-10）

- **现象**：侧栏换到左边后，缩小窗口，整个 UI 一部分透明模糊、一部分不透明，混在一起。
- **根因（已修复）**：glass 透明模式的分界线**不支持侧栏翻转**：
  - `apps/desktop/src/store/translucency.ts` → `measureRailEdge()` 计算 `--glass-rail-edge` 时只处理了 RTL（`direction === 'rtl'`），没有处理 `panesFlipped`；
  - `apps/desktop/src/styles.css` 的 `:root[data-hermes-glass][data-hermes-glass-scope='sidebar'] body` 用固定 `linear-gradient(to right, …)` 把“玻璃区 / 不透明区”按左右切分。
  - 侧栏在右边时：导轨的 `rect.right` 落到窗口右缘 → 分界值错误 → 玻璃/不透明落在错误的一侧，再叠加 `[data-glass-opaque]` 元素保持填充，视觉上就是“随机混搭”。
- **修复方向**：按导轨**实际几何位置**（哪一侧就走哪一侧）镜像分界：设置如 `data-hermes-glass-rail="right"` 的根属性 + 对应 `to left` 渐变规则；同时覆盖 RTL、翻转、拖拽换边三种情况（不要只判断 `panesFlipped`）。

---

## 二、聊天界面莫名“瞬移”到上面的对话（未修复）

- **现象**：聊天过程中，视图会莫名其妙跳到上面的对话/消息（滚动位置突然回跳），没有明显操作规律，偶发。
- **排查方向**（均为假设，未验证）：
  - 流式输出/图片加载后的滚动锚定（scroll anchoring）或“保持在底部”逻辑在某些时机把视口复位到上方；
  - 消息列表虚拟化/重渲染时滚动位置恢复错误；
  - “回到最新”按钮的 reveal、或某处 `scrollIntoView` 被意外触发；
  - 与会话切换/恢复（滚动位置持久化）的竞态。
- **状态**：未修，未排查。需要稳定复现路径（发生时机、是否在流式输出中、是否点了某个按钮）再定位。

---

## 三、提高对话性能：对话多了容易卡（未开始）

- **需求**：聊天对话（消息）变多后界面容易卡顿，需要优化长对话下的流畅度。
- **现状摸底**（已初步调研，未改动）：
  - 对话列表已有一套深度性能工程：`app/chat/transcript-window.ts`（按渲染权重的窗口截断、粘性切线、会话级 memo）、`thread/list.tsx` 的 RENDER_BUDGET / 首帧预算 / `content-visibility` 离屏跳过、多窗格共享预算——说明剩余热点在窗口机制之外。
  - 可疑方向：行级组件的全局 store 订阅放大（如 `assistant-message.tsx` 里每条消息订阅 `$currentModel`/`$connection`/`$activeGatewayProfile`，全局状态一变全量行重渲染）、markdown/代码高亮重复解析、滚动锚定开销（可能与“瞬移”同根因）。
- **怎么入手**：仓库自带性能基准工具 `apps/desktop/scripts/perf/`（`npm run perf -- --spawn`，合成消息驱动、不需要 LLM；场景含 `transcript`（长对话挂载）、`stream-history`、`live-window`、`session-switch`；`baseline.json` 做回归门禁，`--cpuprofile` 做热点归因）。先跑基准拿数据 → 定位热点 → 改 → 复测对比。
- **状态**：未开始（基准第一次运行被打断）。

---

## 四、把“现场下载”的依赖去掉（新需求）

**需求**：不要依赖运行时在线下载的组件——现在是“用的时候现下载”，不是安装包自带的。要么改成自带，要么去掉这项依赖。

已核实涉及“现场下载”的位置：

| 组件 | 位置 | 现状 |
|---|---|---|
| 语言服务器（pyright 1.1.414、typescript-language-server 6.0.1） | `apps/desktop/electron/ide/lsp/catalog.ts`、`lsp/install.ts` | 代码注释原文：“They are not bundled in the installer; the manager downloads these exact versions on first use.” 首次使用时在线下载 |
| 调试适配器（vscode-js-debug） | `apps/desktop/electron/ide/dap/manager.ts` | 运行时下载，失败只能报 unavailable |
| 扩展市场（Open VSX 的 vsix） | `apps/desktop/electron/ide/extensions/openvsx.ts` | 安装扩展时在线下载（市场性质，是否保留待定） |

- **待决策**：内置进安装包（离线可用）还是直接去掉该能力（例如不带语言服务器，编辑器只做纯文本高亮）。
- **实现要点**：改 `install.ts` / `manager.ts` 的解析逻辑（找本地自带目录优先于下载），安装包打包相应资源，`catalog.ts` 的版本常量随之调整。

---

## 附：环境备忘（不影响仓库代码）

- 本机 `node_modules` 曾有 8 个包解压损坏（`radix-ui`、`shiki`、`streamdown`、`@streamdown/code`、`@streamdown/math`、`remend`、`cross-env`、`@audiowave/react`、`@nous-research/ui`）——这是之前大批 vitest 测试文件“无法运行”的根因，**已修复**。
- 仓库基线上还有约 43 个既有测试失败（侧栏翻转布局、`title=` 扫描等），在改动前的 HEAD 上即失败，与已完成的改动无关。

---

## 已完成（供对照，均已验证）

1. 代码校验不瞎报错（关闭 Monaco 内置误报检查器；LSP 严重级别映射修复）
2. HERMES AGENT 字样固定在页面 + 雕像背景铺满整页
3. IDE 区域分界改色差区分、分隔条鼠标靠近才显示
4. 扩展面板图标 + 点击在文件预览区展示详情
5. 有问题的文件名标红 + 右侧错误数量（文件树 + 编辑器标签页）
6. 网关状态“一直检查中”修复（改用与聊天界面相同的就绪度探测）
7. 审查不再抢占对话窗口 + 打开时强制刷新（空列表修复）
8. 拖拽文件进对话框改为文件胶囊（行引用/链接保留行内）
