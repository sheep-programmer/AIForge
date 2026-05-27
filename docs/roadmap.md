# 路线图

> [English version](roadmap.en.md)

公开下一步要做什么，欢迎拍砖、欢迎认领。日期都是**目标不是承诺**。

---

## 版本概览

| 版本 | 主题 | 状态 |
|------|------|------|
| v0.1 | 推荐器 MVP | 已发布 |
| v0.2 | 统一 Artifact + Web 面板 | 已发布 |
| v0.3 | 跨 agent + MCP 网关完善 | 进行中 |
| v0.4+ | 联邦化、市场、A/B、学习信号 | 探索中 |

---

## 已发布

### v0.1 —— 推荐器 MVP

把核心 skill 推荐链路跑通。

- [x] FastAPI 服务端 + 健康检查 API
- [x] sqlite-vss 向量检索
- [x] `all-MiniLM-L6-v2` embedder
- [x] 两阶段推荐器（向量召回 → Ollama / Haiku / 无 reranker）
- [x] 去重 + 信誉打分
- [x] GitHub 入库 + 多 skill 仓库拆分
- [x] Claude Code 插件 + `UserPromptSubmit` hook
- [x] 本地兜底（服务端挂了用 SQLite 缓存继续工作）
- [x] 远程 finder 框架（默认关）+ 人工审批
- [x] Docker 镜像 + multi-arch release

### v0.2 —— 统一 Artifact + Web 面板

从「skill 路由器」升级为「skill / MCP / plugin 一站式管理」。

- [x] **统一 Artifact 数据模型** —— 一张 `Skill` 表通过 `artifact_type` 字段同时承载三类，向上提供 `/v1/artifacts` 统一 API；老 `/v1/skills` 保留兼容
- [x] **MCP / Plugin 入库器** —— 自动检测 `mcp.json` / `.claude-plugin/plugin.json` / `package.json` MCP 痕迹，一个仓库可同时产出多种 artifact
- [x] **扁平多标签系统** —— 20 个预置 tag（browser-automation / reverse-engineering / ui / testing / security ...）+ 任意自定义；`source=manual|auto` 区分来源
- [x] **小模型自动打标** —— 复用 Qwen2.5-1.5B reranker，串行批处理 + 进度条 + ETA
- [x] **Web 管理面板（9 条路由）** —— dashboard / artifacts / tags / ingest / autotag / playground / discovery / settings，企业级密度，后端不可达时 fallback 到 demo 数据
- [x] **MCP 运行时网关 MVP** —— `aiforge-mcp` 进程对外是单个 MCP，对内连 N 个下游，按 `<name>__<tool>` 命名空间路由，stdio transport
- [x] **插件命令扩展** —— `/aiforge:list` / `install` / `uninstall` / `tag` / `autotag`

---

## 进行中

### v0.3 —— 跨 agent + MCP 网关完善

这个里程碑解决两件事：让 MCP 网关从 MVP 进入生产可用，让 AIForge 跨出 Claude Code。

- [ ] **MCP 网关热更新** —— 不重启进程也能换 active 集；目前需要重启 `aiforge-mcp`，长期不可接受
- [ ] **HTTP / SSE 下游 transport** —— 当前只支持 stdio 下游；越来越多的 MCP 走 HTTP/SSE（云端 MCP），必须支持
- [ ] **动态 active 集合** —— 根据每轮**推荐结果**自动调整 active 集合，而不只是预先配置的 tag 列表。让网关真正做到「按需暴露」
- [ ] **跨 agent 适配 —— Codex** —— Codex CLI 的 prompt hook 接入
- [ ] **跨 agent 适配 —— Cursor** —— 通过 Continue 扩展或 native skill API
- [ ] **跨 agent 适配 —— Gemini CLI** —— 等 Google 上游 hook 协议稳定
- [ ] **Web 面板 i18n** —— English 优先；框架已就位，主要工作是翻译
- [ ] **推荐质量在线评估** —— 在生产流量上 sample 一小撮，用更大模型打分，长期监控质量漂移
- [ ] **每条 artifact 的 secret store** —— MCP `env` 里的 secret 单独加密；当前是明文 JSON，敏感场景不可接受
- [ ] **迁移到官方 MCP Python SDK** —— v0.2 的网关是手搓 JSON-RPC；SDK 1.x API 稳定后切回去
- [ ] **Prometheus `/metrics`** —— 推荐延迟、命中率、缓存命中、网关 active 集大小
- [ ] **alembic 自动迁移** —— 升级零手工

---

## v0.4 及之后（更具探索性）

- [ ] **联邦注册中心** —— 让多个 AIForge 实例互相发现 artifact；适合「公司全局 + 团队私域」两级结构
- [ ] **公共 AIForge.dev 目录**（可选 opt-in 提交） —— 让 artifact 作者主动把自己的仓库登记进公共索引；纯 opt-in，AIForge 实例可选择是否拉取
- [ ] **Web 面板里的 Skill 市场 UI** —— 在 `/discovery` 旁边加一个浏览公共目录的页面，所见即可入
- [ ] **推荐 A/B 框架** —— 同一 prompt 流量按比例分给不同 reranker prompt / 模型，看哪个排得更准
- [ ] **学习信号** —— 用户接受 / 拒绝 / 忽略某次注入，反向影响下次排序
- [ ] **链式推荐** —— 不只是返回一组 artifact，而是返回**有序**的使用顺序

---

## 不会做的

- **托管 SaaS** —— AIForge 是开源 self-host。我们不打算运营 hosted 服务（你愿意自己运营，我们不拦）
- **agent 编排** —— 我们只回答「这次该用哪几个 artifact」，不回答「按什么顺序跑」。后者用 LangGraph / Autogen
- **自训 embedder / reranker** —— 用现成开源模型；效果不够好就换更好的开源模型，不自己训
- **中心化 MCP 发现服务** —— 我们不打算成为新的 MCP「应用商店」；公共目录如果做，也是 opt-in、去中心化的

---

## 设计原则（决定我们做什么 / 不做什么）

1. **小核心，大生态** —— AIForge 自己只做注册、推荐、路由；artifact 由生态提供
2. **零中心化依赖** —— 自托管是一等公民；公共服务（如未来的 AIForge.dev）永远 opt-in
3. **本地优先** —— 默认 Ollama 本地 reranker、SQLite 本地存储；不强制任何云服务
4. **人在回路** —— 自动化（打标、发现、推荐）始终可被人覆盖
5. **数据归你** —— 没有匿名遥测，没有「云同步」；你的 SQLite 是事实唯一源

---

## 怎么影响路线图

- 给 GitHub issue 点 thumbs-up —— 我们按反应数排
- 写一个真实场景的 case study issue —— 这是优先级提升最快的路径
- 直接发 PR 实现一个 v0.3 item —— 我们会拥抱
- 在 Discussions 里发起 RFC，讨论 v0.4 的方向
