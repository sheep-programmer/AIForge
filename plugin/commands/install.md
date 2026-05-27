---
description: 安装一个 artifact（mcp 写入 settings.json；plugin git clone 到 ~/.claude/plugins）
argument-hint: <artifact_id> [--force]
---

执行下面的 bash 命令并展示输出：

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/lib/cli.py install "$@"
```

参数 `$1` 是 `/aiforge:list` 给出的 artifact id。命令会：

1. 调 `GET /v1/artifacts/{id}` 拿到 artifact 详情；
2. 按 `artifact_type` 分发：
   - **mcp**：把 `mcp_config` 写入 `~/.claude/settings.json` 的 `mcpServers.<name>`，
     写之前自动备份原文件到 `settings.json.bak.<unix_ts>`；
   - **plugin**：`git clone` 仓库到 `~/.claude/plugins/<name>/`；目录已存在时需要
     加 `--force` 才会覆盖；
   - **skill**：返回友好提示——skill 由推荐器在 prompt 命中时自动注入，无需手动安装。

任何失败都会打印中文错误并以非零退出码结束。
