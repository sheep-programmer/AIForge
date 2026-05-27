---
description: 在 AIForge 库里搜索 skill
argument-hint: <query>
---

执行下面的 bash 命令并展示输出：

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/lib/cli.py search "$@"
```

`"$@"` 会把用户输入的所有关键词作为查询。优先使用服务端的 `/v1/skills?q=`；
若服务端不可达，则自动切到本地缓存关键词检索，并在输出中明确标注「搜索来源：本地缓存」。

支持 `--limit N` 限制返回条数（默认 10）。
