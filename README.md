# Hermes Local

基于 [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) 的**私人本地化**版本，面向本机 Windows 桌面与终端使用。

本仓库为私有 fork，与 Nous Research 无隶属关系。使用问题请勿向上游反馈。

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
git clone https://github.com/argb6/hermes-local.git
cd hermes-local

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

上游项目 [Hermes Agent](https://github.com/NousResearch/hermes-agent) by [Nous Research](https://nousresearch.com)。完整能力与官方支持请使用上游仓库。
