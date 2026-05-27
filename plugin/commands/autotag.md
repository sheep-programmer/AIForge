---
description: 触发服务端对 artifact 自动打标，并轮询直至完成
argument-hint: [--ids=A,B,...]
---

执行下面的 bash 命令并展示输出：

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/lib/cli.py autotag "$@"
```

参数：

- `--ids=A,B,...`：可选，只对这些 artifact id 跑自动打标；不传则对所有尚未打过
  auto tag 的 artifact 全量跑。

命令流程：

1. `POST /v1/admin/autotag` 提交任务，拿到 `job_id`；
2. 每 2 秒 `GET /v1/admin/autotag/{job_id}` 轮询一次状态，
   打印 `processed/total` 进度；
3. 状态变为 `done` / `completed` / `finished` 时退出 0；
   变为 `failed` / `error` 时退出 1；
4. 达到 `--max-polls`（默认 60，即约 2 分钟）仍未完成则告警退出。
