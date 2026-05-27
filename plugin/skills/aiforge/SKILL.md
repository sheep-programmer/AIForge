---
name: aiforge
description: AIForge 自描述。当用户问 "aiforge 怎么用" / "如何添加 skill 库" / "服务端在哪" / "本地兜底是怎么工作的" 时使用。
---

# AIForge 自描述

AIForge 是一个 **skill 路由器**：每次用户提问前，`UserPromptSubmit` hook 会先咨询本地的 AIForge 服务端（`http://localhost:8765`），从全部 skill 库里挑出 top-N 个真正匹配本次任务的 skill，并以 `<aiforge-recommendations>` XML 块的形式注入到上下文。

读到这个 skill 通常意味着用户在询问 AIForge 本身。下面是排障与常用操作清单。

## 常用 slash 命令

| 命令 | 用途 |
|------|------|
| `/aiforge:status` | 服务端是否可达？skill 总数？reranker 是否启用？本地缓存大小？ |
| `/aiforge:add <github-url>` | 触发服务端入库一个 GitHub skill 仓库 |
| `/aiforge:search <query>` | 在 skill 库里关键词搜索 |
| `/aiforge:sync` | 把服务端 skill 同步到本地兜底缓存 |
| `/aiforge:config` | 显示或修改插件配置 |

## 配置文件

`~/.config/aiforge/config.toml`（如不存在则使用默认值）：

```toml
server_url = "http://localhost:8765"
top_k = 3
max_tokens = 4000
enabled = true
fallback_warn_once = true
timeout_ms = 250
```

可用 `/aiforge:config --set key=value` 修改单项。

## 工作流程

1. **服务端可达**：hook 在 250ms 内拿到推荐 → 注入 → 用户看到 `[aiforge] server 142ms · skill-a, skill-b, skill-c` 之类的 stderr 日志。
2. **服务端不可达**：自动切到 `~/.config/aiforge/local-cache.sqlite` 上的本地关键词检索（`SimpleSearcher`，BM25-lite）。注入块会带 `<aiforge-fallback-mode>true</aiforge-fallback-mode>` 标记。**每个 session 仅警告一次**。
3. **本地缓存也为空**：hook 变 no-op，stderr 提示用户启动服务端或 `/aiforge:sync`。

## 常见问题

**Q: 提问后没看到 skill 注入？**
1. 跑 `/aiforge:status` 检查服务端。
2. 检查 `~/.config/aiforge/config.toml` 里 `enabled = true`。
3. 看 stderr 是否有 `[aiforge] …` 日志，没有就说明 hook 没被 Claude Code 触发，确认插件已安装到 `~/.claude/plugins/aiforge/`。

**Q: 想暂时关掉 hook？**
`/aiforge:config --set enabled=false`，下一轮起 hook 直接 no-op。

**Q: 怎么加新的 skill 仓库？**
`/aiforge:add https://github.com/owner/repo` —— 服务端自动 shallow clone、解析 SKILL.md、向量化入库。完成后建议 `/aiforge:sync` 更新本地缓存。

**Q: 服务端跑哪儿？**
默认 `http://localhost:8765`（FastAPI + SQLite + sqlite-vss）。改 server_url 即可指向远程实例。

**Q: 推荐结果不靠谱怎么办？**
1. 确认服务端的 reranker 已启用（`/aiforge:status` 看 `reranker: on`）。
2. 提高 `top_k`：`/aiforge:config --set top_k=5`。
3. 用 `/aiforge:search <关键词>` 看库里到底有什么。

## 相关文件

- 插件 manifest: `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`
- Hook 入口: `${CLAUDE_PLUGIN_ROOT}/hooks/on-user-prompt`
- Python 主逻辑: `${CLAUDE_PLUGIN_ROOT}/lib/hook_entry.py`
- 配置: `~/.config/aiforge/config.toml`
- 本地缓存: `~/.config/aiforge/local-cache.sqlite`
- Session 状态: `~/.cache/aiforge/session-state.json`
