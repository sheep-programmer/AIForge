# AIForge 与替代方案的对比

> [English version](comparison.en.md)

写在前面：这不是营销文案，是**诚实对比**。如果你的场景用不到 AIForge，我们会直说。

---

## TL;DR

**AIForge 适合你**，如果：

- 你的团队同时管 **100+ 个 skill / 10+ 个 MCP / 多个 plugin**，并且数量还在涨
- 你已经被 50K+ 的 system prompt 折磨过，知道 token 预算的真实代价
- 你希望 skill / MCP / plugin **一个面板**管完，而不是分别在 git、`settings.json`、`~/.claude/plugins/` 来回跳
- 你愿意自己跑一个 $5/月的 VPS（或 localhost）

**AIForge 不适合你**，如果：

- 你只有十几个 skill、两三个 MCP，全装也不会爆上下文
- 你需要 agent 编排（多步骤、有顺序的 tool 调用） —— 那是 LangGraph / Autogen 的活
- 你不能容忍 hook 引入的 ~100-250ms 额外延迟
- 你的 artifact 全是 air-gapped 且不允许任何 LLM rerank（这种情况可以用兜底模式，但意义有限）

---

## 横向对比

| 维度 | **AIForge** | Claude Code 原生 skill 加载 | mcp-marketplace（假想） | 手工 `claude mcp add` | 手搓 context engineering | 自建 RAG |
|------|-------------|------------------------------|----------------------|----------------------|--------------------------|---------|
| 覆盖范围 | skill + MCP + plugin | 仅 skill | 仅 MCP | 仅 MCP | 全部 | 全部 |
| 中心化注册 | 是（SQLite + Web） | 否（文件系统扫描） | 是 | 否 | 否 | 自己搭 |
| 自动打标 | 小模型分类 + 人工复核 | 无 | 取决于平台 | 无 | 全人工 | 自己实现 |
| Token 预算控制 | top-K + MCP gateway 双管 | 全装全暴露 | 单 MCP 仍全暴露 | 全 tool 全暴露 | 看你 prompt 工程功力 | 自己实现 |
| 安装自动化 | `/aiforge:install` 一键写 settings.json | 手工放目录 | 取决于平台 | 一条命令一个 MCP | 全手工 | 不在范围 |
| 运行时 tool 过滤 | 是（MCP gateway 按 active 集暴露） | n/a | 否 | 否 | 否 | 否 |
| 自托管 | 是（必须） | n/a | 平台决定 | n/a | n/a | 是 |
| 起步成本 | docker compose up + 一次 ingest | 0 | 0 | 0 | 0 | 数周 |

---

## vs. Claude Code 原生 skill 加载

Claude Code 已经会扫 `~/.claude/skills/` 把 SKILL.md 全部装进上下文。**库小的时候这够用。**

- **少于 20 个 skill**：别用 AIForge。原生加载更直接，省心。
- **100+ 个 skill**：原生加载会把每个 skill 的描述塞进上下文，token 账单立刻教育你。
- AIForge 不替换 `~/.claude/skills/`，它在前面**加一层路由**。两者可以共存：常用的留在原生目录，其余的让 AIForge 按需注入。

经验法则：当你开始考虑「这次任务我要先 disable 哪些 skill」时，就该上 AIForge 了。

---

## vs. 给每个 MCP 手工 `claude mcp add`

1-3 个 MCP？写在 `settings.json` 里完事，AIForge 是杀鸡用牛刀。

10+ 个 MCP 同时挂着，问题就来了：

- 每个 MCP 都把自己的 tool 表暴露给 agent —— 一个 playwright MCP 就有 30+ tool
- agent 一次任务只用其中 2-3 个，剩下的全在 token 预算里冷板凳
- tool 名字冲突（两个 MCP 都有 `read_file`），agent 选错就翻车

AIForge 的 MCP **运行时网关**把这事兜住：

- 对 Claude Code 来说，只有一个 MCP server（`aiforge-mcp`）
- 网关按当前推荐结果决定 active 集合，**只把 active MCP 的 tool 暴露出去**
- tool 命名空间 `<mcp_name>__<tool_name>`，冲突天然消失

代价：多一个进程在跑，多一个 JSON-RPC 跳。换来的是上下文清爽和零冲突。

---

## vs. 自建 RAG

你团队完全可以自己搭：向量库 + LLM rerank + 一个 hook。技术上没有秘密。

但 AIForge 把这些工程零件**装配好**了：

- 跟 Claude Code `UserPromptSubmit` hook 的完整集成
- 自动检测 SKILL.md / `mcp.json` / `.claude-plugin/plugin.json` / `package.json` 里的 MCP 痕迹
- 同语义 artifact 的去重启发式（来源信誉、更新时间、安装量）
- 一个 9 路由的 Web 管理面板（dashboard、ingest、autotag、playground...）
- 开箱即用的 MCP 运行时网关
- 默认 Ollama 本地 reranker，零 LLM API 费用；可一键切到 Haiku

什么时候自建更好：你已经有自己的内部 platform team、有现成的向量库基础设施、对 MCP 协议有特殊需求。否则 AIForge 节省你几周到几个月。

---

## vs. 什么都不做，硬抗 context bloat

短期可行。直到某天你的 system prompt 50K+，主模型开始：

- 漏掉对话开头的指令
- 在 tool list 里挑错 tool
- 推理 latency 显著上升（长上下文的隐性成本）

我们的经验数据：**重度使用 agent 的团队，2 个月内就会撞上这堵墙**。AIForge 是把这件事系统化解决，而不是等它再爆一次。

---

## AIForge **不是**什么

诚实清单：

1. **不是通用向量数据库** —— SQLite + sqlite-vss 够用到 10 万级 artifact，再往上请用 pgvector
2. **不是中心化 MCP 发现服务** —— 我们不运营公共目录，所有 artifact 都在你**自己**的实例里
3. **不是 Claude Code 替代品** —— AIForge 是 Claude Code 的伴侣，不能脱离 agent 运行
4. **不是人工策展的替代品** —— 自动打标只是**建议**，不是权威。Web 面板里所有 auto tag 都可改可删
5. **不是 agent 编排框架** —— 我们只回答「这次该用哪几个 artifact」，不回答「按什么顺序跑」
6. **不是托管 SaaS** —— 我们不打算运营 hosted 服务（你愿意自己运营，我们不阻止）

---

## 性能与成本速查

| 方案 | 每轮额外延迟 | 每轮注入 token | 月成本（10k 请求） |
|------|------------|----------------|---------------------|
| AIForge（Ollama 自托管） | +120ms | ~3k | $5 VPS |
| AIForge（Haiku reranker） | +200ms | ~3k | $5 VPS + ~$0.3 Haiku |
| 全装 skill + 所有 MCP | 0ms | 30-100k | $0，但主模型 token 烧得多 |
| 手搓 context engineering | 0ms 额外 | 看你水平 | $0 |

---

## 一句话结论

- **小库静态** → 不需要 AIForge
- **大库动态 + 自动化** → AIForge
- **要多步 agent 编排** → 找别的工具，AIForge 不接这活
