# AIForge Claude Code 插件

为 Claude Code 智能推荐并注入最相关的 skill。每次提问前，hook 会先咨询本地 AIForge 服务端，把 top-N 个真正匹配本次任务的 skill 注入到上下文。

## 安装

```bash
cd plugin/
./install.sh --server http://localhost:8765
```

安装脚本会：

1. 把当前目录链接到 `~/.claude/plugins/aiforge/`
2. 在 `~/.config/aiforge/config.toml` 写入服务端地址等配置
3. 检查 `python3`（3.11+）是否可用

无需手动改 `~/.claude/settings.json`：Claude Code 会通过 plugin manifest 自动注册 hook。

## 用法

直接与 Claude Code 对话。每一轮提问，hook 会在 250ms 内问服务端"这次最该用哪几个 skill？"并把它们以 `<aiforge-recommendations>` XML 块的形式注入到 prompt 上下文。

服务端不可达时，自动切换到本地缓存兜底（基于 SQLite + 简易关键词检索）。**每个 session 仅警告一次**，避免刷屏。

## 自带命令

| 命令 | 作用 |
|------|------|
| `/aiforge:status` | 显示服务端、缓存、reranker 状态 |
| `/aiforge:add <github-url>` | 把一个 GitHub skill 仓库入库 |
| `/aiforge:search <query>` | 在 skill 库里搜索 |
| `/aiforge:sync` | 刷新本地兜底缓存 |
| `/aiforge:config` | 显示当前配置 |

详见上层目录的 [README.md](../README.md)。
