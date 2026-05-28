---
description: 扫描本机各 AI agent 已安装的 MCP / plugin / skill
argument-hint: "[--sync] [--all] [--json]"
---

执行下面的 bash 命令并把原始输出展示给用户：

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/lib/cli.py scan "$@"
```

它会自动探测本机这些 agent 的配置目录，列出**已经安装**的条目：

- **Claude Code** — `~/.claude/{settings.json, plugins/, skills/}` + `~/.claude.json`
- **Codex** — `~/.codex/config.toml`（`[mcp_servers.*]`）
- **Cursor** — `~/.cursor/mcp.json` + 项目 `.cursor/mcp.json`
- **Gemini CLI** — `~/.gemini/settings.json`
- **Windsurf** — `~/.codeium/windsurf/mcp_config.json`
- **VS Code** — `~/.config/Code/User/mcp.json`

参数：

- `--sync`：把扫描结果上报到 AIForge 服务端，之后能在 Web 面板的 **Environment** 页看到（并与库里的 artifact 交叉比对，标出"已装"）
- `--all`：连未检测到的 agent 也列出来（标记 ○）
- `--json`：输出原始 JSON

安全说明：扫描**只读文件、绝不执行**任何被发现的命令；MCP 的 `env` 密钥值会被脱敏成 `***`（只保留 key 名），上报时不会泄露 API key。
