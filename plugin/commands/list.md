---
description: 列出 AIForge 库中的 artifact（skill / mcp / plugin）
argument-hint: [--type=skill|mcp|plugin] [--tag=NAME] [--installed]
---

执行下面的 bash 命令并展示输出：

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/lib/cli.py list "$@"
```

参数说明：

- `--type=skill|mcp|plugin`：只显示指定类型的 artifact。
- `--tag=<name>`：按 tag 过滤。
- `--installed`：只显示本地已安装的 mcp / plugin（扫描 `~/.claude/settings.json` 中
  的 `mcpServers` 以及 `~/.claude/plugins/` 目录），方便确认当前环境状态。

输出每条 artifact 的类型、名称、第一行描述、id 和 tag 列表，便于后续用
`/aiforge:install <id>` 或 `/aiforge:tag <id> ...` 操作。
