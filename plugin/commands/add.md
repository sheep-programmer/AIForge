---
description: 入库一个 GitHub skill 仓库
argument-hint: <github-url>
---

执行下面的 bash 命令并展示输出：

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/lib/cli.py add "$1"
```

参数 `$1` 是用户提供的 GitHub 仓库 URL，例如：
`/aiforge:add https://github.com/obra/superpowers-skills`

命令会：

1. 调 `POST /v1/ingest`，返回 `job_id` 与初始 `status`
2. 打印查询进度用的 GET URL（`/v1/ingest/{job_id}`）

如果服务端不可达，告知用户先启动服务端。
