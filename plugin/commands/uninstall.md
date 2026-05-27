---
description: 卸载一个 artifact（mcp 从 settings.json 移除；plugin 删除目录）
argument-hint: <artifact_id>
---

执行下面的 bash 命令并展示输出：

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/lib/cli.py uninstall "$@"
```

参数 `$1` 是 artifact id。命令会：

1. 调 `GET /v1/artifacts/{id}` 拿到 artifact 名称和类型；
2. 按 `artifact_type` 分发：
   - **mcp**：从 `~/.claude/settings.json` 的 `mcpServers` 中删除该 key（带备份）；
   - **plugin**：删除 `~/.claude/plugins/<name>/` 整棵目录；
   - **skill**：skill 不在本地常驻，无需卸载，直接给出提示。

操作前会自动备份 `settings.json` 到 `settings.json.bak.<unix_ts>`。
