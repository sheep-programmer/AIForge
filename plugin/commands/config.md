---
description: 显示或修改 AIForge 插件配置
argument-hint: [--set key=value]
---

执行下面的 bash 命令并展示输出：

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/lib/cli.py config $@
```

用法示例：

- `/aiforge:config` —— 只打印当前配置
- `/aiforge:config --set server_url=http://host:8765`
- `/aiforge:config --set top_k=5`
- `/aiforge:config --set enabled=false` —— 暂时关闭 hook
- `/aiforge:config --set timeout_ms=400`

可识别的字段：`server_url` / `top_k` / `max_tokens` / `enabled` / `timeout_ms` / `fallback_warn_once`。
