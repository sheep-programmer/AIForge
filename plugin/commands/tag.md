---
description: 为 artifact 整体替换 tag 集
argument-hint: <artifact_id> <tag1,tag2,...>
---

执行下面的 bash 命令并展示输出：

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/lib/cli.py tag "$@"
```

参数：

- `$1`：artifact id（可以从 `/aiforge:list` 获得）。
- `$2`：逗号分隔的 tag 名称列表，例如 `browser-automation,testing`。

命令调用 `PUT /v1/artifacts/{id}/tags`，会**整体替换**该 artifact 的 tag 集合
（不是追加）。返回更新后的 tag 列表。

如果想保留旧 tag，请先 `/aiforge:list --tag=...` 看一下，再传入完整列表。
