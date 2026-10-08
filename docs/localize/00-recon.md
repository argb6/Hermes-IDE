# 阶段0 摸底报告（00-recon.md）

> 日期：2026-10-07　仓库：`argb6/Hermes-IDE`（曾用名 `hermes-local`；main = 9c78a45）　基线：官方 Hermes 上游已裁剪多轮，**已完成清单见计划 §0.1，本文不重复**。
> 本文对应计划 §3「阶段0：摸底」的 5 项产出，外加 §5.6 两条建议的初步摸底。

## 1. 仓库结构

| 目录 | 作用 | 处置 |
|---|---|---|
| `hermes_cli/` | 命令行入口、配置、web 后端（serve）、各子命令 | **核心必留** |
| `agent/` | 智能体主循环、工具执行、技能/记忆调度 | **核心必留** |
| `apps/desktop/` | 桌面应用（Electron + React，`electron-builder` 打包） | **核心必留** |
| `ui-tui/` | 终端 TUI（`hermes --tui`，npm workspace） | 保留（计划定过别删） |
| `web/` | Web 管理面板前端（`hermes dashboard`，npm workspace） | 保留（后端 serve 被桌面复用） |
| `gateway/` | 消息网关引擎 | 命令已删，但被 config/cron/dashboard 引用 → **文件保留（死代码）**，阶段2深删前必须先解引用 |
| `plugins/` | 功能插件（浏览器、图像、记忆等 = 插件市场货源）+ `platforms/`（22 个消息适配器） | 功能插件**保留**；`platforms/` 已不可达，**待阶段2深删**（同样要先解 config 引用） |
| `plugin-catalog/` `pm/` | 插件市场目录与插件管理器 | **保留（用户定过：插件市场别删）** |
| `skills/` `optional-skills/` | 内置技能 + 官方技能画廊离线源 | **核心必留** |
| `locales/` | 界面多语言（含 zh） | **必留** |
| `scripts/` | 构建/维护脚本（`node scripts/build.mjs` 等） | 必留 |
| tests / evals / Docker / Nix / CI / 文档站 | 运行时无关 | **已删**（见计划 §0.1） |

配置加载：`config.yaml`（设置）+ `.env`（密钥）在 `HERMES_HOME`（本机为 `D:\hermes`）；修改走 `hermes config set`，不手编。

## 2. 联网点清单

| # | 联网点 | 现状 | 处置 |
|---|---|---|---|
| 1 | 模型 API（`api.xiaomimimo.com` 等用户配置的提供方） | 使用中 | **必留**（这是本体） |
| 2 | 插件市场目录 `hermes-agent.nousresearch.com/docs/api/plugin-catalog.json` | 在用 | **必留（用户定过）** |
| 3 | 技能中心（GitHub API 仓库列表、clawhub.ai 提交链接等） | 在用 | 保留，但按 §5.6-1 **简化** |
| 4 | GitHub `upstream` 拉取 | 手动、走代理（127.0.0.1:7890） | 保留为手动能力；`hermes update` 已删 |
| 5 | 共享指标（遥测） | **发送开关已删、强制关**；本地收集开关保留 | 默认关，不外发 |
| 6 | Nous Portal / Hermes Cloud 登录 | 登录入口与 Cloud 卡片已删 | 残余代码（cloud 面板、连接注册表里的 cloud 项）**阶段2深清** |
| 7 | 各类文档链接（docs URL） | 仅点击时开浏览器 | 无害，保留 |
| 8 | 浏览器工具云后端（Browser Use 等） | 插件、需 API key | 不配置即不联网 |
| 9 | 模型目录缓存刷新 | 读**本地** `website/static/api/model-catalog.json`（已保留） | 离线 ✓ |

结论：断网可启动、可聊天（只连 1 号点时）；2/3 号点是用户明确要保留的市场能力。

## 3. 三套界面

| 界面 | 技术栈 | 怎么启动 | 怎么构建 |
|---|---|---|---|
| **Desktop（主力）** | Electron + React（`apps/desktop`），Python 后端 = `hermes_cli/web_server`（serve，随机端口 + 锁文件发现） | `hermes desktop` | 退出应用后 `hermes desktop --force-build`（内部 `node scripts/build.mjs` → electron-builder → `release/win-unpacked`） |
| TUI | Ink/Node（`ui-tui`） | `hermes --tui` | `npm ci` 即可 |
| Dashboard | React（`web`）+ FastAPI | `hermes dashboard`（默认 9119） | `npm ci` |

注意：Dashboard **无认证**，只应监听 `127.0.0.1`（现状如此）；serve 的锁文件发现机制依赖 `gateway-locks` 目录健康，ACL 损坏问题已于 10-07 修复。

## 4. Windows 安装 / 更新流程（现状）

- **安装（源码）**：`git clone` →（代理配置）→ `source ./activate.ps1`（PM 自动准备 Python 3.14 与依赖）→ `npm ci` → `hermes desktop`
- **更新**：`hermes update` **已删**；现状 = 计划 §7 **选项 A**（手动 `git pull origin main` + 重装依赖 + 桌面重建）。选项 B（重建私有更新源）待拍板
- **桌面更新**：桌面端自带更新入口已隐藏（设置→关于子页、右键菜单）；构建产物未签名 → SmartScreen 提示（阶段5 处理）
- **exe 安装包**：= 阶段5，基于仓库已有的 `electron-builder.config.cjs` 扩展，不引入新打包体系

## 5. 功能分类（增量部分，全量已完成项见计划 §0.1）

| 分类 | 项 |
|---|---|
| 【核心必留】 | 桌面/TUI/Dashboard 三界面、agent 主循环、技能系统、**插件市场**、技能中心（简化后）、cron、MCP、审批、会话/记忆、模型切换与 API key 提供方 |
| 【已删】 | update 命令、gateway 命令与消息平台 CLI、whatsapp/slack/send/pairing/peer、portal/egress/codex-runtime/moa、全部订阅 OAuth 卡片、设置里的 宠物/账单/密码管理器/账号/发送使用统计/Hermes Cloud 卡片（本轮） |
| 【默认关】 | 共享指标收集（本地）、浏览器云工具（无 key 不联网）、`updates.check=false` |
| 【待处理】 | gateway/platforms 死代码深删（要先解引用）、Hermes Cloud 残余面板与连接注册表项、HUD 模式简化（§5.6-1）、响应速度优化（§5.6-2） |

## 6. HUD 模式摸底（§5.6-1 前置）

- **入口**：标题栏图标 / `Ctrl+Shift+H`（`enterHud`/`exitHud`），悬浮小窗形态
- **附属机制**（= 简化候选，bug 高发面）：
  1. **手势辅助程序**：独立 helper 进程，`Ctrl+Alt` 轻按从任意应用唤出（有 `missingHelper`/`unavailable` 两类错误态——独立进程 + 全局钩子，最可疑）
  2. HUD 大小/位置状态的保存与恢复（`resetHudLayout`）
  3. HUD 手势设置页（`hud-modifier-settings`）
- **简化方向（待复现确认后定稿）**：优先砍 1（进程与钩子），其次简化 2 的恢复逻辑；保留"快捷键进出 + 可拖动"这一核心路径
- ⚠️ **待补充：具体 bug 现象**（怎么进的、看到什么错误/什么行为不对）——有现象才能对症简化

## 7. 响应速度摸底（§5.6-2 前置）

- **度量方法**：固定任务前后计时（如"问一个问题并改一个文件"），记录：首字延迟、工具调用次数、确认回合数、总时长
- **优化杠杆（按预期收益排序）**：
  1. 工具调用批量合并（一次往返做多件事）
  2. 减少确认/汇报回合（信任目录放宽审批；砍中间状态复述）
  3. 辅助任务轻量化（起标题/摘要走 auxiliary 轻量模型）
  4. 网络（代理已配好；模型 API 直连不受影响）
- **状态**：基线待桌面重建后测第一轮，结果写入本文件

## 8. 下一步（按顺序）

1. 桌面重建，让已完成的全部裁剪生效（需先退出应用）
2. HUD bug 现象补充 → 简化方案 → 实施
3. 固定任务计时基线 → 逐项优化
4. 阶段2 收尾深清（gateway/platforms、cloud 残余——需先解引用，逐项 commit）
