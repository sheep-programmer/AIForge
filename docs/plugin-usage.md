# 插件用法

> [English version](plugin-usage.en.md)
> 关联：[快速上手](getting-started.md) · [Artifact 格式](artifact-format.md) · [项目主页](../README.md)

本文是 AIForge 插件的**完整使用手册**。前提：你已经按 [getting-started](getting-started.md)
跑通安装。如果你只想看「我有哪些 slash 命令」，跳到 [Slash 命令参考](#slash-命令参考)。

---

## 1. 插件到底做了什么

装好后，AIForge 插件做两件事：

1. **UserPromptSubmit hook**（`plugin/hooks/on-user-prompt`）—— 每次你按下 enter，
   hook 先把你的 prompt 转发给 `POST /v1/recommend`，服务端返回 top-N 个 artifact
   的完整 body，hook 把它们封装成 `<aiforge-recommendations>` XML 块通过 stdout
   注入到本轮上下文中。Claude 拿到时已经有了「该用哪几个 skill / MCP / plugin」
   的明确指引。
2. **10 个 slash 命令**（`/aiforge:*`）—— 让你直接浏览 artifact 库、入库新仓库、
   一键安装 MCP / plugin、打标签、触发自动打标。所有命令都封装在
   `plugin/lib/cli.py`，完全用 Python 标准库写成，零三方依赖。

服务端不可达时插件自动切到**本地兜底模式**（详见第 6 节），保证你的 prompt 永远
不会因为 hook 失败而被阻塞。

---

## 2. Hook 行为

### 2.1 注入什么

服务端返回的每条 artifact 会渲染成一个小节：

```
<aiforge-recommendations>
本次对话最相关的 skill（由 AIForge 自动筛选并注入，请优先使用）：

## 1. security-review
_审查代码中的 OWASP top 10 漏洞..._

> 选中理由：用户提问包含 "review" 与 "auth"，与本 skill 描述高度相关

<SKILL.md body...>

来源：https://github.com/obra/superpowers-skills

---

## 2. <下一个 artifact>
...
</aiforge-recommendations>
```

- 注入位置：hook 的 **stdout**，Claude Code 默认把它作为额外 context 拼到用户
  prompt 之前。
- 默认 `top_k = 3`，可在 [配置文件](#7-配置文件) 中调整。
- artifact 的 `body` 字段直接展开 —— `skill` 是 SKILL.md 正文、`plugin` 是 README、
  `mcp` 是 README 摘录（≤ 2000 字符）。

### 2.2 `[aiforge] ...` 摘要行

hook 在 **stderr** 打印一行摘要，不污染 Claude 的输入：

```
[aiforge] server 187ms · security-review, run-failing-tests, repo-explorer
[aiforge] fallback 12ms · security-review, write-tests
[aiforge] 推荐失败: HTTPConnection timeout
```

格式：`[aiforge] <mode> <elapsed_ms>ms · <name1, name2, ...>`，其中 `mode` 是
`server` 或 `fallback`。

### 2.3 超时与失败

- HTTP 超时上限：默认 `timeout_ms = 250`（毫秒）
- 服务端 5xx / 网络错误：自动尝试本地兜底
- 本地兜底也失败：hook 退化为 no-op，原 prompt 原样透传给 Claude
- 兜底首次触发时，stderr 会打印一行警告（受 `fallback_warn_once` 控制）

---

## 3. Slash 命令参考

所有命令都用 `/aiforge:<name>` 触发；底层都是
`python3 ${CLAUDE_PLUGIN_ROOT}/lib/cli.py <name>`。

### 3.1 `/aiforge:status`

显示服务端连通性、本地缓存大小、当前配置摘要。

```
> /aiforge:status
AIForge 状态
  配置:        http://localhost:8765 (enabled=True)
  本地缓存:    ~/.config/aiforge/local-cache.sqlite
  缓存 skill 数: 312
  服务端:      可达 (HTTP 23ms)
    版本:        0.2.0
    skill 总数:  1284
    reranker:    on
```

调用：`GET /v1/health`。服务端不可达时退出码非 0，并提示运行 `/aiforge:sync`。

### 3.2 `/aiforge:add <github-url>`

把一个 GitHub 仓库提交给服务端入库。

```
> /aiforge:add https://github.com/obra/superpowers-skills
已提交入库任务: job_id=ing_01J3...  status=queued
可通过 GET http://localhost:8765/v1/ingest/ing_01J3... 查询进度。
```

调用：`POST /v1/ingest`，参数 `{github_url, auto_approve: true}`。入库过程会自动
识别 `.claude-plugin/plugin.json` / `mcp.json` / `SKILL.md`，一个仓库可同时产出
多种 artifact（详见 [artifact-format.md](artifact-format.md)）。

### 3.3 `/aiforge:search <query>`

关键词搜索。优先打服务端 `/v1/skills?q=`，失败回退本地缓存。

```
> /aiforge:search browser automation
搜索来源: 服务端; 命中 4 条
- playwright-mcp  —  Drive headless browsers via Playwright over MCP
    https://github.com/microsoft/playwright-mcp
- selenium-skills —  Recipes for stable Selenium-based scraping
    https://github.com/...
```

支持 `--limit N`（默认 10）。

### 3.4 `/aiforge:sync`

把服务端所有 artifact 拉到本地兜底缓存 SQLite。

```
> /aiforge:sync
正在从服务端拉取 skill 列表…
已写入本地缓存: 1284 条 → ~/.config/aiforge/local-cache.sqlite
```

每次新增仓库或调整服务端后建议跑一次。它会**全量覆盖**本地条目，不是增量。

### 3.5 `/aiforge:config`

只读模式打印当前配置；带 `--set` 修改单项。

```
> /aiforge:config --set top_k=5
已更新 top_k = 5
配置文件: ~/.config/aiforge/config.toml
server_url       = http://localhost:8765
top_k            = 5
...
```

可识别字段：`server_url` / `top_k` / `max_tokens` / `enabled` / `timeout_ms` /
`fallback_warn_once`。

### 3.6 `/aiforge:list [--type=...] [--tag=...] [--installed]`

列出 artifact，按类型 / 标签筛选；`--installed` 只显示本机已装的 mcp / plugin。

```
> /aiforge:list --type=mcp --tag=browser-automation
- [mcp] playwright-mcp [已安装]  —  Headless browser automation via Playwright
    id: f8d9e312ab74cc60
    tags: browser-automation, testing
- [mcp] puppeteer-mcp  —  Puppeteer-based browser control
    id: 71b3...
共 2 条
```

调用：`GET /v1/artifacts?type=mcp&tag=browser-automation`。本地安装状态扫描
`~/.claude/settings.json` 的 `mcpServers` 与 `~/.claude/plugins/` 目录得出。

### 3.7 `/aiforge:install <artifact_id>`

按 artifact id 安装。具体行为按类型分发（详见第 4 节）。

```
> /aiforge:install f8d9e312ab74cc60
已安装 MCP 'playwright-mcp' 到 ~/.claude/settings.json （备份: settings.json.bak.1716...）
```

`--force` 用于覆盖已存在的 plugin 目录。

### 3.8 `/aiforge:uninstall <artifact_id>`

反向操作；详见第 5 节。

### 3.9 `/aiforge:tag <artifact_id> <tag1,tag2,...>`

**整体替换** artifact 的 tag 集（不是追加）。

```
> /aiforge:tag f8d9e312ab74cc60 browser-automation,testing,scraping
已更新 tag: browser-automation, testing, scraping
```

调用 `PUT /v1/artifacts/{id}/tags`。如想保留旧 tag，请先 `/aiforge:list` 看一眼
当前集合再传完整列表。

### 3.10 `/aiforge:autotag [--ids=...]`

触发服务端跑自动打标任务（小模型分类器）并轮询直至完成。

```
> /aiforge:autotag
已提交 autotag 任务: job_id=at_01J3...
  [#1] status=running 8/120
  [#2] status=running 24/120
  ...
  [#13] status=completed 120/120
完成：处理 120 条
```

`--ids=A,B,...` 限定子集；不传则对所有未打过 auto tag 的 artifact 全量跑。
单条预算约 2-3 秒；`--max-polls` 控制轮询上限（默认 60 即 ~2 分钟）。

---

## 4. 安装行为详解

`/aiforge:install` 拿到 artifact 详情后按 `artifact_type` 分发。

### 4.1 MCP

1. 读取 `~/.claude/settings.json`（不存在则当作空 dict）
2. 备份原文件到 `~/.claude/settings.json.bak.<unix_ts>`
3. 在 `mcpServers[<artifact.name>]` 写入 artifact 的 `mcp_config` 整体
4. 原子写回（先 `.tmp` 再 `os.replace`）

支持 stdio / http / sse 三种 transport，原 `mcp_config` 怎么填就怎么落。

```json
{
  "mcpServers": {
    "playwright-mcp": {
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@playwright/mcp"],
      "env": {}
    }
  }
}
```

### 4.2 Plugin

```bash
git clone --depth 1 <artifact.source_url> ~/.claude/plugins/<artifact.name>/
```

- 不修改 `settings.json` —— Claude Code 启动时自动扫描 `~/.claude/plugins/`
- 目录已存在时拒绝；加 `--force` 才会 `rmtree` 后重 clone
- 找不到 `git` / 超时（120 秒）/ 非零退出码都会以友好中文提示退出
- 网络受限环境可手动 `git clone` 到目标路径，效果等价

### 4.3 Skill

**不支持**手动 install。原因：skill 设计上是**按需注入**的 —— AIForge 推荐器
每轮根据你的 prompt 命中后才把 `SKILL.md` body 塞进上下文。复制到本地反而：

- 浪费 token（无论是否相关都常驻）
- 失去去重（同 query 可能命中多个语义重叠 skill）
- 失去更新（库里 skill 升级了你的本地版本是旧的）

如真的要做 "always-on" 的 skill，把它打包成 plugin 的 `skills/` 目录即可。

---

## 5. 卸载行为

`/aiforge:uninstall <artifact_id>`：

| 类型 | 行为 |
|------|------|
| `mcp` | 从 `~/.claude/settings.json` 的 `mcpServers` 删除该 key；先备份 `settings.json.bak.<ts>` |
| `plugin` | `rm -rf ~/.claude/plugins/<name>/` |
| `skill` | no-op，提示 "skill 不在本地常驻" |

安全注记：

- 备份**永远**先于写入；写失败时原文件不受影响
- 备份从不自动清理，可手动 `rm ~/.claude/settings.json.bak.*` 节省空间
- 卸载 plugin 时**不会**回滚它写入过的其它文件（如 plugin 自带的 hook 注册），
  必要时手动检查 `~/.claude/settings.json` 的 `hooks` 段

---

## 6. 本地兜底模式

### 6.1 触发条件

任何之一即进入兜底：

- 服务端 HTTP 不可达（连接拒绝 / DNS 失败 / 笔电离线）
- 请求超过 `timeout_ms`（默认 250ms）
- 服务端返回 5xx

### 6.2 兜底可用的能力

| 能力 | 在线 | 兜底 |
|------|:----:|:----:|
| 召回（关键词命中） | 向量 + BM25 | 仅关键词 |
| 重排（小模型） | Qwen / Haiku | 无 |
| 去重 | 有 | 无 |
| `/aiforge:search` | 服务端 | 本地缓存 |
| `/aiforge:list` / `install` / `tag` / `autotag` / `add` / `sync` | OK | **失败** |
| `/aiforge:status` | OK | 显示 "不可达" |

简而言之，**hook 会继续工作**（注入降级版推荐），但所有需要服务端写状态的命令都不可用。

### 6.3 让兜底有意义

兜底数据来自 `~/.config/aiforge/local-cache.sqlite`，由 `/aiforge:sync` 全量写入。

```bash
# 服务端可达时跑一次，把全量索引落到本地
/aiforge:sync
```

建议加进你常用的启动脚本，或每天一次的 cron。**没跑过 sync 的兜底就是空的**，
hook 退化为 no-op。

---

## 7. 配置文件

路径：`~/.config/aiforge/config.toml`

### 7.1 完整带注释样例

```toml
# AIForge 插件配置。任何字段都可以删除以恢复默认值。

# 服务端地址。env: AIFORGE_SERVER_URL
server_url = "http://localhost:8765"

# 默认推荐条数。env: AIFORGE_TOP_K
top_k = 3

# 单轮注入预算（约 4 字符/token 估算）；超过会截断 body
max_tokens = 4000

# 总开关；置 false 时 hook 直接 no-op。env: AIFORGE_ENABLED
enabled = true

# 兜底首次触发时是否在 stderr 打印警告
fallback_warn_once = true

# 推荐 HTTP 超时（毫秒）；超时后切兜底
timeout_ms = 250
```

### 7.2 环境变量覆盖

| 变量 | 覆盖字段 | 例子 |
|------|----------|------|
| `AIFORGE_SERVER_URL` | `server_url` | `AIFORGE_SERVER_URL=http://10.0.0.5:8765` |
| `AIFORGE_TOP_K` | `top_k` | `AIFORGE_TOP_K=5` |
| `AIFORGE_ENABLED` | `enabled` | `AIFORGE_ENABLED=false` 临时关 hook |
| `AIFORGE_CONFIG_DIR` | 配置目录 | 测试时把整个 `~/.config/aiforge` 重定向 |
| `AIFORGE_CACHE_DIR` | 缓存目录 | 同上，用于 `~/.cache/aiforge` |

环境变量优先级高于文件。修改 `config.toml` 后**无需重启 Claude Code**，下次提问
hook 会读最新值。

---

## 8. FAQ

**Q1：装插件会不会改坏我现有的 `settings.json`？**
不会。安装脚本和 `install_mcp` 在写入前一律先 backup 到
`settings.json.bak.<unix_ts>`，使用原子写（先 `.tmp` 再 `os.replace`）。出错时
原文件不受影响。

**Q2：怎么彻底关掉 hook？**
最轻：`AIFORGE_ENABLED=false claude` 单次会话关。半永久：
`/aiforge:config --set enabled=false`。彻底卸载：从 `~/.claude/settings.json`
的 `hooks.UserPromptSubmit` 里删掉 `${CLAUDE_PLUGIN_ROOT}/hooks/on-user-prompt`
条目，再删 `~/.claude/plugins/aiforge/`。

**Q3：我能临时禁用某个 artifact 吗？**
当前没有 "禁用" 字段；可以 `/aiforge:uninstall <id>` 把 mcp / plugin 拿掉，或
通过 `/aiforge:tag` 标个 `disabled` tag 配合服务端过滤（Web 面板会用）。skill
级别的禁用在 v0.3 规划中。

**Q4：`/aiforge:sync` 会不会重新下载所有 artifact 内容？**
会。它走 `/v1/skills?limit=1000` 分页拉所有 artifact 的元数据与 body，全量覆盖
本地缓存表。一次 1k 条大约几百 KB，可以放心多跑。

**Q5：MCP 安装失败 / 没看到 tool 怎么办？**
按顺序：
1. `/aiforge:status` 确认服务端给出的 artifact 详情
2. `cat ~/.claude/settings.json` 看 `mcpServers.<name>` 是否真的写进去了
3. 重启 Claude Code（MCP 在启动时才扫描 settings）
4. 服务端 `command` 可能依赖本机没装的工具（如 `uvx` / `bunx`），手动跑一遍
   `mcp_config.command` 看报错
5. 仍不行：`/aiforge:uninstall` 后用最新版重装

**Q6：插件需要联网才能用吗？**
不强制。`/aiforge:sync` 一次后即可离线运行兜底模式。所有 install / tag /
autotag / add 都需要服务端在线。
