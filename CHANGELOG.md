# 变更日志

记录所有重要变更。格式遵循 [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)，版本号遵循 [SemVer](https://semver.org/)。

> English: [CHANGELOG.en.md](CHANGELOG.en.md)

## [0.2.0] · 2026-05-27

> ⚠️ **品牌改名**：`Skillforge` 全面更名为 `AIForge`。
>
> - Python 包 `skillforge` → `aiforge`
> - 环境变量 `SKILLFORGE_*` → `AIFORGE_*`
> - 脚本 `skillforge-server` → `aiforge-server`，新增 `aiforge-mcp`
> - 插件路径 `~/.claude/plugins/skillforge/` → `~/.claude/plugins/aiforge/`
> - 斜杠命令 `/skillforge:*` → `/aiforge:*`
> - Web localStorage / 配置目录键全部跟随
> - 现有部署升级时一次性切换，**不保留向后兼容别名**

### 新增 — 统一 Artifact 模型
- `Skill` 表新增 `artifact_type` 字段（`skill` / `mcp` / `plugin`），一张表通吃三类
- 新增 `mcp_config` JSON 列（transport / command / args / env / url / headers）
- 新增 `plugin_manifest` JSON 列（manifest 摘要 + install_url）
- 模块别名 `Artifact = Skill` 供新代码使用
- 新 API：`GET /v1/artifacts`、`GET /v1/artifacts/{id}`（兼容 `/v1/skills` 别名）

### 新增 — 扁平多标签 + 自动打标
- 新增 `tags` 表 + `skill_tags` 多对多关联，区分 `source=manual|auto` 与可选置信度 `score`
- 20 个预置 tag（`browser-automation`、`reverse-engineering`、`ui`、`testing`、`security`、`devops`、`db`、`docs`、`code-review`、`refactor`、`build`、`debug`、`api-integration`、`data-pipeline`、`ml`、`mobile`、`cli`、`git`、`auth`、`scraping`）启动时幂等写入
- 新模块 `aiforge.recommender.tagger`：复用 Qwen-1.5B / Haiku reranker，给每个 artifact 从预置集合挑 1-3 个最贴合的标签
- 新 API：`/v1/tags*`、`/v1/artifacts/{id}/tags*`、`/v1/admin/autotag*`
- 推荐响应增加 `artifact_type`、`tags`、`mcp_config`、`plugin_manifest` 字段

### 新增 — MCP / Plugin 入库
- `ingestion/detectors.py` 三类 artifact 检测（plugin → mcp → skill 优先级）
- `ingestion/mcp_adapter.py` 解析 `mcp.json` / `mcp-server.json` / `.mcp/config.json` / `package.json`
- `ingestion/plugin_adapter.py` 解析 `.claude-plugin/plugin.json`
- 一个仓库可同时产出多种 artifact

### 新增 — MCP 运行时网关
- 新进程 `aiforge-mcp`，对外是单个 MCP server（stdio JSON-RPC），对内连 N 个下游
- 按 `<artifact_name>__<tool_name>` 命名空间路由 `tools/call`
- 启动时从服务端拉取 active MCP 集合；按 tag / pin id 过滤
- 一个下游挂掉不影响其它下游
- MVP 限制：仅 stdio 下游、无热更新（重启即可拉取最新集合）
- 新增 env：`AIFORGE_GATEWAY_ACTIVE_TAGS`、`AIFORGE_GATEWAY_PIN_IDS`

### 新增 — 插件命令
- `/aiforge:list [--type=...] [--tag=...] [--installed]` —— 浏览 artifact，含本地已装标记
- `/aiforge:install <id>` —— MCP 写 `settings.json`（带备份）/ Plugin 拉到 `~/.claude/plugins/`
- `/aiforge:uninstall <id>` —— 反向卸载
- `/aiforge:tag <id> <tag1,tag2,...>` —— 手动打标
- `/aiforge:autotag` —— 触发自动打标 + 实时进度轮询

### 新增 — Web 管理面板（`web/`）
- Next.js 14 + Tailwind + 自研 shadcn 风格组件库
- 9 条路由：Dashboard / Artifacts 列表+详情 / Tags / Ingest / Autotag / Playground / Discovery / Settings
- "Editorial Engineering" 设计语言：暖色 parchment + 氧化铜绿单色强调 + Fraunces 衬线 + Inter + JetBrains Mono
- 标志性视觉：旋转 Reactor SVG、底部 LIVE FEED ticker、HealthPill 心跳指示
- 后端不可达时 fallback 到 demo 数据，全程可演示
- ⌘K command palette、URL state 可分享、HelpTip 解释术语
- 端口 3500，`next.config` 把 `/api/*` 转发到后端 8765

### 新增 — 文档
- 新增 `docs/web-admin.md` / `.en.md`（中英双语）
- 新增 `docs/artifact-format.md` / `.en.md` —— 替换原 `docs/skill-format.md`，覆盖三类 artifact 格式
- 新增 `docs/extension-spec.md` —— v0.2 内部契约文档

### 改动 — 数据库迁移
- Alembic `002_artifact_and_tags.py`：新增列 `artifact_type` / `mcp_config` / `plugin_manifest` + 新建 `tags` / `skill_tags` 表
- 使用 `op.batch_alter_table` 兼容 SQLite ALTER 限制
- 安全应用在 v0.1 既有数据库上（既有行默认 `artifact_type='skill'`）

### 改动 — 文档大改
- README.md / README.en.md 完全重写以反映三类 artifact + Web 面板
- docs/architecture.md / .en.md 重写：新增 Artifact / Tag / 网关章节，更新数据模型 + API 契约
- docs/recommender-internals.md / .en.md 新增 auto-tagger 段落 + 序列图
- docs/getting-started.md / .en.md 新增 Web 面板 + MCP 网关步骤
- docs/server-deployment.md / .en.md 更新 systemd / docker-compose / 反代示例
- docs/plugin-usage.md / .en.md 加入 5 个新命令的完整说明
- docs/comparison.md / .en.md 新增 6 路对比表
- docs/faq.md / .en.md 重写 15 个 Q&A
- docs/roadmap.md / .en.md 勾选 v0.2 完成项，扩展 v0.3 / v0.4

### 删除
- `docs/skill-format.md` / `.en.md` —— 内容合并进 `docs/artifact-format.md` / `.en.md`

## [0.1.0] · 2026-05-13

### 修复
- `core/db.vss_search`：必须用 `vss_search_params(emb, k)` 包装，否则 FAISS 抛断言并 SIGABRT
- `core/db.upsert_embedding`：sqlite-vss 虚拟表不支持 `INSERT OR REPLACE`，改为 DELETE + INSERT
- `core/models.Skill`：补齐 `embedding: bytes` 列（架构 spec 中已声明但 ORM 漏写，导致 deduper 跑不通）
- `discovery/scorer.score_discovery`：对负数 `stars` / `skill_count` 做 clamp，避免 `math.log` domain error

### 新增
- 服务端核心：FastAPI + SQLite + sqlite-vss，两阶段推荐器
- Claude Code 插件：`UserPromptSubmit` hook + 斜杠命令
- GitHub URL 入库 + 多 skill 仓库自动拆分
- 本地兜底（缓存 SQLite + BM25）
- 远程 skill-finder + 人工审批队列（默认关闭）
- Docker Compose 部署
- 常用公开 skill 库种子脚本
- Mermaid 架构图与时序图（`docs/diagrams/`）
- Alembic 基线 schema 迁移
- 完整 pytest 测试套件（parser/splitter/deduper/scorer/API 集成）
- 管理脚本：`seed_skills` / `benchmark` / `admin_cli` / `export_skills` / `import_skills`
