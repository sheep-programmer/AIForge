---
description: 同步服务端 skill 列表到本地兜底缓存
---

执行下面的 bash 命令并展示输出：

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/lib/cli.py sync
```

它会：

1. 调 `GET /v1/skills?limit=1000`（自动分页）
2. 把所有 skill 写入 `~/.config/aiforge/local-cache.sqlite`
3. 输出写入条数

建议每次新增 skill 仓库或调整服务端配置后都跑一次，以便服务端宕机时兜底能挑到合理结果。
