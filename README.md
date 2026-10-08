# Hermes-IDE

基于 [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) 的**私人本地化**版本，面向本机 Windows 桌面与终端使用。

仓库：<https://github.com/argb6/Hermes-IDE>  
本仓库为私人 fork，与 Nous Research 无隶属关系。使用问题请勿向上游反馈。

- 上游：<https://github.com/NousResearch/hermes-agent>
- 文档：<https://hermes-agent.nousresearch.com/docs/>
- 许可：[MIT](./LICENSE)（与上游一致）

## 能做什么

- **桌面应用**（IDE 布局：文件 / 编辑 / 对话 / Git）
- **终端 CLI / TUI** 聊天
- 模型切换、技能（Skills）、插件、定时任务、MCP、浏览器工具、会话记忆

密钥与配置在 `HERMES_HOME`（默认 `~/.hermes`）：`.env` 放密钥，`config.yaml` 放行为设置。

## 环境

- Windows 10 / 11（本 fork 主要在此验证）
- Git、可用的网络（国内建议开 HTTP 代理后再克隆 / 装依赖）

## 从源码安装

```powershell
git clone https://github.com/argb6/Hermes-IDE.git
cd Hermes-IDE

# 国内网络可先设代理（端口按你的客户端改）
# git config --global http.proxy  http://127.0.0.1:7890
# git config --global https.proxy http://127.0.0.1:7890

. .\activate.ps1
hermes --version

npm ci
hermes desktop          # 首次会构建，较慢属正常
# hermes                # 终端聊天
```

常用命令：

```powershell
hermes model            # 选模型 / 提供商
hermes setup            # 配置向导
hermes doctor           # 环境检查
hermes desktop --force-build   # 桌面构建异常时强制重建
```

## Windows 安装包（可选）

可用 NSIS 安装包安装桌面应用。安装时**自选路径**；向导会提示：继续安装将**清空该目录下全部内容**，确认后再解压。

本地打包（开发机）：

```powershell
cd apps\desktop
$env:HERMES_DESKTOP_WIN_TARGET = 'nsis'
npm run dist:win:nsis
```

产物在 `apps/desktop/release/`（或你设置的 `HERMES_DESKTOP_RELEASE_DIR`）。

## 故障排查

| 情况 | 处理 |
|---|---|
| 桌面起不来 / 校验失败 | `hermes desktop --force-build` |
| GitHub / 依赖下不动 | 检查代理：`curl -x http://127.0.0.1:7890 https://github.com` |
| 环境不明 | `hermes doctor`；日志在 `%HERMES_HOME%\logs\` |

## 致谢

本仓库是私人本地化 fork，**并非** Nous Research 官方产品。完整能力与官方支持请使用上游仓库。

### 上游

- [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) — Hermes Agent 原项目（MIT）by [Nous Research](https://nousresearch.com)

### 本 fork 桌面 / IDE 借鉴与依赖（部分）

布局与交互参考了常见代码编辑器产品；下列为代码或资源中有明确来源的项目：

| 项目 | 用途 |
|---|---|
| [microsoft/vscode](https://github.com/microsoft/vscode) | IDE 布局参考（活动栏、侧栏、编辑区、底栏等） |
| [material-extensions/vscode-material-icon-theme](https://github.com/material-extensions/vscode-material-icon-theme) | 文件树图标主题（MIT，见 `apps/desktop/src/assets/file-icons/`） |
| [codemirror/dev](https://github.com/codemirror/dev) / CodeMirror 6 | 中间源码编辑器 |
| [xtermjs/xterm.js](https://github.com/xtermjs/xterm.js) | 内嵌终端 |
| [electron/electron](https://github.com/electron/electron) | 桌面壳 |
| [assistant-ui/assistant-ui](https://github.com/assistant-ui/assistant-ui) | 对话消息 UI |
| [cli/cli](https://github.com/cli/cli)（`gh`） | GitHub 面板通过本机 GitHub CLI 调用，不走托管 MCP |

另有 Electron / React / Radix / nanostores 等常规开源依赖，详见各目录 `package.json` 与上游许可。图标、编辑器等第三方资源的版权归原作者所有；本 fork 的裁剪与打包由 **argb** 维护。
