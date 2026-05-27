---
description: 显示 AIForge 服务端状态
---

执行下面的 bash 命令并把原始输出展示给用户：

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/lib/cli.py status
```

它会打印：

- 当前 `server_url`、`enabled` 配置
- 服务端是否可达（含 HTTP 往返耗时）
- 服务端版本、skill 总数、reranker 是否就绪
- 本地缓存路径以及缓存的 skill 数量

如果服务端不可达，请提示用户：
1. 启动 `cd aiforge/server && docker compose -f docker/docker-compose.yml up -d`，或
2. 运行 `/aiforge:sync` 以便兜底模式至少有可用数据。
