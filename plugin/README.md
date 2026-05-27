# AIForge — Claude Code 插件

为 Claude Code 智能推荐并注入最相关的 skill。**零第三方 Python 依赖**，只需 Python 3.11+。

## 介绍

每次用户提问，插件的 `UserPromptSubmit` hook 会：

1. 把 prompt 转发给本地 AIForge 服务端（默认 `http://localhost:8765`）；
2. 拿到 top-K 推荐 skill，渲染成 `<aiforge-recommendations>` XML 块；
3. 通过 stdout 用 Claude Code hook 协议把它注入到上下文。

服务端不可达？自动切到本地 SQLite 缓存 + 关键词检索兜底，**每个 session 仅警告一次**。两边都没东西就静默放过，不挡用户。

## 安装

```bash
cd plugin/
./install.sh --server http://localhost:8765
# 想要修改源码立即生效：
./install.sh --server http://localhost:8765 --dev
```

脚本会做：

- 把 `plugin/` 复制（或 symlink）到 `~/.claude/plugins/aiforge/`
- 在 `~/.config/aiforge/config.toml` 写入 `server_url` 等配置
- 检查 `python3` 版本 >= 3.11（需要 `tomllib`）
- **不** 修改 `~/.claude/settings.json`，Claude Code 会通过 plugin manifest 自动加载 hook

安装后请重启 Claude Code，然后在会话里执行 `/aiforge:status` 检查连通性。

## 用法

直接和 Claude Code 对话即可。hook 会悄悄运行，stderr 会留一行调试日志：

```
[aiforge] server 142ms · superpowers:tdd, impeccable:polish, ljg-skills:concept-anatomist
```

或在兜底模式：

```
[aiforge] fallback 18ms · skill-a, skill-b
```

## Slash 命令

| 命令 | 说明 |
|------|------|
| `/aiforge:status` | 检查服务端连通性、版本、skill 总数、reranker、本地缓存大小 |
| `/aiforge:add <github-url>` | 触发服务端入库一个 GitHub skill 仓库 |
| `/aiforge:search <query>` | 关键词搜索 skill；服务端不可用时自动用本地缓存 |
| `/aiforge:sync` | 把服务端 skill 全量拉到 `~/.config/aiforge/local-cache.sqlite` |
| `/aiforge:config [--set key=value]` | 查看 / 修改插件配置 |

## 配置

`~/.config/aiforge/config.toml`：

| 字段 | 默认 | 说明 |
|------|------|------|
| `server_url` | `http://localhost:8765` | AIForge 服务端地址 |
| `top_k` | `3` | 每次注入几个 skill |
| `max_tokens` | `4000` | 返回 body 的总 token 预算 |
| `enabled` | `true` | 设为 `false` 临时关闭 hook |
| `fallback_warn_once` | `true` | 兜底警告每 session 只发一次 |
| `timeout_ms` | `250` | 调服务端的总超时（含网络） |

可以用 `/aiforge:config --set top_k=5` 类命令修改单项。

## 故障排查

**hook 没生效（提问后 stderr 没 `[aiforge]` 日志）**

1. 确认 `~/.claude/plugins/aiforge/` 存在且包含 `.claude-plugin/plugin.json`。
2. 确认 `~/.claude/plugins/aiforge/hooks/on-user-prompt` 可执行（`chmod +x`）。
3. 重启 Claude Code，让它重新扫描插件。

**`[aiforge] 服务端不可达…`**

- 启动服务端：`cd aiforge/server && docker compose -f docker/docker-compose.yml up -d`
- 或者运行 `/aiforge:sync` 让本地兜底至少有数据

**`tomllib` 找不到**

需要 Python 3.11+。可设置 `AIFORGE_PYTHON=/path/to/python3.11` 让 hook 使用指定解释器。

**Hook 太慢拖累输入**

降低超时（`/aiforge:config --set timeout_ms=150`）或临时禁用（`--set enabled=false`）。

## 设计要点

- **零第三方 Python 依赖**：仅 `urllib` / `sqlite3` / `json` / `tomllib` / `argparse`。
- **250ms 总超时**：hook 不能拖累用户输入；超时一律走兜底。
- **`SimpleSearcher`**：纯 Python BM25-lite，2K 字符 body 截断 + name/desc 加权 (3x/2x)。
- **Session 警告去重**：用 `~/.cache/aiforge/session-state.json` 记录已警告的 session ID。
- **注入格式**：`<aiforge-recommendations>` XML 块；兜底模式额外加 `<aiforge-fallback-mode>true</aiforge-fallback-mode>`，方便 agent 与下游工具识别。

## 目录结构

```
plugin/
├── .claude-plugin/
│   ├── plugin.json        # Claude Code plugin manifest
│   └── README.md
├── hooks/
│   └── on-user-prompt     # bash 入口（chmod +x），转交给 hook_entry.py
├── lib/
│   ├── hook_entry.py      # hook 主流程
│   ├── client.py          # urllib HTTP 客户端
│   ├── fallback.py        # SQLite 缓存 + SimpleSearcher
│   ├── injector.py        # 渲染注入 XML 块
│   ├── config.py          # config.toml 读写
│   └── cli.py             # /aiforge:* 命令实现
├── commands/              # 5 个 slash command 的 markdown
├── skills/
│   └── aiforge/SKILL.md # 插件自描述
├── local-fallback/        # （保留目录，缓存实际写到 ~/.config/aiforge/）
├── install.sh
└── README.md              # 本文件
```
