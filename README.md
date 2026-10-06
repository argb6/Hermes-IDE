<p align="center">
  <img src="assets/banner.png" alt="Hermes Agent" width="100%">
</p>

# Hermes Local — Hermes 原仓库 · 本地化版

> ⚠️ **本仓库是 [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)（Hermes Agent 官方原仓库）修改而来的衍生版本**，为**私人、本机（本地化）部署**裁剪而成。本仓库为私有仓库，非官方项目，与 Nous Research 无隶属关系；使用问题请勿向上游反馈。

**Hermes Agent** 是 Nous Research 开源的自进化 AI 智能体框架（终端 CLI/TUI、桌面应用、IDE 接入），支持 20+ 模型提供商与插件/技能生态。本仓库在原仓库基础上做了本地化裁剪，适合单机桌面场景长期使用。

- 🔗 上游原仓库：<https://github.com/NousResearch/hermes-agent>
- 📖 原版文档：<https://hermes-agent.nousresearch.com/docs/>
- 📄 **开源许可：MIT License，与原仓库完全一致**（见 [LICENSE](./LICENSE)，版权归 Nous Research；本 fork 的改动同样以 MIT 发布）
- 🀄 原版中文说明：[README.zh-CN.md](./README.zh-CN.md)

---

## 与原仓库的差异（本地化改动）

本仓库 = 官方 Hermes 原仓库 + 以下改动：

| 类别 | 改动 |
|---|---|
| **更新** | 移除 `hermes update`——不再跟踪官方更新，**源码归本地所有**；官方仓库仅保留为 `upstream` 远端，被动更新提醒已关闭 |
| **消息网关** | 移除 `hermes gateway`（Telegram / Discord / WhatsApp / 飞书等全部消息平台入口），photon 等平台 CLI 一并下线 |
| **消息面命令** | 移除 `whatsapp`、`whatsapp-cloud`、`slack`、`send`、`pairing`、`peer` |
| **杂项命令** | 移除 `portal`（Nous Portal 账号）、`egress`（出站防火墙）、`codex-runtime`、`moa` |
| **仓库瘦身** | 移除 tests / evals、Docker / Nix / GitHub CI 配置、贡献者文档、文档站点源码等运行时无关文件（约 120MB） |

**完整保留**：桌面应用、终端 CLI / TUI 聊天、技能系统（Skills Hub）、**插件市场**（`hermes plugins` 及插件目录）、模型切换与备用提供商、定时任务（cron）、MCP、浏览器工具、会话/记忆、审批系统等核心能力。

被移除的命令在 `hermes --help` 中标注 `(removed)`，执行时只打印说明、不会运行任何逻辑。

---

## 下载与部署

### 环境要求

- **Windows 10/11**（上游同样支持 macOS / Linux / WSL2，本 fork 仅在 Windows 验证）
- **Git**
- 国内网络需要可用的 **HTTP 代理**（克隆与依赖下载依赖 GitHub）

### 1. 克隆仓库

```bash
git clone https://github.com/argb6/hermes-local.git
cd hermes-local
```

### 2.（国内网络）配置代理

```bash
# git 走代理（端口换成你自己的）
git config --global http.proxy  http://127.0.0.1:7890
git config --global https.proxy http://127.0.0.1:7890
```

```powershell
# 让新开的终端 / Hermes 进程也走代理（写入用户环境变量）
[Environment]::SetEnvironmentVariable('HTTP_PROXY',  'http://127.0.0.1:7890', 'User')
[Environment]::SetEnvironmentVariable('HTTPS_PROXY', 'http://127.0.0.1:7890', 'User')
[Environment]::SetEnvironmentVariable('NO_PROXY',    'localhost,127.0.0.1,::1', 'User')
```

验证：`curl -x http://127.0.0.1:7890 https://github.com` 返回 `200` 即通。

### 3. 准备 Python 环境

仓库自带 PM 工作流，激活脚本会自动准备 Python 3.14 工具链并同步依赖（首次较慢）：

```powershell
# PowerShell（Windows）
. .\activate.ps1
hermes --version
```

```bash
# bash（Linux / macOS / WSL2 / Git Bash）
source ./activate
hermes --version
```

### 4. 安装前端 / 桌面依赖

```bash
npm ci
```

### 5. 启动

```bash
hermes desktop     # 桌面应用（首次运行自动构建，耗时较长属正常）
hermes             # 终端聊天（在已激活的环境中）
```

构建异常 / 更新后校验失败时：

```bash
hermes desktop --force-build
```

### 6. 配置模型

```bash
hermes model       # 选择提供商与模型（OpenRouter / OpenAI / DeepSeek / 小米 MiMo 等）
hermes setup       # 完整配置向导
hermes doctor      # 环境体检
```

- 密钥存放在 `HERMES_HOME`（默认 `~/.hermes`，可设环境变量 `HERMES_HOME` 指到任意目录）下的 `.env`
- 各项设置在同目录 `config.yaml`（修改请用 `hermes config set KEY VAL`）

---

## 后续如何更新（手动、可选）

本 fork **不会自动更新，也没有 `hermes update` 命令**。想同步上游时手动操作：

```bash
git fetch upstream     # 上游远端已配置：https://github.com/NousResearch/hermes-agent.git
git merge --ff-only upstream/main

. .\activate.ps1       # 同步 Python 依赖（bash 环境用 source ./activate）
npm ci                 # 同步 JS 依赖
hermes desktop --force-build   # 需要桌面时重建
```

> 上游合并可能与本地裁剪产生冲突（被移除命令的注册点），解决冲突后删除对应 stub 或重新应用裁剪即可。

---

## 常见问题

| 问题 | 处理 |
|---|---|
| 桌面启动失败 / 构建校验失败 | `hermes desktop --force-build` |
| GitHub 连不上 / 更新检查失败 | 确认第 2 步代理生效：`curl -x http://127.0.0.1:7890 https://github.com` |
| 想知道环境哪里出问题 | `hermes doctor`；日志在 `HERMES_HOME/logs/` |

---

## 致谢与许可

- 上游项目：[Hermes Agent](https://github.com/NousResearch/hermes-agent) by [Nous Research](https://nousresearch.com)
- **许可：MIT**，与原仓库对齐，见 [LICENSE](./LICENSE)（原版权归属 Nous Research 保持不变；本 fork 的裁剪与文档改动同样按 MIT 授权）
- 本 fork 仅供私人本地部署使用；如需完整功能或想给上游提建议，请使用[原仓库](https://github.com/NousResearch/hermes-agent)。
