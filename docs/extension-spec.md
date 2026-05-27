# AIForge Unified Artifact 扩展规范（v0.2 在建）

本文是把 AIForge 从「skill 路由器」升级为「skill / MCP / plugin 一站式管理」
的**共享契约**。Phase 2-5 的并行 agent 都按这份规范实现，避免冲突。

> 本文与代码 lock-step。任何接口/字段改动必须先在此处更新。
> Phase 1 已完成 —— 数据模型 + tag CRUD + 推荐 response 扩展。

---

## 1. 顶层概念：Artifact

`Skill` 表已被语义上扩展为 `Artifact`，由 `artifact_type` 字段区分种类：

| `artifact_type` | 含义 | 主要载体 |
|------|------|----------|
| `skill` | 一份 `SKILL.md` | `body` |
| `mcp`   | 一个 MCP server 登记条目 | `mcp_config` (JSON) |
| `plugin`| 一个 Claude Code 插件 | `plugin_manifest` (JSON) |

> Python 中用 `Skill` 或 `Artifact` 均可（`Artifact = Skill` 别名）。
> 新代码优先用 `Artifact` 让语义更清晰。

### 1.1 `mcp_config` JSON 结构

**stdio 类型**（最常见）：
```json
{
  "transport": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"],
  "env": {"FOO": "bar"}
}
```

**HTTP / SSE 类型**：
```json
{ "transport": "http", "url": "https://api.example.com/mcp", "headers": {} }
{ "transport": "sse",  "url": "https://api.example.com/sse" }
```

### 1.2 `plugin_manifest` JSON 结构

直接复制原 `.claude-plugin/plugin.json` 的关键字段：

```json
{
  "name": "aiforge",
  "version": "0.1.0",
  "description": "...",
  "commands": ["commands/foo.md", ...],
  "hooks": {"UserPromptSubmit": "hooks/on-foo"},
  "skills": ["skills/x/SKILL.md", ...],
  "mcpServers": {...},               // 部分插件含 MCP
  "manifest_path": ".claude-plugin/plugin.json",
  "install_url": "https://github.com/<owner>/<repo>"
}
```

---

## 2. Tag 模型

- 扁平多标签，每个 artifact 最多 20 个 tag。
- `Tag.is_builtin=True` 表示 `BUILTIN_TAGS` 里的预置标签，禁止 API 删除。
- `ArtifactTag.source` 区分 `manual` / `auto`，便于 retag / 审计。
- 自动打标的 tag 必须先存在；新 tag 由 `tags.upsert_tag()` 幂等建立。

预置 tag 列表见 `aiforge.core.models.BUILTIN_TAGS`：
`browser-automation, reverse-engineering, ui, testing, security, devops,
db, docs, code-review, refactor, build, debug, api-integration,
data-pipeline, ml, mobile, cli, git, auth, scraping`

---

## 3. API 增量（Phase 1 已实现）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET  | `/v1/artifacts` | 同 `/v1/skills`，多了语义化路径 |
| GET  | `/v1/artifacts/{id}` | 单条详情，含 `mcp_config` / `plugin_manifest` |
| GET  | `/v1/artifacts/{id}/tags` | 列出 tag |
| PUT  | `/v1/artifacts/{id}/tags` | 整体替换 tag 集 |
| POST | `/v1/artifacts/{id}/tags` | 追加单个 tag |
| DELETE | `/v1/artifacts/{id}/tags/{name}` | 移除单个 tag |
| GET  | `/v1/tags` | 列出全部 tag（含 `artifact_count`） |
| POST | `/v1/tags` | 新建 tag |
| DELETE | `/v1/tags/{name}` | 删除 tag（builtin 拒绝） |

`/v1/skills` 现支持 `?type=skill|mcp|plugin&tag=<name>` 过滤。

---

## 4. Phase 2 — MCP / Plugin 入库（独立 agent A）

### 4.1 文件归属（不要碰其他文件）
- 新建：`server/src/aiforge/ingestion/detectors.py`
- 新建：`server/src/aiforge/ingestion/mcp_adapter.py`
- 新建：`server/src/aiforge/ingestion/plugin_adapter.py`
- 修改：`server/src/aiforge/ingestion/pipeline.py`（在 `_embed_and_upsert` 之后增加 mcp/plugin 分支）
- 修改：`server/src/aiforge/ingestion/splitter.py`（保留原 find_skills，再加 `find_mcps`、`find_plugins`）

### 4.2 检测规则
- **plugin**：仓库根有 `.claude-plugin/plugin.json` → 1 个 plugin artifact
- **mcp**：以下任一命中
  - `mcp.json` / `mcp-server.json` / `.mcp/config.json` 在仓库根
  - `package.json` 含 `"mcpName"` 或 `"keywords": ["mcp", ...]`
  - README 第一行匹配 `MCP server` / `Model Context Protocol`
- **skill**：保持原逻辑（递归找 SKILL.md）

一个仓库可能同时产出多种 artifact，统一走 IngestJob 完成。

### 4.3 数据写法
- MCP / Plugin artifact 也要写入 `embedding`，用 `name + description` 编码。
- MCP 不需要 `body` 内容，可写 `description` 或简短 README 摘录（≤ 2000 字符）。
- Plugin `body` 可放 README 全文，便于 reranker 看到能力描述。
- `source_path` 对 mcp/plugin 是 `mcp.json` / `.claude-plugin/plugin.json` 的相对路径。
- 主键：`SHA256(source_url + source_path)[:16]`（沿用原算法）。

### 4.4 IngestJob 字段
保留 `skills_added/skills_updated`，新增逻辑里**合并计数**（所有 artifact 类型加在一起）。
未来再做 schema 拆分，本期不动。

---

## 5. Phase 3 — 自动打标（独立 agent B）

### 5.1 文件归属
- 新建：`server/src/aiforge/recommender/tagger.py`
- 新建：`server/src/aiforge/api/autotag.py`
- 修改：`server/src/aiforge/main.py`（仅添加 `app.include_router(autotag.router)`）

### 5.2 工作流
1. 拿 artifact list（默认未打过 auto tag 的）
2. 构造 LLM prompt：
   ```
   你是分类器。从以下 tag 列表挑出 1-{N} 个最能描述 artifact 的 tag。
   只能从列表内选。返回 JSON {"tags": ["tag1", ...]}。

   Tag 列表（含解释）：
   - browser-automation: ...
   - ...

   Artifact:
     name: <name>
     description: <description>
     摘要: <body 前 600 字符>
   ```
3. 复用 `reranker._call_ollama` / `_call_haiku` 的 client，但**复制一份**给 tagger 用，
   不要直接 import reranker 私有函数 —— 避免循环依赖与签名漂移。
4. 把命中的 tag 写入 `ArtifactTag(source="auto", score=置信度可选)`。

### 5.3 API
- `POST /v1/admin/autotag` —— 入参见 `schemas.AutotagRequest`
- `GET  /v1/admin/autotag/{job_id}` —— 状态
- Job 状态保存在内存里（dict 即可，不需要新表）—— Phase 3 简单优先。

### 5.4 限制
- 限速：每个 LLM 调用之间至少 50 ms（防 Ollama 过载）
- 超时：单条 ≤ 3s，失败则跳过并记录
- 不要并发 ≥ 4，1.5B 模型 CPU 推理基本是串行最稳

---

## 6. Phase 4 — 插件命令（独立 agent C）

### 6.1 文件归属
- 新建：`plugin/lib/install.py`
- 修改：`plugin/lib/cli.py`（在 dispatch 表新增 list / install / uninstall / tag / autotag 子命令）
- 新建：`plugin/commands/list.md`、`install.md`、`uninstall.md`、`tag.md`、`autotag.md`
- 修改：`plugin/.claude-plugin/plugin.json`（commands 数组加新条目）

### 6.2 install 行为
- **MCP**：
  - 找 `~/.claude/settings.json`（不存在则创建空骨架）
  - 在 `mcpServers.<artifact.name>` 写入 `mcp_config`（保留 transport 区分）
  - 写之前做 backup 到 `~/.claude/settings.json.bak.<ts>`
- **Plugin**：
  - `git clone <install_url>` 到 `~/.claude/plugins/<name>/`
  - 不修改 `settings.json` —— Claude Code 自动扫描 `~/.claude/plugins`
- **Skill**：当前不支持 install（用户直接通过推荐使用），返回友好错误

### 6.3 uninstall
- **MCP**：从 `settings.json` 的 `mcpServers` 删除该 key
- **Plugin**：删除 `~/.claude/plugins/<name>/`

### 6.4 列表命令
`/aiforge:list [--type=mcp|plugin|skill] [--tag=<name>] [--installed]`

`--installed` 时只显示本地已装的（通过扫描 `~/.claude/plugins` 和 settings.json 的 mcpServers）。

### 6.5 客户端
扩展 `plugin/lib/client.py`：
- `list_artifacts(type=None, tag=None, limit=…)`
- `set_tags(artifact_id, tags)`、`add_tag(artifact_id, tag)`、`remove_tag(...)`
- `trigger_autotag(...)`

---

## 7. Phase 5 — MCP 运行时网关（独立 agent D）

### 7.1 目标
一个进程对外是 **单个** MCP server（stdio），对内连接 N 个下游 MCP server，
把 active 集合里的 tool 暴露给 Claude Code。Active 集由 aiforge server 的
推荐结果或用户 pin 决定，可热更。

### 7.2 文件归属
- 新建：`server/src/aiforge/gateway/__init__.py`
- 新建：`server/src/aiforge/gateway/proxy.py` — 单个下游 MCP 的代理（spawn + JSON-RPC）
- 新建：`server/src/aiforge/gateway/registry.py` — active 集合管理
- 新建：`server/src/aiforge/gateway/server.py` — 对外 MCP server 实现
- 新建：`server/src/aiforge/gateway/cli.py` — `aiforge-mcp` 命令入口
- 修改：`server/pyproject.toml` — 增加 `[project.scripts] aiforge-mcp = "aiforge.gateway.cli:main"`
- 修改：`server/pyproject.toml` — 增加依赖 `mcp>=1.2`（官方 SDK）

### 7.3 协议
使用官方 `mcp` Python SDK（`modelcontextprotocol/python-sdk`）：
- 对外用 `stdio_server` + `Server` 类
- 对内用 `ClientSession` + `stdio_client` 连每个下游

### 7.4 Active 集策略（MVP）
- 启动时读 aiforge server `/v1/artifacts?type=mcp&active=true`
- tool 命名空间防冲突：暴露成 `<artifact_name>__<tool_name>`
- 工具调用时按前缀路由到对应下游 Proxy
- 提供 `POST /v1/gateway/reload` HTTP 端点让 server 通知 gateway 刷新

Phase 5 复杂度高，**最小可用**先做：
1. 启动时一次性加载 active 集合
2. tool 命名空间合成 + 转发
3. 暴露 health + tools/list + tools/call
4. 不做热更，重启即可

### 7.5 配置
新增 `AIFORGE_GATEWAY_ACTIVE_TAGS`（CSV）和 `AIFORGE_GATEWAY_PIN_IDS`（CSV）。

---

## 8. 共享规则

- **不要碰其他 phase 拥有的文件**。如必须修改共享文件（`main.py`、`schemas.py`、`config.py`），
  在 PR 描述里写清，merge 时手动调和。
- 所有新 API 走 `prefix="/v1"`。
- 所有 ORM 改动必须配一份 Alembic migration（编号 003、004 ...）。
- 测试放在 `server/tests/<area>/test_*.py`。
- 文档增量统一放 `docs/extension-spec.md` 的对应章节。
